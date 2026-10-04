import { test } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../tools/serve.mjs";

test("serves the site's index page from the repo root", async () => {
  const server = await startServer({ port: 8400 });
  try {
    const res = await fetch(server.url);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/html/);
    assert.match(await res.text(), /<title>Agent explorables<\/title>/);
  } finally {
    await server.close();
  }
});

test("refuses a path outside the repo root", async () => {
  const server = await startServer({ port: 8400 });
  try {
    const res = await fetch(new URL("/..%2f..%2fetc/passwd", server.url));
    assert.ok(res.status === 403 || res.status === 404, `got ${res.status}`);
  } finally {
    await server.close();
  }
});
