#!/usr/bin/env node
// A static file server for the repo root. No caching, no build: what's on disk is what's
// served. Exports startServer() so smoke.mjs can reuse it; only auto-starts as the CLI.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = resolve(__filename, "..", "..");

/** @type {Record<string, string>} */
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jsonl": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".sh": "text/x-sh; charset=utf-8",
};

const DEFAULT_TYPE = "application/octet-stream";

/**
 * Resolve a request path to a file under root, refusing anything that escapes it.
 * @param {string} root
 * @param {string} urlPath
 * @returns {string | null} an absolute path, or null if it escapes root
 */
function resolvePath(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  const cleaned = decoded.replace(/^\/+/, "");
  const target = resolve(root, cleaned);
  if (target !== root && !target.startsWith(root + sep)) return null;
  return target;
}

/**
 * @param {string} root
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @returns {Promise<void>}
 */
async function handleRequest(root, req, res) {
  res.setHeader("Cache-Control", "no-store");

  const requested = resolvePath(root, req.url ?? "/");
  if (!requested) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  let target = requested;
  try {
    const info = await stat(target);
    if (info.isDirectory()) {
      target = join(target, "index.html");
    }
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  try {
    const body = await readFile(target);
    const type = CONTENT_TYPES[extname(target)] ?? DEFAULT_TYPE;
    res.writeHead(200, { "Content-Type": type });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

/**
 * Try to listen on one port. Resolves with the server on success; resolves with null (after
 * closing the server) on EADDRINUSE so the caller can try the next port; rejects on any
 * other error.
 * @param {import("node:http").Server} server
 * @param {number} port
 * @returns {Promise<boolean>}
 */
function tryListen(server, port) {
  return new Promise((resolvePromise, reject) => {
    const onError = (/** @type {NodeJS.ErrnoException} */ err) => {
      server.removeListener("listening", onListening);
      if (err.code === "EADDRINUSE") {
        resolvePromise(false);
      } else {
        reject(err);
      }
    };
    const onListening = () => {
      server.removeListener("error", onError);
      resolvePromise(true);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port);
  });
}

const PORT_ATTEMPTS = 10;

/**
 * @param {{ port?: number; root?: string }} [options]
 * @returns {Promise<{ url: string; close: () => Promise<void> }>}
 */
export async function startServer(options = {}) {
  const root = resolve(options.root ?? repoRoot);
  const startPort = options.port ?? (Number(process.env.PORT) || 8080);

  const server = createServer((req, res) => {
    handleRequest(root, req, res).catch((err) => {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Internal error");
      console.error(err);
    });
  });

  let port = startPort;
  let listening = false;
  for (let attempt = 0; attempt < PORT_ATTEMPTS; attempt++) {
    port = startPort + attempt;
    listening = await tryListen(server, port);
    if (listening) break;
  }
  if (!listening) {
    throw new Error(`no free port found in ${startPort}-${startPort + PORT_ATTEMPTS - 1}`);
  }

  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  const url = `http://localhost:${actualPort}/`;

  return {
    url,
    close: () =>
      new Promise((resolvePromise, reject) => {
        server.close((err) => (err ? reject(err) : resolvePromise(undefined)));
      }),
  };
}

/**
 * @returns {number | undefined}
 */
function portArg() {
  const args = process.argv.slice(2);
  const flagIndex = args.indexOf("--port");
  if (flagIndex !== -1 && args[flagIndex + 1]) {
    const n = Number(args[flagIndex + 1]);
    if (Number.isInteger(n)) return n;
  }
  return undefined;
}

const __isMain = process.argv[1] != null && resolve(process.argv[1]) === __filename;
if (__isMain) {
  const port = portArg() ?? (process.env.PORT ? Number(process.env.PORT) : 8080);
  const { url } = await startServer({ port });
  console.log(`Serving ${repoRoot} at ${url}`);
}
