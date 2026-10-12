// Drive the subagents fan-out explainer in headless Chrome the way a coach would, and check what it shows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../tools/serve.mjs";
import { launchChrome } from "../tools/cdp.mjs";

const PAGE = "modules/subagents/fan-out.html";

test("Fan-out explainer: three subagents stacked, the selected one marked, the reports, the closed column, the reply and the cost, and every note placed clear", async () => {
  const server = await startServer({ port: 8432 });
  const chrome = await launchChrome({ width: 1280, height: 720 });
  try {
    const page = await chrome.newPage();
    /** @param {string} js */
    const get = async (js) => page.evaluate(js);
    const text = (/** @type {string} */ sel) => get(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? ""`);
    const count = (/** @type {string} */ sel) => get(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
    const highlighted = () => get(`[...document.querySelectorAll("#view .vbody .hl")].map((e) => e.textContent).join("\\n")`);

    await page.goto(new URL(PAGE, server.url).href);
    assert.equal(await get(`document.title`), "Subagents explainer: Fan out");
    assert.match(await text("#subs"), /No subagents running/);

    // It sizes up the codebase: the file list, nothing highlighted.
    await get(`explorable.go(1)`);
    assert.match(await text("#view .vbody"), /app\/models\.py/);
    assert.equal(await count("#view .vbody .hl"), 0);

    // The Agent call with its full prompt, from the top, nothing cut off.
    await get(`explorable.go(2)`);
    assert.match(await text("#view .vbody"), /^subagent_type: general-purpose/);
    assert.equal(await count("#view .line.more"), 0);
    assert.equal(await get(`document.querySelector("#view .vbody").scrollTop`), 0);
    assert.equal(await count("#mainterm .ln.tool"), 4);

    // Three subagents start together, none selected, none faded.
    await get(`explorable.go(3)`);
    assert.equal(await count("#subs > .panel"), 3);
    assert.equal(await count("#subs > .panel.selected"), 0);
    assert.equal(await count("#agents .row"), 4);

    // One selected: marked, the others fade.
    await get(`explorable.go(6)`);
    assert.equal(await text("#subs > .panel.selected .who"), "Review API and auth");
    assert.equal(await get(`[...document.querySelectorAll("#subs > .panel:not(.selected)")].map((e) => getComputedStyle(e).opacity).join()`), "0.4,0.4");
    assert.match(await highlighted(), /forged reset GET 200/);

    // All three reports come back on one step; the API report is on the right, the main agent's context grows.
    await get(`explorable.go(7)`);
    assert.equal(await count("#subs .ln.box"), 3);
    assert.match(await text("#view .vbody"), /^Code review: auth and REST API/);
    assert.match(await text("#ctx-main"), /17\.3k → 34\.0k/);
    assert.equal(await count("#agents .row"), 4);
    assert.match(await text("#agents"), /10 tool uses · 69\.6k/);

    // The subagents' column closes; the spot-check has the top findings highlighted.
    await get(`explorable.go(8)`);
    assert.match(await text("#subs"), /No subagents running/);
    assert.match(await highlighted(), /SECRET_KEY[\s\S]*netloc/);

    // The reply, cut off on the left and in full on the right, highlighted.
    await get(`explorable.go(9)`);
    assert.match(await text("#mainterm .ln.more"), /^\(\d+ more lines\)$/);
    assert.match(await text("#view .vbody"), /^# Code review: microblog \(Flask\)/);
    assert.equal(await count("#view .vbody .line:not(.hl)"), 0);

    // The session's cost, with no per-model breakout.
    await get(`explorable.go(10)`);
    assert.match(await text("#cost"), /^Session cost \$1\.908$/);
    assert.match(await text("#bubble"), /3m35s and cost \$1\.91/);

    assert.deepEqual(await get(`explorable.check()`), []);
  } finally {
    await chrome.close();
    await server.close();
  }
});
