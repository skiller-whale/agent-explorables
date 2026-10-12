// A canned main agent and its subagents, one step at a time, for a coach to screenshare.
//
// The page has three columns. Left, the main agent's conversation, with the list of agents under its input
// box, as in Claude Code. Middle, the selected subagent's own conversation, or (if the page has a #subs column
// instead of #sub) every subagent's conversation, stacked, with the selected one marked. Right, what the selected agent is
// looking at: a file, search results or a web page. Each agent shows the model it runs on and how much of
// its context window is used.
//
// A script is a list of steps. Each step says what changes once it has happened: lines in the conversations
// build up, and the rest (the selection, the view, each agent's context and status) carries on until a later
// step changes it. → and ← move a step, and so do the button in the input box and the dots.
//
// A step can have a note, which behaves as on the hooks pages: next to the thing to look at, open at first,
// folding to a small ? when clicked. The URL hash is the step, counted from #0.

import { escapeHtml as esc, highlightFile } from "../specs-and-plans/highlight.js";

/**
 * A line in a conversation.
 * @typedef {object} Line
 * @property {string} cls  "user", "say", "tool", "res" (a tool's result, under it), "box", "think"
 * @property {string} [text]  plain text
 * @property {string} [html]  or HTML
 * @property {string} [spin]  the tool line spins while this agent is running (a call to a subagent)
 * @property {number} [clip]  on its own step, show only this many lines of it, then how many more there are; after
 *   that it scrolls up with the rest of the conversation
 * @property {boolean} [keep]  stay cut off on later steps too
 * @property {string} [tail]  HTML for the line's end, shown under how many lines are left out
 * @property {boolean} [hl]  highlighted on its own step, like a highlighted line on the right
 */

/**
 * @typedef {object} Agent
 * @property {string} name
 * @property {string} model
 * @property {string} [tools]  the tools it has, shown under its name, e.g. "all except Edit, Write"
 */

/**
 * What the selected agent is looking at.
 * @typedef {{ kind: "file", path: string, text: string, hl?: number[] | "*", label?: string, more?: number }
 *   | { kind: "search", query: string, results: { title: string, url: string, snippet: string, hl?: boolean }[] }
 *   | { kind: "page", url: string, title: string, blocks: { text?: string, code?: string, hl?: boolean }[] }
 *   | { kind: "card", label: string, id: string, crumbs?: string, title: string, status: string, meta?: string,
 *       blocks: { text?: string, code?: string, hl?: boolean }[], hl?: "*" | "title" }
 * } View
 * A card is an item an MCP tool returned, such as an issue or a wiki page, drawn as the tracker or wiki would show it;
 * `hl: "*"` highlights all of it, `hl: "title"` its title.
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
 * @property {Line[]} [main]  lines added to the main agent's conversation
 * @property {Record<string, Line[]>} [sub]  lines added to each subagent's conversation
 * @property {Agent | Agent[]} [spawn]  a subagent starts, or several at once
 * @property {Record<string, "running" | "done">} [status]
 * @property {Record<string, string>} [stats]  what the agents list says after a subagent's name, e.g. "4 tool uses"
 * @property {Record<string, number>} [ctx]  tokens in each agent's context ("main" for the main agent)
 * @property {string[]} [grow]  agents whose context shows what it was before this step, then what it is now
 * @property {string} [select]  the subagent shown in the middle, and whose view is on the right; "main" for the main agent
 * @property {View | null} [view]  what the selected agent is looking at, from now on
 * @property {Record<string, number>} [cost]  what each model has cost so far in the session, in dollars (keys from `prices`)
 * @property {string} [typed]  text waiting in the input box
 * @property {string} [button]  the input box's button: "Start", "Send" or (by default) "Next"
 * @property {boolean} [closeSubs]  from now on the middle column (#subs or #sub) is empty, the subagents' conversations closed
 * @property {Note} [note]
 */

/**
 * @typedef {object} Script
 * @property {string} mainModel
 * @property {{ key: string, label: string, in: number, out: number }[]} [prices]  each model's list price, in dollars per million
 *   input and output tokens, for the cost panel; without it the panel shows only the session's cost
 * @property {Step[]} steps
 */

/** @typedef {{ step: number, open: boolean, problem: string }} Problem */

/** Covering these matters most to least. */
const COVER = /** @type {const} */ ([
  ["#cost, #cost .m, #cost .total, #sub .tools, .term .ln, #view .vh, #view .vbody .hl, #agents .row, #input .opt, #input .typed, .ahead, header, nav", 1000],
  ["#view .code .line, #view .vbody > *", 50],
  ["#main > .panel", 0.5],
]);
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

/** @param {string} name  an agent's name, as it can go in an id */
const idOf = (name) => name.replace(/\W+/g, "-");

/** @param {number} n  tokens */
const k = (n) => `${(n / 1000).toFixed(1)}k`;

/** @param {number} d  dollars: whole numbers as they are, anything else to the cent */
const money = (d) => (Number.isInteger(d) ? String(d) : d.toFixed(2));

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

  /** The state after step i: everything that carries on from step to step. */
  function stateAt(/** @type {number} */ i) {
    /** @type {Agent[]} */
    const agents = [];
    /** @type {Record<string, "running" | "done">} */
    const status = {};
    /** @type {Record<string, string>} */
    const stats = {};
    /** @type {Record<string, number>} */
    const ctx = {};
    let select = "main";
    let shown = ""; // the subagent in the middle: the one last selected
    /** @type {Record<string, number>} */
    const cost = {};
    /** @type {View | null} */
    let view = null;
    let closed = false;
    for (const s of steps.slice(0, i + 1)) {
      for (const a of [s.spawn ?? []].flat()) { agents.push(a); status[a.name] = "running"; }
      Object.assign(status, s.status ?? {});
      Object.assign(stats, s.stats ?? {});
      Object.assign(ctx, s.ctx ?? {});
      Object.assign(cost, s.cost ?? {});
      if (s.select) { select = s.select; if (s.select !== "main") shown = s.select; }
      if (s.view !== undefined) view = s.view;
      if (s.closeSubs) closed = true;
    }
    return { agents, status, stats, ctx, cost, select, shown, view, closed };
  }

  /**
   * @param {Line} l
   * @param {boolean} fresh
   * @param {number} i
   * @param {Record<string, "running" | "done">} status
   */
  function line(l, fresh, i, status) {
    const d = document.createElement("div");
    d.className = `ln ${l.cls}${fresh ? " fresh" : ""}${l.hl && fresh ? " hl" : ""}${l.spin && status[l.spin] === "running" ? " spin" : ""}`;
    if (fresh) d.style.animationDelay = `${i * 0.3}s`;
    // a line to cut off keeps its text in an inner block, so the cut doesn't show in its padding
    const body = l.clip && (fresh || l.keep) ? document.createElement("div") : d;
    if (body !== d) {
      body.className = "clip"; body.dataset.clip = String(l.clip); d.classList.add("cut"); d.append(body);
      if (l.tail) body.dataset.tail = l.tail;
    }
    if (l.html) body.innerHTML = l.html;
    else if (l.text) body.textContent = l.text;
    return d;
  }

  /**
   * @param {string} who  the agent's name, or "main"
   * @param {string} model
   * @param {number | undefined} tokens
   */
  function head(/** @type {string} */ who, /** @type {string} */ model, /** @type {number | undefined} */ tokens, /** @type {number | undefined} */ was) {
    const from = was && was !== tokens ? `<span class="was">${k(was)}</span> → ` : "";
    return `<span class="who">${who === "main" ? "Main agent" : esc(who)}</span><span class="model">${esc(model)}</span>
      <span class="ctx" id="ctx-${idOf(who)}"><span class="lbl">context</span> ${from}<b>${tokens ? k(tokens) : "–"}</b> tokens</span>`;
  }

  /** @param {View | null} v @param {string} who */
  function renderView(v, who) {
    const el = $("#view");
    if (!v) { el.innerHTML = ""; return; }
    const whose = `<span class="whose">${who === "main" ? "Main agent" : esc(who)}</span>`;
    if (v.kind === "file") {
      const all = v.hl === "*";
      const hl = new Set(Array.isArray(v.hl) ? v.hl : []);
      const lines = highlightFile(v.path, v.text).map((l, i) => `<span class="line${all || hl.has(i) ? " hl" : ""}">${l || " "}</span>`).join("") +
        (v.more ? `<span class="line more">(${v.more} more lines)</span>` : "");
      el.innerHTML = `<div class="vh">${whose}<span class="kind">${esc(v.label ?? "File")}</span><span class="where">${esc(v.path)}</span></div><pre class="vbody code"><code>${lines}</code></pre>`;
    } else if (v.kind === "search") {
      el.innerHTML = `<div class="vh">${whose}<span class="kind">Search</span><span class="where">${esc(v.query)}</span></div>
        <div class="vbody results">${v.results.map((r) => `<div class="result${r.hl ? " hl" : ""}"><div class="rt">${esc(r.title)}</div><div class="ru">${esc(r.url)}</div><div class="rs">${esc(r.snippet)}</div></div>`).join("")}</div>`;
    } else if (v.kind === "card") {
      el.innerHTML = `<div class="vh">${whose}<span class="kind">${esc(v.label)}</span><span class="where">${esc(v.id)}</span></div>
        <div class="vbody pagebody cardbody"><div class="card${v.hl === "*" ? " hl" : ""}">${v.crumbs ? `<div class="crumbs">${esc(v.crumbs)}</div>` : ""}<h2${v.hl === "title" ? ' class="hl"' : ""}>${esc(v.title)}</h2>
        <div class="meta"><span class="chip">${esc(v.status)}</span>${v.meta ? ` ${esc(v.meta)}` : ""}</div>${v.blocks.map((b) => b.code !== undefined
          ? `<pre class="${b.hl ? "hl" : ""}">${esc(b.code)}</pre>`
          : `<p class="${b.hl ? "hl" : ""}">${esc(b.text ?? "")}</p>`).join("")}</div></div>`;
    } else {
      el.innerHTML = `<div class="vh">${whose}<span class="kind">Web page</span><span class="where">${esc(v.url)}</span></div>
        <div class="vbody pagebody"><h2>${esc(v.title)}</h2>${v.blocks.map((b) => b.code !== undefined
          ? `<pre class="${b.hl ? "hl" : ""}">${esc(b.code)}</pre>`
          : `<p class="${b.hl ? "hl" : ""}">${esc(b.text ?? "")}</p>`).join("")}</div>`;
    }
    const body = el.querySelector(".vbody"), first = el.querySelector(".hl");
    // scroll to the first highlighted line only when it would otherwise be out of sight
    if (body instanceof HTMLElement && first instanceof HTMLElement && first.offsetTop - body.offsetTop + first.offsetHeight > body.clientHeight)
      body.scrollTop = Math.max(0, first.offsetTop - body.offsetTop - 40);
  }

  function render() {
    const s = steps[at];
    const st = stateAt(at);

    const before = at ? stateAt(at - 1).ctx : {};
    /** @param {string} who */
    const was = (who) => s.grow?.includes(who) ? before[who] : undefined;

    // the subagents' conversations: the shown one in #sub, or all of them, stacked, in #subs
    const stack = document.querySelector("#subs");
    /** @type {Map<string, HTMLElement>} */
    const terms = new Map();
    if (stack) {
      stack.innerHTML = st.agents.length && !st.closed
        ? st.agents.map((a) => `<section class="panel${st.select === a.name ? " selected" : ""}" id="sub-${idOf(a.name)}" aria-label="${esc(a.name)}">
            <div class="ahead">${head(a.name, a.model, st.ctx[a.name], was(a.name))}</div><div class="term" aria-live="polite"></div></section>`).join("")
        : `<section class="panel empty"><div class="ahead"><span class="who none">No subagents running</span></div></section>`;
      if (!st.closed) st.agents.forEach((a) => terms.set(a.name, $(`#sub-${idOf(a.name)} .term`)));
    } else {
      $("#subterm").innerHTML = "";
      if (!st.closed) terms.set(st.shown, $("#subterm"));
    }

    // the conversations: everything up to here, with this step's lines fading in
    const mainterm = $("#mainterm");
    mainterm.innerHTML = "";
    for (const t of terms.values()) t.innerHTML = "";
    steps.slice(0, at + 1).forEach((x, j) => {
      const fresh = j === at;
      let n = 0;
      for (const l of x.main ?? []) {
        if (mainterm.lastElementChild?.classList.contains("think")) mainterm.lastElementChild.remove();
        mainterm.append(line(l, fresh, n++, st.status));
      }
      const first = n; // the subagents' lines all come in together
      for (const [name, t] of terms) {
        n = first;
        for (const l of x.sub?.[name] ?? []) {
          if (t.lastElementChild?.classList.contains("think")) t.lastElementChild.remove();
          t.append(line(l, fresh, n++, st.status));
        }
      }
    });

    // long lines cut off, with how many lines are left out under them
    for (const d of document.querySelectorAll(".term [data-clip]")) {
      if (!(d instanceof HTMLElement) || !(d.parentElement instanceof HTMLElement)) continue;
      const lh = parseFloat(getComputedStyle(d).lineHeight), clip = Number(d.dataset.clip);
      const lines = Math.round(d.scrollHeight / lh);
      const fresh = d.parentElement.classList.contains("fresh") ? " fresh" : "";
      /** @type {HTMLElement[]} */
      const under = [];
      if (lines > clip) {
        d.style.maxHeight = `${clip * lh}px`;
        const more = document.createElement("div");
        more.className = `ln more${fresh}`;
        more.textContent = `(${lines - clip} more lines)`;
        under.push(more);
      }
      if (d.dataset.tail) {
        const tail = document.createElement("div");
        tail.className = `ln tail${fresh}`;
        tail.innerHTML = d.dataset.tail;
        under.push(tail);
      }
      for (const u of under) u.style.animationDelay = d.parentElement.style.animationDelay;
      d.parentElement.after(...under);
    }

    // like a terminal, a full conversation scrolls up: lines that have gone out of sight are dropped, and the top
    // one may be part-hidden...
    for (const t of [mainterm, ...terms.values()]) {
      const cs = getComputedStyle(t);
      const room = t.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom), gap = parseFloat(cs.rowGap) || 0;
      const kids = () => /** @type {HTMLElement[]} */ ([...t.children]);
      const used = () => kids().reduce((a, e) => a + e.offsetHeight, 0) + gap * Math.max(0, t.children.length - 1);
      while (t.children.length > 1 && used() - kids()[0].offsetHeight - gap >= room) kids()[0].remove();
      // and the top one is cut at a line, so no sliver of a line shows
      const top = kids()[0], hidden = used() - room - parseFloat(cs.paddingTop);
      if (top && hidden > 0) {
        const cs1 = getComputedStyle(top), lh = parseFloat(cs1.lineHeight), pad = parseFloat(cs1.paddingTop);
        top.style.clipPath = `inset(${pad + Math.ceil((hidden - pad - 1) / lh) * lh}px 0 0 0)`;
      }
    }

    // the headers: model and context
    $("#mainhead").innerHTML = head("main", script.mainModel, st.ctx.main, was("main"));
    if (!stack) {
      const shown = st.closed ? undefined : st.agents.find((a) => a.name === st.shown);
      $("#subhead").innerHTML = shown ? head(shown.name, shown.model, st.ctx[shown.name], was(shown.name)) : `<span class="who none">No subagent running</span>`;
      const tools = $("#subtools");
      tools.hidden = !shown?.tools;
      tools.innerHTML = shown?.tools ? `<span class="lbl">tools</span> ${esc(shown.tools)}` : "";
      $("#sub").classList.toggle("empty", !shown);
      $("#sub").classList.toggle("selected", !!shown && st.select !== "main");
    }

    // the agents list under the input box
    $("#agents").innerHTML = st.agents.length
      ? [`<div class="row${st.select === "main" ? " sel" : ""}" id="row-main"><span class="g">●</span><span class="nm">main</span><span class="md">${esc(script.mainModel)}</span><span class="st"></span></div>`,
         ...st.agents.map((a) => `<div class="row ${st.status[a.name]}${st.select === a.name ? " sel" : ""}" id="row-${idOf(a.name)}"><span class="g">${st.status[a.name] === "done" ? "✓" : "◌"}</span><span class="nm">${esc(a.name)}</span><span class="md">${esc(a.model)}</span><span class="st">${esc(st.stats[a.name] ?? "")}</span></div>`)].join("")
      : "";

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
    } else {
      const btn = document.createElement("button");
      btn.className = "opt restart";
      btn.innerHTML = `<span class="k">↺ Restart</span>`;
      btn.onclick = () => go(0);
      input.append(btn);
    }

    renderView(st.view, st.select);

    // the session's cost so far, and what each model costs
    const total = Object.values(st.cost).reduce((a, b) => a + b, 0);
    $("#cost").innerHTML = `<span class="total"><span class="lbl">Session cost</span> <b>$${total.toFixed(3)}</b></span>` +
      (script.prices ?? []).map((p) => `<span class="m${st.cost[p.key] ? "" : " none"}" id="cost-${esc(p.key)}"><span class="nm">${esc(p.label)}</span> <b>$${(st.cost[p.key] ?? 0).toFixed(3)}</b><span class="price">$${money(p.in)} in · $${money(p.out)} out per M tokens</span></span>`).join("");

    // the nav
    document.querySelectorAll(".dot").forEach((d, i) => { d.className = `dot${i === at ? " now" : i < at ? " done" : ""}`; });
    $("#where").innerHTML = esc(s.title) + (notice ? ` <span class="notice">${esc(notice)}</span>` : "");
    /** @type {HTMLButtonElement} */ ($("#back")).disabled = at === 0;
    /** @type {HTMLButtonElement} */ ($("#next")).disabled = at === steps.length - 1;
    if (location.hash !== `#${at}`) history.replaceState(null, "", `#${at}`);

    place();
  }

  /**
   * Put the note next to its target with the pointer on it, clear of anything that matters (as on the
   * hooks pages, in harness.js).
   */
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
