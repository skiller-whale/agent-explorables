// Drive the subagents research explainer in headless Chrome the way a coach would, and check what it shows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../tools/serve.mjs";
import { launchChrome } from "../tools/cdp.mjs";

const PAGE = "modules/subagents/research.html";

test("Research explainer: the subagents list, the Agent call and its prompt, cut-off and scrolled lines, the report, context and cost, and every note placed clear", async () => {
  const server = await startServer({ port: 8431 });
  const chrome = await launchChrome({ width: 1280, height: 720 });
  try {
    const page = await chrome.newPage();
    /** @param {string} js */
    const get = async (js) => page.evaluate(js);
    const text = (/** @type {string} */ sel) => get(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? ""`);

    await page.goto(new URL(PAGE, server.url).href);
    assert.equal(await get(`document.title`), "Subagents explainer: Research");
    assert.equal(await get(`document.querySelectorAll("#agents .row").length`), 0);

    // The main agent sees the built-in subagents, and calls Explore on Haiku.
    await get(`explorable.go(1)`);
    assert.match(await get(`[...document.querySelectorAll("#view .vbody .hl")].map((e) => e.textContent).join(" ")`), /Explore[\s\S]*Edit, Write/);
    await get(`explorable.go(2)`);
    assert.match(await text("#view .vbody"), /subagent_type: Explore[\s\S]*model: haiku/);
    await get(`explorable.go(3)`);
    assert.match(await get(`[...document.querySelectorAll("#view .vbody .hl")].map((e) => e.textContent).join(" ")`), /^prompt: \|[\s\S]*Do NOT use the web/);
    assert.match(await text("#view .line.more"), /^\(\d+ more lines\)$/);

    // The subagent starts with the main agent's prompt as its first message, cut off, and is
    // listed under the input box.
    await get(`explorable.go(4)`);
    assert.match(await text("#subterm .ln.user"), /Do NOT use the web/);
    assert.match(await text("#subterm .ln.more"), /^\(\d+ more lines\)$/);
    assert.equal(await get(`document.querySelector("#subtools").hidden`), true);
    assert.match(await text("#row-Explore"), /Explore\s*haiku/);
    assert.equal(await get(`document.querySelector("#mainterm .ln.tool.spin") !== null`), true);

    // Once Explore starts working, its prompt is no longer cut: it scrolls up like a terminal, and the top line
    // left in view is cut at a whole line.
    await get(`explorable.go(5)`);
    assert.equal(await get(`document.querySelector("#subterm .ln.more")`), null);
    assert.match(await get(`document.querySelector("#subterm").firstElementChild.style.clipPath`), /^inset\(/);

    // The report is cut in Explore's conversation and shown in full on the right, and stays cut later.
    await get(`explorable.go(8)`);
    assert.match(await text("#subterm .ln.box.cut"), /^Flask-Limiter research/);
    assert.match(await text("#subterm .ln.more"), /^\(\d+ more lines\)$/);
    assert.match(await text("#view .vbody"), /Files cited:/);
    await get(`explorable.go(9)`);
    assert.match(await text("#subterm .ln.more"), /^\(\d+ more lines\)$/);
    assert.match(await text("#ctx-main"), /9\.9k → 15\.4k/);
    assert.match(await text("#cost"), /Session cost \$0\.096/);

    // The reply is cut too, with its last line under the count, on its own step and after.
    for (const i of [10, 11]) {
      await get(`explorable.go(${i})`);
      assert.match(await text("#mainterm .ln.say.cut"), /^I had a Haiku subagent read/);
      assert.match(await text("#mainterm .ln.more"), /^\(\d+ more lines\)$/);
      assert.equal(await text("#mainterm .ln.tail"), "Do you want me to add this to app.py?");
    }

    // The report comes back: the subagent is done, the context counts and the session cost are the run's.
    await get(`explorable.go(10)`);
    assert.equal(await get(`document.querySelector("#mainterm .ln.tool.spin") === null`), true);
    assert.match(await text("#row-Explore"), /✓/);
    assert.match(await text("#ctx-main"), /16\.7k/);
    assert.match(await text("#ctx-Explore"), /40\.1k/);
    assert.match(await text("#cost"), /Session cost \$0\.122/);

    // A hash that matches no step starts at the beginning and says so.
    await page.goto(new URL(`${PAGE}#99`, server.url).href);
    assert.match(await text("#where"), /no step #99/);

    assert.deepEqual(await get(`explorable.check()`), []);
  } finally {
    await chrome.close();
    await server.close();
  }
});
