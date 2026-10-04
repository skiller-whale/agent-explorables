// Drive the plan-mode explainer in headless Chrome the way a coach would, and check what it shows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../tools/serve.mjs";
import { launchChrome } from "../tools/cdp.mjs";

const PAGE = "modules/specs-and-plans/plan-mode.html";
const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

test("plan-mode explainer: every turn plays, callouts show where they should, the viewer follows the script", async () => {
  const server = await startServer({ port: 8410 });
  const chrome = await launchChrome({ width: 1280, height: 720 });
  try {
    const page = await chrome.newPage();
    await page.goto(new URL(PAGE, server.url).href);
    /** @param {string} js */
    const get = async (js) => page.evaluate(js);
    /** @param {string} key */
    const press = (key) => page.evaluate(`dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(key)} }))`);
    const where = () => get(`document.querySelector("#where").textContent`);
    const viewing = () => get(`document.querySelector("#viewer .vh")?.textContent ?? ""`);
    const calloutText = () => get(`document.querySelector("#callout").hidden ? "" : document.querySelector("#callout").textContent`);
    const settle = async () => { await sleep(50); for (let i = 0; i < 200 && (await get(`document.body.dataset.phase`)) === "responding"; i++) await sleep(50); };

    assert.equal(await where(), "Plan mode · The request");
    assert.match(await calloutText(), /This is a booking system for a restaurant\./);
    assert.equal(await get(`document.title`), "Spec-Driven Development explainer: Plan mode");
    assert.equal(await get(`document.querySelector(".next-link").getAttribute("href")`), "openspec.html");

    const nextDisabled = () => get(`document.querySelector("#next").disabled`);

    // First playthrough: → does nothing; the coach clicks the messages (key 1 clicks the first).
    assert.equal(await nextDisabled(), true);
    await press("ArrowRight"); await settle();
    assert.equal(await where(), "Plan mode · The request");

    await press("1"); await settle();
    assert.equal(await where(), "Plan mode · Approve");
    assert.equal(await nextDisabled(), true);
    assert.equal(await viewing(), "bookings.py");
    assert.equal(await get(`document.querySelectorAll("#viewer .line.hl").length`), 0);

    // A file the coach opens stays only until the script moves on.
    await get(`document.querySelector('[data-path="guests.py"]').click()`);
    assert.equal(await viewing(), "guests.py");
    await press("1"); await settle();
    assert.equal(await viewing(), "bookings.py");
    assert.match(await get(`[...document.querySelectorAll("#viewer .line.hl")].map(l => l.textContent).join("\\n")`), /def requires_deposit/);

    // The end of act 1: a Continue button starts act 2.
    assert.equal(await nextDisabled(), true);
    assert.match(await get(`document.querySelector("#input .opt").textContent`), /Continue.*Five months later/);
    await press("1"); await settle();
    assert.equal(await where(), "Five months later · The request");
    assert.equal(await calloutText(), "Five months later, a new requirement has come in.");
    await press("1"); await settle();
    assert.equal(await where(), "Five months later · Approve");
    assert.equal(await calloutText(), "Can you spot the problem here?");
    const box = JSON.parse(await get(`JSON.stringify(document.querySelector("#callout").getBoundingClientRect())`));
    assert.ok(box.top >= 0 && box.bottom <= 720 && box.left >= 0 && box.right <= 1280, "callout inside the screen");
    await press("1"); await settle();
    assert.match(await calloutText(), /so a new customer pays no deposit\./);
    assert.match(await get(`document.querySelector("#viewer").textContent`), /grant_free_month/);
    assert.equal(await nextDisabled(), true);

    // Going back, → replays what was played, without animation, as far as it went.
    await get(`document.querySelectorAll(".dot")[0].click()`); await settle();
    assert.equal(await where(), "Plan mode · The request");
    for (const expected of ["Plan mode · Approve", "Plan mode · Approve", "Five months later · The request", "Five months later · Approve", "Five months later · Approve"]) {
      assert.equal(await nextDisabled(), false);
      await press("ArrowRight"); await settle();
      assert.equal(await where(), expected);
    }
    assert.equal(await nextDisabled(), true);

    // ← goes back to the start of the turn.
    await press("ArrowLeft"); await settle();
    assert.equal(await where(), "Five months later · Approve");

    const problems = page.consoleMessages.filter((m) => ["error", "warning", "exception"].includes(m.type) && !m.text.includes("favicon.ico"));
    assert.deepEqual(problems, []);
    await page.close();
  } finally {
    await chrome.close();
    await server.close();
  }
});
