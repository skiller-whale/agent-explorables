// Drive the PreToolUse (blocking edits) explainer in headless Chrome the way a coach would, and check what it shows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../tools/serve.mjs";
import { launchChrome } from "../tools/cdp.mjs";

const PAGE = "modules/hooks/pretooluse.html";

test("PreToolUse explainer: the script, its input and output, the blocked path, and every note placed clear", async () => {
  const server = await startServer({ port: 8421 });
  const chrome = await launchChrome({ width: 1280, height: 720 });
  try {
    const page = await chrome.newPage();
    /** @param {string} js */
    const get = async (js) => page.evaluate(js);
    const where = () => get(`document.querySelector("#where").textContent`);
    const shown = (/** @type {string} */ sel) => get(`getComputedStyle(document.querySelector(${JSON.stringify(sel)})).display !== "none"`);

    await page.goto(new URL(PAGE, server.url).href);
    assert.equal(await get(`document.title`), "Hooks explainer: Blocking Edits");
    assert.match(await get(`document.querySelector("#bubble").textContent`), /stops it editing \.env.*click this to collapse it/);

    // The registry is one line once settings.json is read; the script is there from the start.
    await get(`explorable.go(1)`);
    assert.equal(await get(`document.querySelectorAll("#reglist .reg").length`), 1);
    assert.match(await get(`document.querySelector("#reglist").textContent`), /PreToolUse Edit\|Write → protect\.sh/);
    assert.match(await get(`document.querySelector("#hooklines .code").textContent`), /exit 2/);
    assert.match(await get(`document.querySelector("#script-in").textContent`), /Not run yet/);

    // The blocked edge is always drawn; its label only once the edit is blocked.
    assert.equal(await shown("#e-block"), true);
    assert.equal(await shown("#l-block"), false);

    // The hook runs: the input appears and the jq line is marked; then it blocks with exit 2.
    await get(`explorable.go(6)`);
    assert.equal(await where(), "The hook runs");
    assert.match(await get(`document.querySelector("#script-in").textContent`), /"file_path": "\.env"/);
    assert.match(await get(`document.querySelector("#hooklines .code .line.hl").textContent`), /jq -r/);
    await get(`explorable.go(7)`);
    assert.match(await get(`document.querySelector("#script-out").textContent`), /stderr Blocked: \.env is protected[\s\S]*exit 2/);
    assert.match(await get(`document.querySelector("#term").textContent`), /PreToolUse:Edit hook error/);

    // Back to the model along the blocked edge, now labelled; the edit tool and .env never light up.
    await get(`explorable.go(8)`);
    assert.equal(await get(`document.querySelector("#e-block").classList.contains("now")`), true);
    assert.equal(await shown("#l-block"), true);
    for (let i = 0; i < 12; i++) {
      await get(`explorable.go(${i})`);
      assert.equal(await get(`document.querySelector("#b-edit").classList.contains("lit") || document.querySelector("#b-file").classList.contains("lit")`), false, `step ${i}`);
    }

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
