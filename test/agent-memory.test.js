// Drive the agent memory explainer in headless Chrome the way a coach would, and check what it shows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../tools/serve.mjs";
import { launchChrome } from "../tools/cdp.mjs";

const PAGE = "modules/memory/agent-memory.html";

test("Agent memory explainer: the index in the context, the memory written to disk, a fresh context next session, and every note placed clear", async () => {
  const server = await startServer({ port: 8432 });
  const chrome = await launchChrome({ width: 1280, height: 720 });
  try {
    const page = await chrome.newPage();
    /** @param {string} js */
    const get = async (js) => page.evaluate(js);
    const text = (/** @type {string} */ sel) => get(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? ""`);

    await page.goto(new URL(PAGE, server.url).href);
    assert.equal(await get(`document.title`), "Agent memory explainer: How memory works");

    // The session starts with the system prompt, CLAUDE.md and an empty index in the context.
    await get(`explorable.go(1)`);
    assert.deepEqual(await get(`[...document.querySelectorAll("#ctxbody > *")].map((e) => e.id)`), ["ctx-sys", "ctx-claude", "ctx-index"]);
    assert.match(await text("#ctx-index"), /\(empty\)/);

    // The index is in the memory folder from the start, empty.
    assert.match(await text("#index"), /MEMORY\.md[\s\S]*\(empty\)/);

    // The prompt waits in the input box until it's sent, and isn't in the context yet.
    await get(`explorable.go(2)`);
    assert.match(await text("#input .typed"), /billing/);
    assert.equal(await get(`document.querySelectorAll("#ctxbody .user").length`), 0);

    // The agent writes the memory file (all added lines), then a line in the index.
    await get(`explorable.go(5)`);
    assert.match(await text("#view .vh"), /billing-refactor\.md/);
    assert.equal(await get(`document.querySelectorAll("#view .line.add").length`), await get(`document.querySelectorAll("#view .line").length`));
    await get(`explorable.go(6)`);
    assert.match(await text("#index .line.add"), /^- \[Billing/);

    // The session ends: the context empties, the memory folder keeps its files.
    await get(`explorable.go(8)`);
    assert.equal(await get(`document.querySelectorAll("#ctxbody .blk, #ctxbody .pb").length`), 0);
    assert.equal(await get(`document.querySelectorAll("#term .ln").length`), 0);

    // The next session loads the index again, now with a line, and not the memory file.
    await get(`explorable.go(9)`);
    assert.match(await text("#ctx-index"), /billing-refactor\.md/);
    assert.match(await text("#view .vh"), /not loaded/);

    const problems = await get(`explorable.check()`);
    assert.deepEqual(problems, []);
  } finally {
    await chrome.close();
    await server.close();
  }
});
