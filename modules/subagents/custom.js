// The custom subagents explainer: a developer at Fernway (a made-up grocery delivery company) wants to drop the
// code that rounds delivery fees up to the next 50p, and asks why it's there first. The main agent hands the
// question to the team's own subagent, project-historian, picked by its description. The subagent runs on Sonnet
// with the issue tracker and the wiki as MCP servers of its own, finds the reason (Paylink's 50p settlement), finds
// that the reason has lapsed (the move to Coinbridge), and reports back with its sources. Artificial, by Kay's
// choice: no run behind it. See SOURCES.md.

import { start } from "./agents.js";

/** @typedef {import("./agents.js").Script} Script */

const PROMPT = "Customers are complaining that delivery fees get rounded up to 50p. Can we drop the rounding? Check why it's there first.";

const AGENT_FILE = `---
name: project-historian
description: Finds out why this project's code is
  the way it is, from the issue tracker, the wiki
  and the other repos. Use before changing
  behaviour whose reason isn't clear from the code.
tools: Read, Grep, Glob, mcp__tracker, mcp__wiki
mcpServers:
  - tracker:
      type: http
      url: https://tracker.fernway.internal/mcp
  - wiki:
      type: http
      url: https://wiki.fernway.internal/mcp
model: sonnet
---

You answer "why is it like this?" questions about
the Fernway project's code.

Look in this order:
1. The issue tracker: search for the feature, then read
   the issues it links to.
2. The wiki: decision records (ADR-*) and team pages.
3. The other Fernway repos, cloned under ~/fernway/.

Report in under 150 words:
- the reason, citing each source by its ID
- whether that reason still holds, and what shows it
- who to ask, if the sources disagree

Quote your sources. Don't guess. Never change anything.`;

const FEES = `from decimal import Decimal, ROUND_UP


def delivery_fee(distance_km: Decimal) -> Decimal:
    fee = Decimal("1.99") + Decimal("0.35") * distance_km
    # Round up to the next 50p
    return (fee * 2).quantize(Decimal("1"), rounding=ROUND_UP) / 2`;

const TASK = `checkout/fees.py rounds every delivery fee up to the next 50p. The developer wants to remove the rounding.

Find out why it was added, and whether that reason still holds today. Cite your sources.`;

const CALL = ["subagent_type: project-historian", "description: Why delivery fees round up to 50p", "prompt: |",
  ...TASK.split("\n").flatMap((p) => p ? wrap(p, 50) : [""]).map((l) => l ? `  ${l}` : "")].join("\n");

const GREP = `CHANGELOG.md:12:## 4.0.0 (2026-03-14)
CHANGELOG.md:13:- Removed the Paylink client (PAY-301).`;

const REPORT = `Why delivery fees round up to 50p

Reason: Paylink settled card payments in 50p units, so fees in whole pence didn't reconcile (FIN-212). ADR-014 made the rounding the fix, and says "Revisit if we move off Paylink."

Does it still hold? No. PAY-301 moved card payments to Coinbridge on 14 Mar 2026, and Coinbridge settles to the penny. payments-service has had no Paylink code since v4.0.0 (CHANGELOG.md:13).

Who to ask: Finance Ops raised FIN-212. Their reconciliation reports may still expect 50p steps.`;

const REPLY = `The rounding was added for Paylink, which settled card payments in 50p units (FIN-212, ADR-014). The decision record says to revisit it if Fernway moved off Paylink, and it has: card payments went to Coinbridge on 14 March (PAY-301), and Coinbridge settles to the penny.

So the original reason no longer holds. One thing to check first: Finance Ops raised FIN-212, and their reconciliation reports may still expect fees in 50p steps.

Do you want me to remove the rounding from fees.py and update the tests?`;

/** Word-wraps a paragraph to `width` columns. @param {string} text @param {number} width */
function wrap(text, width) {
  const out = [""];
  for (const word of text.split(" ")) {
    const last = out[out.length - 1];
    if (last && (last + " " + word).length > width) out.push(word);
    else out[out.length - 1] = last ? `${last} ${word}` : word;
  }
  return out;
}

/** @param {string} text @param {(l: string) => boolean} test */
const lines = (text, test) => text.split("\n").flatMap((l, i) => (test(l) ? [i] : []));

/** Lines from..to of a text, both included. @param {number} from @param {number} to */
const span = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

// the agent file's parts: name and description, then tools, MCP servers and model, then (after the closing ---) the body
const FILE_LINES = AGENT_FILE.split("\n");
const TOOLS_AT = FILE_LINES.findIndex((l) => l.startsWith("tools:"));
const FRONT_END = FILE_LINES.lastIndexOf("---"), BODY_START = FRONT_END + 2;
const FILE_VIEW = { kind: /** @type {const} */ ("file"), label: "Subagent", path: ".claude/agents/project-historian.md", text: AGENT_FILE };

const H = "project-historian";

/** @type {Script} */
const script = {
  mainModel: "opus",
  prices: [
    { key: "opus", label: "opus", in: 4, out: 20 },
    { key: "sonnet", label: "sonnet", in: 2, out: 10 },
  ],
  // Each step says what changes once it has happened (see Step in agents.js).
  steps: [
    { title: "A custom subagent", button: "Start",
      view: { ...FILE_VIEW, hl: [] },
      note: { html: "<p>In this project, developers have had problems with their agents not understanding historical project context.</p><p>They've created a subagent to help with this.</p>", at: "#cc", side: "center" } },

    { title: "Its name and description",
      view: { ...FILE_VIEW, hl: span(1, TOOLS_AT - 1) },
      note: { html: "They give the subagent a name and description, which will help the main agent know when to use it.", at: "#view .vbody .hl", side: "left" } },

    { title: "Its tools, MCP servers and model",
      view: { ...FILE_VIEW, hl: span(TOOLS_AT, FRONT_END - 1) },
      note: { html: "They restrict the agent to read-only tools and give it special access to MCP servers for the internal wiki and issue tracker.", at: "#view .vbody .hl", side: "left" } },

    { title: "Its system prompt",
      view: { ...FILE_VIEW, hl: span(BODY_START, FILE_LINES.length - 1) },
      note: { html: "They write a system prompt for the custom subagent, explaining its role, how it should go about its task, and how it should report back to the main agent.", at: "#view .vbody .hl", side: "left" } },

    { title: "The developer's question", typed: PROMPT, button: "Send",
      view: { ...FILE_VIEW, hl: [] },
      note: { html: "A developer asks about some code they want to change.", at: "#cc", side: "center" } },

    { title: "It looks at the code", ctx: { main: 10_600 }, cost: { opus: 0.018 },
      main: [{ cls: "user", text: PROMPT }, { cls: "tool", text: 'Search(pattern: "50p")' }, { cls: "res", text: "Found 1 file" }, { cls: "tool", text: "Read(fees.py)" }],
      view: { kind: "file", path: "checkout/fees.py", text: FEES, hl: lines(FEES, (l) => /Round up|ROUND_UP\)/.test(l)) },
      note: { html: "The main agent finds the code, but not the reason.", at: "#view .vbody .hl", side: "below" } },

    { title: "It picks the custom subagent", ctx: { main: 11_300 }, cost: { opus: 0.030 },
      main: [{ cls: "say", text: "fees.py rounds every delivery fee up to the next 50p, but the code doesn't say why. I'll ask project-historian to find out." },
        { cls: "tool", text: `${H}(Why delivery fees round up to 50p)`, spin: H }],
      view: { kind: "file", label: "Tool call", path: "Agent", text: CALL, hl: [0] },
      note: { html: "The main agent dispatches a <code>project-historian</code> subagent to investigate.", at: "#sub", side: "center" } },

    { title: "The subagent starts", ctx: { [H]: 7_800 },
      spawn: { name: H, model: "sonnet" }, stats: { [H]: "starting" }, select: H,
      sub: { [H]: [{ cls: "user", text: TASK }] },
      view: { ...FILE_VIEW, hl: [] },
      note: { html: "The main agent writes a prompt for the subagent.", at: "#subterm .ln.user", side: "right" } },

    { title: "It searches the tracker", ctx: { [H]: 8_600 }, cost: { sonnet: 0.003 }, stats: { [H]: "1 tool use" },
      sub: { [H]: [{ cls: "tool", text: 'tracker - search_issues (MCP)(query: "delivery fee rounding")' }] },
      view: { kind: "search", query: "tracker · delivery fee rounding", results: [
        { title: "FIN-212: Delivery fees don't reconcile with Paylink settlements", url: "Done · June 2024", snippet: "Fix: round fees up to the next 50p at checkout. See ADR-014.", hl: true },
        { title: "CHK-140: Wrong delivery fee for addresses on a zone boundary", url: "Done · Nov 2025", snippet: "Fees for addresses exactly on the boundary use the outer zone's distance." },
        { title: "CHK-88: Show the delivery fee breakdown at checkout", url: "Won't do · Feb 2025", snippet: "Customers ask why their fee changes between orders." },
        { title: "FIN-97: Monthly settlement report for card payments", url: "Done · Mar 2024", snippet: "One CSV per month from the payment provider's settlement batches." },
      ] },
      note: { html: "The subagent uses its specialist MCP tools to search the issue tracker.", at: "#subterm .ln.tool", side: "right" } },

    { title: "It finds a relevant issue", ctx: { [H]: 9_300 }, cost: { sonnet: 0.006 }, stats: { [H]: "2 tool uses" },
      sub: { [H]: [{ cls: "tool", text: 'tracker - get_issue (MCP)(id: "FIN-212")' }] },
      view: { kind: "card", label: "Issue", id: "tracker · FIN-212", crumbs: "Finance › Payments", title: "Delivery fees don't reconcile with Paylink settlements", status: "Done", meta: "June 2024 · raised by Finance Ops",
        blocks: [
          { text: "Paylink settles card payments in 50p units, so every delivery fee in whole pence leaves a difference." },
          { text: "Finance Ops spends about two days a month matching them by hand." },
          { text: "Fix: round fees up to the next 50p at checkout. See ADR-014.", hl: true },
        ] },
      note: { html: "The subagent finds a reference to a decision record in the internal wiki.", at: "#view .vbody .hl", side: "below" } },

    { title: "It reads the decision record", ctx: { [H]: 10_200 }, cost: { sonnet: 0.011 }, stats: { [H]: "3 tool uses" },
      sub: { [H]: [{ cls: "tool", text: 'wiki - get_page (MCP)(id: "ADR-014")' }] },
      view: { kind: "card", label: "Wiki page", id: "wiki · ADR-014", crumbs: "Engineering › Decisions", title: "ADR-014: Round delivery fees to 50p", status: "Accepted", meta: "June 2024", hl: "*",
        blocks: [
          { text: "Context: Paylink settles card payments in 50p units. Fees in whole pence don't reconcile, which costs Finance Ops about two days a month." },
          { text: "Decision: round every delivery fee up to the next 50p before charging." },
          { text: "Consequence: customers pay up to 49p more." },
          { text: "Revisit if we move off Paylink." },
        ] },
      note: { html: "The decision record gives context and explains when the decision should be revisited.", at: "#view .vbody .hl", side: "below" } },

    { title: "It checks whether that has happened", ctx: { [H]: 11_500 }, cost: { sonnet: 0.016 }, stats: { [H]: "5 tool uses" },
      sub: { [H]: [{ cls: "tool", text: 'tracker - search_issues (MCP)(query: "Paylink")' }, { cls: "tool", text: 'tracker - get_issue (MCP)(id: "PAY-301")' }] },
      view: { kind: "card", label: "Issue", id: "tracker · PAY-301", crumbs: "Platform › Payments", title: "Move card payments from Paylink to Coinbridge", status: "Done", meta: "14 Mar 2026", hl: "title",
        blocks: [
          { text: "All card payments go through Coinbridge from 14 March. The Paylink client is removed in payments-service v4.0." },
          { text: "Coinbridge settles each payment to the penny." },
        ] },
      note: { html: "<p>The subagent's system prompt instructs it to check whether reasons still hold.</p><p>So it follows the thread and discovers a payment provider migration, which may change things.</p>", at: "#view .vbody .hl", side: "left" } },

    { title: "It checks the other repo", ctx: { [H]: 12_000 }, cost: { sonnet: 0.019 }, stats: { [H]: "6 tool uses" },
      sub: { [H]: [{ cls: "tool", text: 'Search(pattern: "paylink", path: "~/fernway/payments-service", -i)' }] },
      view: { kind: "file", label: "Output", path: 'Search(pattern: "paylink")', text: GREP, hl: [1] },
      note: { html: "It confirms the migration has taken place in the code.", at: "#view .vbody .hl", side: "below" } },

    { title: "It reports back", ctx: { [H]: 12_400 }, cost: { sonnet: 0.024 }, status: { [H]: "done" }, stats: { [H]: "6 tool uses · 12.4k" },
      sub: { [H]: [{ cls: "box", text: REPORT, clip: 4, keep: true }] },
      view: { kind: "file", label: "Report", path: "sent back to the main agent", text: REPORT, hl: "*" },
      note: { html: "The subagent sends back a short report, citing its sources.", at: "#view .vbody .line:last-child", side: "below" } },

    { title: "The main agent replies", ctx: { main: 12_000 }, grow: ["main"], cost: { opus: 0.047 }, select: "main", closeSubs: true,
      main: [{ cls: "res", text: "Done (6 tool uses · 12.4k tokens · 41s)" }, { cls: "say", text: REPLY, hl: true }],
      view: { kind: "file", label: "Report", path: `from ${H}`, text: REPORT, hl: [] },
      note: { html: "The main agent reads the report and responds to the user.", at: "#sub", side: "center" } },
  ],
};

start(script);
