// Drive the false memories explainer in headless Chrome the way a coach would, and check what it shows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../tools/serve.mjs";
import { launchChrome } from "../tools/cdp.mjs";

const PAGE = "modules/memory/false-memories.html";

test("False memories explainer: the stale memory, the code, the corrected file and index, the followed preference, and every note placed clear", async () => {
  const server = await startServer({ port: 8433 });
  const chrome = await launchChrome({ width: 1280, height: 720 });
  try {
    const page = await chrome.newPage();
    /** @param {string} js */
    const get = async (js) => page.evaluate(js);
    const text = (/** @type {string} */ sel) => get(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? ""`);

    await page.goto(new URL(PAGE, server.url).href);
    assert.equal(await get(`document.title`), "Agent memory explainer: False memories");
    assert.match(await text("#index"), /health check endpoint is `\/status`/);

    // The memory says /status; the code says /health.
    await get(`explorable.go(4)`);
    assert.match(await text("#view .line.hl"), /\/status/);
    await get(`explorable.go(5)`);
    assert.match(await text("#ctx-code .pl.hl"), /"\/health"/);

    // The stale-memory instruction is highlighted when the agent decides to trust the code.
    await get(`explorable.go(6)`);
    assert.match(await get(`[...document.querySelectorAll("#ctx-sys .pl.hl")].map((e) => e.textContent).join(" ")`), /trust what you\s+observe now/);

    // It fixes the memory file, then the index line.
    await get(`explorable.go(7)`);
    assert.match(await text("#view .line.add"), /\/health/);
    await get(`explorable.go(8)`);
    assert.match(await text("#index .line.add"), /`\/health`/);

    // It follows the no-refactors memory and adds the header three times.
    await get(`explorable.go(11)`);
    assert.match(await text("#view .line.hl"), /never wants refactors/);
    await get(`explorable.go(13)`);
    assert.equal(await get(`document.querySelectorAll("#ctx-edit .pl.hl").length`), 3);

    const problems = await get(`explorable.check()`);
    assert.deepEqual(problems, []);
  } finally {
    await chrome.close();
    await server.close();
  }
});
