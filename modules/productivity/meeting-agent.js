// Booking a meeting: an agent with guidance, a tool for getting information, an approval gate and a tool for taking action.
// Canned and artificial (no recording): see SOURCES.md. The stage is drawn on a 1040x560 grid; overlays are placed on the same grid.

const W = 1040, H = 560;
const C = { ink: "#1d1d1d", muted: "#5f6870", blue: "#4ba1f1", amber: "#f1ac4b", coral: "#f39a6b", border: "#d3d8dd", wire: "#c9ced3", pill: "#f1f3f5", pillOn: "#ddedfa", white: "#ffffff", guideHl: "#fbe6c4" };
// Faded fill and edge for each kind of box.
/** @type {Record<string, [string, string]>} */
const TINT = { guidance: ["#fdf4e4", "#ecd3a8"], info: ["#eaf3fc", "#b9d7f2"], actions: ["#e9f6ee", "#b5dcc5"] };
// A wrench, drawn on a 12x12 grid.
const WRENCH = `<path d="M7.6 1.2a3.2 3.2 0 0 0-3.3 4.3L1 8.8a1.3 1.3 0 0 0 1.9 1.9l3.3-3.3a3.2 3.2 0 0 0 4.3-3.3L8.7 5.9 7 5.6 6.7 3.9z"/>`;
/** @type {Record<string, [string, string, string]>} */
const PEOPLE = { P: ["Priya", "var(--priya)", "var(--priya-edge)"], T: ["Tom", "var(--tom)", "var(--tom-edge)"], S: ["Sam", "var(--sam)", "var(--sam-edge)"] };

/** @type {Record<string, string>} */
const ARROWS = {
  ask:     "M290 235 H392",
  reply:   "M545 195 V180 H652 V100 H682",
  think:   "M545 195 V180 H652 V100 H684",
  guide:   "M485 168 V187",
  call:    "M465 275 V327",
  result:  "M505 335 V283",
  toCal:   "M655 400 H692",
  toGate:  "M570 235 H637",
  through: "M663 235 H712",
};

const PROMPT = "Find 45 minutes for a project kickoff with Priya, Tom and Sam, ideally next week, and book it.";

// [day 0-4, start, end, person, title, class]
/** @typedef {[number, number, number, string|null, string, string?]} Ev */
/** @type {{label: string, days: string[], ev: Ev[]}} */
const WEEK1 = { label: "Week of 19 October", days: ["Mon 19", "Tue 20", "Wed 21", "Thu 22", "Fri 23"], ev: [
  [0, 9, 10.5, "P", "Planning"], [0, 10.5, 12.5, "T", "Design review"], [0, 13.5, 15, "S", "Interviews"], [0, 15, 16, "P", "1:1"], [0, 16, 17, "T", "Retro"],
  [1, 9, 10, "S", "Standup"], [1, 10, 11.5, "T", "Roadmap"], [1, 11.5, 12.5, "P", "Hiring"], [1, 13, 14, "P", "Client", "client"], [1, 15, 17, "S", "Workshop"],
  [2, 9, 12.5, "T", "Offsite"], [2, 13.5, 15.5, "P", "Budget"], [2, 15.5, 17, "S", "Demos"],
  [3, 9, 11, "S", "Research"], [3, 11, 12.5, "P", "1:1s"], [3, 13.5, 17, "T", "Training"],
  [4, 9, 12.5, "P", "Training"], [4, 13.5, 15, "S", "Sprint review"], [4, 15, 17, "T", "Focus"],
]};
/** @type {{label: string, days: string[], ev: Ev[]}} */
const WEEK2 = { label: "Week of 26 October", days: ["Mon 26", "Tue 27", "Wed 28", "Thu 29", "Fri 30"], ev: [
  [0, 9, 11, "T", "Planning"], [0, 11, 12.5, "S", "Interviews"], [0, 13.5, 17, "P", "Away"],
  [1, 9, 10.5, "P", "Hiring"], [1, 10.5, 12.5, "S", "Workshop"], [1, 13.5, 16, "T", "Roadmap"],
  [2, 9, 10, "S", "Standup"], [2, 11, 12.5, "P", "Budget"], [2, 13.5, 15.5, "T", "Design review"],
  [3, 9.5, 12, "T", "Training"], [3, 14, 15, "S", "1:1"],
  [4, 9, 10, "P", "1:1"], [4, 13.5, 15, "S", "Demos"],
]};
/** @type {Ev} */
const KICKOFF = [2, 10, 10.75, null, "Kickoff", "booked"];

const GUIDANCE = ["Mornings first, 9:30–12:00", "Never over lunch, 12:30–13:30", "Leave half an hour after client meetings", "Add a video link"];
const ASK = "Next week's only free time is straight after Priya's client meeting, so I looked at the week after. Wednesday 28 October, 10:00–10:45 suits everyone. Shall I book it?";
const TIP = { x: 20, y: 20, w: 300 };

/**
 * @typedef {{x: number, y: number, w: number}} Box
 * @typedef {{title: string, hl: string[], arrows: string[], prompt?: boolean, guidance?: boolean, guideHl?: number, gateOpen?: boolean,
 *   cal?: {week: typeof WEEK1, slot?: [number, number, number, string, string], booked?: boolean},
 *   think?: string, reply?: {html: string, approve?: string}, tip?: Box & {html: string}}} Step
 */
/** @type {Step[]} */
const STEPS = [
  { title: "Overview", hl: [], arrows: [], guidance: true,
    tip: { ...TIP, html: "We will walk through an agent that finds good times for meetings. Pay attention to everything the agent needs to be good at its job." } },
  { title: "The prompt", hl: ["prompt"], arrows: ["ask"], prompt: true, guidance: true,
    tip: { ...TIP, html: "The user asks the agent to book a meeting." } },
  { title: "Guidance", hl: ["guidance"], arrows: ["guide"], prompt: true, guidance: true,
    tip: { ...TIP, html: "First, the agent needs guidance on what it means to do this task well. This might be a skill or a prompt." } },
  { title: "Check calendars", hl: ["info"], arrows: ["call", "result", "toCal"], prompt: true, guidance: true, cal: { week: WEEK1 },
    tip: { ...TIP, html: "Next, the agent uses a tool to look up the attendees' calendars." } },
  { title: "Reasoning", hl: ["agent"], arrows: ["think"], prompt: true, guidance: true, guideHl: 2, cal: { week: WEEK1, slot: [1, 14, 14.75, "no", "✕"] },
    think: "Tuesday 14:00 is the only time next week when all three are free. But it's straight after Priya's client meeting, and the guidance says to leave half an hour. I'll look at the week after.",
    tip: { ...TIP, html: "The agent reasons through the options." } },
  { title: "The next week", hl: ["info"], arrows: ["call", "result", "toCal", "think"], prompt: true, guidance: true, cal: { week: WEEK2, slot: [2, 10, 10.75, "", "✓"] },
    think: "Wednesday 28 October, 10:00–10:45 is free for all three. It's in the morning, and it isn't after a client meeting.",
    tip: { ...TIP, html: "The agent uses the tool to look at the next week and finds a slot." } },
  { title: "Asking permission", hl: ["agent", "gate"], arrows: ["reply", "toGate"], prompt: true, guidance: true, cal: { week: WEEK2, slot: [2, 10, 10.75, "", "✓"] },
    reply: { html: ASK, approve: "" },
    tip: { ...TIP, html: "The agent reports to the user and asks permission to book the meeting." } },
  { title: "Booking", hl: ["gate", "actions"], arrows: ["toGate", "through"], gateOpen: true, prompt: true, guidance: true, cal: { week: WEEK2, booked: true },
    reply: { html: ASK, approve: "pressed" },
    tip: { ...TIP, html: "If approved, the agent calls the tool to book the meeting." } },
  { title: "Reporting back", hl: ["agent"], arrows: ["reply"], gateOpen: true, prompt: true, guidance: true, cal: { week: WEEK2, booked: true },
    reply: { html: "Booked: Project kickoff, Wednesday 28 October, 10:00–10:45, with Priya, Tom and Sam. Invites are out, with a video link." },
    tip: { ...TIP, html: "The agent reports back." } },
];

/** @param {Step} s */
function svg(s) {
  const on = (/** @type {string} */ id) => s.hl.includes(id);
  const card = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ w, /** @type {number} */ h, /** @type {string} */ title, /** @type {[string, string]} */ [fill, edge], /** @type {boolean} */ lit) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${fill}" filter="url(#soft)" stroke="${lit ? C.ink : edge}" stroke-width="${lit ? 2.5 : 1.5}"/>
     <text x="${x + 22}" y="${y + 33}" font-size="17" font-weight="700">${title}</text>`;
  const tool = (/** @type {number} */ x, /** @type {number} */ y, /** @type {string} */ name, /** @type {string} */ edge, /** @type {boolean} */ lit) =>
    `<rect x="${x}" y="${y}" width="200" height="34" rx="4" fill="${C.white}" stroke="${lit ? C.ink : edge}" stroke-width="${lit ? 2.5 : 1.5}"/>
     <g transform="translate(${x + 12} ${y + 9}) scale(1.1)" fill="none" stroke="${C.ink}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${WRENCH}</g>
     <text x="${x + 38}" y="${y + 22}" font-size="14" font-family="ui-monospace, Menlo, Consolas, monospace">${name}</text>`;
  const arrows = s.arrows.map(id => `<path d="${ARROWS[id]}" fill="none" stroke="${C.ink}" stroke-width="2.5" stroke-linejoin="round" ${id === "think" ? 'stroke-dasharray="1 6" stroke-linecap="round"' : 'marker-end="url(#ah)"'}/>`).join("");
  const gateRing = (/** @type {number} */ y, /** @type {number} */ h) => on("gate") ? `<rect x="642" y="${y - 3}" width="24" height="${h + 6}" rx="6" fill="none" stroke="${C.ink}" stroke-width="2.5"/>` : "";
  const gate = s.gateOpen
    ? `<rect x="645" y="195" width="18" height="28" rx="4" fill="${C.coral}"/><rect x="645" y="247" width="18" height="28" rx="4" fill="${C.coral}"/>${gateRing(195, 28)}${gateRing(247, 28)}`
    : `<rect x="645" y="195" width="18" height="80" rx="4" fill="${C.coral}"/>${gateRing(195, 80)}`;
  const guidance = s.guidance
    ? GUIDANCE.map((t, i) => `${s.guideHl === i ? `<rect x="347" y="${70 + i * 22}" width="276" height="21" rx="4" fill="${C.guideHl}"/>` : ""}<text x="357" y="${85 + i * 22}" font-size="13.5">${t}</text>`).join("")
    : `<text x="357" y="88" font-size="13.5" fill="${C.muted}">How we book meetings</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" font-family="Exo, Avenir, 'Avenir Next', Helvetica, Arial, sans-serif" fill="${C.ink}" role="img" aria-label="${s.title}">
  <defs>
    <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${C.ink}"/></marker>
    <filter id="soft" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#1d1d1d" flood-opacity="0.07"/></filter>
  </defs>
  <g stroke="${C.wire}" stroke-width="1.5" fill="none">
    <path d="M290 235 H400"/><path d="M485 168 V195"/><path d="M485 275 V335"/><path d="M570 235 H645"/><path d="M663 235 H720"/>
  </g>
  ${arrows}
  ${card(335, 28, 300, 140, "Guidance", TINT.guidance, on("guidance"))}${guidance}
  ${on("agent") ? `<rect x="395" y="190" width="180" height="90" rx="16" fill="none" stroke="${C.ink}" stroke-width="2.5"/>` : ""}
  <rect x="400" y="195" width="170" height="80" rx="12" fill="${C.blue}" filter="url(#soft)"/>
  <text x="485" y="242" font-size="20" font-weight="700" text-anchor="middle" fill="${C.white}">Agent</text>
  ${card(315, 335, 340, 105, "Tools for Getting Information", TINT.info, on("info"))}${tool(337, 386, "check-calendars", TINT.info[1], on("info"))}
  ${gate}
  <text x="654" y="300" font-size="14" font-weight="700" text-anchor="middle">Approval</text>
  ${card(720, 183, 300, 105, "Tools for Taking Action", TINT.actions, on("actions"))}${tool(742, 234, "book-meeting", TINT.actions[1], on("actions"))}
</svg>`;
}

// Drawn rather than typed, so the mark sits in the middle of its slot whatever the font's metrics.
/** @type {Record<string, string>} */
const MARKS = {
  "✕": `<svg viewBox="0 0 10 10" aria-label="Ruled out"><path d="M2 2 L8 8 M8 2 L2 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  "✓": `<svg viewBox="0 0 10 10" aria-label="Chosen"><path d="M1.8 5.4 L4.2 7.6 L8.4 2.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

const pos = (/** @type {Box} */ b) => `left:${b.x / W * 100}%;top:${b.y / H * 100}%;width:${b.w / W * 100}%`;
const T = (/** @type {number} */ h) => `${(h - 9) / 8 * 100}%`;
const span = (/** @type {number} */ s, /** @type {number} */ e) => `top:${T(s)};height:calc(${(e - s) / 8 * 100}% - 1px)`;

/** @param {NonNullable<Step["cal"]>} c */
function calendar(c) {
  const evs = [...c.week.ev, ...(c.booked ? [KICKOFF] : [])];
  const hours = [9, 11, 13, 15, 17].map(h => `<span style="top:${T(h)}">${h}</span>`).join("");
  const cols = c.week.days.map((_, d) => `<div class="col">${
    evs.filter(e => e[0] === d).map(([, s, e, p, t, cls]) => `<div class="ev ${cls || ""}" style="${span(s, e)}${p ? `;background:${PEOPLE[p][1]};border-left-color:${PEOPLE[p][2]}` : ""}">${t}</div>`).join("")}${
    c.slot && c.slot[0] === d ? `<div class="slot ${c.slot[3]}" style="${span(c.slot[1], c.slot[2])}">${MARKS[c.slot[4]]}</div>` : ""}</div>`).join("");
  const legend = Object.values(PEOPLE).map(([n, , col]) => `<span><i style="background:${col}"></i>${n}</span>`).join("");
  return `<div class="ov cal" style="${pos({ x: 700, y: 318, w: 320 })}">
    <div class="cal-head"><strong>${c.week.label}</strong><div class="legend">${legend}</div></div>
    <div class="cal-grid"><div></div>${c.week.days.map(d => `<div class="day">${d}</div>`).join("")}<div class="hours">${hours}</div>${cols}</div></div>`;
}

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const stage = $("stage"), dots = $("dots"), where = $("where");
const back = /** @type {HTMLButtonElement} */ ($("back")), next = /** @type {HTMLButtonElement} */ ($("next")), restart = $("restart");
let at = 0;

dots.innerHTML = STEPS.map((s, i) => `<button type="button" aria-label="Step ${i + 1}: ${s.title}" title="${s.title}"></button>`).join("");
[...dots.children].forEach((b, i) => b.addEventListener("click", () => go(i)));

/** @param {number} i @param {string} [note] */
function render(i, note) {
  const s = STEPS[i];
  const lit = s.hl.includes("prompt") ? " lit" : "";
  const ov = [`<div class="ov prompt${s.prompt ? "" : " empty"}${lit}" style="${pos({ x: 20, y: 190, w: 270 })};height:${90 / H * 100}%">${s.prompt ? PROMPT : "Ask anything…"}</div>`];
  if (s.think) ov.push(`<div class="ov msg think" style="${pos({ x: 684, y: 20, w: 336 })}"><span class="label"><b><i></i><i></i><i></i></b>Thinking</span>${s.think}</div>`);
  if (s.reply) ov.push(`<div class="ov msg reply" style="${pos({ x: 684, y: 20, w: 336 })}"><span class="label">Agent</span>${s.reply.html}${s.reply.approve !== undefined ? `<div class="row"><span class="${s.reply.approve}">Approve</span><span>Deny</span></div>` : ""}</div>`);
  if (s.cal) ov.push(calendar(s.cal));
  const tip = note ? { ...(s.tip || TIP), html: note } : s.tip;
  if (tip) ov.push(`<div class="ov tip" style="${pos(tip)}">${tip.html}</div>`);
  stage.innerHTML = svg(s) + ov.join("");
  [...dots.children].forEach((b, j) => b.className = j < i ? "done" : j === i ? "now" : "");
  where.textContent = `${i + 1} / ${STEPS.length}`;
  back.disabled = i === 0;
  next.disabled = i === STEPS.length - 1;
  restart.hidden = i !== STEPS.length - 1;
}

/** @param {number} i */
function go(i) {
  at = Math.max(0, Math.min(STEPS.length - 1, i));
  if (location.hash !== `#${at}`) history.pushState(null, "", `#${at}`);
  render(at);
}

function fromHash() {
  const h = location.hash.slice(1);
  const n = Number(h);
  if (h === "" || (Number.isInteger(n) && n >= 0 && n < STEPS.length)) { at = h === "" ? 0 : n; render(at); return; }
  at = 0;
  render(0, `There's no step "${h.replace(/[<>&"]/g, "")}" here, so this starts at the beginning.`);
}

back.addEventListener("click", () => go(at - 1));
next.addEventListener("click", () => go(at + 1));
restart.addEventListener("click", () => go(0));
addEventListener("keydown", e => {
  if (e.key === "ArrowRight") go(at + 1);
  else if (e.key === "ArrowLeft") go(at - 1);
});
addEventListener("popstate", fromHash);
fromHash();
