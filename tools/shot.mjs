#!/usr/bin/env node
// Screenshot a page of the site, as a coach's screenshare would show it.
//   node tools/shot.mjs <path, hash allowed> <out.png> [--size 1280x720]
//   node tools/shot.mjs "modules/hooks/#some-state" /tmp/hooks.png

import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { startServer } from "./serve.mjs";
import { launchChrome } from "./cdp.mjs";

const args = process.argv.slice(2);
const sizeAt = args.indexOf("--size");
const [width, height] = (sizeAt >= 0 ? args.splice(sizeAt, 2)[1] : "1280x720").split("x").map(Number);
const [path, out] = args;
if (!path || !out || !width || !height) {
  console.error('usage: node tools/shot.mjs <path, hash allowed> <out.png> [--size 1280x720]');
  process.exit(2);
}

const server = await startServer({ port: 8200 });
const chrome = await launchChrome({ width, height });
try {
  const page = await chrome.newPage();
  await page.goto(new URL(path, server.url).href);
  await mkdir(dirname(resolve(out)), { recursive: true });
  await page.screenshot(resolve(out));
  console.log(`${path} -> ${out} (${width}x${height})`);
} finally {
  await chrome.close();
  await server.close();
}
