// Minimal syntax highlighting for the file viewer: Python and Markdown, one line at a time.
// Enough to make code read as code on a screenshare; not a parser.

const PY_KEYWORDS = new Set([
  "and", "as", "class", "def", "elif", "else", "for", "from", "if", "import", "in", "is",
  "not", "or", "pass", "return", "while", "with", "None", "True", "False",
]);

/** @param {string} s */
export function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * @param {string} cls  one of k (keyword), s (string), c (comment), n (number), fn (defined name), d (decorator), h (heading)
 * @param {string} text
 */
const span = (cls, text) => `<span class="t-${cls}">${escapeHtml(text)}</span>`;

const PY_TOKEN = /(#.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(@\w+)|(\b\d+\b)|(\b[A-Za-z_]\w*\b)|([^#"'@\w]+|.)/g;

/**
 * Highlight one line of Python.
 * @param {string} line
 * @returns {string} HTML
 */
export function highlightPython(line) {
  let out = "";
  let afterDef = false;
  for (const m of line.matchAll(PY_TOKEN)) {
    const [text, comment, str, deco, num, word] = m;
    if (comment) out += span("c", text);
    else if (str) out += span("s", text);
    else if (deco) out += span("d", text);
    else if (num) out += span("n", text);
    else if (word) {
      if (afterDef) out += span("fn", text);
      else if (PY_KEYWORDS.has(word)) out += span("k", text);
      else out += escapeHtml(text);
      afterDef = word === "def" || word === "class";
      continue;
    } else out += escapeHtml(text);
    if (text.trim()) afterDef = false;
  }
  return out;
}

/**
 * Highlight one line of Markdown: headings and inline code.
 * @param {string} line
 * @returns {string} HTML
 */
export function highlightMarkdown(line) {
  if (/^#{1,6}\s/.test(line)) return span("h", line);
  return line
    .split(/(`[^`]+`)/)
    .map((part) => (part.startsWith("`") && part.endsWith("`") && part.length > 1 ? span("s", part) : escapeHtml(part)))
    .join("");
}

/**
 * Highlight a file's lines by its extension.
 * @param {string} path
 * @param {string} text
 * @returns {string[]} one HTML string per line
 */
export function highlightFile(path, text) {
  const lines = text.split("\n");
  if (path.endsWith(".py")) return lines.map(highlightPython);
  if (path.endsWith(".md")) return lines.map(highlightMarkdown);
  return lines.map(escapeHtml);
}

/**
 * The 0-based indexes of lines in `after` that are not in `before` (a line diff by longest common subsequence).
 * @param {string} before
 * @param {string} after
 * @returns {Set<number>}
 */
export function changedLines(before, after) {
  const a = before.split("\n");
  const b = after.split("\n");
  /** @type {number[][]} */
  const lcs = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const changed = new Set();
  let i = 0;
  let j = 0;
  while (j < b.length) {
    if (i < a.length && a[i] === b[j]) { i++; j++; }
    else if (i < a.length && lcs[i + 1][j] >= lcs[i][j + 1]) i++;
    else { changed.add(j); j++; }
  }
  // Blank lines at the edge of a change are layout, not part of it.
  for (const k of [...changed]) if (b[k] === "" && !(changed.has(k - 1) && changed.has(k + 1) && b[k - 1] !== "" && b[k + 1] !== "")) changed.delete(k);
  return changed;
}

/**
 * The 0-based indexes of the block that starts at the first line beginning with `marker`:
 * that line and every following line up to the next top-level line.
 * @param {string} text
 * @param {string} marker
 * @returns {Set<number>}
 */
export function blockLines(text, marker) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.startsWith(marker));
  const block = new Set();
  if (start < 0) return block;
  block.add(start);
  for (let k = start + 1; k < lines.length; k++) {
    if (lines[k] !== "" && !/^\s/.test(lines[k])) break;
    block.add(k);
  }
  // Trailing blank lines are not part of the block.
  for (let k = Math.max(...block); k > start && lines[k] === ""; k--) block.delete(k);
  return block;
}

/**
 * The 0-based indexes of the Markdown block that starts at the first line beginning with `marker`.
 * A heading takes everything up to the next heading of the same or a higher level; any other line is just itself.
 * @param {string} text
 * @param {string} marker
 * @returns {Set<number>}
 */
export function markdownBlockLines(text, marker) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.startsWith(marker));
  const block = new Set();
  if (start < 0) return block;
  block.add(start);
  const level = (/^(#+)\s/.exec(lines[start]) ?? [])[1]?.length;
  if (!level) return block;
  for (let k = start + 1; k < lines.length; k++) {
    const h = (/^(#+)\s/.exec(lines[k]) ?? [])[1]?.length;
    if (h && h <= level) break;
    block.add(k);
  }
  for (let k = Math.max(...block); k > start && lines[k] === ""; k--) block.delete(k);
  return block;
}
