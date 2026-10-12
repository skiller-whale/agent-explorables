// Drive the custom subagents explainer in headless Chrome the way a coach would, and check what it shows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../tools/serve.mjs";
import { launchChrome } from "../tools/cdp.mjs";

const PAGE = "modules/subagents/custom.html";

test("Custom subagents explainer: the agent file, the Agent call, the issue and wiki cards, the report, the reply and the cost, and every note placed clear", async () => {
  const server = await startServer({ port: 8433 });
  const chrome = await launchChrome({ width: 1280, height: 720 });
  try {
    const page = await chrome.newPage();
    /** @param {string} js */
    const get = async (js) => page.evaluate(js);
    const text = (/** @type {string} */ sel) => get(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? ""`);
    const highlighted = () => get(`[...document.querySelectorAll("#view .vbody .hl")].map((e) => e.textContent).join("\\n")`);

    await page.goto(new URL(PAGE, server.url).href);
    assert.equal(await get(`document.title`), "Subagents explainer: Custom subagents");

    // The agent file, nothing highlighted, then a part at a time: name and description, tools to model, the body.
    assert.match(await text("#view .vh"), /\.claude\/agents\/project-historian\.md/);
    assert.equal(await highlighted(), "");
    await get(`explorable.go(1)`);
    assert.match(await highlighted(), /^name: project-historian\ndescription: Finds out why this project's code[\s\S]*from the code\.$/);
    await get(`explorable.go(2)`);
    assert.match(await highlighted(), /^tools: [\s\S]*mcpServers:[\s\S]*model: sonnet$/);
    await get(`explorable.go(3)`);
    assert.match(await highlighted(), /^You answer [\s\S]*the Fernway project's code\.[\s\S]*Never change anything\.$/);
    await get(`explorable.go(7)`);
    assert.equal(await highlighted(), "");
    assert.match(await text("#subterm .ln.user"), /^checkout\/fees\.py rounds every delivery fee/);
    assert.match(await text("#row-project-historian"), /project-historian\s*sonnet/);

    // The main agent calls it by name, with the full prompt.
    await get(`explorable.go(6)`);
    assert.match(await text("#view .vbody"), /^subagent_type: project-historian[\s\S]*Cite your sources\.$/);

    // No ticket ID before the subagent searches the tracker.
    for (let i = 0; i <= 7; i++) {
      await get(`explorable.go(${i})`);
      assert.doesNotMatch(await get(`document.querySelector("#stage").textContent`), /FIN-212/, `#${i}`);
    }

    // MCP search results, then results as cards: the issue, then the wiki page with its last line highlighted.
    await get(`explorable.go(8)`);
    assert.equal(await get(`document.querySelectorAll("#view .result").length`), 4);
    assert.doesNotMatch(await text("#subterm"), /get_issue/);
    assert.match(await highlighted(), /^FIN-212:/);
    await get(`explorable.go(9)`);
    assert.match(await text("#view .cardbody h2"), /Paylink settlements/);
    await get(`explorable.go(10)`);
    assert.equal(await text("#view .cardbody .chip"), "Accepted");
    assert.match(await highlighted(), /^Engineering › Decisions[\s\S]*Revisit if we move off Paylink\.$/);

    // The report comes back; the main agent's context grows by it, and the session's cost adds up.
    await get(`explorable.go(14)`);
    assert.match(await text("#row-project-historian"), /✓[\s\S]*6 tool uses · 12\.4k/);
    assert.match(await text("#ctx-main"), /11\.3k → 12\.0k/);
    assert.match(await text("#mainterm .ln.say.hl"), /^The rounding was added for Paylink/);
    assert.equal(await get(`document.querySelectorAll("#view .vbody .hl").length`), 0);
    assert.match(await text("#subhead"), /No subagent running/);
    assert.equal(await text("#subterm"), "");
    assert.match(await text("#view .vbody"), /^Why delivery fees round up to 50p/);
    assert.match(await text("#cost .total"), /\$0\.071/);
    assert.equal(await get(`document.querySelectorAll("#dots > *").length`), 15);

    assert.deepEqual(await get(`explorable.check()`), []);
  } finally {
    await chrome.close();
    await server.close();
  }
});
