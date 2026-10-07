// Drive the prompt hook explainer in headless Chrome the way a coach would, and check what it shows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../tools/serve.mjs";
import { launchChrome } from "../tools/cdp.mjs";

const PAGE = "modules/hooks/prompt-hook.html";

test("prompt hook explainer: the prompt, $ARGUMENTS, the hook model's reasoning and answer, deny then allow", async () => {
  const server = await startServer({ port: 8422 });
  const chrome = await launchChrome({ width: 1280, height: 720 });
  try {
    const page = await chrome.newPage();
    /** @param {string} js */
    const get = async (js) => page.evaluate(js);
    const where = () => get(`document.querySelector("#where").textContent`);
    const text = (/** @type {string} */ sel) => get(`document.querySelector(${JSON.stringify(sel)}).textContent`);

    await page.goto(new URL(PAGE, server.url).href);
    assert.equal(await get(`document.title`), "Hooks explainer: Prompt Hooks");
    assert.equal(await where(), "Waiting for a prompt");
    assert.match(await text("#bubble"), /prompt hook that stops it running shell commands.*click this to collapse it/);
    assert.match(await text("#reglist"), /PreToolUse Bash → prompt/);
    assert.match(await text("#hooklines .code"), /The command: \$ARGUMENTS/);

    // The first command: $ARGUMENTS filled in, the hook model thinks, then denies; the reasoning stays.
    await get(`explorable.go(3)`);
    assert.match(await text("#script-in"), /"command": "git checkout -- checkout\.py"/);
    await get(`explorable.go(4)`);
    assert.equal(await where(), "The hook model thinks");
    assert.match(await text("#script-out"), /thinking/);
    await get(`explorable.go(5)`);
    assert.match(await text("#script-out"), /thinking[\s\S]*"ok": false/);
    assert.match(await text("#term"), /PreToolUse:Bash hook error: git checkout -- discards/);

    // Back to the model along the blocked edge, then the second command is allowed and runs.
    await get(`explorable.go(6)`);
    assert.equal(await get(`document.querySelector("#e-block").classList.contains("now")`), true);
    await get(`explorable.go(11)`);
    assert.equal(await where(), "The hook allows the command");
    assert.match(await text("#script-in"), /git stash push checkout\.py/);
    assert.match(await text("#script-out"), /thinking[\s\S]*"ok": true/);
    await get(`explorable.go(explorable.steps - 1)`);
    assert.equal(await where(), "The tool runs");
    assert.equal(await get(`document.querySelector("#b-edit").classList.contains("lit")`), true);

    // Every step, folded and open: no note covers what matters, each ? sits at its open note's pointer,
    // and the harness never skips a state.
    assert.deepEqual(await get(`explorable.check()`), []);

    // Chrome asks for /favicon.ico by itself; the site has none.
    assert.deepEqual(page.consoleMessages.filter((m) => ["error", "exception"].includes(m.type) && !m.text.includes("favicon.ico")), []);
  } finally {
    await chrome.close();
    await server.close();
  }
});
