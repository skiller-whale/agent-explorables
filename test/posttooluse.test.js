// Drive the PostToolUse explainer in headless Chrome the way a coach would, and check what it shows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../tools/serve.mjs";
import { launchChrome } from "../tools/cdp.mjs";

const PAGE = "modules/hooks/posttooluse.html";

test("PostToolUse explainer: steps, notes, the hash, and every note placed clear of what matters", async () => {
  const server = await startServer({ port: 8420 });
  const chrome = await launchChrome({ width: 1280, height: 720 });
  try {
    const page = await chrome.newPage();
    /** @param {string} js */
    const get = async (js) => page.evaluate(js);
    /** @param {string} key */
    const press = (key) => get(`dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(key)} }))`);
    const where = () => get(`document.querySelector("#where").textContent`);
    const note = () => get(`(() => { const b = document.querySelector("#bubble"); return b.hidden ? null : { folded: b.classList.contains("folded"), text: b.textContent }; })()`);

    await page.goto(new URL(PAGE, server.url).href);
    assert.equal(await get(`document.title`), "Hooks explainer: Workflow");
    assert.equal(await get(`location.hash`), "#0");
    assert.equal(await where(), "What this shows");

    // Notes start open, fold to a ? on click, and stay as they were left from step to step.
    assert.match((await note()).text, /simplified agent.*click this to collapse it/);
    await get(`document.querySelector("#bubble").click()`);
    assert.deepEqual(await note(), { folded: true, text: "?" });
    await get(`document.querySelector("#bubble").click()`);
    await press("ArrowRight");
    assert.equal(await where(), "The agent starts");
    assert.match((await note()).text, /reads settings\.json/);
    assert.match(await get(`document.querySelector("#reglist").textContent`), /npx eslint \. >&2 \|\| exit 2/);
    await get(`document.querySelector("#bubble").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }))`);
    assert.deepEqual(await note(), { folded: true, text: "?" });
    await press("ArrowRight");
    assert.equal((await note()).folded, true);

    // The input box's button moves on, and Send puts the prompt in the conversation.
    assert.match(await get(`document.querySelector("#input .opt").textContent`), /Send/);
    await get(`document.querySelector("#input .opt").click()`);
    assert.equal(await where(), "UserPromptSubmit");
    assert.match(await get(`document.querySelector("#term").textContent`), /Add a retry to fetchUser in api\.js\./);

    // The hash is the step; the hook fails at step 10 and passes at step 16.
    await get(`location.hash = "#10"`);
    await page.evaluate(`new Promise((r) => setTimeout(r, 50))`);
    assert.equal(await where(), "The hook fails");
    assert.match(await get(`document.querySelector("#hooklines").textContent`), /exit 2/);
    assert.equal(await get(`document.querySelector("#n-post").classList.contains("now")`), true);
    await get(`explorable.go(16)`);
    assert.match(await get(`document.querySelector("#hooklines").textContent`), /exit 0/);

    // The last step has no next.
    await get(`explorable.go(explorable.steps - 1)`);
    assert.equal(await where(), "Waiting for a prompt");
    assert.equal(await get(`document.querySelector("#next").disabled`), true);
    assert.equal(await get(`document.querySelector("#input .opt")`), null);

    // A hash that matches no step starts at the beginning and says so.
    await page.goto(new URL(`${PAGE}#99`, server.url).href);
    assert.match(await where(), /^What this shows.*no step #99/);
    assert.equal(await get(`location.hash`), "#0");

    // Every step, folded and open: no note covers what matters, each ? sits at its open note's
    // pointer, and the harness never skips a state.
    assert.deepEqual(await get(`explorable.check()`), []);

    // Chrome asks for /favicon.ico by itself; the site has none.
    assert.deepEqual(page.consoleMessages.filter((m) => ["error", "exception"].includes(m.type) && !m.text.includes("favicon.ico")), []);
  } finally {
    await chrome.close();
    await server.close();
  }
});
