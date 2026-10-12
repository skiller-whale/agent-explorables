#!/bin/bash
# Records real Claude Code runs for the "subagents / fan out" scenario: a project skill that reviews the
# uncommitted changes with three subagents in parallel, one per line of review. The fixture's base/ is committed
# and change/ is laid over it uncommitted, so `git diff` shows the change. Skills are allowed (lib.sh's
# rec_run_claude disables them, so this script runs claude itself), and the whole project directory is kept,
# since Claude Code writes each subagent's transcript to its own file beside the main one.
# The fixture is microblog (github.com/miguelgrinberg/microblog, MIT): base/ is chapter 22's tree, change/ is chapter 23's
# changed files, committed on branch api. Earlier fixtures, with planted problems, are in small/ and planted/.
# Usage: REC_MODEL=<model> tools/record/subagents-fan-out.sh <case> <run-numbers...>
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"
REC_TOOLS="Skill,Bash,Read,Write,Edit,Grep,Glob,WebFetch,WebSearch,TodoWrite"
# REC_NO_AGENT=1 leaves the Agent tool out, for a run with no subagents at all
if [[ -z "${REC_NO_AGENT:-}" ]]; then REC_TOOLS="Agent,$REC_TOOLS"; fi

REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CASE="$1"; shift
CASE_DIR="$REPO_ROOT/recordings/subagents/fan-out/$CASE"
FIXTURE="$REPO_ROOT/recordings/subagents/fan-out/${REC_FIXTURE:-fixture}"
PROMPT="${REC_PROMPT:-/review-changes}"
# REC_VENV: a venv built from the fixture's requirements.txt, copied into each checkout as venv (the project ignores venv)
VENV="${REC_VENV:-}"

for n in "$@"; do
  RUN_DIR="$CASE_DIR/run-$n"
  rm -rf "$RUN_DIR"; mkdir -p "$RUN_DIR"
  SCRATCH="$(mktemp -d /tmp/subagents-rec.XXXXXX)"
  CHECKOUT="$SCRATCH/checkout"
  cp -R "$FIXTURE/base" "$CHECKOUT"
  rec_git_init "$CHECKOUT"
  git -C "$CHECKOUT" commit -q --amend -m "Initial quotes API"
  cp -R "$FIXTURE/change/." "$CHECKOUT/"
  if [[ -z "${REC_UNCOMMITTED:-}" ]]; then  # the change as a commit on a branch; REC_UNCOMMITTED=1 for the older fixtures
    git -C "$CHECKOUT" checkout -q -b api && git -C "$CHECKOUT" add -A && git -C "$CHECKOUT" commit -q -m "Add an API"
  fi
  if [[ -n "$VENV" ]]; then cp -R "$VENV" "$CHECKOUT/venv"; fi
  CHECKOUT="$(cd "$CHECKOUT" && pwd -P)"
  echo "run $n ($REC_MODEL) in $CHECKOUT"
  rec_env_unset_args
  (
    cd "$CHECKOUT"
    env "${REC_ENV_UNSET_ARGS[@]}" "$REC_CLAUDE_BIN" -p "$PROMPT" \
      --model "$REC_MODEL" --output-format json \
      --permission-mode auto --permission-prompts none \
      --tools "$REC_TOOLS" --setting-sources project --strict-mcp-config --no-chrome
  ) > "$RUN_DIR/out.json" 2> "$RUN_DIR/stderr.txt" </dev/null || echo "  claude exited $?"
  SID="$(jq -r '.session_id // empty' "$RUN_DIR/out.json")"
  SRC="$(rec_find_transcript "$SID")"
  if [[ -n "$SRC" ]]; then
    PROJ="$(dirname "$SRC")"
    cp "$SRC" "$RUN_DIR/transcript.jsonl"
    if [[ -d "$PROJ/$SID" ]]; then cp -R "$PROJ/$SID" "$RUN_DIR/session"; fi
    rm -rf "$PROJ"
  fi
  rec_scrub_dir "$RUN_DIR" "$CHECKOUT"
  jq '{cost: .total_cost_usd, turns: .num_turns, ms: .duration_ms, models: (.modelUsage // {} | keys)}' "$RUN_DIR/out.json" || true
done
