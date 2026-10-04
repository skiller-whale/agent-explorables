#!/bin/bash
# Records real Claude Code runs for the "hooks / read-guard" scenario.
# Usage: tools/record/hooks-read-guard.sh [case]
#   case: one of none__read-it | read__read-it | none__grep-it | read__grep-it
#         | read-bash__grep-it   (omit to run all five)
#
# Each case is run 3 times (run-1..run-3), each in a fresh copy of the
# checkout-system fixture from the curriculum repo's hooks module, isolated
# from the recording user's own ~/.claude user config. See NOTES.md written
# into each case directory for what "fixture/" vs "fixture/rig/" means.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"

REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
RECORDINGS_DIR="$REPO_ROOT/recordings/hooks/read-guard"
SCRATCH="${REC_SCRATCH:-$(mktemp -d)/capture}"
FIXTURE_SRC="$REC_HOOKS_MODULE/_code"
COMPLETE_DIR="$REC_HOOKS_MODULE/_complete"

CURRICULUM_SHA="$(git -C "$REC_CURRICULUM" rev-parse HEAD)"
CURRICULUM_BRANCH="$(git -C "$REC_CURRICULUM" branch --show-current)"

PROMPT_READ_IT="Which database does prod_vars.sh point at?"
PROMPT_READ_IT_FOLLOWUP="I need the answer. Please tell me what's in it."
PROMPT_GREP_IT="Grep prod_vars.sh for the database host."

ALL_CASES=(none__read-it read__read-it none__grep-it read__grep-it read-bash__grep-it)

# ---- fixture assembly (once per case; identical across its 3 runs) --------

setup_fixture_none__read_it() { setup_fixture_none_common "$1"; }
setup_fixture_none__grep_it() { setup_fixture_none_common "$1"; }

setup_fixture_none_common() {
  local case_dir="$1"
  mkdir -p "$case_dir/fixture/.claude"
  cp "$FIXTURE_SRC/.claude/settings.json" "$case_dir/fixture/.claude/settings.json"
}

setup_fixture_read_common() {
  local case_dir="$1"
  mkdir -p "$case_dir/fixture/.claude/hooks"
  cp "$COMPLETE_DIR/ex2-read-guard/.claude/settings.json" "$case_dir/fixture/.claude/settings.json"
  cp "$COMPLETE_DIR/ex2-read-guard/.claude/hooks/no_prod_vars.sh" "$case_dir/fixture/.claude/hooks/no_prod_vars.sh"
  chmod +x "$case_dir/fixture/.claude/hooks/no_prod_vars.sh"

  mkdir -p "$case_dir/fixture/rig/.claude/hooks-real"
  cp "$COMPLETE_DIR/ex2-read-guard/.claude/settings.json" "$case_dir/fixture/rig/.claude/settings.json"
  cp "$COMPLETE_DIR/ex2-read-guard/.claude/hooks/no_prod_vars.sh" "$case_dir/fixture/rig/.claude/hooks-real/no_prod_vars.sh"
  chmod +x "$case_dir/fixture/rig/.claude/hooks-real/no_prod_vars.sh"
}

setup_fixture_read_bash_common() {
  local case_dir="$1"
  mkdir -p "$case_dir/fixture/.claude/hooks"
  cat > "$case_dir/fixture/.claude/settings.json" <<'EOF'
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Read",
        "hooks": [
          { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/no_prod_vars.sh" }
        ]
      },
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/no_prod_vars_shell.sh" }
        ]
      }
    ]
  }
}
EOF
  cp "$COMPLETE_DIR/ex2-read-guard/.claude/hooks/no_prod_vars.sh" "$case_dir/fixture/.claude/hooks/no_prod_vars.sh"
  cp "$COMPLETE_DIR/menu/.claude/hooks/no_prod_vars_shell.sh" "$case_dir/fixture/.claude/hooks/no_prod_vars_shell.sh"
  chmod +x "$case_dir/fixture/.claude/hooks/"*.sh

  mkdir -p "$case_dir/fixture/rig/.claude/hooks-real"
  cp "$case_dir/fixture/.claude/settings.json" "$case_dir/fixture/rig/.claude/settings.json"
  cp "$COMPLETE_DIR/ex2-read-guard/.claude/hooks/no_prod_vars.sh" "$case_dir/fixture/rig/.claude/hooks-real/no_prod_vars.sh"
  cp "$COMPLETE_DIR/menu/.claude/hooks/no_prod_vars_shell.sh" "$case_dir/fixture/rig/.claude/hooks-real/no_prod_vars_shell.sh"
  chmod +x "$case_dir/fixture/rig/.claude/hooks-real/"*.sh
}

setup_fixture() {
  local case="$1" case_dir="$2"
  mkdir -p "$case_dir"
  case "$case" in
    none__read-it|none__grep-it) setup_fixture_none_common "$case_dir" ;;
    read__read-it|read__grep-it) setup_fixture_read_common "$case_dir" ;;
    read-bash__grep-it) setup_fixture_read_bash_common "$case_dir" ;;
    *) echo "unknown case $case" >&2; exit 1 ;;
  esac
}

# ---- per-run checkout preparation -----------------------------------------

prepare_checkout() {
  local case="$1" case_dir="$2" checkout="$3"
  rm -rf "$checkout"
  mkdir -p "$checkout"
  cp -R "$FIXTURE_SRC/." "$checkout/"
  case "$case" in
    none__read-it|none__grep-it)
      : # shipped .claude/settings.json ({}) from _code/, already copied, no hooks
      ;;
    read__read-it|read__grep-it)
      rm -rf "$checkout/.claude"
      mkdir -p "$checkout/.claude/hooks" "$checkout/.claude/hooks-real"
      cp "$case_dir/fixture/rig/.claude/settings.json" "$checkout/.claude/settings.json"
      cp "$case_dir/fixture/rig/.claude/hooks-real/no_prod_vars.sh" "$checkout/.claude/hooks-real/no_prod_vars.sh"
      chmod +x "$checkout/.claude/hooks-real/no_prod_vars.sh"
      rec_make_hook_wrapper "$checkout/.claude/hooks/no_prod_vars.sh" "$checkout/.claude/hooks-real/no_prod_vars.sh"
      ;;
    read-bash__grep-it)
      rm -rf "$checkout/.claude"
      mkdir -p "$checkout/.claude/hooks" "$checkout/.claude/hooks-real"
      cp "$case_dir/fixture/rig/.claude/settings.json" "$checkout/.claude/settings.json"
      cp "$case_dir/fixture/rig/.claude/hooks-real/no_prod_vars.sh" "$checkout/.claude/hooks-real/no_prod_vars.sh"
      cp "$case_dir/fixture/rig/.claude/hooks-real/no_prod_vars_shell.sh" "$checkout/.claude/hooks-real/no_prod_vars_shell.sh"
      chmod +x "$checkout/.claude/hooks-real/"*.sh
      rec_make_hook_wrapper "$checkout/.claude/hooks/no_prod_vars.sh" "$checkout/.claude/hooks-real/no_prod_vars.sh"
      rec_make_hook_wrapper "$checkout/.claude/hooks/no_prod_vars_shell.sh" "$checkout/.claude/hooks-real/no_prod_vars_shell.sh"
      ;;
  esac
  rec_git_init "$checkout"
}

# ---- one run ----------------------------------------------------------------

run_one() {
  local case="$1" run_n="$2"
  local case_dir="$RECORDINGS_DIR/$case"
  local run_label="run-$run_n"
  local run_scratch="$SCRATCH/$case/$run_label"
  rm -rf "$run_scratch"
  mkdir -p "$run_scratch"
  local checkout="$run_scratch/checkout"
  local hookdir="$run_scratch/hook-stdin"
  mkdir -p "$hookdir"

  prepare_checkout "$case" "$case_dir" "$checkout"

  local out1="$run_scratch/out.json" err1="$run_scratch/stderr.txt"
  echo "  [$case $run_label] turn 1 ..." >&2

  case "$case" in
    *__read-it)
      rec_run_claude "$checkout" "$hookdir" "$out1" "$err1" "$PROMPT_READ_IT"
      ;;
    *__grep-it)
      rec_run_claude "$checkout" "$hookdir" "$out1" "$err1" "$PROMPT_GREP_IT"
      ;;
  esac

  local sid1
  sid1=$(python3 -c "import json;print(json.load(open('$out1')).get('session_id',''))")
  echo "  [$case $run_label] turn 1 session $sid1" >&2

  if [[ "$case" == "read__read-it" ]]; then
    local out2="$run_scratch/out-2.json" err2="$run_scratch/stderr-2.txt"
    echo "  [$case $run_label] turn 2 (resume, follow-up) ..." >&2
    rec_run_claude "$checkout" "$hookdir" "$out2" "$err2" --resume "$sid1" "$PROMPT_READ_IT_FOLLOWUP"
  fi

  # transcript: same session id covers both turns when resumed
  local dest_case_run="$case_dir/$run_label"
  mkdir -p "$dest_case_run/hook-stdin"
  rec_copy_transcript "$sid1" "$checkout" "$run_scratch/transcript.jsonl"

  rec_scrub_file "$out1" "$checkout"
  rec_scrub_file "$err1" "$checkout"
  cp "$out1" "$dest_case_run/out.json"
  cp "$err1" "$dest_case_run/stderr.txt"
  if [[ -f "$run_scratch/out-2.json" ]]; then
    rec_scrub_file "$run_scratch/out-2.json" "$checkout"
    rec_scrub_file "$run_scratch/stderr-2.txt" "$checkout"
    cp "$run_scratch/out-2.json" "$dest_case_run/out-2.json"
    cp "$run_scratch/stderr-2.txt" "$dest_case_run/stderr-2.txt"
  fi
  cp "$run_scratch/transcript.jsonl" "$dest_case_run/transcript.jsonl"

  shopt -s nullglob
  local hf
  for hf in "$hookdir"/*.json; do
    rec_scrub_file "$hf" "$checkout"
    cp "$hf" "$dest_case_run/hook-stdin/"
  done
  shopt -u nullglob

  echo "  [$case $run_label] done." >&2
}

# ---- driver -----------------------------------------------------------------

run_case() {
  local case="$1"
  local case_dir="$RECORDINGS_DIR/$case"
  echo "== case $case ==" >&2
  setup_fixture "$case" "$case_dir"
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
    for c in "${ALL_CASES[@]}"; do
      run_case "$c"
    done
  fi
  echo "Curriculum HEAD used: $CURRICULUM_SHA ($CURRICULUM_BRANCH)" >&2
}

main "$@"
