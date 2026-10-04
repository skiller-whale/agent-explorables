// A small, dependency-free Chrome DevTools Protocol client: enough to launch headless
// Chrome, open a page, navigate it (including a same-document hash change), evaluate JS,
// collect console output and take a screenshot. Uses Node's global WebSocket and fetch.

import { spawn } from "node:child_process";
import { mkdtemp, rm, access } from "node:fs/promises";
import { rmSync } from "node:fs";
import { constants } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, delimiter } from "node:path";
import { writeFile } from "node:fs/promises";

const NAV_TIMEOUT_MS = 20_000;
const WS_READY_TIMEOUT_MS = 15_000;

/** @param {string} p @returns {Promise<boolean>} */
async function fileExists(p) {
  try {
    await access(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** @param {string} name @returns {Promise<string | null>} */
async function which(name) {
  const dirs = (process.env.PATH ?? "").split(delimiter);
  for (const dir of dirs) {
    if (!dir) continue;
    const candidate = join(dir, name);
    if (await fileExists(candidate)) return candidate;
  }
  return null;
}

/** @returns {Promise<string>} */
async function findChrome() {
  /** @type {string[]} */
  const candidates = [];
  if (process.env.CHROME_BIN) candidates.push(process.env.CHROME_BIN);
  candidates.push(join(homedir(), "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"));
  candidates.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
  for (const c of candidates) {
    if (await fileExists(c)) return c;
  }
  for (const name of ["google-chrome", "chromium", "chromium-browser"]) {
    const found = await which(name);
    if (found) return found;
  }
  throw new Error(
    "Could not find a Chrome/Chromium binary. Set CHROME_BIN to its path, or install Google Chrome / Chromium.",
  );
}

/**
 * @param {import("node:child_process").ChildProcessByStdio<null, null, import("node:stream").Readable>} child
 * @returns {Promise<string>} the browser-level DevTools websocket URL
 */
function readWsUrl(child) {
  return new Promise((resolvePromise, reject) => {
    let buf = "";
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("timed out waiting for Chrome's DevTools websocket URL"));
    }, WS_READY_TIMEOUT_MS);
    /** @param {Buffer} chunk */
    function onData(chunk) {
      buf += chunk.toString();
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) {
        cleanup();
        resolvePromise(m[1]);
      }
    }
    /** @param {number | null} code */
    function onExit(code) {
      if (!buf.includes("DevTools listening")) {
        cleanup();
        reject(new Error(`Chrome exited before its DevTools websocket was ready (code ${code})`));
      }
    }
    /** @param {Error} err */
    function onError(err) {
      cleanup();
      reject(err);
    }
    function cleanup() {
      clearTimeout(timeout);
      child.stderr.off("data", onData);
      child.off("exit", onExit);
      child.off("error", onError);
    }
    child.stderr.on("data", onData);
    child.once("exit", onExit);
    child.once("error", onError);
  });
}

/** A single WebSocket connection to the browser, in flat session mode. */
class CDPConnection {
  /** @param {WebSocket} ws */
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    /** @type {Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>} */
    this.pending = new Map();
    /** @type {Map<string, Set<(params: any, sessionId: string | undefined) => void>>} */
    this.listeners = new Map();
    ws.addEventListener("message", (event) => this._onMessage(event.data));
  }

  /** @returns {Promise<void>} */
  ready() {
    return new Promise((resolvePromise, reject) => {
      if (this.ws.readyState === WebSocket.OPEN) {
        resolvePromise();
        return;
      }
      this.ws.addEventListener("open", () => resolvePromise(), { once: true });
      this.ws.addEventListener("error", () => reject(new Error("Chrome DevTools websocket failed to open")), { once: true });
    });
  }

  /**
   * @param {string} method
   * @param {Record<string, unknown>} [params]
   * @param {string} [sessionId]
   * @returns {Promise<any>}
   */
  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    /** @type {any} */
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject });
      this.ws.send(JSON.stringify(msg));
    });
  }

  /**
   * @param {string} method
   * @param {string | undefined} sessionId
   * @param {(params: any, sessionId: string | undefined) => void} handler
   * @returns {() => void} unsubscribe
   */
  on(method, sessionId, handler) {
    const key = `${sessionId ?? "*"}:${method}`;
    let set = this.listeners.get(key);
    if (!set) {
      set = new Set();
      this.listeners.set(key, set);
    }
    set.add(handler);
    return () => set.delete(handler);
  }

  /** @param {string} raw */
  _onMessage(raw) {
    /** @type {any} */
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.id !== undefined) {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message ?? JSON.stringify(msg.error)));
      else p.resolve(msg.result);
      return;
    }
    if (msg.method) {
      const key = `${msg.sessionId ?? "*"}:${msg.method}`;
      for (const h of this.listeners.get(key) ?? []) h(msg.params, msg.sessionId);
    }
  }

  close() {
    try {
      this.ws.close();
    } catch {
      // already closing/closed
    }
  }
}

/** @param {any} arg a Runtime.RemoteObject @returns {string} */
function describeRemoteArg(arg) {
  if (!arg || typeof arg !== "object") return String(arg);
  if (arg.type === "string") return arg.value;
  if (arg.type === "undefined") return "undefined";
  if (arg.subtype === "null") return "null";
  if (arg.value !== undefined) {
    try {
      return typeof arg.value === "string" ? arg.value : JSON.stringify(arg.value);
    } catch {
      return String(arg.value);
    }
  }
  return arg.description ?? arg.unserializableValue ?? String(arg.type);
}

export class Page {
  /**
   * @param {CDPConnection} conn
   * @param {string} targetId
   * @param {string} sessionId
   */
  constructor(conn, targetId, sessionId) {
    this._conn = conn;
    this._targetId = targetId;
    this._sessionId = sessionId;
    /** @type {{ type: string; text: string }[]} */
    this.consoleMessages = [];
    this._unsubs = [
      conn.on("Runtime.consoleAPICalled", sessionId, (params) => {
        const text = (params.args ?? []).map(describeRemoteArg).join(" ");
        this.consoleMessages.push({ type: params.type, text });
      }),
      conn.on("Runtime.exceptionThrown", sessionId, (params) => {
        const detail = params.exceptionDetails;
        const text = detail?.exception?.description ?? detail?.text ?? "uncaught exception";
        this.consoleMessages.push({ type: "exception", text });
      }),
      conn.on("Log.entryAdded", sessionId, (params) => {
        const entry = params.entry ?? {};
        const text = entry.url ? `${entry.text ?? ""} (${entry.url})` : entry.text ?? "";
        this.consoleMessages.push({ type: entry.level ?? "log", text });
      }),
    ];
  }

  /** @returns {Promise<void>} */
  async _init() {
    await this._conn.send("Page.enable", {}, this._sessionId);
    await this._conn.send("Runtime.enable", {}, this._sessionId);
    await this._conn.send("Log.enable", {}, this._sessionId);
  }

  /**
   * @param {number} width
   * @param {number} height
   * @returns {Promise<void>}
   */
  async _setViewport(width, height) {
    await this._conn.send(
      "Emulation.setDeviceMetricsOverride",
      { width, height, deviceScaleFactor: 1, mobile: false },
      this._sessionId,
    );
  }

  /**
   * Evaluate an expression, awaiting a returned promise and returning its value by-value.
   * Throws with the exception's own description if evaluation threw.
   * @param {string} expression
   * @returns {Promise<any>}
   */
  async evaluate(expression) {
    const result = await this._conn.send(
      "Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true, replMode: true },
      this._sessionId,
    );
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails;
      throw new Error(detail.exception?.description ?? detail.text ?? "evaluation threw");
    }
    return result.result?.value;
  }

  /**
   * @param {string} method
   * @param {number} timeoutMs
   * @returns {Promise<any>}
   */
  _waitForEvent(method, timeoutMs) {
    return new Promise((resolvePromise, reject) => {
      const timeout = setTimeout(() => {
        unsub();
        reject(new Error(`timed out waiting for ${method}`));
      }, timeoutMs);
      const unsub = this._conn.on(method, this._sessionId, (params) => {
        clearTimeout(timeout);
        unsub();
        resolvePromise(params);
      });
    });
  }

  /**
   * Navigate to `url`. If only the hash differs from the current location, this is a
   * same-document navigation: no load event ever fires, so instead it changes the hash and
   * waits for the page's own "hashchange" listener to run (and two animation frames after,
   * so any DOM it wrote has been laid out).
   * @param {string} url
   * @returns {Promise<void>}
   */
  async goto(url) {
    const [targetPath] = url.split("#");
    let current = "";
    try {
      current = String((await this.evaluate("location.href")) ?? "");
    } catch {
      current = "";
    }
    const [currentPath] = current.split("#");

    if (current && currentPath === targetPath) {
      if (current === url) return; // nothing would change
      await this.evaluate(`
        new Promise((resolve) => {
          window.addEventListener("hashchange", () => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)));
          }, { once: true });
          location.href = ${JSON.stringify(url)};
        })
      `);
      return;
    }

    const loaded = this._waitForEvent("Page.loadEventFired", NAV_TIMEOUT_MS);
    await this._conn.send("Page.navigate", { url }, this._sessionId);
    await loaded;
    // Let the page's own module script run and the first render settle.
    await this.evaluate(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(null))))`);
  }

  /**
   * @param {string} path
   * @returns {Promise<void>}
   */
  async screenshot(path) {
    const { data } = await this._conn.send("Page.captureScreenshot", { format: "png" }, this._sessionId);
    await writeFile(path, Buffer.from(data, "base64"));
  }

  /** @returns {Promise<void>} */
  async close() {
    for (const unsub of this._unsubs) unsub();
    try {
      await this._conn.send("Target.closeTarget", { targetId: this._targetId });
    } catch {
      // the browser may already be closing
    }
  }
}

/**
 * @param {{ width?: number; height?: number }} [options]
 * @returns {Promise<{ newPage: () => Promise<Page>; close: () => Promise<void> }>}
 */
export async function launchChrome(options = {}) {
  const width = options.width ?? 1280;
  const height = options.height ?? 720;

  const bin = await findChrome();
  const userDataDir = await mkdtemp(join(tmpdir(), "agent-explorables-chrome-"));

  const args = [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--hide-scrollbars",
    `--window-size=${width},${height}`,
    "--disable-gpu",
  ];

  const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
  const wsUrl = await readWsUrl(child);

  const conn = new CDPConnection(new WebSocket(wsUrl));
  await conn.ready();

  let closed = false;
  const syncCleanup = () => {
    if (closed) return;
    closed = true;
    try {
      child.kill("SIGKILL");
    } catch {
      // already gone
    }
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  };
  process.once("exit", syncCleanup);

  return {
    /** @returns {Promise<Page>} */
    async newPage() {
      const { targetId } = await conn.send("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await conn.send("Target.attachToTarget", { targetId, flatten: true });
      const page = new Page(conn, targetId, sessionId);
      await page._init();
      await page._setViewport(width, height);
      return page;
    },
    /** @returns {Promise<void>} */
    async close() {
      if (closed) return;
      closed = true;
      process.removeListener("exit", syncCleanup);
      conn.close();
      try {
        child.kill();
      } catch {
        // already gone
      }
      await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
    },
  };
}
