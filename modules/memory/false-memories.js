// False memories: the orders-api service from the agent memory module's False Memories exercise, with its seeded
// memory store. The user asks for a Cache-Control header on the health check. The agent reads the health check
// memory (it says /status), checks the code (it says /health), trusts the code and corrects the memory and its
// index line. Then it reads the no-refactors memory, which nothing in the code can check, follows it, and adds the
// header three times. Asked why, it cites the memory.
//
// Built from the exercise's own files (_code/orders-api, _code/seed-store) and the behaviour its instructor notes
// record (tested on Sonnet 5). Not recorded on Sonnet 5.5: the replies and the agent's reasoning are drafts.
// The system prompt lines are verbatim from recordings/memory/agent-memory/system-prompt/. Tooltips from the
// storyboard (https://claude.ai/artifact/K3hMW3p75Ljq2gBcdg3QEk), v3.

import { start } from "./memory.js";

/** @typedef {import("./memory.js").Script} Script */

const MEM = "~/.claude/projects/-home-learner-orders-api/memory";
const INDEX = `${MEM}/MEMORY.md`;
const HEALTH = `${MEM}/health-check-endpoint.md`;
const NOREF = `${MEM}/no-refactors.md`;

const PROMPT1 = "Add a Cache-Control: no-store header to the health check response.";
const PROMPT2 = "That code is really ugly. Why did you write it that way instead of refactoring it?";

/** Word-wraps text to `width` columns, each line after the first indented by `indent`. @param {string} text @param {number} width @param {string} [indent] */
const wrap = (text, width, indent = "") => {
  const out = [""];
  for (const word of text.split(" ")) {
    const last = out[out.length - 1];
    if (last.trim() && (last + " " + word).length > width) out.push(indent + word);
    else out[out.length - 1] = last.trim() ? `${last} ${word}` : `${last}${word}`;
  }
  return out.join("\n");
};

// The memory instructions, verbatim, cut to the lines that matter here. "…N" is about N lines left out.
const STALE = "- Memory records can become stale over time. Use memory as context for what was true at a given point in time. Before answering the user or building assumptions based solely on information in memory records, verify that the memory is still correct and up-to-date by reading the current state of the files or resources. If a recalled memory conflicts with current information, trust what you observe now — and update or remove the stale memory rather than acting on it.";
const SYS_HEAD = ["…200", "# auto memory", "", wrap("You have a persistent, file-based memory system at", 46), "`/home/learner/.claude/projects/", "  -home-learner-orders-api/memory/`.", "…100"];
// The bullet's last sentence starts a line of its own, so it can be highlighted alone.
const TRUST_AT = STALE.indexOf("If a recalled memory");
const SYS_STALE_FIRST = wrap(STALE.slice(0, TRUST_AT).trim(), 46, "  ").split("\n");
const SYS_STALE = [...SYS_STALE_FIRST, ...wrap(STALE.slice(TRUST_AT), 44).split("\n").map((l) => "  " + l)];
const SYS_MEMORY = [...SYS_HEAD, ...SYS_STALE, "…20"].join("\n");
const SYS_LINES = SYS_MEMORY.split("\n");
/** the stale-memory bullet */
const SYS_STALE_HL = SYS_STALE.map((_, i) => SYS_HEAD.join("\n").split("\n").length + i);
/** its last sentence: trust what you observe, and fix the memory */
const SYS_TRUST_HL = SYS_STALE_HL.slice(SYS_STALE_FIRST.length);

// The seeded index, cut to the two entries that matter: the health check and no-refactors.
const HEALTH_LINE = (/** @type {string} */ path) => `- [Health check endpoint](health-check-endpoint.md) — The health check endpoint is \`${path}\`.`;
const NOREF_LINE = "- [No refactors](no-refactors.md) — The user never wants refactors in this repo — only minimal, surgical changes.";
const INDEX_TEXT = (/** @type {string} */ path) => [HEALTH_LINE(path), NOREF_LINE].join("\n");
const IDX_HEALTH = 0, IDX_NOREF = 1;

// The seeded memory files, verbatim.
const HEALTH_MD = (/** @type {string} */ path) => `---
name: health-check-endpoint
description: The health check endpoint path
metadata:
  node_type: memory
  type: project
  originSessionId: 22222222-2222-4222-8222-222222222222
  modified: 2026-08-01T10:05:00.000Z
---

The health check endpoint is \`${path}\`.

**Why:** that's the path the service exposes for liveness checks.

**How to apply:** when wiring up monitoring or curling the service to check it's up, use \`${path}\`.`;
const HEALTH_PATH_LINES = [10, 14];

const NOREF_MD = `---
name: no-refactors
description: The user does not want refactors in this repo
metadata:
  node_type: memory
  type: feedback
  originSessionId: 88888888-8888-4888-8888-888888888888
  modified: 2026-08-01T10:35:00.000Z
---

The user never wants refactors in this repo — only minimal, surgical changes.

**Why:** The user said so very directly in a previous session about this repo.

**How to apply:** when making a change, keep it minimal and surgical; don't restructure or "clean up" surrounding code even if it looks improvable.`;
const NOREF_RULE_LINE = 10;

// The handler in app.py, as the agent reads it.
const HANDLER = `…7
def do_GET(self):
    if self.path == "/health":
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(b"ok")
    elif self.path == "/health/":
…4
    elif self.path.startswith("/health?"):
…4
    else:
…30`;
const HANDLER_HEALTH = 2;

const EDIT = `    if self.path == "/health":
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Cache-Control", "no-store")
…3
    elif self.path == "/health/":
…2
        self.send_header("Cache-Control", "no-store")
…2
    elif self.path.startswith("/health?"):
…2
        self.send_header("Cache-Control", "no-store")
…2`;

// Drafts, from the exercise's instructor notes, until there's a Sonnet 5.5 recording.
const REASON1 = "The memory says the health check is /status, but app.py only serves /health. I'll trust the code and fix the memory.";
const REASON2 = "There's no way to check a preference against the code, so I'll follow it and keep the change minimal.";
const REPLY1 = "Added Cache-Control: no-store to all three health check branches in app.py. I also corrected a memory that said the endpoint was /status: it's /health.";

const all = (/** @type {string} */ t) => t.split("\n").map((_, i) => i);

/** @type {Script} */
const script = {
  memory: MEM,
  plainContext: true,
  files: {
    [INDEX]: { text: INDEX_TEXT("/status") },
    [HEALTH]: { text: HEALTH_MD("/status") },
    [NOREF]: { text: NOREF_MD },
  },
  steps: [
    { title: "Overview",
      note: { html: "<p>We'll see what an agent does when one of its memories is wrong.</p><p>(You can click this to collapse it)</p>", at: "#cc", side: "center" } },

    { title: "The session starts", session: "Session",
      ctx: [
        { id: "sys", kind: "sys", label: "System prompt (excerpt)", text: SYS_MEMORY },
        { id: "index", kind: "file", label: "MEMORY.md", text: INDEX_TEXT("/status") },
      ],
      ctxHl: { sys: SYS_STALE_HL },
      note: { html: "The system prompt instructs the agent to regard memories as potentially stale and to trust the code over the memory.", at: "#cc", side: "center" } },

    { title: "The prompt",
      typed: PROMPT1, button: "Send",
      note: { html: "The user asks for a small change to the health check.", at: "#input .typed", side: "right" } },

    { title: "A relevant memory",
      term: [{ cls: "user", text: PROMPT1 }],
      ctx: [{ id: "p1", kind: "user", label: "User", text: PROMPT1 }],
      indexHl: [IDX_HEALTH],
      note: { html: "The index has a line about the health check endpoint.", at: "#index .line.hl", side: "left", mayCover: "#ctxbody .pl" } },

    { title: "Reading the memory",
      term: [{ cls: "tool", text: "Recalled 1 memory" }],
      ctx: [{ id: "m1", kind: "tool", label: "Read health-check-endpoint.md", text: HEALTH_MD("/status").split("\n").slice(10).join("\n") }],
      view: { path: HEALTH, hl: [HEALTH_PATH_LINES[0]] },
      note: { html: "The agent reads the memory. It says the endpoint is <code>/status</code>.", at: "#view .line.hl", side: "above" } },

    { title: "Checking the code",
      term: [{ cls: "tool", text: "Read(app.py)" }],
      ctx: [{ id: "code", kind: "tool", label: "Read app.py", text: HANDLER }],
      ctxHl: { code: [HANDLER_HEALTH] },
      view: { path: HEALTH },
      note: { html: "It reads the handler too. The code says <code>/health</code>.", at: "#ctx-code .pl.hl", side: "right", mayCover: "#view .line" } },

    { title: "Trusting the code",
      term: [{ cls: "aside", text: REASON1 }],
      ctxHl: { sys: SYS_TRUST_HL },
      note: { html: "The agent follows the instructions in its system prompt to trust the code and update faulty memories.", at: "#term .gap", side: "center" } },

    { title: "Fixing the memory",
      term: [{ cls: "tool", text: "Wrote 1 memory" }],
      ctx: [{ id: "e1", kind: "tool", label: "Edit health-check-endpoint.md", text: "ok" }],
      files: { [HEALTH]: { text: HEALTH_MD("/health") } },
      view: { path: HEALTH, diff: { add: HEALTH_PATH_LINES } },
      note: { html: "It corrects the memory file.", at: "#view .line.add", side: "above" } },

    { title: "Fixing the index",
      ctx: [{ id: "e2", kind: "tool", label: "Edit MEMORY.md", text: "ok" }],
      files: { [INDEX]: { text: INDEX_TEXT("/health") } },
      indexDiff: { add: [IDX_HEALTH] },
      view: { path: HEALTH },
      note: { html: "<p>It updates the index line too.</p><p>Agents sometimes forget this step, which leaves the index saying <code>/status</code> for the next session.</p>", at: "#index .line.add", side: "left", mayCover: "#ctxbody .pl" } },

    { title: "Back to the task",
      note: { html: "The agent continues with its task.", at: "#term .gap", side: "center" } },

    { title: "Another relevant memory",
      indexHl: [IDX_NOREF],
      note: { html: "The agent decides the memory about making no refactors may be relevant.", at: "#index .line.hl", side: "left", mayCover: "#ctxbody .pl" } },

    { title: "Reading it",
      term: [{ cls: "tool", text: "Recalled 1 memory" }],
      ctx: [{ id: "m2", kind: "tool", label: "Read no-refactors.md", text: NOREF_MD.split("\n").slice(10).join("\n") }],
      view: { path: NOREF, hl: [NOREF_RULE_LINE] },
      note: { html: "<p>The agent reads the memory file.</p><p>It confirms the user never wants refactors in this repository.</p>", at: "#view .line.hl", side: "above" } },

    { title: "Following a preference",
      term: [{ cls: "aside", hl: true, text: REASON2 }],
      note: { html: "Nothing in the code can confirm or contradict a preference, so the agent takes it as true.", at: "#term .gap", side: "center" } },

    { title: "The change",
      term: [{ cls: "tool", text: "Update(app.py)" }, { cls: "res", text: "Added 3 lines" }],
      ctx: [{ id: "edit", kind: "tool", label: "Edit app.py", text: EDIT }],
      ctxHl: { edit: [3, 7, 11] },
      note: { html: "It adds the header three times instead of tidying the handler first.", at: "#ctx-edit", side: "right", mayCover: "#view .line" } },

    { title: "The agent returns",
      term: [{ cls: "say", hl: true, text: REPLY1 }],
      ctx: [{ id: "r1", kind: "say", label: "Agent", text: REPLY1 }],
      note: { html: "The agent returns to the user.", at: "#term .ln.say:last-child", side: "right", mayCover: "#ctxbody .pl" } },

    { title: "Asking why",
      typed: PROMPT2, button: "Send",
      note: { html: "<p>The user is annoyed at this new ugly code.</p><p>Perhaps the user got frustrated in a previous session and said something a bit too direct, which the agent stored as an overly broad memory.</p>", at: "#input .typed", side: "right" } },
  ],
};

start(script);
