// The fan-out explainer: a developer asks the agent to fan out and thoroughly review a codebase (microblog, a
// Flask app of about 3,000 lines). The main agent sizes it up, splits it into three areas and starts a
// subagent on each, all at once. They read their areas in parallel, each in its own context, and report back
// one by one; the main agent checks the top findings itself and writes one combined review. Based on a
// recorded run; see SOURCES.md (the costs between the start and the end are estimates).

import { start } from "./agents.js";
import { PROMPT, LIST_CMD, LIST_OUT, PROMPTS, SUB_CALLS, SUB_END_CTX, PROBE, PROBE_OUT, REPORTS, REPORTS_TEXT, SAYS, SPOT_CMD, SPOT_OUT, REPLY, REPLY_TEXT, CONFIG_PY, NGINX } from "./fan-out-run.js";

/** @typedef {import("./agents.js").Script} Script */
/** @typedef {import("./agents.js").Line} Line */

const A = "Review API and auth", M = "Review models, routes, tasks", D = "Review deploy, templates, migrations";

/** Word-wraps text to `width` columns, each line indented by `indent`. @param {string} text @param {number} width @param {string} indent */
const wrap = (text, width, indent) => text.split("\n").flatMap((para) => {
  if (!para) return [""];
  const out = [""];
  for (const word of para.split(" ")) {
    const last = out[out.length - 1];
    if (last && (indent + last + " " + word).length > width) out.push(word);
    else out[out.length - 1] = last ? `${last} ${word}` : word;
  }
  return out.map((l) => indent + l);
});

/** A tool call as a line in a subagent's conversation, its command cut to its start. @param {{ name: string, cmd: string }} c @returns {Line} */
const tool = (c) => {
  const first = c.cmd.split("\n")[0];
  const cut = first.length > 64 || c.cmd.includes("\n");
  return { cls: "tool", text: `${c.name}(${cut ? first.slice(0, 64).trimEnd() + " …" : first})` };
};

/** Lines for the subagent's tool calls from..to (not including to). @param {keyof typeof SUB_CALLS} who @param {number} from @param {number} [to] */
const calls = (who, from, to) => SUB_CALLS[who].slice(from, to).map(tool);

/** The subagent's context once its calls up to `to` have their results. @param {keyof typeof SUB_CALLS} who @param {number} to */
const ctxAfter = (who, to) => SUB_CALLS[who][to]?.ctx ?? SUB_END_CTX[who];

/** @param {string} text @param {(l: string) => boolean} test */
const lines = (text, test) => text.split("\n").flatMap((l, i) => (test(l) ? [i] : []));

// The Agent call for the API and auth review, with its full prompt.
const PROMPT_LINES = wrap(PROMPTS[A], 54, "  ");
const CALL = ["subagent_type: general-purpose", `description: ${A}`, "run_in_background: true", "prompt: |",
  ...PROMPT_LINES].join("\n");

const PROBE_RUN = `${PROBE}\n\n$ python probe2.py\n${PROBE_OUT}`;

/** The tool line in the main agent's conversation for each subagent. @param {string} who @returns {Line} */
const call = (who) => ({ cls: "tool", text: `general-purpose(${who})`, spin: who });

/** @type {Script} */
const script = {
  mainModel: "opus",
  // Each step says what changes once it has happened (see Step in agents.js).
  steps: [
    { title: "Initial prompt", typed: PROMPT, button: "Send",
      note: { html: "<p>We're going to ask the agent to review a codebase using multiple subagents in parallel.</p><p>(You can click this to collapse it)</p>", at: "#cc", side: "center" } },

    { title: "It sizes up the codebase", ctx: { main: 14_100 }, cost: { opus: 0.033 },
      main: [{ cls: "user", text: PROMPT }, { cls: "tool", text: `Bash(${LIST_CMD})` }],
      view: { kind: "file", label: "Output", path: LIST_CMD, text: LIST_OUT, hl: [] },
      note: { html: "The main agent lists out tracked files and their sizes to understand the size and scope of the codebase.", at: "#subs", side: "center" } },

    { title: "It splits the review in three", cost: { opus: 0.087 },
      main: [{ cls: "say", html: SAYS[0] }, call(A), call(M), call(D)],
      view: { kind: "file", label: "Tool call", path: "Agent (one of three)", text: CALL, hl: Array.from({ length: PROMPT_LINES.length + 1 }, (_, i) => i + 3) },
      note: { html: "The main agent writes prompts for three subagents, each focused on one area of the codebase.", at: "#view .vbody .hl", side: "left" } },

    { title: "Three subagents start", ctx: { main: 17_300, [A]: SUB_CALLS[A][0].ctx, [M]: SUB_CALLS[M][0].ctx, [D]: SUB_CALLS[D][0].ctx }, cost: { opus: 0.115 },
      spawn: [{ name: A, model: "opus" }, { name: M, model: "opus" }, { name: D, model: "opus" }],
      stats: { [A]: "starting", [M]: "starting", [D]: "starting" },
      view: null,
      main: [{ cls: "say", html: SAYS[1], clip: 4 }],
      sub: { [A]: [{ cls: "user", text: PROMPTS[A], clip: 3 }], [M]: [{ cls: "user", text: PROMPTS[M], clip: 3 }], [D]: [{ cls: "user", text: PROMPTS[D], clip: 3 }] },
      note: { html: "Each of the three subagents has its own context, and they run in parallel.", at: "#subs", side: "right" } },

    { title: "They read their areas", ctx: { [A]: ctxAfter(A, 3), [M]: ctxAfter(M, 2), [D]: ctxAfter(D, 2) }, cost: { opus: 0.415 },
      stats: { [A]: "3 tool uses", [M]: "2 tool uses", [D]: "2 tool uses" },
      sub: { [A]: calls(A, 0, 3), [M]: calls(M, 0, 2), [D]: calls(D, 0, 2) },
      select: A,
      view: { kind: "file", path: "config.py", text: CONFIG_PY, hl: lines(CONFIG_PY, (l) => l.includes("SECRET_KEY")) },
      note: { html: "Each investigates the codebase according to its brief.", at: "#subs", side: "right" } },

    { title: "They keep reading", ctx: { [A]: ctxAfter(A, 6), [M]: ctxAfter(M, 4), [D]: ctxAfter(D, 5) }, cost: { opus: 0.865 },
      stats: { [A]: "6 tool uses", [M]: "4 tool uses", [D]: "5 tool uses" },
      sub: { [A]: calls(A, 3, 6), [M]: calls(M, 2, 4), [D]: calls(D, 2, 5) },
      select: D,
      view: { kind: "file", path: "deployment/nginx/microblog", text: NGINX, hl: lines(NGINX, (l) => /server_name|Host \$host/.test(l)) },
    },

    { title: "One tries an attack", ctx: { [A]: ctxAfter(A, 9), [M]: ctxAfter(M, 7), [D]: ctxAfter(D, 6) }, cost: { opus: 1.115 },
      stats: { [A]: "9 tool uses", [M]: "7 tool uses", [D]: "6 tool uses" },
      sub: { [A]: calls(A, 6, 9), [M]: calls(M, 4, 7), [D]: calls(D, 5, 6) },
      select: A,
      view: { kind: "file", label: "Bash", path: "/tmp/probe_scr/probe2.py", text: PROBE_RUN, hl: lines(PROBE_RUN, (l) => /^f=jwt|forged/.test(l)) },
      note: { html: "The subagents can use temporary scratch areas. The auth subagent writes a script to test a bug it found with the password reset token.", at: "#view .vh", side: "below", mayCover: "#view .code .line" } },

    { title: "The reports come back", ctx: { main: 34_000, [D]: ctxAfter(D, 9) }, grow: ["main"], cost: { opus: 1.789 },
      status: { [M]: "done", [A]: "done", [D]: "done" }, stats: { [M]: "8 tool uses · 43.0k", [A]: "10 tool uses · 41.5k", [D]: "10 tool uses · 69.6k" },
      sub: {
        [M]: [{ cls: "box", html: REPORTS[M], clip: 2, keep: true }],
        [A]: [{ cls: "box", html: REPORTS[A], clip: 2, keep: true }],
        [D]: [...calls(D, 6, 9), { cls: "box", html: REPORTS[D], clip: 2, keep: true }],
      },
      main: [{ cls: "say", html: SAYS[2], clip: 3 }, { cls: "say", html: SAYS[3], clip: 3 }],
      select: A,
      view: { kind: "file", label: "Report", path: "sent back to the main agent", text: REPORTS_TEXT[A], hl: "*" },
      note: { html: "The reviews finish after two or three minutes and write their reports for the main agent.", at: "#subs", side: "center" } },

    { title: "It checks the top findings", ctx: { main: 35_100 }, cost: { opus: 1.838 },
      main: [tool({ name: "Bash", cmd: SPOT_CMD })],
      select: "main", closeSubs: true,
      view: { kind: "file", label: "Output", path: "Spot-check top findings", text: SPOT_OUT, hl: lines(SPOT_OUT, (l) => /SECRET_KEY|netloc/.test(l)) },
      note: { html: "<p>The main agent now synthesises all the reports into a single report for the user.</p><p>Before it does so, it spot-checks the main findings by looking at the files itself.</p>", at: "#subs", side: "center" } },

    { title: "The combined review", cost: { opus: 1.908 },
      main: [{ cls: "say", html: REPLY, clip: 12, keep: true }],
      view: { kind: "file", label: "Reply", path: "to the user", text: REPLY_TEXT, hl: "*" },
      note: { html: "The main agent produces its final report.", at: "#subs", side: "center" } },

    { title: "The session's cost",
      note: { html: "<p>The session took 3m35s and cost $1.91.</p><p>Using multiple subagents in parallel can get work done faster, but it also spends tokens faster.</p><p>In this session, every subagent ran on the more expensive Opus model. We could have asked the main agent to run the subagents on a cheaper model, at the risk of possibly worse results.</p>", at: "#subs", side: "center" } },
  ],
};

start(script);
