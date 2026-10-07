#!/bin/bash
# Records real Claude Code runs for the "hooks / posttooluse" scenario: a
# PostToolUse lint hook (npx eslint) on Edit|Write in a tiny JavaScript project.
# Usage: tools/record/hooks-posttooluse.sh [case]
#   case: natural | seeded   (omit to run both)
#
# The fixture is built here (no curriculum dependency). `npm install` runs once
# per case, outside the claude run, in the scratch dir; every run gets a fresh
# copy of that prepared project (node_modules included) so `npx eslint` works
# offline. node_modules never reaches recordings/.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"

REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
RECORDINGS_DIR="$REPO_ROOT/recordings/hooks/posttooluse"
SCRATCH="${REC_SCRATCH:-$(mktemp -d)/capture}"

PROMPT="Add a retry to fetchUser in api.js."
ALL_CASES=(natural seeded)

# ---- fixture (learner view, plus rig view) ---------------------------------

write_api_js() {
  local dest="$1" case="$2"
  {
    echo 'async function getJson(url) {'
    [[ "$case" == seeded ]] && echo '  const started = Date.now();'
    cat <<'EOF2'
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchUser(id) {
  const url = `https://api.example.com/users/${id}`;
  return getJson(url);
}
EOF2
  } > "$dest"
}

# Files shared by learner view and rig view (project, not .claude/).
write_project_files() {
  local dir="$1" case="$2"
  mkdir -p "$dir"
  cat > "$dir/package.json" <<'EOF2'
{
  "name": "user-client",
  "private": true,
  "type": "module",
  "devDependencies": {
    "@eslint/js": "^9.0.0",
    "eslint": "^9.0.0",
    "globals": "^15.0.0"
  }
}
EOF2
  cat > "$dir/eslint.config.js" <<'EOF2'
import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  { languageOptions: { globals: globals.node } },
];
EOF2
  printf 'node_modules\n' > "$dir/.gitignore"
  write_api_js "$dir/api.js" "$case"
}

setup_fixture() {
  local case="$1" case_dir="$2"
  rm -rf "$case_dir/fixture"
  mkdir -p "$case_dir/fixture/.claude" "$case_dir/fixture/rig/.claude/hooks-real"
  write_project_files "$case_dir/fixture" "$case"
  # What the learner's settings look like: the plain command.
  cat > "$case_dir/fixture/.claude/settings.json" <<'EOF2'
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "npx eslint . >&2 || exit 2" }
        ]
      }
    ]
  }
}
EOF2
  # What the rig really ran: settings point at the wrapper; the plain command
  # lives in hooks-real/lint.sh.
  cat > "$case_dir/fixture/rig/.claude/settings.json" <<'EOF2'
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/lint.sh" }
        ]
      }
    ]
  }
}
EOF2
  printf '#!/bin/bash\nnpx eslint . >&2 || exit 2\n' > "$case_dir/fixture/rig/.claude/hooks-real/lint.sh"
  chmod +x "$case_dir/fixture/rig/.claude/hooks-real/lint.sh"
}

# Prepared project with node_modules, built once per case in scratch.
prepare_base() {
  local case="$1" case_dir="$2"
  BASE="$SCRATCH/$case/base"
  rm -rf "$BASE"
  write_project_files "$BASE" "$case"
  echo "  [$case] npm install (once) ..." >&2
  ( cd "$BASE" && npm install --no-audit --no-fund --silent >&2 )
}

prepare_checkout() {
  local case_dir="$1" checkout="$2"
  rm -rf "$checkout"
  mkdir -p "$checkout"
  cp -R "$BASE/." "$checkout/"
  mkdir -p "$checkout/.claude/hooks" "$checkout/.claude/hooks-real"
  cp "$case_dir/fixture/rig/.claude/settings.json" "$checkout/.claude/settings.json"
  cp "$case_dir/fixture/rig/.claude/hooks-real/lint.sh" "$checkout/.claude/hooks-real/lint.sh"
  chmod +x "$checkout/.claude/hooks-real/lint.sh"
  rec_make_hook_wrapper "$checkout/.claude/hooks/lint.sh" "$checkout/.claude/hooks-real/lint.sh"
  rec_git_init "$checkout"
}

run_one() {
  local case="$1" run_n="$2"
  local case_dir="$RECORDINGS_DIR/$case"
  local run_label="run-$run_n"
  local run_scratch="$SCRATCH/$case/$run_label"
  rm -rf "$run_scratch"
  mkdir -p "$run_scratch/hook-stdin"
  local checkout="$run_scratch/checkout"
  local hookdir="$run_scratch/hook-stdin"
  prepare_checkout "$case_dir" "$checkout"

  local out1="$run_scratch/out.json" err1="$run_scratch/stderr.txt"
  echo "  [$case $run_label] running ..." >&2
  rec_run_claude "$checkout" "$hookdir" "$out1" "$err1" "$PROMPT"
  local sid
  sid=$(python3 -c "import json;print(json.load(open('$out1')).get('session_id',''))")

  local dest="$case_dir/$run_label"
  rm -rf "$dest"
  mkdir -p "$dest/hook-stdin"
  rec_copy_transcript "$sid" "$checkout" "$run_scratch/transcript.jsonl"
  rec_scrub_file "$out1" "$checkout"
  rec_scrub_file "$err1" "$checkout"
  cp "$out1" "$dest/out.json"
  cp "$err1" "$dest/stderr.txt"
  cp "$run_scratch/transcript.jsonl" "$dest/transcript.jsonl"
  # Final state of the edited file, as evidence of what the model left behind.
  cp "$checkout/api.js" "$run_scratch/api.final.js"
  rec_scrub_file "$run_scratch/api.final.js" "$checkout"
  cp "$run_scratch/api.final.js" "$dest/api.final.js"
  shopt -s nullglob
  local hf
  for hf in "$hookdir"/*.json; do
    rec_scrub_file "$hf" "$checkout"
    cp "$hf" "$dest/hook-stdin/"
  done
  shopt -u nullglob
  echo "  [$case $run_label] done." >&2
}

run_case() {
  local case="$1"
  local case_dir="$RECORDINGS_DIR/$case"
  echo "== case $case ==" >&2
  mkdir -p "$case_dir"
  setup_fixture "$case" "$case_dir"
  prepare_base "$case" "$case_dir"
  local n
  for n in 1 2 3; do
    run_one "$case" "$n"
  done
}

main() {
  mkdir -p "$RECORDINGS_DIR"
  if [[ $# -ge 1 ]]; then
    run_case "$1"
  else
    local c
    for c in "${ALL_CASES[@]}"; do run_case "$c"; done
  fi
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then main "$@"; fi
