// The prompt hook explainer: one prompt through a simplified agent whose only hook is a PreToolUse prompt
// hook on Bash, which asks another model to deny commands that could lose work. The agent tries to discard a
// file's changes, the hook's model denies it, and continueOnBlock sends the reason back so the agent carries
// on: it stashes the changes instead, which the hook allows. Every state is shown in turn, and the hook's
// prompt sits bottom right with what $ARGUMENTS was filled with and the model's answer. Canned, from the
// example on the hooks module's "Hook Actions" slide.

import { start } from "./harness.js";

/** @typedef {import("./harness.js").Script} Script */

const PROMPT = "Put checkout.py back to how it was in the last commit.";
const DISCARD = "git checkout -- checkout.py";
const STASH = "git stash push checkout.py";
const REASON = "git checkout -- discards the uncommitted changes to checkout.py";
/** @param {string} command */
const args = (command) => `{"tool_name": "Bash",
 "tool_input": {
   <b>"command": "${command}"</b>}}`;

/** @type {Script} */
const script = {
  events: ["PreToolUse"],
  hooks: [{ event: "PreToolUse", matcher: "Bash", command: "prompt" }],
  registry: "line",
  hookScript: {
    name: "the hook's prompt",
    lines: [
      "Deny any command that could lose",
      "uncommitted work or data, such as git",
      "reset --hard, git checkout -- ., git",
      "stash drop, rm -rf on tracked files, or",
      "DROP TABLE. Allow everything else.",
      "The command: $ARGUMENTS",
    ],
    inLabel: "$ARGUMENTS",
    outLabel: "the hook model's answer",
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
    { title: "Waiting for a prompt", state: "n-prompt", lit: ["b-you"], registry: true, typed: PROMPT, button: "Send",
      note: { html: "<p>This agent has been configured with a prompt hook that stops it running shell commands which could lose work. We will see what happens when it tries.</p><p>(You can click this to collapse it)</p>", at: "#cc", side: "center" } },

    { title: "The model asks for a tool", state: "n-model", edge: "e-prompt", lit: ["b-you", "b-model"], arrows: ["a-you", "a-reply"], replyLabel: "tool_use",
      cc: [{ cls: "user", text: PROMPT }, { cls: "say", text: "I’ll discard the changes to checkout.py." }],
      note: { html: `<p>The model asks the harness to run a shell command that throws away the file’s changes.</p><pre>tool_use: Bash
  command: ${DISCARD}</pre>`, at: "#cc", side: "center" } },

    { title: "PreToolUse", state: "n-pre", edge: "e-tool", reg: { PreToolUse: "match" },
      note: { html: "The harness triggers the <code>PreToolUse</code> hook, which matches on the <code>Bash</code> tool. Its action is a prompt.", at: "#reg-PreToolUse", side: "left" } },

    { title: "The hook model is asked", state: "n-pre", lit: ["b-hook"], arrows: ["a-hook"], stdin: args(DISCARD), scriptHl: [5],
      note: { html: "The harness fills in <code>$ARGUMENTS</code> with the tool call, and sends the prompt to another model.", at: "#script-in", side: "left" } },

    { title: "The hook model thinks", state: "n-pre", lit: ["b-hook"], arrows: ["a-hook"], scriptHl: [0, 1, 2],
      out: [{ cls: "reasoning", html: `<span class="tag">thinking</span> git checkout -- on a file throws away its uncommitted changes. That's work that can't be got back, and the prompt lists this command by name. Deny.` }] },

    { title: "The hook denies the command", state: "n-pre", lit: ["b-hook"], arrows: ["a-hook"], scriptHl: [0, 1, 2],
      out: [{ cls: "reasoning", html: `<span class="tag">thinking</span> git checkout -- on a file throws away its uncommitted changes. That's work that can't be got back, and the prompt lists this command by name. Deny.` },
            { cls: "exit bad", html: `{"ok": false,\n "reason": "${REASON}"}` }],
      cc: [{ cls: "hookfb", text: `PreToolUse:Bash hook error: ${REASON}` }],
      note: { html: "The hook model decides this command would lose uncommitted work, so it denies it and gives a reason.", at: "#script-out", side: "left" } },

    { title: "Back to the model", state: "n-model", edge: "e-block", lit: ["b-model"], arrows: ["a-ctx"], ctxLabel: "context + hook's reason",
      cc: [{ cls: "think", text: "Thinking…" }],
      note: { html: "The harness blocks the command.", at: "#b-model", side: "left" } },

    // the second time round: the agent finds another way, and the hook allows it
    { title: "The model asks for a tool", state: "n-model", lit: ["b-model"], arrows: ["a-reply"], replyLabel: "tool_use",
      cc: [{ cls: "say", text: "The hook won’t let me discard the changes. I’ll stash them instead, so you can get them back." }],
      note: { html: `<p>The model tries another way.</p><pre>tool_use: Bash
  command: ${STASH}</pre>`, at: "#b-model", side: "left" } },

    { title: "PreToolUse", state: "n-pre", edge: "e-tool", reg: { PreToolUse: "match" } },

    { title: "The hook model is asked", state: "n-pre", lit: ["b-hook"], arrows: ["a-hook"], stdin: args(STASH), scriptHl: [5] },

    { title: "The hook model thinks", state: "n-pre", lit: ["b-hook"], arrows: ["a-hook"], scriptHl: [4],
      out: [{ cls: "reasoning", html: `<span class="tag">thinking</span> git stash push saves the changes before it clears them from the file, and git stash pop brings them back. Nothing is lost, so this is allowed.` }] },

    { title: "The hook allows the command", state: "n-pre", lit: ["b-hook"], arrows: ["a-hook"], scriptHl: [4],
      out: [{ cls: "reasoning", html: `<span class="tag">thinking</span> git stash push saves the changes before it clears them from the file, and git stash pop brings them back. Nothing is lost, so this is allowed.` },
            { cls: "exit good", html: `{"ok": true}` }],
      note: { html: "Stashing keeps the changes, so the hook model allows it.", at: "#script-out", side: "left" } },

    { title: "The tool runs", state: "n-run", edge: "e-pre", lit: ["b-edit", "b-file"], arrows: ["a-edit"],
      cc: [{ cls: "tool", text: `Bash(${STASH})` }, { cls: "ok", text: "Saved working directory and index state" }] },
  ],
};

start(script);
