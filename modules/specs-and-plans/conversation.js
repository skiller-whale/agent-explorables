// A canned Claude Code conversation beside the repo it works on, for a coach to screenshare.
//
// A script is a list of turns. A turn waits for the user: the coach picks one of its messages,
// and Claude's whole response plays out until it next needs the user; at the end of an act, a
// Continue button starts the next. ← goes back to the start of the turn, or the turn before.
// → only replays ground already covered (the message picked last time, without animation), so a
// first playthrough always goes through the conversation itself. The file viewer follows the script; a file the coach clicks stays open
// only until the script moves on.
//
// The URL hash records where the page is: #3 is waiting at the third turn, #3-end is the end of an act whose
// last turn is the third. A refresh comes back to the same place, and the browser's back and forward buttons
// move between the places visited. At the end, a Restart button goes back to the start.

import { blockLines, changedLines, escapeHtml, highlightFile, markdownBlockLines } from "./highlight.js";

/**
 * One thing that happens on screen.
 * @typedef {object} Op
 * @property {string} [reset]  replace the repo with this snapshot of `files` and clear the conversation
 * @property {"plan" | "normal"} [mode]  the permission mode shown under the input box
 * @property {string} [tool]  a tool call line, e.g. "Read(bookings.py)"
 * @property {string} [file]  the repo path the tool call touches
 * @property {string} [to]  the snapshot the file changes to (an edit)
 * @property {boolean} [show]  open the file in the viewer
 * @property {string | string[]} [focus]  highlight the blocks starting with these lines, or "*" for the whole file (otherwise an edit highlights what changed)
 * @property {string} [line]  a line of output; `cls` styles it ("say", "ok")
 * @property {string} [cls]
 * @property {string} [box]  a bordered block of output (HTML)
 * @property {string} [diff]  a diff block (HTML)
 * @property {string} [view]  open this file in the viewer, with no line in the conversation (`focus` applies)
 * @property {string} [repo]  replace the repo with this snapshot, keeping the conversation (files that appear are marked new)
 * @property {number} [stage]  the workflow stage now under way (an index into `stages`; `stages.length` means all done)
 */

/**
 * @typedef {object} Option
 * @property {string} label  what the coach clicks, e.g. "Send" or "1. Yes, start building"
 * @property {string} [send]  the message typed into the input box, if any
 * @property {Op[]} ops  Claude's response
 * @property {Callout} [callout]  shown once the response has finished, unless the next turn has its own
 * @property {boolean} [quiet]  a step, not a message to Claude: a yellow button, and nothing added to the conversation
 * @property {string} [note]  shown beside the label, e.g. the file the step moves to
 */

/**
 * @typedef {object} Callout
 * @property {string} html
 * @property {"center" | "top" | "side"} place  where in the conversation pane ("side" sits against the repo, pointing at it)
 */

/**
 * @typedef {object} Turn
 * @property {number} act
 * @property {string} title
 * @property {boolean} [scene]  starts a new act: the coach presses → to begin it
 * @property {Op[]} [before]  what happens when the turn begins
 * @property {Callout} [callout]  shown while the turn waits for the user
 * @property {Option[]} options
 */

/**
 * @typedef {object} Script
 * @property {string[]} acts
 * @property {string[]} [tree]  repo paths, two spaces of indent per directory level, directories ending in "/";
 *   without it, the tree is built from the files present, directories first
 * @property {string[]} [stages]  workflow stages shown as a tracker in the nav bar, e.g. explore, propose, apply, archive
 * @property {string[]} [collapse]  directories whose subdirectories are listed without their contents
 * @property {Record<string, Record<string, string>>} files  snapshot name -> path -> contents; a path ending in "/" is an empty directory
 * @property {Turn[]} turns
 */

/**
 * @param {string} sel
 * @returns {HTMLElement}
 */
function $(sel) {
  const el = document.querySelector(sel);
  if (!(el instanceof HTMLElement)) throw new Error(`missing element ${sel}`);
  return el;
}

/** @param {Script} script */
export function start(script) {
  const term = $("#term");
  const input = $("#input");
  const tree = $("#tree");
  const viewer = $("#viewer");
  const callout = $("#callout");
  const ccPane = $("#cc");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** @type {Record<number, number[]>} turn -> options picked, in order: the most recent path */
  let path = {};
  let at = 0;
  /** @type {number[]} */
  let picked = [];
  /** @type {"waiting" | "responding" | "done"} */
  let phase = "waiting";
  let run = 0; // bumped to cancel whatever is animating
  let furthest = 0; // the furthest turn reached on the current path
  /** @type {Record<string, string>} */
  let contents = {};
  /** @type {Record<string, string>} */
  let marks = {};
  /** @type {string | null} */
  let openPath = null;
  /** @type {{ path: string, lines: Set<number> } | null} what the script last showed */
  let scripted = null;
  /** @type {"push" | "replace" | "none"} how the next place reached goes into the browser history */
  let history_ = "replace";
  let notice = ""; // shown after the turn name until the coach moves on, e.g. for a link that matches nothing

  function record() {
    const hash = `#${at + 1}${phase === "done" ? "-end" : ""}`;
    if (history_ !== "none" && location.hash !== hash) {
      if (history_ === "push") history.pushState(null, "", hash);
      else history.replaceState(null, "", hash);
    }
    history_ = "push";
  }
  let stageAt = -1; // the workflow stage under way; -1 before the first

  function renderStages() {
    const el = document.querySelector("#stages");
    if (!(el instanceof HTMLElement) || !script.stages) return;
    el.innerHTML = script.stages
      .map((name, i) => {
        const state = i < stageAt ? "done" : i === stageAt ? "now" : "todo";
        return `<span class="stage ${state}">${escapeHtml(name)}</span>`;
      })
      .join("");
  }

  /**
   * @param {number} ms
   * @param {boolean} fast
   */
  const wait = (ms, fast) => (fast || reduce ? Promise.resolve() : new Promise((r) => setTimeout(r, ms)));

  // ---- repo ----
  /** The tree as indented entries, like `script.tree`, built from the files present. */
  function treeFromContents() {
    /** @type {Set<string>} */
    const paths = new Set();
    for (const p of Object.keys(contents)) {
      const parts = p.split("/");
      for (let k = 1; k < parts.length; k++) paths.add(parts.slice(0, k).join("/") + "/");
      if (!p.endsWith("/")) paths.add(p);
    }
    const hidden = (/** @type {string} */ p) => (script.collapse ?? []).some((c) => p.startsWith(c) && p.slice(c.length).replace(/\/$/, "").includes("/"));
    /** @param {string} dir */
    const children = (dir) => [...paths]
      .filter((p) => p.startsWith(dir) && p !== dir && !p.slice(dir.length).replace(/\/$/, "").includes("/"))
      .sort((a, b) => Number(b.endsWith("/")) - Number(a.endsWith("/")) || a.localeCompare(b, "en", { sensitivity: "base" }));
    /** @type {string[]} */
    const out = [];
    /**
     * @param {string} dir
     * @param {number} depth
     */
    const walk = (dir, depth) => {
      for (const p of children(dir)) {
        if (hidden(p)) continue;
        out.push("  ".repeat(depth) + p.slice(dir.length));
        if (p.endsWith("/")) walk(p, depth + 1);
      }
    };
    walk("", 0);
    return out;
  }

  /** @param {string} p  a path, or a directory ending in "/" (marked if anything inside it is) */
  function markOf(p) {
    if (!p.endsWith("/")) return marks[p];
    const inside = Object.keys(marks).filter((m) => m.startsWith(p)).map((m) => marks[m]);
    return inside.length ? (inside.every((m) => m === "new") ? "new" : "mod") : undefined;
  }

  /** @param {string} name  a file name, or "/" for a directory */
  function icon(name) {
    if (name === "/") return `<svg class="ic dir" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 3h4.2l1.6 1.6h7.2v8.9h-13z"/></svg>`;
    const kind = name.endsWith(".py") ? "py" : name.endsWith(".md") ? "md" : "other";
    return `<svg class="ic file ${kind}" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 1.5h6l3 3v10h-9z"/><path d="M9.5 1.5v3h3"/></svg>`;
  }

  function renderTree() {
    /** @type {string[]} */
    const dirs = [];
    tree.innerHTML = "";
    const collapsedDir = (/** @type {string} */ p) => (script.collapse ?? []).some((c) => p.startsWith(c) && p !== c);
    for (const entry of script.tree ?? treeFromContents()) {
      const name = entry.trimStart();
      const depth = (entry.length - name.length) / 2;
      dirs.length = depth;
      const isDir = name.endsWith("/");
      const p = dirs.join("") + name;
      if (isDir) dirs[depth] = name;
      const el = document.createElement(isDir ? "div" : "button");
      el.className = `f ${isDir ? "dir" : "file"}${p === openPath ? " open" : ""}`;
      el.style.paddingLeft = `calc(6px + ${depth} * var(--indent, 14px))`;
      el.dataset.path = p;
      const mark = isDir && !collapsedDir(p) ? undefined : markOf(p);
      el.innerHTML = `<span class="nm">${icon(isDir ? "/" : name)}${escapeHtml(name)}</span>${mark ? `<span class="mark ${mark}" title="${mark === "new" ? "new" : "modified"}">${mark === "new" ? "A" : "M"}</span>` : ""}`;
      if (!isDir) el.addEventListener("click", () => showFile(p, new Set()));
      tree.append(el);
    }
  }

  /**
   * @param {string} p
   * @param {Set<number>} lines  lines to highlight
   */
  function showFile(p, lines) {
    const text = contents[p];
    if (text === undefined) return;
    openPath = p;
    const html = highlightFile(p, text)
      .map((l, i) => `<span class="line${lines.has(i) ? " hl" : ""}">${l || " "}</span>`)
      .join("");
    viewer.innerHTML = `<div class="vh">${escapeHtml(p)}</div><pre><code>${html}</code></pre>`;
    renderTree();
    const pre = viewer.querySelector("pre");
    const first = viewer.querySelector(".line.hl");
    if (pre && first instanceof HTMLElement) {
      const last = /** @type {HTMLElement} */ ([...viewer.querySelectorAll(".line.hl")].at(-1));
      const mid = (first.offsetTop + last.offsetTop + last.offsetHeight) / 2;
      pre.scrollTop = Math.max(0, mid - pre.clientHeight / 2);
    }
  }

  /**
   * @param {string} p
   * @param {string | string[] | undefined} focus
   */
  function focusLines(p, focus) {
    const text = contents[p] ?? "";
    if (focus === "*") return new Set(text.split("\n").keys());
    const find = p.endsWith(".md") ? markdownBlockLines : blockLines;
    return new Set([focus ?? []].flat().flatMap((m) => [...find(text, m)]));
  }

  function backToScript() {
    if (scripted && openPath !== scripted.path) showFile(scripted.path, scripted.lines);
  }

  /** @param {string} p */
  function flash(p) {
    const el = tree.querySelector(`[data-path="${p}"]`);
    if (!el) return;
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 500);
  }

  // ---- conversation ----
  function trim() {
    while (term.scrollHeight > term.clientHeight && term.children.length > 1) term.firstChild?.remove();
  }
  /**
   * @param {string} html
   * @param {string} cls
   */
  function addLine(html, cls) {
    const d = document.createElement("div");
    d.className = `ln ${cls}`;
    d.innerHTML = html;
    term.append(d);
    trim();
    return d;
  }
  /**
   * Type out HTML a few characters at a time, keeping tags whole.
   * @param {HTMLElement} el
   * @param {string} html
   * @param {boolean} fast
   * @param {number} r
   */
  async function stream(el, html, fast, r) {
    if (!(fast || reduce)) {
      let out = "";
      for (const part of html.split(/(<[^>]+>)/)) {
        if (part.startsWith("<")) { out += part; continue; }
        for (let i = 0; i < part.length; i += 5) {
          if (r !== run) return;
          el.innerHTML = out + part.slice(0, i + 5);
          trim();
          await wait(10, false);
        }
        out += part;
      }
    }
    el.innerHTML = html;
    trim();
  }

  /**
   * @param {Op} o
   * @param {boolean} fast
   * @param {number} r
   */
  async function op(o, fast, r) {
    if (o.reset) stageAt = -1;
    if (o.stage !== undefined) stageAt = o.stage;
    if (o.reset || o.stage !== undefined) renderStages();
    if (o.reset) {
      term.innerHTML = "";
      contents = { ...script.files[o.reset] };
      marks = {};
      ccPane.classList.remove("closed");
      if (scripted) showFile(scripted.path, new Set());
      else viewer.innerHTML = "";
      renderTree();
    }
    if (o.mode) $("#mode").innerHTML = o.mode === "plan" ? `<span class="plan">⏸ plan mode on</span>` : "";
    if (o.tool) {
      const d = addLine(escapeHtml(o.tool), "tool spin");
      if (o.file && !fast) flash(o.file);
      await wait(400, fast);
      if (r !== run) return;
      d.classList.remove("spin");
      if (o.file) {
        const before = contents[o.file] ?? "";
        if (o.to) {
          if (!(o.file in contents)) marks[o.file] = "new";
          else if (marks[o.file] !== "new") marks[o.file] = "mod";
          contents[o.file] = script.files[o.to][o.file];
          renderTree();
        }
        if (o.show) {
          const text = contents[o.file];
          const lines = o.focus ? focusLines(o.file, o.focus) : o.to ? changedLines(before, text) : new Set();
          scripted = { path: o.file, lines: /** @type {Set<number>} */ (lines) };
          showFile(o.file, scripted.lines);
        } else if (o.file === openPath) showFile(o.file, new Set());
      }
    }
    if (o.repo) {
      const next = { ...script.files[o.repo] };
      for (const p of Object.keys(next)) if (!(p in contents) && !p.endsWith("/")) marks[p] = "new";
      for (const p of Object.keys(marks)) if (!(p in next)) delete marks[p];
      contents = next;
      if (openPath && !(openPath in contents)) { openPath = null; scripted = null; viewer.innerHTML = ""; }
      renderTree();
    }
    if (o.view) {
      scripted = { path: o.view, lines: focusLines(o.view, o.focus) };
      showFile(o.view, scripted.lines);
    }
    if (o.line !== undefined) await stream(addLine("", o.cls ?? ""), escapeHtml(o.line), fast, r);
    if (o.box) await stream(addLine("", "box"), o.box, fast, r);
    if (o.diff) await stream(addLine("", "diff"), o.diff, fast, r);
    if (!fast) await wait(120, false);
  }
  /**
   * @param {Op[] | undefined} list
   * @param {boolean} fast
   * @param {number} r
   */
  async function ops(list, fast, r) {
    for (const o of list ?? []) {
      if (r !== run) return;
      await op(o, fast, r);
    }
  }

  // ---- turns ----
  /** @param {Callout | undefined} c */
  function showCallout(c) {
    callout.hidden = !c;
    if (!c) return;
    callout.innerHTML = c.html;
    callout.className = c.place;
  }

  function showOptions() {
    input.innerHTML = "";
    script.turns[at].options.forEach((o, j) => {
      const b = document.createElement("button");
      b.className = o.quiet ? "opt continue" : "opt";
      const rest = o.send ?? o.note;
      b.innerHTML = `<span class="k">${escapeHtml(o.label)}</span>${rest ? `<span>${escapeHtml(rest)}</span>` : ""}`;
      b.addEventListener("click", () => pick(j, false));
      input.append(b);
    });
  }

  /**
   * The user's message, then Claude's response.
   * @param {number} j
   * @param {boolean} fast
   * @param {number} r
   */
  async function play(j, fast, r) {
    const o = script.turns[at].options[j];
    input.innerHTML = `<span class="typed"></span>`;
    if (!fast && o.send) {
      const typed = /** @type {HTMLElement} */ (input.firstChild);
      for (let c = 0; c < o.send.length; c += 3) {
        if (r !== run) return;
        typed.textContent = o.send.slice(0, c + 3);
        await wait(12, false);
      }
      await wait(200, false);
      input.innerHTML = `<span class="typed"></span>`;
    }
    if (o.send) addLine(escapeHtml(o.send), "user");
    else if (!o.quiet) addLine(escapeHtml(o.label), "sys");
    await ops(o.ops, fast, r);
  }

  /**
   * @param {number} j
   * @param {boolean} fast
   */
  async function pick(j, fast) {
    if (phase !== "waiting") return;
    if ((path[at] ?? [])[picked.length] !== j) {
      path[at] = [...picked, j];
      for (const k of Object.keys(path)) if (+k > at) delete path[+k];
      furthest = at;
    }
    picked.push(j);
    notice = "";
    phase = "responding";
    showCallout(undefined);
    backToScript();
    updateNav();
    const r = ++run;
    await play(j, fast, r);
    if (r !== run) return;
    const after = script.turns[at].options[j].callout;
    if (at + 1 < script.turns.length && !script.turns[at + 1].scene) {
      at++;
      picked = [];
      await enter(fast, r);
      if (r === run && !script.turns[at].callout) showCallout(after);
    } else {
      phase = "done";
      showContinue();
      showCallout(after);
      updateNav();
      record();
    }
  }

  /**
   * @param {boolean} fast
   * @param {number} r
   */
  async function enter(fast, r) {
    await ops(script.turns[at].before, fast, r);
    if (r !== run) return;
    phase = "waiting";
    furthest = Math.max(furthest, at);
    showOptions();
    showCallout(script.turns[at].callout);
    updateNav();
    record();
  }

  /** At the end of an act: a button to start the next one, where the messages would be. At the end, Restart. */
  function showContinue() {
    input.innerHTML = `<span class="typed"></span>`;
    const b = document.createElement("button");
    if (at + 1 >= script.turns.length) {
      b.className = "opt restart";
      b.innerHTML = `<span class="k">↺ Restart</span>`;
      b.addEventListener("click", () => go(0));
      input.replaceChildren(b);
      return;
    }
    b.className = "opt continue";
    b.innerHTML = `<span class="k">Continue</span><span>${escapeHtml(script.acts[script.turns[at + 1].act])}</span>`;
    b.addEventListener("click", nextAct);
    input.replaceChildren(b);
  }

  function nextAct() {
    if (phase !== "done" || at + 1 >= script.turns.length) return;
    backToScript();
    showCallout(undefined);
    at++;
    picked = [];
    phase = "responding";
    updateNav();
    enter(false, ++run);
  }

  /**
   * Jump to the start of turn i, replaying the most recent path up to it.
   * @param {number} i
   */
  async function go(i) {
    const r = ++run;
    notice = "";
    phase = "responding";
    document.body.dataset.phase = phase;
    term.innerHTML = "";
    marks = {};
    scripted = null;
    openPath = null;
    viewer.innerHTML = "";
    showCallout(undefined);
    for (let k = 0; k < i; k++) {
      at = k;
      picked = [];
      await ops(script.turns[k].before, true, r);
      for (const j of path[k] ?? [0]) await play(j, true, r);
    }
    at = i;
    picked = [];
    await enter(true, r);
  }

  /** The message → sends: the one picked last time here, if this ground has been covered. */
  function remembered() {
    return (path[at] ?? [])[picked.length];
  }

  function canGoForward() {
    if (phase === "waiting") return remembered() !== undefined;
    return phase === "done" && at < furthest;
  }

  function next() {
    if (!canGoForward()) return;
    if (phase === "waiting") pick(/** @type {number} */ (remembered()), true);
    else nextAct();
  }
  function back() {
    if (phase === "responding" || picked.length) go(at);
    else go(Math.max(0, at - 1));
  }

  function updateNav() {
    const t = script.turns[at];
    document.body.dataset.phase = phase; // for tests and tools: "responding" while anything plays
    /** @type {HTMLButtonElement} */ ($("#back")).disabled = at === 0 && !picked.length;
    /** @type {HTMLButtonElement} */ ($("#next")).disabled = !canGoForward();
    $("#where").textContent = `${script.acts[t.act]} · ${t.title}${notice ? ` · ${notice}` : ""}`;
    const acts = $("#acts");
    acts.innerHTML = "";
    script.acts.forEach((name, ai) => {
      const a = document.createElement("span");
      a.className = `act${t.act === ai ? " now" : ""}`;
      a.innerHTML = `<b>${escapeHtml(name)}</b>`;
      const dots = document.createElement("span");
      dots.className = "dots";
      script.turns.forEach((s, i) => {
        if (s.act !== ai) return;
        const d = document.createElement("button");
        d.className = `dot${i < at ? " done" : ""}${i === at ? " now" : ""}`;
        d.title = `${name} · ${s.title}`;
        d.setAttribute("aria-label", d.title);
        d.disabled = i > furthest; // only turns already reached
        d.addEventListener("click", () => go(i));
        dots.append(d);
      });
      a.append(dots);
      acts.append(a);
    });
  }

  $("#next").addEventListener("click", next);
  $("#back").addEventListener("click", back);
  addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") next();
    else if (e.key === "ArrowLeft") back();
    else if (/^[1-9]$/.test(e.key)) /** @type {HTMLElement | undefined} */ (input.querySelectorAll(".opt")[+e.key - 1])?.click();
  });

  const stage = $("#stage");
  const fit = () => { stage.style.transform = `scale(${Math.min(innerWidth / 1280, innerHeight / 720)})`; };
  addEventListener("resize", fit);
  fit();

  /** Go to the place the URL hash names, or the start if it names none. */
  async function fromHash() {
    const m = /^#(\d+)(-end)?$/.exec(location.hash);
    const i = m ? +m[1] - 1 : 0;
    const end = !!m?.[2];
    const endsAct = (/** @type {number} */ k) => k + 1 >= script.turns.length || !!script.turns[k + 1].scene;
    const ok = !location.hash || (m && i >= 0 && i < script.turns.length && (!end || endsAct(i)));
    if (!ok) { await go(0); notice = "that link isn't a step here, so this is the start"; updateNav(); return; }
    if (!end) return go(i);
    history_ = "none";
    await go(i);
    const r = run;
    history_ = "none";
    for (const j of path[i] ?? [0]) if (r === run && phase === "waiting") await pick(j, true);
  }
  addEventListener("popstate", () => { history_ = "none"; fromHash(); });
  fromHash();
}
