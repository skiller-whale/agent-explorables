// A canned Claude Code session beside its context and the disk, one step at a time, for a coach to screenshare.
//
// Three columns. Left, the Claude Code conversation with its input box. Middle, the agent's context: the blocks
// the harness and the conversation put there, in order (the system prompt, CLAUDE.md, the memory index, the
// user's messages, tool calls and their results). Right, the memory folder on disk: its index, MEMORY.md, on
// top, and under it the memory file being looked at. Other files the agent touches aren't shown.
//
// A script is a list of steps. Each step says what changes once it has happened. The conversation and the
// context build up until a step clears them (a new session), and the files on disk carry on until a step
// changes them. → and ← move a step, and so do the button in the input box and the dots.
//
// A step can have a note, which behaves as on the hooks and subagents pages: next to the thing to look at,
// open at first, folding to a small ? when clicked. The URL hash is the step, counted from #0.

import { escapeHtml as esc, highlightFile } from "../specs-and-plans/highlight.js";

/**
 * A line in the conversation.
 * @typedef {object} Line
 * @property {string} cls  "user", "say", "tool", "res" (a tool's result, under it), "think", "sys"
 * @property {string} [text]
 * @property {string} [html]
 * @property {boolean} [hl]  highlighted on its own step
 */

/**
 * A block in the context.
 * @typedef {object} Block
 * @property {string} id  for highlighting it later, and for notes to point at (#ctx-<id>)
 * @property {"sys" | "file" | "user" | "tool" | "res" | "say"} kind
 * @property {string} label  what it is: "System prompt", "CLAUDE.md", "MEMORY.md", "You", "Read" …
 * @property {string} [text]  what it says, or the part of it worth showing
 * @property {number} [more]  how many more lines it has than are shown
 * @property {string} [empty]  shown dimmed when there's no text, e.g. "(empty)"
 */

/**
 * A file on disk. `null` deletes it.
 * @typedef {{ text: string } | null} File
 */

/**
 * The memory file open on the right, under the index. Lines in `diff` show as added (green) or removed (red).
 * @typedef {{ path: string, label?: string, tag?: string, text?: string, hl?: number[] | "*", more?: number, diff?: { add?: number[], del?: number[] } }} View
 */

/**
 * @typedef {object} Note
 * @property {string} html
 * @property {string} at  a selector for the thing it points at
 * @property {"left" | "right" | "below" | "above" | "center"} side
 * @property {string} [mayCover]
 */

/**
 * @typedef {object} Step
 * @property {string} title
 * @property {string} [session]  the header's session label, from now on
 * @property {boolean} [clear]  the session ends: the conversation and the context are emptied before this step's own lines
 * @property {Line[]} [term]  lines added to the conversation
 * @property {Block[]} [ctx]  blocks added to the context
 * @property {Record<string, number[] | "*">} [ctxHl]  blocks (by id) highlighted on this step, all of them or some lines
 * @property {Record<string, File>} [files]  files written, changed or deleted, by path
 * @property {number[] | "*"} [indexHl]  lines of the index highlighted on this step
 * @property {{ add?: number[], del?: number[] }} [indexDiff]  lines of the index shown as added or removed on this step
 * @property {View | null} [view]  the memory file open on the right, from now on
 * @property {string} [typed]  text waiting in the input box
 * @property {string} [button]  the input box's button: "Send" or (by default) "Next"
 * @property {Note} [note]
 */

/**
 * @typedef {object} Script
 * @property {string} memory  the memory folder's path; its index is MEMORY.md in it
 * @property {Record<string, File>} [files]  what's on disk before step 0
 * @property {boolean} [plainContext]  show the context as one plain-text transcript, with a role line where the
 *   speaker changes, instead of a box per block
 * @property {Step[]} steps
 */

/** @typedef {{ step: number, open: boolean, problem: string }} Problem */

/** Covering these matters most to least. */
const COVER = /** @type {const} */ ([
  ["#session, .term .ln, .vh, .vbody .hl, .blk.hl, .pl.hl, #input .opt, #input .typed, .phead, header, nav", 1000],
  [".code .line, .blk, .pl", 50],
  ["#main > .panel, #disk > .panel", 0.5],
]);
const MUST_NOT_COVER = COVER[0][0];
const SIDES = /** @type {const} */ (["left", "right", "below", "above"]);
const W = 1280, H = 720;

/** @param {string} sel @returns {HTMLElement} */
function $(sel) {
  const el = document.querySelector(sel);
  if (!(el instanceof HTMLElement)) throw new Error(`missing element ${sel}`);
  return el;
}

/** @param {string} s  as it can go in an id */
export const idOf = (s) => s.replace(/\W+/g, "-");

/** @param {Script} script */
export function start(script) {
  const { steps } = script;
  const stage = $("#stage");
  const bub = $("#bubble");
  let at = 0;
  let open = true;
  let notice = "";
  let scale = 1;

  function fit() {
    scale = Math.min(innerWidth / W, innerHeight / H);
    stage.style.transform = `scale(${scale})`;
  }

  /** @param {Element} e  its box in stage coordinates */
  function box(e) {
    const s = stage.getBoundingClientRect(), r = e.getBoundingClientRect();
    return { x: (r.left - s.left) / scale, y: (r.top - s.top) / scale, w: r.width / scale, h: r.height / scale };
  }

  $("#dots").innerHTML = steps.map((s, i) => `<button class="dot" data-i="${i}" title="${esc(s.title)}" aria-label="Step ${i}: ${esc(s.title)}"></button>`).join("");
  $("#dots").addEventListener("click", (e) => {
    const i = e.target instanceof HTMLElement ? e.target.dataset.i : undefined;
    if (i !== undefined) go(+i);
  });

  /** The state after step i. */
  function stateAt(/** @type {number} */ i) {
    /** @type {Record<string, string>} */
    const files = {};
    for (const [p, f] of Object.entries(script.files ?? {})) if (f) files[p] = f.text;
    /** @type {{ line: Line, step: number }[]} */
    let term = [];
    /** @type {{ block: Block, step: number }[]} */
    let ctx = [];
    let session = "";
    /** @type {View | null} */
    let view = null;
    steps.slice(0, i + 1).forEach((s, j) => {
      if (s.clear) { term = []; ctx = []; }
      if (s.session !== undefined) session = s.session;
      for (const l of s.term ?? []) term.push({ line: l, step: j });
      for (const b of s.ctx ?? []) ctx.push({ block: b, step: j });
      for (const [p, f] of Object.entries(s.files ?? {})) { if (f) files[p] = f.text; else delete files[p]; }
      if (s.view !== undefined) view = s.view;
    });
    return { files, term, ctx, session, view };
  }

  /** @param {Line} l @param {boolean} fresh @param {number} n */
  function line(l, fresh, n) {
    const d = document.createElement("div");
    d.className = `ln ${l.cls}${fresh ? " fresh" : ""}${l.hl && fresh ? " hl" : ""}`;
    if (fresh) d.style.animationDelay = `${n * 0.3}s`;
    if (l.html) d.innerHTML = l.html; else if (l.text) d.textContent = l.text;
    return d;
  }

  /** @param {Block} b @param {boolean} fresh @param {number} n @param {number[] | "*" | undefined} hl */
  function block(b, fresh, n, hl) {
    const lines = (b.text ?? "").split("\n");
    const lit = new Set(Array.isArray(hl) ? hl : []);
    const body = b.text
      ? lines.map((l, i) => `<span class="bl${lit.has(i) ? " hl" : ""}">${esc(l) || " "}</span>`).join("") + (b.more ? `<span class="bl more">(${b.more} more lines)</span>` : "")
      : `<span class="bl none">${esc(b.empty ?? "")}</span>`;
    return `<div class="blk ${b.kind}${fresh ? " fresh" : ""}${hl === "*" ? " hl" : ""}" id="ctx-${idOf(b.id)}"${fresh ? ` style="animation-delay:${n * 0.3}s"` : ""}>
      <div class="bh">${esc(b.label)}</div>${b.text || b.empty ? `<div class="bb">${body}</div>` : ""}</div>`;
  }

  /**
   * The same block as plain text in a transcript: its lines, under a role line when the speaker changes.
   * @param {Block} b @param {boolean} fresh @param {number} n @param {number[] | "*" | undefined} hl @param {string} prev  the role before it
   * @returns {{ html: string, role: string }}
   */
  function plain(b, fresh, n, hl, prev) {
    const lit = new Set(Array.isArray(hl) ? hl : []);
    const text = b.text ?? "";
    /** @type {{ role?: string, text: string, i?: number, cls?: string, n?: number }[]} */
    const out = [];
    let role = prev;
    const say = (/** @type {string} */ r) => { if (r !== role) { out.push({ role: r, text: r }); role = r; } };
    // a line "…N" is about N lines left out
    const body = (/** @type {string} */ t) => t.split("\n").forEach((l, i) => {
      const m = /^…(\d*)$/.exec(l);
      out.push(m ? { text: m[1] ? `(${m[1]} line${m[1] === "1" ? "" : "s"} omitted)` : "(lines omitted)", cls: "more", n: Number(m[1] || 1) } : { text: l, i });
    });
    if (b.kind === "sys") { say("system"); body(text); }
    else if (b.kind === "file") { say("user"); out.push({ text: `Contents of ${b.label}:` }); if (text) body(text); else out.push({ text: b.empty ?? "", cls: "none" }); }
    else if (b.kind === "user") { say("user"); body(text); }
    else if (b.kind === "say") { say("assistant"); body(text); }
    else {
      const [tool, ...arg] = b.label.split(" ");
      say("assistant"); out.push({ text: `${tool}(${arg.join(" ")})` });
      say("tool result"); body(text);
    }
    if (b.more) out.push({ text: `(${b.more} lines omitted)`, cls: "more", n: b.more });
    const lines = out.map((l) => l.role
      ? `<span class="pl role">${esc(l.text)}</span>`
      : `<span class="pl${l.cls ? ` ${l.cls}` : ""}${hl === "*" || (l.i !== undefined && lit.has(l.i)) ? " hl" : ""}">${esc(l.text) || " "}</span>`).join("");
    // how many lines it really has, counting those left out
    const size = out.filter((l) => !l.role).reduce((a, l) => a + (l.n ?? 1), 0);
    return { role, html: `<div data-lines="${size}" class="pb ${b.kind}${fresh ? " fresh" : ""}" id="ctx-${idOf(b.id)}"${fresh ? ` style="animation-delay:${n * 0.3}s"` : ""}>${lines}</div>` };
  }

  /**
   * A file's lines as code, highlighted, with added and removed lines tinted green and red.
   * @param {string} path @param {string} text @param {number[] | "*" | undefined} hl @param {{ add?: number[], del?: number[] } | undefined} diff
   */
  function codeLines(path, text, hl, diff) {
    if (!text) return `<span class="line none">(empty)</span>`;
    const all = hl === "*", lit = new Set(Array.isArray(hl) ? hl : []);
    const add = new Set(diff?.add ?? []), del = new Set(diff?.del ?? []);
    const raw = text.split("\n");
    return highlightFile(path, text).map((l, i) => {
      // a line "…N" in a file stands for about N lines left out, as in the context
      const m = /^…(\d*)$/.exec(raw[i] ?? "");
      if (m) return `<span class="line more">(${m[1] ? `${m[1]} line${m[1] === "1" ? "" : "s"} omitted` : "lines omitted"})</span>`;
      return `<span class="line${all || lit.has(i) ? " hl" : ""}${add.has(i) ? " add" : ""}${del.has(i) ? " del" : ""}">${l || " "}</span>`;
    }).join("");
  }

  /** The memory index, always open at the top right. @param {Record<string, string>} files @param {Step} s */
  function renderIndex(files, s) {
    const path = `${script.memory}/MEMORY.md`;
    const text = files[path];
    $("#index").innerHTML = `<div class="vh"><span class="kind">Memory index</span><span class="where">MEMORY.md</span></div>
      <div class="folder">${esc(script.memory)}/</div>
      <pre class="vbody code"><code>${text === undefined ? `<span class="line none">(no file)</span>` : codeLines(path, text, s.indexHl, s.indexDiff)}</code></pre>`;
  }

  /** @param {View | null} v @param {Record<string, string>} files */
  function renderView(v, files) {
    const el = $("#view");
    if (!v) { el.innerHTML = ""; return; }
    const text = v.text ?? files[v.path] ?? "";
    const lines = codeLines(v.path, text, v.hl, v.diff) + (v.more ? `<span class="line more">(${v.more} more lines)</span>` : "");
    const name = v.path.split("/").pop() ?? v.path;
    el.innerHTML = `<div class="vh"><span class="kind">${esc(v.label ?? "Memory file")}</span><span class="where">${esc(name)}</span>${v.tag ? `<span class="tag">${esc(v.tag)}</span>` : ""}</div><pre class="vbody code"><code>${lines}</code></pre>`;
  }

  function render() {
    const s = steps[at];
    const st = stateAt(at);

    // the conversation
    const term = $("#term");
    term.innerHTML = "";
    let n = 0;
    for (const { line: l, step } of st.term) {
      if (term.lastElementChild?.classList.contains("think") && step === at) term.lastElementChild.remove();
      term.append(line(l, step === at, step === at ? n++ : 0));
    }
    // like a terminal, a full conversation scrolls up
    {
      const t = term, cs = getComputedStyle(t);
      const room = t.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom), gap = parseFloat(cs.rowGap) || 0;
      const kids = () => /** @type {HTMLElement[]} */ ([...t.children]);
      const used = () => kids().reduce((a, e) => a + e.offsetHeight, 0) + gap * Math.max(0, t.children.length - 1);
      while (t.children.length > 1 && used() - kids()[0].offsetHeight - gap >= room) kids()[0].remove();
      // the clear space above the lines, for a note to sit in (#term .gap)
      const space = document.createElement("div");
      space.className = "gap";
      t.prepend(space);
    }

    // the context: oldest at the top, as it's sent to the model
    const ctx = $("#ctxbody");
    n = 0;
    ctx.classList.toggle("plain", !!script.plainContext);
    if (!st.ctx.length) ctx.innerHTML = `<div class="none">Empty</div>`;
    else if (script.plainContext) {
      let role = "";
      ctx.innerHTML = st.ctx.map(({ block: b, step }) => {
        const p = plain(b, step === at, step === at ? n++ : 0, s.ctxHl?.[b.id], role);
        role = p.role;
        return p.html;
      }).join("");
    } else ctx.innerHTML = st.ctx.map(({ block: b, step }) => block(b, step === at, step === at ? n++ : 0, s.ctxHl?.[b.id])).join("");
    // if it overflows, keep the newest and the highlighted blocks in sight by folding the oldest unhighlighted ones
    for (const b of /** @type {HTMLElement[]} */ ([...ctx.querySelectorAll(".blk, .pb")])) {
      if (ctx.scrollHeight <= ctx.clientHeight) break;
      if (b.classList.contains("hl") || b.querySelector(".hl") || b.classList.contains("fresh")) continue;
      b.classList.add("folded");
    }
    // a run of folded blocks says, once, roughly how many lines it leaves out
    if (script.plainContext) {
      /** @type {HTMLElement | null} */
      let head = null;
      for (const b of /** @type {HTMLElement[]} */ ([...ctx.querySelectorAll(".pb")])) {
        if (!b.classList.contains("folded")) { head = null; continue; }
        const lines = Number(b.dataset.lines);
        if (head) { head.dataset.omit = String(Number(head.dataset.omit) + lines); b.dataset.omit = ""; }
        else { head = b; b.dataset.omit = String(lines); }
      }
      for (const b of /** @type {HTMLElement[]} */ ([...ctx.querySelectorAll(".pb[data-omit]")])) {
        if (!b.dataset.omit) continue;
        const n = Number(b.dataset.omit);
        const more = document.createElement("span");
        more.className = "pl more";
        more.textContent = `(${n > 10 ? Math.round(n / 10) * 10 : n} lines omitted)`;
        b.append(more);
      }
    }

    // the memory folder
    renderIndex(st.files, s);
    renderView(st.view, st.files);

    // the header's session label
    $("#session").textContent = st.session;
    $("#session").hidden = !st.session;

    // the input box
    const input = $("#input");
    input.innerHTML = "";
    if (s.typed) {
      const t = document.createElement("div");
      t.className = "typed";
      t.textContent = s.typed;
      input.append(t);
    }
    const btn = document.createElement("button");
    if (at < steps.length - 1) {
      const label = s.button ?? "Next";
      btn.className = label === "Send" ? "opt" : "opt continue";
      btn.innerHTML = `<span class="k">${label === "Send" ? "↵" : "→"}</span><span>${esc(label)}</span>`;
      btn.onclick = () => go(at + 1);
    } else {
      btn.className = "opt restart";
      btn.innerHTML = `<span class="k">↺ Restart</span>`;
      btn.onclick = () => go(0);
    }
    input.append(btn);

    // the nav
    document.querySelectorAll(".dot").forEach((d, i) => { d.className = `dot${i === at ? " now" : i < at ? " done" : ""}`; });
    $("#where").innerHTML = esc(s.title) + (notice ? ` <span class="notice">${esc(notice)}</span>` : "");
    /** @type {HTMLButtonElement} */ ($("#back")).disabled = at === 0;
    /** @type {HTMLButtonElement} */ ($("#next")).disabled = at === steps.length - 1;
    if (location.hash !== `#${at}`) history.replaceState(null, "", `#${at}`);

    place();
  }

  /** Put the note next to its target with the pointer on it, clear of anything that matters (as in agents.js). */
  function place() {
    const note = steps[at].note;
    if (!note) { bub.hidden = true; return; }
    bub.innerHTML = /<p>|<pre>/.test(note.html) ? note.html : `<p>${note.html}</p>`;
    bub.className = note.side;
    bub.hidden = false;
    bub.title = open ? "Close the note" : "Open the note";
    bub.setAttribute("aria-expanded", String(open));
    bub.style.left = "0px"; bub.style.top = "0px";
    bub.style.maxWidth = "";
    const el = document.querySelector(note.at);
    if (!el) return;
    const t = box(el);
    if (note.side === "center") bub.style.maxWidth = `${Math.min(parseFloat(getComputedStyle(bub).maxWidth) || Infinity, t.w - 24)}px`;
    const w = bub.offsetWidth, h = bub.offsetHeight;
    const gap = 14, tip = 9, m = 10;

    /** @param {string} side @param {number} x @param {number} y @param {number} p */
    const fold = (side, x, y, p) => {
      bub.textContent = "?";
      bub.className = `${side} folded`;
      const fw = bub.offsetWidth, fh = bub.offsetHeight, ft = 6;
      const across = side === "left" || side === "right";
      const fx = side === "left" ? x + w - fw : side === "right" ? x : side === "center" ? x + w / 2 - fw / 2 : p - fw / 2;
      const fy = side === "above" ? y + h - fh : side === "below" ? y : side === "center" ? y + h / 2 - fh / 2 : p - fh / 2;
      bub.style.left = `${fx}px`; bub.style.top = `${fy}px`;
      bub.style.setProperty("--px", `${across ? 0 : fw / 2 - ft}px`);
      bub.style.setProperty("--py", `${across ? fh / 2 - ft : 0}px`);
    };

    if (note.side === "center") {
      const x = Math.max(12, Math.min(W - 12 - w, t.x + t.w / 2 - w / 2)), y = Math.max(12, Math.min(H - 12 - h, t.y + t.h / 2 - h / 2));
      if (!open) return fold("center", x, y, 0);
      bub.style.left = `${x}px`; bub.style.top = `${y}px`;
      return;
    }

    const may = note.mayCover;
    const obstacles = COVER.flatMap(([q, wt]) => [...document.querySelectorAll(q)]
      .filter((e) => e !== el && !e.contains(el) && !el.contains(e))
      .map((e) => ({ ...box(e), wt: may && e.matches(may) ? Math.min(wt, 1) : wt })).filter((r) => r.w && r.h)).concat([{ ...t, wt: 1000 }]);
    /** @param {number} x @param {number} y */
    const cover = (x, y) => obstacles.reduce((a, r) =>
      a + r.wt * Math.max(0, Math.min(x + w, r.x + r.w) - Math.max(x, r.x)) * Math.max(0, Math.min(y + h, r.y + r.h) - Math.max(y, r.y)), 0);

    /** @type {{ score: number, side: string, x: number, y: number, p: number, across: boolean } | null} */
    let best = null;
    [note.side, ...SIDES.filter((x) => x !== note.side)].forEach((side, si) => {
      const across = side === "left" || side === "right";
      const [lo, hi, pref] = across ? [t.y + 2, t.y + t.h - 2, t.y + Math.min(t.h, 40) / 2] : [t.x + 2, t.x + t.w - 2, t.x + t.w / 2];
      const size = across ? h : w;
      for (const g of [gap, gap + 24, gap + 48]) for (let d = 0; d <= 400; d += 8) for (const sgn of d ? [1, -1] : [1]) {
        const startAt = pref - size / 2 + d * sgn;
        const x = side === "left" ? t.x - w - g : side === "right" ? t.x + t.w + g : startAt;
        const y = side === "above" ? t.y - h - g : side === "below" ? t.y + t.h + g : startAt;
        if (x < 12 || y < 12 || x + w > W - 12 || y + h > H - 12) continue;
        const pLo = Math.max(startAt + m + tip, lo), pHi = Math.min(startAt + size - m - tip, hi);
        if (pLo > pHi) continue;
        const p = Math.max(pLo, Math.min(pHi, pref));
        const score = cover(x, y) + si * 2000 + d * 2 + (g - gap) * 40 + Math.abs(p - pref) * 400;
        if (!best || score < best.score) best = { score, side, x, y, p, across };
      }
    });
    if (!best) return;
    const b = /** @type {{ score: number, side: string, x: number, y: number, p: number, across: boolean }} */ (best);
    if (!open) return fold(b.side, b.x, b.y, b.p);
    bub.className = b.side;
    bub.style.left = `${b.x}px`; bub.style.top = `${b.y}px`;
    bub.style.setProperty("--px", `${b.across ? 0 : b.p - b.x - tip}px`);
    bub.style.setProperty("--py", `${b.across ? b.p - b.y - tip : 0}px`);
  }

  /** @param {number} i */
  function go(i) {
    const to = Math.max(0, Math.min(steps.length - 1, i));
    if (to !== at) notice = "";
    at = to;
    render();
  }

  const toggle = () => { open = !open; place(); };
  bub.addEventListener("click", toggle);
  bub.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
  $("#back").onclick = () => go(at - 1);
  $("#next").onclick = () => go(at + 1);
  addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") go(at + 1);
    if (e.key === "ArrowLeft") go(at - 1);
  });
  addEventListener("resize", () => { fit(); place(); });

  function fromHash() {
    const h = location.hash.slice(1);
    const i = /^\d+$/.test(h) ? Number(h) : NaN;
    if (h && !(i >= 0 && i < steps.length)) {
      at = 0;
      notice = `(there's no step #${h}, so this is the start)`;
      render();
      return;
    }
    go(Number.isNaN(i) ? 0 : i);
  }
  addEventListener("hashchange", fromHash);
  fit();
  fromHash();

  /**
   * Check every step, folded and open: the note is on screen, covers nothing that matters, and the ? sits
   * at the open note's pointer. For the tests.
   * @returns {Problem[]}
   */
  function check() {
    const was = { at, open };
    /** @type {Problem[]} */
    const problems = [];
    const tipAt = () => {
      const r = box(bub);
      const t = bub.classList.contains("folded") ? 6 : 9;
      const px = parseFloat(bub.style.getPropertyValue("--px")), py = parseFloat(bub.style.getPropertyValue("--py"));
      if (bub.classList.contains("left")) return [r.x + r.w + t, r.y + py + t];
      if (bub.classList.contains("right")) return [r.x - t, r.y + py + t];
      if (bub.classList.contains("below")) return [r.x + px + t, r.y - t];
      if (bub.classList.contains("above")) return [r.x + px + t, r.y + r.h + t];
      return [r.x + r.w / 2, r.y + r.h / 2];
    };
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (!s.note) continue;
      /** @type {number[][]} */
      const tips = [];
      for (const o of [false, true]) {
        open = o;
        at = i;
        render();
        const target = document.querySelector(s.note.at);
        if (!target) { problems.push({ step: i, open: o, problem: `the note points at ${s.note.at}, which isn't on the page` }); continue; }
        const r = box(bub);
        if (r.x < 0 || r.y < 0 || r.x + r.w > W || r.y + r.h > H) problems.push({ step: i, open: o, problem: "the note is off the screen" });
        if (s.note.side !== "center") for (const e of document.querySelectorAll(MUST_NOT_COVER)) {
          if (e === target || e.contains(target) || target.contains(e)) continue;
          if (s.note.mayCover && e.matches(s.note.mayCover)) continue;
          const c = box(e);
          if (c.w && c.h && r.x < c.x + c.w && c.x < r.x + r.w && r.y < c.y + c.h && c.y < r.y + r.h) {
            problems.push({ step: i, open: o, problem: `the note covers ${e.id ? `#${e.id}` : e.className || e.tagName.toLowerCase()} "${(e.textContent ?? "").trim().slice(0, 30)}"` });
          }
        }
        tips.push(tipAt());
      }
      if (tips.length === 2 && Math.hypot(tips[0][0] - tips[1][0], tips[0][1] - tips[1][1]) > 4) problems.push({ step: i, open: false, problem: "the ? isn't where the open note's pointer is" });
    }
    at = was.at;
    open = was.open;
    render();
    return problems;
  }

  Object.assign(window, { explorable: { go, setOpen: (/** @type {boolean} */ o) => { open = o; place(); }, steps: steps.length, at: () => at, check } });
}
