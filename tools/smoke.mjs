#!/usr/bin/env node
// Load every page listed in pages.txt in headless Chrome at 1280x720 and fail on anything a
// coach would see go wrong: a console error, an uncaught exception, or a page wider than the screen.
// Extend the checks as the site grows; keep them about what the page shows, not how it is built.

import { readFile } from "node:fs/promises";
import { startServer } from "./serve.mjs";
import { launchChrome } from "./cdp.mjs";

const WIDTH = 1280;
const HEIGHT = 720;

const listed = (await readFile(new URL("../pages.txt", import.meta.url), "utf8"))
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));

const server = await startServer({ port: 8300 });
const chrome = await launchChrome({ width: WIDTH, height: HEIGHT });
let failures = 0;
try {
  for (const path of listed) {
    const page = await chrome.newPage();
    await page.goto(new URL(path, server.url).href);
    const problems = page.consoleMessages
      // Chrome asks for /favicon.ico by itself; the site has none.
      .filter((m) => ["error", "warning", "exception"].includes(m.type) && !m.text.includes("favicon.ico"))
      .map((m) => `${m.type}: ${m.text}`);
    const scrollWidth = await page.evaluate("document.documentElement.scrollWidth");
    if (scrollWidth > WIDTH) problems.push(`the page is ${scrollWidth}px wide, wider than the ${WIDTH}px screen`);
    await page.close();
    console.log(`${problems.length === 0 ? "ok  " : "FAIL"} ${path}`);
    for (const p of problems) console.log(`       ${p}`);
    failures += problems.length;
  }
} finally {
  await chrome.close();
  await server.close();
}
console.log(failures === 0 ? `${listed.length} page(s), all clean` : `${failures} problem(s)`);
process.exit(failures === 0 ? 0 : 1);
