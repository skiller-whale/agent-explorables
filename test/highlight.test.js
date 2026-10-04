import { test } from "node:test";
import assert from "node:assert/strict";
import { blockLines, changedLines, highlightMarkdown, highlightPython, markdownBlockLines } from "../modules/specs-and-plans/highlight.js";

test("highlights Python keywords, defined names, strings, numbers and comments", () => {
  assert.equal(
    highlightPython('def book(guest, start):  # first'),
    '<span class="t-k">def</span> <span class="t-fn">book</span>(guest, start):  <span class="t-c"># first</span>',
  );
  assert.equal(highlightPython('x = "a<b" + 10'), 'x = <span class="t-s">"a&lt;b"</span> + <span class="t-n">10</span>');
  assert.equal(highlightPython("@dataclass"), '<span class="t-d">@dataclass</span>');
});

test("highlights Markdown headings and inline code", () => {
  assert.equal(highlightMarkdown("# Bookings"), '<span class="t-h"># Bookings</span>');
  assert.equal(highlightMarkdown("run `pytest` now"), 'run <span class="t-s">`pytest`</span> now');
});

test("finds the lines an edit added or changed", () => {
  assert.deepEqual([...changedLines("a\nb\nc", "a\nx\nb\nc\nd")], [1, 4]);
  assert.deepEqual([...changedLines("a\nb", "a\nb")], []);
  assert.deepEqual([...changedLines("a\nb", "a\n\nx\n\nb")], [2]);
});

test("finds a top-level block by its first line, without trailing blank lines", () => {
  const text = "x = 1\n\ndef f():\n    a\n\n    b\n\n\ndef g():\n    c";
  assert.deepEqual([...blockLines(text, "def f")], [2, 3, 4, 5]);
  assert.deepEqual([...blockLines(text, "def g")], [8, 9]);
  assert.deepEqual([...blockLines(text, "def h")], []);
});

test("finds a Markdown block: a heading up to the next heading as high, or a single line", () => {
  const text = "## A\n### R1\nx\n#### S\ny\n\n### R2\nz\n## B";
  assert.deepEqual([...markdownBlockLines(text, "### R1")], [1, 2, 3, 4]);
  assert.deepEqual([...markdownBlockLines(text, "## A")], [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual([...markdownBlockLines(text, "z")], [7]);
});
