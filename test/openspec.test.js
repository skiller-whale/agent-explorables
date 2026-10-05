// Drive the OpenSpec explainer in headless Chrome the way a coach would, and check what it shows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../tools/serve.mjs";
import { launchChrome } from "../tools/cdp.mjs";

const PAGE = "modules/specs-and-plans/openspec.html";
const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

test("OpenSpec explainer: both acts play through the five stages, the tours show each file, → replays", async () => {
  const server = await startServer({ port: 8411 });
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
    const highlighted = () => get(`[...document.querySelectorAll("#viewer .line.hl")].map(l => l.textContent).join("\\n")`);
    const calloutText = () => get(`document.querySelector("#callout").hidden ? "" : document.querySelector("#callout").textContent`);
    const treeText = () => get(`document.querySelector("#tree").textContent`);
    const stages = () => get(`[...document.querySelectorAll("#stages .stage")].map(s => s.className.replace("stage ", "")).join(" ")`);
    const settle = async () => { await sleep(50); for (let i = 0; i < 300 && (await get(`document.body.dataset.phase`)) === "responding"; i++) await sleep(50); };

    assert.equal(await get(`document.title`), "Spec-Driven Development explainer: OpenSpec");
    assert.equal(await where(), "OpenSpec · Explore");
    assert.match(await calloutText(), /same request as before/);
    assert.match(await treeText(), /openspec\/changes\/specs\//);

    /** @type {[string, string, RegExp?][]} turn title, file in the viewer, callout */
    const act1 = [
      ["Answer", "bookings.py"],
      ["Propose", "bookings.py"],
      ["proposal.md", "openspec/changes/add-weekend-deposit/proposal.md", /proposal/],
      ["spec.md", "openspec/changes/add-weekend-deposit/specs/booking-deposit/spec.md", /spec/],
      ["design.md", "openspec/changes/add-weekend-deposit/design.md", /design/],
      ["tasks.md", "openspec/changes/add-weekend-deposit/tasks.md", /tasks/],
      ["Tasks done", "openspec/changes/add-weekend-deposit/tasks.md", /ticks off/],
      ["bookings.py", "bookings.py", /do what the spec says/],
      ["Sync", "bookings.py", /Archiving does two things.*syncs.*archives/s],
    ];
    assert.equal(await stages(), "todo todo todo todo todo");
    /** @type {Record<string, string>} the tracker once each turn is reached */
    const tracker = { Answer: "now todo todo todo todo", "proposal.md": "done now todo todo todo", "Tasks done": "done done now todo todo", Sync: "done done done now todo" };
    for (const [title, file, callout] of act1) {
      await press("1"); await settle();
      if (tracker[title]) assert.equal(await stages(), tracker[title], title);
      assert.equal(await where(), `OpenSpec · ${title}`);
      assert.equal(await viewing(), file);
      if (callout) assert.match(await calloutText(), callout);
      if (title === "Tasks done") assert.match(await highlighted(), /^- \[x\] 1\.1/);
    }

    // Sync: the change moves to the archive, the main spec appears, and the act ends.
    await press("1"); await settle();
    assert.equal(await viewing(), "openspec/specs/booking-deposit/spec.md");
    assert.equal(await calloutText(), "");
    assert.match(await treeText(), /archive\/2026-05-12-add-weekend-deposit\//);
    assert.equal(await stages(), "done done done done done");
    assert.doesNotMatch(await treeText(), /proposal\.md/, "archived changes are listed without their contents");
    assert.match(await get(`document.querySelector("#input .opt").textContent`), /Continue.*Five months later/);

    // Act 2: Claude reads the main spec, and the line it relies on is highlighted.
    await press("1"); await settle();
    assert.equal(await where(), "Five months later · Explore");
    assert.equal(await calloutText(), "Five months later, a new requirement has come in.");
    assert.equal(await stages(), "todo todo todo todo todo");
    await press("1"); await settle();
    assert.equal(await where(), "Five months later · The spec");
    assert.match(await highlighted(), /^The system SHALL NOT charge a deposit/);
    for (const title of ["Answer", "Propose", "Apply", "Archive", "Sync"]) {
      await press("1"); await settle();
      assert.equal(await where(), `Five months later · ${title}`);
    }
    await press("1"); await settle();
    assert.match(await treeText(), /welcome-membership\/spec\.md/);
    assert.match(await treeText(), /2026-10-13-add-welcome-membership\//);
    assert.match(await get(`document.querySelector("#input .opt").textContent`), /Restart/);

    // Going back to the start, → replays the whole path without the coach clicking.
    await get(`document.querySelectorAll(".dot")[0].click()`); await settle();
    for (let i = 0; i < 18; i++) { await press("ArrowRight"); await settle(); }
    assert.equal(await where(), "Five months later · Sync");
    assert.equal(await get(`document.querySelector("#next").disabled`), true);

    // The hash records the place: refresh comes back to it, links work, and back/forward move between places.
    assert.equal(await get(`location.hash`), "#17-end");
    assert.match(await get(`document.querySelector("#input .opt").textContent`), /Restart/);
    await get(`location.reload()`); await sleep(500); await settle();
    assert.equal(await where(), "Five months later · Sync");
    assert.match(await get(`document.querySelector("#input .opt").textContent`), /Restart/);
    await get(`location.hash = "#5"`); await sleep(100); await settle();
    assert.equal(await where(), "OpenSpec · spec.md");
    assert.equal(await viewing(), "openspec/changes/add-weekend-deposit/specs/booking-deposit/spec.md");
    await get(`location.hash = "#10-end"`); await sleep(100); await settle();
    assert.match(await get(`document.querySelector("#input .opt").textContent`), /Continue/);
    await get(`history.back()`); await sleep(200); await settle();
    assert.equal(await where(), "OpenSpec · spec.md");
    await get(`history.forward()`); await sleep(200); await settle();
    assert.equal(await get(`location.hash`), "#10-end");
    await get(`location.hash = "#99"`); await sleep(100); await settle();
    assert.match(await where(), /OpenSpec · Explore · that link isn't a step here/);
    await get(`document.querySelector("#input .opt").click()`); await settle();
    assert.equal(await where(), "OpenSpec · Answer");

    const problems = page.consoleMessages.filter((m) => ["error", "warning", "exception"].includes(m.type) && !m.text.includes("favicon.ico"));
    assert.deepEqual(problems, []);
    await page.close();
  } finally {
    await chrome.close();
    await server.close();
  }
});
