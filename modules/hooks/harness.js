// A canned walk through the agent's harness, one step at a time, for a coach to screenshare.
//
// The page has three columns: the agent's conversation; the harness, drawn as a loop of states with the
// things it talks to around it; and the hook registry above the terminal the hooks run in. A script is a
// list of steps. Each step says what the page looks like once it has happened: lines in the conversation
// and the terminal build up, and everything else (the state, the edge just taken, what is lit) describes
// that step alone. → and ← move a step, and so do the button in the input box and the dots.
//
// A step can have a note: a yellow box next to the thing to look at. Notes start open, and the coach
// clicks one to fold it to a small ? (and clicks the ? to open it again). Open or folded, the setting carries over from step to step. The ? sits
// where the open note's pointer will be, so opening it doesn't move anything.
//
// The URL hash is the step, counted from #0 (the introduction). A hash that matches no step starts at the
// beginning and says so.

/**
 * A line in the conversation or the terminal.
 * @typedef {object} Line
 * @property {string} cls  how it's styled: "user", "say", "think", "tool", "diff", "hookfb" in the conversation;
 *   "cmd", "stdin", "err", "exit good", "exit bad", "gap" in the terminal
 * @property {string} [text]  plain text
 * @property {string} [html]  or HTML
 */

/**
 * @typedef {object} Note
 * @property {string} html  what it says (plain sentences, or <p> and <pre> blocks)
 * @property {string} at  a selector for the thing it points at
 * @property {"left" | "right" | "below" | "above" | "center"} side  where it would like to sit; it moves
 *   to another side if that one would cover something that matters
 * @property {string} [mayCover]  a selector for things it's allowed to cover, where there's no better place
 */

/**
 * @typedef {object} Step
 * @property {string} title  shown under the page and on the step's dot
 * @property {string | null} state  the harness state now (a node id in the diagram)
 * @property {string} [edge]  the edge just taken to get there
 * @property {string[]} [lit]  the boxes around the harness that are in play
 * @property {string[]} [arrows]  the arrows running between the harness and those boxes
 * @property {string} [ctxLabel]  the label on the arrow to the model (default "context")
 * @property {string} [replyLabel]  the label on the arrow from the model (default "reply")
 * @property {Record<string, "look" | "match">} [reg]  registry rows the harness looks at: "look" finds
 *   nothing, "match" finds the hook
 * @property {boolean} [registry]  the agent has read settings.json, so the registry is filled in from here on
 * @property {Line[]} [cc]  lines added to the conversation (a "think" line goes when the next line comes)
 * @property {Line[]} [term]  lines added to the terminal
 * @property {number[]} [scriptHl]  with a hook script shown: the lines of it running at this step (from 0)
 * @property {string} [stdin]  with a hook script shown: what it's given on stdin from this step on (HTML)
 * @property {Line[]} [out]  with a hook script shown: what it outputs, from this step on
 * @property {string} [typed]  text waiting in the input box
 * @property {string} [button]  the input box's button: "Start", "Send" or (by default) "Next"
 * @property {Note} [note]
 */

/**
 * @typedef {object} Hook
 * @property {string} event  e.g. "PostToolUse"
 * @property {string} matcher
 * @property {string} command
 */

/**
 * @typedef {object} Script
 * @property {string[]} events  the registry's rows, in order
 * @property {Hook[]} hooks  what settings.json registers
 * @property {"full" | "line"} [registry]  "line" shows each hook on one line (event, matcher → command), with
 *   no empty rows; the default shows every event in `events`, empty or not
 * @property {{ name: string, lines: string[] }} [hookScript]  show this script in place of the hooks' terminal,
 *   with its input and output
 * @property {Record<string, [string, string]>} edges  edge id -> [from state, to state]; a step may only
 *   stay in its state or move along one of these
 * @property {Step[]} steps
 */

/** What can be found wrong with a page, for the tests. */
/** @typedef {{ step: number, open: boolean, problem: string }} Problem */

/** Covering these matters most to least: what's in play at this step, states already passed, the rest. */
const COVER = /** @type {const} */ ([
  ["#harness .node.now, .box.lit, .arrow.on, .elabel.now, .reg, #term .ln, #hooklines .tl, #hooklines .io, #input .opt, #input .typed, .panel > .label, header, nav", 1000],
  ["#harness .node.seen:not(.now)", 6],
  ["#harness .node:not(.seen), .box:not(.lit), .elabel:not(.now), #harness .title", 1],
  ["#main > .panel, #right > .panel", 0.5], // straddling a column edge looks careless
  ["#harness > rect", 0.3], // a note outside the harness should stay outside it if it can
]);
/** Covering any of these is a fault, whatever else the note had to choose between. */
const MUST_NOT_COVER = COVER[0][0];
const SIDES = /** @type {const} */ (["left", "right", "below", "above"]);
const W = 1280, H = 720;

/**
 * @param {string} sel
 * @returns {HTMLElement}
 */
function $(sel) {
  const el = document.querySelector(sel);
  if (!(el instanceof HTMLElement)) throw new Error(`missing element ${sel}`);
  return el;
}

/**
 * For SVG elements, which aren't HTMLElements.
 * @param {string} sel
 * @returns {Element}
 */
function $el(sel) {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`missing element ${sel}`);
  return el;
}

/** @param {string} s */
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

/** @param {Script} script */
export function start(script) {
  const { steps } = script;
  const stage = $("#stage");
  const bub = $("#bubble");
  let at = 0;
  let open = true; // notes start open, and stay as the coach last left them
  let notice = ""; // shown after the step's title until the coach moves, e.g. for a hash that matches no step
  let k = 1;

  function fit() {
    k = Math.min(innerWidth / W, innerHeight / H);
    stage.style.transform = `scale(${k})`;
  }

  /** @param {Element} e  its box in stage coordinates */
  function box(e) {
    const s = stage.getBoundingClientRect(), r = e.getBoundingClientRect();
    return { x: (r.left - s.left) / k, y: (r.top - s.top) / k, w: r.width / k, h: r.height / k };
  }

  $("#dots").innerHTML = steps.map((s, i) => `<button class="dot" data-i="${i}" title="${esc(s.title)}" aria-label="Step ${i}: ${esc(s.title)}"></button>`).join("");
  $("#dots").addEventListener("click", (e) => {
    const i = e.target instanceof HTMLElement ? e.target.dataset.i : undefined;
    if (i !== undefined) go(+i);
  });

  /**
   * @param {Line} l
   * @param {"ln" | "tl"} kind
   * @param {boolean} fresh  added at this step: fades in, one after another
   * @param {number} i
   */
  function line(l, kind, fresh, i) {
    const d = document.createElement("div");
    d.className = `${kind} ${l.cls}${fresh ? " fresh" : ""}`;
    if (fresh) d.style.animationDelay = `${i * 0.35}s`;
    if (l.html) d.innerHTML = l.html;
    else if (l.text) d.textContent = l.text;
    return d;
  }

  function render() {
    const s = steps[at];
    const upTo = steps.slice(0, at + 1);

    // the conversation and the terminal: everything up to here, with this step's lines fading in
    const term = $("#term"), hook = $("#hooklines");
    term.innerHTML = "";
    hook.innerHTML = "";
    upTo.forEach((x, j) => {
      const fresh = j === at;
      (x.cc ?? []).forEach((l, i) => {
        if (term.lastElementChild?.classList.contains("think")) term.lastElementChild.remove();
        term.append(line(l, "ln", fresh, i));
      });
      (x.term ?? []).forEach((l, i) => hook.append(line(l, "tl", fresh, i + (x.cc?.length ?? 0))));
    });

    // or the hook's script, the lines running now, and what it was given and gave back
    if (script.hookScript) {
      const stdin = [...upTo].reverse().find((x) => x.stdin !== undefined)?.stdin;
      const outAt = upTo.map((x) => x.out).filter(Boolean).pop();
      const hl = new Set(s.scriptHl ?? []);
      const code = script.hookScript.lines.map((l, i) => `<span class="line${hl.has(i) ? " hl" : ""}">${esc(l) || " "}</span>`).join("");
      const freshIn = s.stdin !== undefined, freshOut = !!s.out;
      hook.innerHTML = `<pre class="code">${code}</pre>
        <div class="io" id="script-in"><span class="tag">input, on stdin</span>${stdin ? `<div class="${freshIn ? "fresh" : ""}">${stdin}</div>` : `<div class="none">Not run yet</div>`}</div>
        <div class="io" id="script-out"><span class="tag">output</span>${outAt ? outAt.map((l) => `<div class="tl ${l.cls}${freshOut ? " fresh" : ""}">${l.html ?? esc(l.text ?? "")}</div>`).join("") : `<div class="none">Nothing yet</div>`}</div>`;
    }

    // the input box
    const input = $("#input");
    input.innerHTML = "";
    if (s.typed) {
      const t = document.createElement("div");
      t.className = "typed";
      t.textContent = s.typed;
      input.append(t);
    }
    if (at < steps.length - 1) {
      const label = s.button ?? "Next";
      const btn = document.createElement("button");
      btn.className = label === "Send" ? "opt" : "opt continue";
      btn.innerHTML = `<span class="k">${label === "Send" ? "↵" : "→"}</span><span>${esc(label)}</span>`;
      btn.onclick = () => go(at + 1);
      input.append(btn);
    }

    // the diagram: the state now, the ones passed, the edges taken, what's lit
    const seen = new Set(upTo.map((x) => x.state));
    const taken = new Set(upTo.map((x) => x.edge));
    document.querySelectorAll(".node").forEach((n) => {
      n.classList.toggle("now", n.id === s.state);
      n.classList.toggle("seen", seen.has(n.id));
    });
    document.querySelectorAll(".edge").forEach((e) => {
      e.classList.toggle("taken", taken.has(e.id));
      e.classList.toggle("now", e.id === s.edge);
    });
    document.querySelectorAll(".elabel").forEach((l) => {
      l.classList.toggle("now", l.getAttribute("data-edge") === s.edge);
      l.classList.toggle("taken", taken.has(l.getAttribute("data-edge") ?? ""));
    });
    $el("#harness").classList.toggle("lit", !!s.state);
    document.querySelectorAll(".box").forEach((x) => x.classList.toggle("lit", (s.lit ?? []).includes(x.id)));
    document.querySelectorAll(".arrow").forEach((x) => x.classList.toggle("on", (s.arrows ?? []).includes(x.id)));
    $el("#t-ctx").textContent = s.ctxLabel ?? "context";
    $el("#t-reply").textContent = s.replyLabel ?? "reply";

    // the registry: empty until the agent has read settings.json
    const loaded = upTo.some((x) => x.registry);
    $("#reglist").innerHTML = !loaded
      ? `<div class="reg more">Not loaded yet.</div>`
      : script.registry === "line"
      ? script.hooks.map((h) => `<div class="reg line ${s.reg?.[h.event] ?? ""}" id="reg-${h.event}"><span class="ev">${h.event}</span> <span class="v">${esc(h.matcher)}</span> → <span class="v">${esc(h.command)}</span></div>`).join("")
      : script.events.map((ev) => {
          const hooks = script.hooks.filter((h) => h.event === ev);
          const body = hooks.length
            ? hooks.map((h) => `<div class="entry"><span class="k">matcher</span> <span class="v">${esc(h.matcher)}</span>\n<span class="k">command</span> <span class="v">${esc(h.command)}</span></div>`).join("")
            : `<span class="none">none</span>`;
          return `<div class="reg ${s.reg?.[ev] ?? ""}" id="reg-${ev}"><span class="ev">${ev}</span>${body}</div>`;
        }).join("") + `<div class="reg more">…</div>`;

    // the nav
    document.querySelectorAll(".dot").forEach((d, i) => { d.className = `dot${i === at ? " now" : i < at ? " done" : ""}`; });
    $("#where").innerHTML = esc(s.title) + (notice ? ` <span class="notice">${esc(notice)}</span>` : "");
    /** @type {HTMLButtonElement} */ ($("#back")).disabled = at === 0;
    /** @type {HTMLButtonElement} */ ($("#next")).disabled = at === steps.length - 1;
    if (location.hash !== `#${at}`) history.replaceState(null, "", `#${at}`);

    place();
  }

  /**
   * Put the note next to its target with the pointer on it, clear of anything that matters. The open note
   * is always placed, even when folded, so the ? can sit where its pointer will be. The note tries the side
   * the step asks for first, then the others, sliding along each and standing a little further off if it
   * must, and takes the spot that covers least, with its pointer as near the middle of the target as it can
   * (so a ? pointing at the same thing sits in the same place from step to step).
   */
  function place() {
    const note = steps[at].note;
    if (!note) { bub.hidden = true; return; }
    bub.innerHTML = /<p>|<pre>/.test(note.html) ? note.html : `<p>${note.html}</p>`;
    bub.className = note.side;
    bub.hidden = false;
    bub.title = open ? "Close the note" : "Open the note";
    bub.setAttribute("aria-expanded", String(open));
    bub.style.left = "0px"; bub.style.top = "0px"; // measure at full width, not squeezed against an edge
    const el = document.querySelector(note.at);
    if (!el) return;
    const t = box(el);
    const w = bub.offsetWidth, h = bub.offsetHeight;
    const gap = 14, tip = 9, m = 10;

    /**
     * The ? on the open note's pointer edge, at the pointer.
     * @param {string} side @param {number} x @param {number} y @param {number} p
     */
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
      const x = t.x + t.w / 2 - w / 2, y = t.y + t.h / 2 - h / 2;
      if (!open) return fold("center", x, y, 0);
      bub.style.left = `${x}px`; bub.style.top = `${y}px`;
      return;
    }

    const obstacles = COVER.flatMap(([q, wt]) => [...document.querySelectorAll(q)]
      .filter((e) => e !== el && !e.contains(el) && !el.contains(e))
      .map((e) => ({ ...box(e), wt })).filter((r) => r.w && r.h)).concat([{ ...t, wt: 1000 }]);
    /** @param {number} x @param {number} y */
    const cover = (x, y) => obstacles.reduce((a, r) =>
      a + r.wt * Math.max(0, Math.min(x + w, r.x + r.w) - Math.max(x, r.x)) * Math.max(0, Math.min(y + h, r.y + r.h) - Math.max(y, r.y)), 0);

    /** @type {{ score: number, side: string, x: number, y: number, p: number, across: boolean } | null} */
    let best = null;
    [note.side, ...SIDES.filter((x) => x !== note.side)].forEach((side, si) => {
      const across = side === "left" || side === "right"; // the pointer is on a vertical edge
      // where the pointer would like to be, and the span of the target it may point at
      const [lo, hi, pref] = across ? [t.y + 2, t.y + t.h - 2, t.y + Math.min(t.h, 40) / 2] : [t.x + 2, t.x + t.w - 2, t.x + t.w / 2];
      const size = across ? h : w;
      for (const g of [gap, gap + 24, gap + 48]) for (let d = 0; d <= 400; d += 8) for (const sgn of d ? [1, -1] : [1]) {
        const start = pref - size / 2 + d * sgn; // the note's top (or left)
        const x = side === "left" ? t.x - w - g : side === "right" ? t.x + t.w + g : start;
        const y = side === "above" ? t.y - h - g : side === "below" ? t.y + t.h + g : start;
        if (x < 12 || y < 12 || x + w > W - 12 || y + h > H - 12) continue;
        // the pointer has to sit on both the note's edge and the target
        const pLo = Math.max(start + m + tip, lo), pHi = Math.min(start + size - m - tip, hi);
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
   * Check every step, folded and open: a note covers nothing that matters, the ? sits at the open note's
   * pointer, and every step stays in its state or moves along an edge of the loop. For the tests.
   * @returns {Problem[]}
   */
  function check() {
    const was = { at, open };
    /** @type {Problem[]} */
    const problems = [];
    /** the pointer's tip, in stage coordinates */
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
      const s = steps[i], prev = steps[i - 1];
      if (prev?.state && s.state !== prev.state) {
        const e = s.edge && script.edges[s.edge];
        if (!e || e[0] !== prev.state || e[1] !== s.state) problems.push({ step: i, open: false, problem: `jumps from ${prev.state} to ${s.state} without taking an edge between them` });
      }
      if (!s.note) continue;
      /** @type {number[][]} */
      const tips = [];
      for (const o of [false, true]) {
        open = o;
        at = i;
        render();
        if (!document.querySelector(s.note.at)) { problems.push({ step: i, open: o, problem: `the note points at ${s.note.at}, which isn't on the page` }); continue; }
        const r = box(bub);
        if (r.x < 0 || r.y < 0 || r.x + r.w > W || r.y + r.h > H) problems.push({ step: i, open: o, problem: "the note is off the screen" });
        const target = document.querySelector(s.note.at);
        for (const e of document.querySelectorAll(MUST_NOT_COVER)) {
          if (target && (e === target || e.contains(target) || target.contains(e))) continue;
          if (s.note.mayCover && e.matches(s.note.mayCover)) continue;
          const c = box(e);
          if (c.w && c.h && r.x < c.x + c.w && c.x < r.x + r.w && r.y < c.y + c.h && c.y < r.y + r.h) {
            problems.push({ step: i, open: o, problem: `the note covers ${e.id ? `#${e.id}` : e.tagName.toLowerCase()} "${(e.textContent ?? "").trim().slice(0, 30)}"` });
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

  /** For the tests, and for checking from the console. */
  Object.assign(window, { explorable: { go, setOpen: (/** @type {boolean} */ o) => { open = o; place(); }, steps: steps.length, at: () => at, check } });
}
