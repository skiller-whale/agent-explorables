// How memory works: two Claude Code sessions in a small shop-api repository. In the first, the user mentions
// that billing/ is being rewritten, and the agent saves that as a memory with its ordinary file tools, plus a line
// in the MEMORY.md index. The session ends. In the second, the harness loads the index, the agent reads the
// memory file when a task touches billing/, and leaves billing/ alone. Tooltips are Kay's (storyboard
// https://claude.ai/artifact/K3hMW3p75Ljq2gBcdg3QEk). Recorded runs: see SOURCES.md.
//
// TODO(recording): the system prompt's memory text, the memory folder's real path, the TUI lines for the memory
// writes and read, the memory file and index line the agent wrote, and both replies.

import { start } from "./memory.js";

/** @typedef {import("./memory.js").Script} Script */

const MEM = "~/.claude/projects/-home-learner-shop-api/memory";

const PROMPT1 = "Tidy up the date helpers in utils/dates.py. Don't touch billing/ though, it's being rewritten next quarter.";
const PROMPT2 = "Invoice totals are a penny out in billing/totals.py. Fix it, and clean up that file while you're at it.";

/** Word-wraps text to `width` columns, so nothing wraps awkwardly in the context column. @param {string} text @param {number} width */
const wrap = (text, width) => text.split("\n").flatMap((para) => {
  if (!para) return [""];
  const out = [""];
  for (const word of para.split(" ")) {
    const last = out[out.length - 1];
    if (last && (last + " " + word).length > width) out.push(word);
    else out[out.length - 1] = last ? `${last} ${word}` : word;
  }
  return out;
}).join("\n");

// TODO(recording): the memory instructions, verbatim, cut to the lines worth showing
const SYS_MEMORY = ["…200",
  "# auto memory",
  wrap("You have a persistent, file-based memory system at:", 46),
  "~/.claude/projects/",
  "  -home-learner-shop-api/memory/",
  "…15",
  wrap("Save information that can't be derived from the code or from files like CLAUDE.md.", 46),
  "…10",
  wrap("MEMORY.md is an index, loaded into your context at the start of each session.", 46),
  "…80"].join("\n");
const SYS_LINES = SYS_MEMORY.split("\n");
/** a line "…N" stands for about N lines left out */
const snip = (/** @type {string} */ l) => l.startsWith("…");
/** the lines of the excerpt that aren't left out */
const SYS_MEM_HL = SYS_LINES.map((l, i) => (snip(l) ? -1 : i)).filter((i) => i >= 0);
/** the instruction to save what can't be derived from the code */
const SNIPS = SYS_LINES.map((l, i) => (snip(l) ? i : -1)).filter((i) => i >= 0);
const SYS_SAVE_HL = SYS_LINES.map((l, i) => i).filter((i) => i > SNIPS[1] && i < SNIPS[2]);

const CLAUDE_MD = `# shop-api

- Run the tests with \`pytest\`.
- Write conventional commit messages (feat:, fix:, chore:).`;





// TODO(recording): the file and index line the agent really wrote
const MEMORY_FILE = `---
name: billing-refactor
description: billing/ is being rewritten, so don't tidy it up
metadata:
  type: project
---

The billing module is going to be rewritten next quarter,
so cleanup there is wasted work.

**Why:** the user said the rewrite is planned for next
quarter.
**How to apply:** leave billing/ alone unless asked, and
don't propose refactors of it.`;
const INDEX_LINE = "- [Billing refactor planned](billing-refactor.md) — don't tidy billing/";

const REPLY1 = "Removed fmt_date, which duplicated format_date, and pointed its two callers at format_date. I've left billing/ alone.";
const REPLY2 = "Fixed the rounding in calculate_total: it now uses Decimal and rounds half up. I haven't cleaned up the rest of billing/totals.py, since billing/ is being rewritten next quarter. Want me to tidy it anyway?";

const sys = () => ({ id: "sys", kind: /** @type {const} */ ("sys"), label: "System prompt (excerpt)", text: SYS_MEMORY });
const claudeMd = () => ({ id: "claude", kind: /** @type {const} */ ("file"), label: "AGENTS.md", text: CLAUDE_MD });
const MEMFILE = `${MEM}/billing-refactor.md`;
const INDEX = `${MEM}/MEMORY.md`;
const all = (/** @type {string} */ t) => t.split("\n").map((_, i) => i);

/** @type {Script} */
const script = {
  memory: MEM,
  plainContext: true,
  files: { [INDEX]: { text: "" } },
  steps: [
    { title: "Overview",
      note: { html: "<p>We'll see how an agent uses its memory feature to remember some information across two sessions.</p><p>(You can click this to collapse it)</p>", at: "#cc", side: "center" } },

    { title: "The session starts", session: "Session 1",
      ctx: [sys(), claudeMd(), { id: "index", kind: "file", label: "MEMORY.md", empty: "(empty)" }],
      ctxHl: { sys: SYS_MEM_HL },
      note: { html: "When a session starts, the harness loads a number of things into context, including its system prompt, our <code>AGENTS.md</code>, and a memory index which is currently empty.", at: "#ctxbody", side: "right" } },

    { title: "The user's prompt",
      typed: PROMPT1, button: "Send",
      note: { html: "The user asks for a change, and mentions a fact about the project in passing.", at: "#input .typed", side: "right" } },

    { title: "The agent does the task",
      term: [
        { cls: "user", text: PROMPT1 },
        { cls: "tool", text: "Read(utils/dates.py)" },
        { cls: "tool", text: "Update(utils/dates.py)" },
        { cls: "res", text: "Removed 4 lines" },
      ],
      ctx: [
        { id: "p1", kind: "user", label: "User", text: PROMPT1 },
        { id: "t1", kind: "tool", label: "Read utils/dates.py", text: "(14 lines)" },
        { id: "t2", kind: "tool", label: "Edit utils/dates.py", text: "ok" },
      ],
      note: { html: "The agent does the task with its usual tools.", at: "#term .ln.tool", side: "right", mayCover: "#ctxbody .pl" } },

    { title: "Deciding to remember",
      term: [{ cls: "aside", hl: true, text: "The billing rewrite isn't in the code or AGENTS.md, and it matters for future work. I'll save it as a project memory." }],
      ctxHl: { sys: SYS_SAVE_HL },
      note: { html: "<p>The agent's system prompt tells it to use its memory system to store information that can't be derived from the codebase.</p><p>The user's fact about the rewrite meets this criteria, so the agent decides to save it.</p>", at: "#term .gap", side: "center" } },

    { title: "Writing the memory",
      term: [{ cls: "tool", text: "Write(~/.claude/…/memory/billing-refactor.md)" }],
      ctx: [{ id: "w1", kind: "tool", label: "Write billing-refactor.md", text: "ok" }],
      files: { [MEMFILE]: { text: MEMORY_FILE } },
      view: { path: MEMFILE, label: "Memory file", diff: { add: all(MEMORY_FILE) } },
      note: { html: "It saves the memory with its ordinary Write tool, into the memory folder. There's no special memory tool.", at: "#view", side: "left" } },

    { title: "Updating the index",
      term: [{ cls: "tool", text: "Write(~/.claude/…/memory/MEMORY.md)" }, { cls: "res", text: "TODO(recording): what the TUI shows" }],
      ctx: [{ id: "w2", kind: "tool", label: "Write MEMORY.md", text: "ok" }],
      files: { [INDEX]: { text: INDEX_LINE } },
      indexDiff: { add: [0] },
      view: { path: MEMFILE, label: "Memory file" },
      note: { html: "Then it adds a line for the new memory to the index.", at: "#index .line.add", side: "below" } },

    { title: "The agent replies",
      term: [{ cls: "say", hl: true, text: REPLY1 }],
      ctx: [{ id: "r1", kind: "say", label: "Agent", text: REPLY1 }],
      note: { html: "The agent returns to the user.", at: "#term .ln.say:last-child", side: "right", mayCover: "#ctxbody .pl" } },

    { title: "The session ends", clear: true, session: "No session",
      note: { html: "The session ends and the context is thrown away.", at: "#cc", side: "center" } },

    { title: "A new session", session: "Session 2",
      ctx: [sys(), claudeMd(), { id: "index", kind: "file", label: "MEMORY.md", text: INDEX_LINE }],
      ctxHl: { index: "*" },
      indexHl: "*",
      view: { path: MEMFILE, label: "Memory file", tag: "not loaded" },
      note: { html: "<p>A week later, the user starts a new session. The harness loads its initial context as before, but now the <code>MEMORY.md</code> index has an entry.</p><p>The memory files themselves are not auto-loaded, only the index.</p>", at: "#cc", side: "center" } },

    { title: "A task in billing/",
      typed: PROMPT2, button: "Send",
      note: { html: "The user asks for a fix in <code>billing/</code>, and a tidy-up.", at: "#input .typed", side: "right" } },

    { title: "A relevant memory",
      term: [{ cls: "user", text: PROMPT2 }],
      ctx: [{ id: "p2", kind: "user", label: "User", text: PROMPT2 }],
      indexHl: "*",
      view: { path: MEMFILE, label: "Memory file", tag: "not loaded" },
      note: { html: "The task is in <code>billing/</code>, so the index line about <code>billing/</code> looks relevant.", at: "#index .line.hl", side: "below" } },

    { title: "Reading the memory",
      term: [{ cls: "tool", text: "Read(~/.claude/…/memory/billing-refactor.md)" }],
      ctx: [{ id: "m1", kind: "tool", label: "Read billing-refactor.md", text: MEMORY_FILE.split("\n").slice(7, 9).join("\n"), more: 4 }],
      ctxHl: { m1: "*" },
      view: { path: MEMFILE, label: "Memory file", hl: "*" },
      note: { html: "The agent reads the memory file, the same way it reads any other file. Now the memory is in the context too.", at: "#ctx-m1", side: "right" } },

    { title: "The memory at work",
      term: [
        { cls: "tool", text: "Update(billing/totals.py)" },
        { cls: "say", hl: true, text: REPLY2 },
      ],
      ctx: [{ id: "e2", kind: "tool", label: "Edit billing/totals.py", text: "ok" }, { id: "r2", kind: "say", label: "Agent", text: REPLY2 }],
      view: { path: MEMFILE, label: "Memory file" },
      note: { html: "The memory changes what the agent does: it fixes the bug and leaves the rest of <code>billing/</code> alone.", at: "#term .ln.say:last-child", side: "right" } },
  ],
};

start(script);
