// The PostToolUse explainer: one prompt through a simplified agent whose only hook runs eslint after every
// edit. The first edit leaves an unused variable, the hook exits 2 and its stderr goes back to the model,
// which fixes it; the second time round the hook passes and the turn ends. Every state is shown in turn.
// Canned; see SOURCES.md for the runs it was checked against and what it simplifies.

import { start } from "./harness.js";

/** @typedef {import("./harness.js").Script} Script */

const PROMPT = "Add a retry to fetchUser in api.js.";
const HOOK_CMD = "npx eslint . >&2 || exit 2";
const CONFIG = `"PostToolUse": [{
  "matcher": "Edit|Write",
  "hooks": [{ "type": "command",
    "command": "${HOOK_CMD}" }]
}]`;

/** @type {Script} */
const script = {
  events: ["UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"],
  hooks: [{ event: "PostToolUse", matcher: "Edit|Write", command: HOOK_CMD }],
  edges: {
    "e-start": ["n-start", "n-prompt"],
    "e-prompt": ["n-prompt", "n-ups"],
    "e-ups": ["n-ups", "n-model"],
    "e-tool": ["n-model", "n-pre"],
    "e-pre": ["n-pre", "n-run"],
    "e-run": ["n-run", "n-post"],
    "e-post": ["n-post", "n-model"],
    "e-reply": ["n-model", "n-stop"],
    "e-stop": ["n-stop", "n-prompt"],
  },
  // Each step says what the page looks like once it has happened (see Step in harness.js).
  steps: [
    { title: "What this shows", state: null, lit: [],
      note: { html: "<p>This page follows a simplified agent through one prompt, with a <code>PostToolUse</code> hook that runs <code>eslint</code> after every edit.</p><p>(You can click this to collapse it)</p>", at: "#cc", side: "center" },
      button: "Start" },

    { title: "The agent starts", state: "n-start", lit: ["b-settings"], arrows: ["a-settings"], registry: true,
      note: { html: `<p>The agent starts and reads <code>settings.json</code>. It finds one hook.</p><pre>${CONFIG}</pre>`, at: "#registry", side: "left",
        mayCover: "#hookterm > .label" } }, // the terminal is empty at this step, and the note has nowhere else to go

    { title: "Waiting for a prompt", state: "n-prompt", edge: "e-start", lit: ["b-you"], typed: PROMPT,
      note: { html: "The agent waits for the user to type a prompt.", at: "#input", side: "right" }, button: "Send" },

    { title: "UserPromptSubmit", state: "n-ups", edge: "e-prompt", lit: ["b-you"], arrows: ["a-you"],
      cc: [{ cls: "user", text: PROMPT }], reg: { UserPromptSubmit: "look" },
      note: { html: "Now we have submitted a prompt, the harness triggers any <code>UserPromptSubmit</code> hooks. There aren’t any, so it carries on.", at: "#reg-UserPromptSubmit", side: "left" } },

    { title: "The model is called", state: "n-model", edge: "e-ups", lit: ["b-model"], arrows: ["a-ctx"],
      cc: [{ cls: "think", text: "Thinking…" }],
      note: { html: "The harness sends the context (including our prompt) to the model and waits for its reply.", at: "#b-model", side: "left" } },

    { title: "The model asks for a tool", state: "n-model", lit: ["b-model"], arrows: ["a-reply"], replyLabel: "tool_use",
      cc: [{ cls: "say", text: "I’ll wrap the fetch in a retry loop." }],
      note: { html: `<p>The model can’t edit files itself. Its reply asks the harness to run <code>Edit</code>.</p><pre>tool_use: Edit
    file_path: api.js</pre>`, at: "#b-model", side: "left" } },

    { title: "PreToolUse", state: "n-pre", edge: "e-tool", reg: { PreToolUse: "look" },
      note: { html: "Before it runs the tool, the harness checks for <code>PreToolUse</code> hooks. There aren’t any.", at: "#reg-PreToolUse", side: "left" } },

    { title: "The tool runs", state: "n-run", edge: "e-pre", lit: ["b-edit", "b-file"], arrows: ["a-edit"],
      cc: [{ cls: "tool", text: "Update(api.js)" },
           { cls: "diff", html: `<span class="add">+  for (let i = 0; i &lt; 3; i++) {</span>
  <span class="add">+    const res = await fetch(url);</span>
  <span class="add">+    try { return await getJson(url); }</span>
  <span class="add">+    catch (e) { if (i === 2) throw e; }</span>
  <span class="add">+  }</span>` }],
      note: { html: "The harness uses the <code>Edit</code> tool to update <code>api.js</code>. But it leaves an unused variable behind.", at: "#term .diff:last-of-type", side: "right" } },

    { title: "PostToolUse", state: "n-post", edge: "e-run", reg: { PostToolUse: "match" },
      note: { html: "<code>Edit</code> has finished, so the harness checks for <code>PostToolUse</code> hooks. The matcher is <code>Edit|Write</code> and the tool was <code>Edit</code>, so this one runs.", at: "#reg-PostToolUse", side: "left" } },

    { title: "The hook runs", state: "n-post", lit: ["b-eslint"], arrows: ["a-hook"],
      term: [{ cls: "cmd", text: HOOK_CMD },
             { cls: "stdin", html: `<span class="tag">stdin</span> {"hook_event_name": "PostToolUse", "tool_name": "Edit", "tool_input": {…}, …}` }],
      note: { html: "The harness runs the hook’s command and sends it the tool call as JSON on <code>stdin</code>. In this case the command ignores it and lints the whole project.", at: "#hooklines .stdin", side: "below" } },

    { title: "The hook fails", state: "n-post", lit: ["b-eslint"], arrows: ["a-hook"],
      term: [{ cls: "err", html: `<span class="tag">stderr</span> api.js 14:11  'res' is assigned a value but never used  no-unused-vars` },
             { cls: "exit bad", html: `<span class="tag">exit</span> 2  <span class="cmt"># means show stderr to the model</span>` }],
      cc: [{ cls: "hookfb", text: "PostToolUse:Edit hook blocking error: api.js 14:11 'res' is assigned a value but never used" }],
      note: { html: "<code>eslint</code> finds a problem, so the command exits with code 2.", at: "#hooklines .exit.bad", side: "below" } },

    { title: "Back to the model", state: "n-model", edge: "e-post", lit: ["b-model"], arrows: ["a-ctx"], ctxLabel: "context + eslint error",
      cc: [{ cls: "think", text: "Thinking…" }],
      note: { html: "Exit code 2 from a <code>PostToolUse</code> hook means <code>stderr</code> gets put in the agent’s context and sent back to the model for consideration.", at: "#b-model", side: "left" } },

    // the second time round the loop: every state, with few notes
    { title: "The model asks for a tool", state: "n-model", lit: ["b-model"], arrows: ["a-reply"], replyLabel: "tool_use",
      cc: [{ cls: "say", text: "The linter says res is unused. I’ll remove it." }],
      note: { html: "The agent decides to fix the linting error, and the loop continues as before.", at: "#term > :last-child", side: "right" } },

    { title: "PreToolUse", state: "n-pre", edge: "e-tool", reg: { PreToolUse: "look" } },

    { title: "The tool runs", state: "n-run", edge: "e-pre", lit: ["b-edit", "b-file"], arrows: ["a-edit"],
      cc: [{ cls: "tool", text: "Update(api.js)" },
           { cls: "diff", html: `<span class="del">-    const res = await fetch(url);</span>` }] },

    { title: "PostToolUse", state: "n-post", edge: "e-run", reg: { PostToolUse: "match" } },

    { title: "The hook passes", state: "n-post", lit: ["b-eslint"], arrows: ["a-hook"],
      term: [{ cls: "gap" }, { cls: "cmd", text: HOOK_CMD }, { cls: "exit good", html: `<span class="tag">exit</span> 0  <span class="cmt"># does nothing</span>` }],
      note: { html: "This time <code>eslint</code> passes and the command exits with code 0, which adds nothing to the model’s context.", at: "#hooklines .exit.good", side: "below" } },

    { title: "Back to the model", state: "n-model", edge: "e-post", lit: ["b-model"], arrows: ["a-ctx"],
      cc: [{ cls: "think", text: "Thinking…" }],
      note: { html: "The model gets no linter errors, so continues onwards.", at: "#b-model", side: "left" } },

    { title: "The model replies", state: "n-model", lit: ["b-model"], arrows: ["a-reply"], replyLabel: "reply",
      cc: [{ cls: "say", text: "Done. fetchUser now retries up to 3 times before it throws." }] },

    { title: "Stop", state: "n-stop", edge: "e-reply", reg: { Stop: "look" },
      note: { html: "This time the reply has no tool call, so the turn is over. The harness checks for <code>Stop</code> hooks. There aren’t any.", at: "#reg-Stop", side: "left" } },

    { title: "Waiting for a prompt", state: "n-prompt", edge: "e-stop", lit: ["b-you"] },
  ],
};

start(script);
