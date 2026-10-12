#!/bin/bash
# Records real Claude Code runs for the "subagents / research" scenario: a research question in a small Flask
# project, with only Claude Code's built-in subagents (no custom ones), to see whether and how the main agent
# delegates. Unlike the hooks rig, the Agent tool is allowed, and the whole project directory is kept, since
# Claude Code writes each subagent's transcript to its own file beside the main one.
# Usage: REC_MODEL=<model> tools/record/subagents-research.sh <case> <run-numbers...>
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"
# REC_NO_AGENT=1 leaves the Agent tool out, for a run with no subagents at all
REC_TOOLS="Bash,Read,Write,Edit,Grep,Glob,WebFetch,WebSearch,TodoWrite"
if [[ -z "${REC_NO_AGENT:-}" ]]; then REC_TOOLS="Agent,$REC_TOOLS"; fi

REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CASE="$1"; shift
CASE_DIR="$REPO_ROOT/recordings/subagents/research/$CASE"
FIXTURE="$REPO_ROOT/recordings/subagents/research/${REC_FIXTURE:-fixture}"
# REC_VENV: a .venv built from the fixture's requirements.txt, copied into each checkout (git-ignored there)
VENV="${REC_VENV:-}"
PROMPT="${REC_PROMPT:-Research the options for rate limiting in Flask and recommend one for this project.}"

for n in "$@"; do
  RUN_DIR="$CASE_DIR/run-$n"
  rm -rf "$RUN_DIR"; mkdir -p "$RUN_DIR"
  SCRATCH="$(mktemp -d /tmp/subagents-rec.XXXXXX)"
  CHECKOUT="$SCRATCH/checkout"
  cp -R "$FIXTURE" "$CHECKOUT"
  if [[ -n "$VENV" ]]; then cp -R "$VENV" "$CHECKOUT/.venv"; fi
  rec_git_init "$CHECKOUT"
  git -C "$CHECKOUT" commit -q --amend -m "Initial quotes API"  # lib.sh names the hooks fixture; that name misled one run
  CHECKOUT="$(cd "$CHECKOUT" && pwd -P)"
  echo "run $n ($REC_MODEL) in $CHECKOUT"
  rec_run_claude "$CHECKOUT" "$SCRATCH/hooks" "$RUN_DIR/out.json" "$RUN_DIR/stderr.txt" "$PROMPT" </dev/null || echo "  claude exited $?"
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
