#!/bin/bash
# One-off: re-scrub already-committed recordings with scrub rules that were
# added to the rig (tools/record/lib.sh) after those recordings were first
# captured -- specifically the ~/.claude/projects key collapse and the
# scratch-directory slash-form catch-all (see lib.sh's rec_scrub_file, rules
# 11-12). Reuses that same function, so capture-time and after-the-fact
# scrubbing are the same code, not a parallel implementation.
#
# Idempotent: every rule in rec_scrub_file is safe to re-apply to text it
# has already transformed. Only touches run-level content (transcripts,
# hook-stdin captures, out/stderr files); MANIFEST.json and NOTES.md are
# hand-maintained and are not touched here.
#
# Usage: tools/record/rescrub.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"

REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
RECORDINGS_DIR="$REPO_ROOT/recordings"

# The run's original raw checkout path no longer appears in these files (it
# was already replaced with this literal at capture time), so rule 1 in
# rec_scrub_file is an inert no-op here; the value is passed only to match
# that function's signature. The rules doing the actual work on this pass
# (11-12) are structural, not tied to this value.
PLACEHOLDER_RUN_PATH="/home/learner/checkout"

count=0
while IFS= read -r -d '' f; do
  rec_scrub_file "$f" "$PLACEHOLDER_RUN_PATH"
  count=$((count + 1))
done < <(find "$RECORDINGS_DIR" -type f \( -name '*.json' -o -name '*.jsonl' -o -name '*.txt' \) -path '*/run-*/*' -print0)

echo "rescrub: scrubbed $count run-level file(s) under $RECORDINGS_DIR" >&2
