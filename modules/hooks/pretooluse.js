// The PreToolUse explainer: one prompt through a simplified agent whose only hook runs protect.sh before every
// edit. The agent tries to edit .env, the script reads the file path from the JSON on stdin, exits 2, and the
// edit never runs: the model gets the script's reason instead of the tool's result, and tells the user. Every
// state is shown in turn, and the script itself sits bottom right with its input and output. Canned, from the
// "Blocking a Tool Call" slide's example.

import { start } from "./harness.js";

/** @typedef {import("./harness.js").Script} Script */

const PROMPT = "Set DEBUG to true in .env.";
const REASON = "Blocked: .env is protected";
const CONFIG = `"PreToolUse": [{
  "matcher": "Edit|Write",
  "hooks": [{ "type": "command",
    "command": ".claude/hooks/protect.sh" }]
}]`;
const STDIN = `{"tool_name": "Edit",
 "tool_input": {
   <b>"file_path": ".env"</b>,
   "old_string": "DEBUG=false",
   "new_string": "DEBUG=true"}}`;

/** @type {Script} */
const script = {
  events: ["PreToolUse"],
  hooks: [{ event: "PreToolUse", matcher: "Edit|Write", command: "protect.sh" }],
  registry: "line",
  hookScript: {
    name: "protect.sh",
    lines: [
      "#!/bin/bash",
      "file=$(jq -r '.tool_input.file_path')",
      'if [[ "$file" == *.env ]]; then',
      `  echo "${REASON}" >&2`,
      "  exit 2",
      "fi",
      "exit 0",
    ],
  },
  edges: {
    "e-start": ["n-start", "n-prompt"],
    "e-prompt": ["n-prompt", "n-model"],
    "e-tool": ["n-model", "n-pre"],
    "e-pre": ["n-pre", "n-run"],
    "e-block": ["n-pre", "n-model"],
    "e-run": ["n-run", "n-post"],
    "e-post": ["n-post", "n-model"],
    "e-reply": ["n-model", "n-stop"],
    "e-stop": ["n-stop", "n-prompt"],
  },
  // Each step says what the page looks like once it has happened (see Step in harness.js).
  steps: [
    { title: "What this shows", state: null, lit: [],
      note: { html: "<p>This agent has been configured with a hook that stops it editing <code>.env</code>. We will see what happens when it tries.</p><p>(You can click this to collapse it)</p>", at: "#cc", side: "center" },
      button: "Start" },

    { title: "The agent starts", state: "n-start", lit: ["b-settings"], arrows: ["a-settings"], registry: true,
      note: { html: `<p>The agent reads <code>settings.json</code>.</p><pre>${CONFIG}</pre>`, at: "#registry", side: "left" } },

    { title: "Waiting for a prompt", state: "n-prompt", edge: "e-start", lit: ["b-you"], typed: PROMPT, button: "Send" },

    { title: "The model is called", state: "n-model", edge: "e-prompt", lit: ["b-you", "b-model"], arrows: ["a-you", "a-ctx"],
      cc: [{ cls: "user", text: PROMPT }, { cls: "think", text: "Thinking…" }] },

    { title: "The model asks for a tool", state: "n-model", lit: ["b-model"], arrows: ["a-reply"], replyLabel: "tool_use",
      cc: [{ cls: "say", text: "I’ll change DEBUG in .env." }],
      note: { html: `<p>The model asks the harness to run <code>Edit</code> on <code>.env</code>.</p><pre>tool_use: Edit
  file_path: .env
  old_string: DEBUG=false
  new_string: DEBUG=true</pre>`, at: "#b-model", side: "left" } },

    { title: "PreToolUse", state: "n-pre", edge: "e-tool", reg: { PreToolUse: "match" },
      note: { html: "The harness triggers the <code>PreToolUse</code> hook which matches on <code>Edit</code> tools and runs a script.", at: "#reg-PreToolUse", side: "left" } },

    { title: "The hook runs", state: "n-pre", lit: ["b-hook"], arrows: ["a-hook"], stdin: STDIN, scriptHl: [1],
      note: { html: "The harness runs the script and passes it the tool call as JSON on <code>stdin</code>. The script reads the file path out of it.", at: "#script-in", side: "left" } },

    { title: "The hook blocks the edit", state: "n-pre", lit: ["b-hook"], arrows: ["a-hook"], scriptHl: [2, 3, 4],
      out: [{ cls: "err", html: `<span class="tag">stderr</span> ${REASON}` },
            { cls: "exit bad", html: `<span class="tag">exit</span> 2  <span class="cmt"># block and put stderr in context</span>` }],
      cc: [{ cls: "hookfb", text: `PreToolUse:Edit hook error: ${REASON}` }],
      note: { html: "The file path ends in <code>.env</code>, so the script writes a reason to <code>stderr</code> and exits with code 2.", at: "#script-out", side: "left" } },

    { title: "Back to the model", state: "n-model", edge: "e-block", lit: ["b-model"], arrows: ["a-ctx"], ctxLabel: "context + hook's reason",
      cc: [{ cls: "think", text: "Thinking…" }],
      note: { html: "The harness blocks the edit, appends the reason to the context, and calls the model to decide what to do.", at: "#b-model", side: "left" } },

    { title: "The model replies", state: "n-model", lit: ["b-model"], arrows: ["a-reply"], replyLabel: "reply",
      cc: [{ cls: "say", text: "A project hook blocks edits to .env, so I haven’t changed DEBUG. You can set it yourself, or change the hook if it should allow this." }] },

    { title: "Stop", state: "n-stop", edge: "e-reply",
      note: { html: "The reply has no tool call, so the turn is over.", at: "#n-stop", side: "right" } },

    { title: "Waiting for a prompt", state: "n-prompt", edge: "e-stop", lit: ["b-you"] },
  ],
};

start(script);
