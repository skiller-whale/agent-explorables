#!/bin/bash
# Shared pieces for the recording rig: fixture copy, hook-wrapper generation,
# isolated `claude -p` invocation, transcript retrieval, and scrubbing.
#
# Nothing here writes canned content. It moves real recorded bytes around and
# substitutes fixed strings (paths/emails/usernames) per the scrub rules
# logged by the caller into MANIFEST.json. See recordings/hooks/read-guard/*
# NOTES.md for what "rig" vs "fixture" means in this scenario.
#
# Every personal value substituted below is derived at runtime from the
# environment of whoever runs the rig (this repo is public, and the rig is
# meant to be re-run by anyone, not just the original recorder) -- none of
# it is hard-coded here. See rec_scrub_file for the full rule list.
set -euo pipefail

REC_CLAUDE_BIN="${REC_CLAUDE_BIN:-$(command -v claude || true)}"
REC_MODEL="${REC_MODEL:-claude-sonnet-5}"
REC_CURRICULUM="${REC_CURRICULUM:-$HOME/Code/curriculum}"
REC_HOOKS_MODULE="$REC_CURRICULUM/teaching_content/ai/agentic_software_development/hooks"

# ---- personal values, derived, never literal -------------------------------
#
# REC_EMAIL defaults to the recording machine's git email, but the account
# email that actually leaks into a transcript's session_context attachment
# (the authenticated Claude account, not git) can differ from it -- see rule
# 2 in rec_scrub_file, which scrubs that field generically by pattern
# instead of relying on this value.
REC_HOME="$HOME"
REC_USER="$USER"
REC_USER_CAP="$(printf '%s' "${REC_USER:0:1}" | tr '[:lower:]' '[:upper:]')${REC_USER:1}"
REC_HOSTNAME="$(hostname 2>/dev/null || true)"
REC_FULLNAME="$(git config --global user.name 2>/dev/null || true)"
REC_EMAIL="${REC_EMAIL:-$(git config --global user.email 2>/dev/null || true)}"
# Comma-separated list of extra literal strings the caller wants scrubbed to
# "learner" (e.g. a nickname or an old username), none by default.
REC_EXTRA_SCRUB="${REC_EXTRA_SCRUB:-}"

# The machine's real /tmp path (on macOS this is a symlink, and resolves to
# its target) -- scrubbed the same way as the home directory, since
# recording scratch dirs live under it. Deliberately resolves the fixed
# path /tmp, not $TMPDIR (a per-session directory elsewhere that the rig's
# scratch dirs are not actually under).
REC_TMPDIR_REAL="$(cd /tmp 2>/dev/null && pwd -P || echo /tmp)"

# dash_encode <path> -- mirrors Claude Code's ~/.claude/projects key
# encoding closely enough for scrub purposes: '/' and '_' both become '-'.
rec_dash_encode() {
  local s="$1"
  s="${s//\//-}"
  s="${s//_/-}"
  printf '%s' "$s"
}

REC_HOME_DASH_PATTERN="$(rec_dash_encode "$REC_HOME")-"
REC_TMPDIR_DASH_PATTERN="$(rec_dash_encode "$REC_TMPDIR_REAL")-"

export REC_HOME REC_USER REC_USER_CAP REC_HOSTNAME REC_FULLNAME REC_EMAIL \
  REC_EXTRA_SCRUB REC_TMPDIR_REAL REC_HOME_DASH_PATTERN REC_TMPDIR_DASH_PATTERN

# The exact set of env vars that, if inherited, attach the child `claude`
# process to THIS session's own live orchestration (background-agent
# messaging socket/token) rather than starting a clean, standalone session.
# Discovered empirically 21 Sep 2026: with these set, the child session's
# transcript carried this session's own agent roster, deferred cloud tools
# (CronCreate, DesignSync, PushNotification, RemoteTrigger, ...) and an
# "Auto Mode Active" attachment identical to this session's -- none of which
# a learner's plain Claude Code session would have.
REC_STRIP_ENV_VARS=(
  CLAUDECODE CLAUDE_CODE_ENTRYPOINT CLAUDE_CODE_MESSAGING_SOCKET
  CLAUDE_CODE_MESSAGING_TOKEN CLAUDE_CODE_EXECPATH CLAUDE_CODE_SESSION_ID
  CLAUDE_CODE_CHILD_SESSION CLAUDE_CODE_SESSION_ATTENDED CLAUDE_PID
  CLAUDE_EFFORT AI_AGENT
)

# The built-in tool allow-list used for every recorded run. Deliberately
# excludes Task/Agent: including it reintroduces an `agent_listing_delta`
# system attachment describing this account's custom subagent roster
# (claude/Explore/general-purpose/Plan/statusline-setup), which a learner's
# session would not have, and none of the read-guard prompts need a subagent.
REC_TOOLS="Bash,Read,Write,Edit,Grep,Glob,WebFetch,WebSearch,TodoWrite,NotebookEdit"

# rec_git_init <dir>
# git init + one commit, with a learner-appropriate local git identity so
# gitStatus system-context attachments don't carry the recording user's own
# name.
rec_git_init() {
  local dir="$1"
  ( cd "$dir" \
    && git init -q -b main \
    && git config user.email "learner@example.com" \
    && git config user.name "learner" \
    && git add -A \
    && git commit -q -m "Initial checkout system" )
}

# rec_env_clean -- prints the `env -u ...` prefix args as a bash array via
# global REC_ENV_UNSET_ARGS, for callers to splice into an `env` invocation.
rec_env_unset_args() {
  REC_ENV_UNSET_ARGS=()
  local v
  for v in "${REC_STRIP_ENV_VARS[@]}"; do
    REC_ENV_UNSET_ARGS+=(-u "$v")
  done
}

# rec_run_claude <cwd> <hook_stdin_dir> <out_json> <stderr_txt> [--resume SESSION_ID] -- <prompt>
# Runs an isolated, headless `claude -p` turn. Writes stdout to out_json and
# stderr to stderr_txt. Prints the session id on stdout's last line via
# out_json itself (caller reads it back with jq).
rec_run_claude() {
  local cwd="$1" hookdir="$2" out_json="$3" err_txt="$4"
  shift 4
  local resume_args=()
  if [[ "${1:-}" == "--resume" ]]; then
    resume_args=(--resume "$2")
    shift 2
  fi
  local prompt="$1"
  rec_env_unset_args
  mkdir -p "$hookdir"
  (
    cd "$cwd"
    CLAUDE_HOOK_STDIN_DIR="$hookdir" \
    env "${REC_ENV_UNSET_ARGS[@]}" \
      "$REC_CLAUDE_BIN" -p "$prompt" \
      --model "$REC_MODEL" \
      --output-format json \
      --permission-mode auto \
      --permission-prompts none \
      --tools "$REC_TOOLS" \
      --setting-sources project \
      --strict-mcp-config \
      --disable-slash-commands \
      --no-chrome \
      ${resume_args[@]+"${resume_args[@]}"}
  ) > "$out_json" 2> "$err_txt"
}

# rec_find_transcript <session_id> -- prints the absolute path of the real
# session transcript jsonl under ~/.claude/projects, or nothing if not found.
rec_find_transcript() {
  local sid="$1"
  grep -rl "\"sessionId\":\"$sid\"" "$HOME/.claude/projects"/*/*.jsonl 2>/dev/null | head -1 || true
}

# rec_cleanup_project_dir <session_id> -- removes the real ~/.claude/projects
# key created for a recording run, once its transcript has been copied out.
# Keeps the recording account's real ~/.claude/projects free of test-run
# debris.
rec_cleanup_project_dir() {
  local sid="$1"
  local f
  f=$(rec_find_transcript "$sid")
  [[ -n "$f" ]] || return 0
  local d
  d=$(dirname "$f")
  rm -rf "$d"
}

# rec_scrub_file <file> <run_abs_checkout_path>
# Applies the fixed, ordered substitution rules in place. Every rule here
# must be mirrored, described generically (never with the literal value),
# in the case's MANIFEST.json scrubs[] list.
rec_scrub_file() {
  local f="$1" run_path="$2"
  [[ -s "$f" ]] || return 0
  REC_RUN_PATH="$run_path" perl -CSD -0777 -pi -e '
    my $run_path   = $ENV{REC_RUN_PATH}          // "";
    my $home       = $ENV{REC_HOME}              // "";
    my $home_dash  = $ENV{REC_HOME_DASH_PATTERN}  // "";
    my $tmp_real   = $ENV{REC_TMPDIR_REAL}        // "";
    my $tmp_dash   = $ENV{REC_TMPDIR_DASH_PATTERN}// "";
    my $hostname   = $ENV{REC_HOSTNAME}           // "";
    my $fullname   = $ENV{REC_FULLNAME}           // "";
    my $email      = $ENV{REC_EMAIL}              // "";
    my $user       = $ENV{REC_USER}               // "";
    my $user_cap   = $ENV{REC_USER_CAP}           // "";
    my $extra      = $ENV{REC_EXTRA_SCRUB}        // "";

    # 1. this run absolute checkout path -> /home/learner/checkout
    s/\Q$run_path\E/\/home\/learner\/checkout/g if length $run_path;

    # 2. the session_context userEmail field: whatever address is embedded
    #    there is replaced by pattern on the field, not by literal value --
    #    the authenticated account email that leaks in there can differ
    #    from the recording machines git email (rule 3, below).
    s/(email address is )\S+?(\.\s*Use it only)/${1}learner\@example.com${2}/g;

    # 3. the recording accounts email, wherever else it appears literally
    s/\Q$email\E/learner\@example.com/g if length $email;

    # 4. the recording users home directory, slash form
    s/\Q$home\E\b/\/home\/learner/g if length $home;

    # 5. same, dash-encoded form (project-key style paths)
    s/\Q$home_dash\E/-home-learner-/g if length $home_dash;

    # 6. this machines real temp-directory path, slash and dash-encoded
    s/\Q$tmp_real\E/\/home\/learner\/tmp/g if length $tmp_real;
    s/\Q$tmp_dash\E/-home-learner-tmp-/g if length $tmp_dash;

    # 7. this machines hostname
    s/\Q$hostname\E/learner-vm/g if length $hostname;

    # 8. the recording users full git name (safety net; should not fire,
    #    since the fixture repos local git identity is already "learner")
    s/\Q$fullname\E/learner/g if length $fullname;

    # 9. standalone username catch-all (word-boundary, case-preserving)
    s/\b\Q$user_cap\E\b/Learner/g if length $user_cap;
    s/\b\Q$user\E\b/learner/g if length $user;

    # 10. operator-supplied extra literal strings (REC_EXTRA_SCRUB, comma
    #     separated), each collapsed to "learner"
    for my $e (split /,/, $extra) {
      next unless length $e;
      s/\Q$e\E/learner/g;
    }

    # 11. the dash-encoded ~/.claude/projects key of this runs checkout
    #     directory, in whatever already-partly-scrubbed form rules 5-6
    #     above have left it in -> the shape a learners own checkout key
    #     would take (a single, unnested directory)
    s/-home-learner-tmp-[A-Za-z0-9-]*?-checkout\b/-home-learner-checkout/g;

    # 12. any other remaining reference to the scratch capture directory
    #     (slash form) that is not the checkout path itself (already
    #     handled by rule 1)
    s{/home/learner/tmp(?:/[^"\s]*)?}{/home/learner}g;
  ' "$f"
}

rec_scrub_dir() {
  local dir="$1" run_path="$2"
  local f
  while IFS= read -r -d '' f; do
    rec_scrub_file "$f" "$run_path"
  done < <(find "$dir" -type f -print0)
}

# rec_copy_transcript <session_id> <run_abs_checkout_path> <dest_file>
# Copies the real transcript (raw, unscrubbed) to dest_file, scrubs it in
# place, then removes the real ~/.claude/projects entry.
rec_copy_transcript() {
  local sid="$1" run_path="$2" dest="$3"
  local src
  src=$(rec_find_transcript "$sid")
  if [[ -z "$src" ]]; then
    echo "rec_copy_transcript: no transcript found for session $sid" >&2
    return 1
  fi
  cp "$src" "$dest"
  rec_scrub_file "$dest" "$run_path"
  rec_cleanup_project_dir "$sid"
}

# rec_make_hook_wrapper <wrapper_path> <real_script_path>
# Writes a bash wrapper that tees its stdin verbatim to
# $CLAUDE_HOOK_STDIN_DIR/<Event>-<Tool>-NNN.json (numbered per event+tool
# pair), replays the same bytes to the real hook script unmodified, mirrors
# its stdout/stderr/exit code exactly, and records
# $CLAUDE_HOOK_STDIN_DIR/<same-name>.result.json = {exit, stdout, stderr}.
# This wrapper is rig, not part of the learner's hook -- see NOTES.md.
rec_make_hook_wrapper() {
  local wrapper_path="$1" real_script="$2"
  cat > "$wrapper_path" <<WRAPEOF
#!/bin/bash
# RIG WRAPPER -- not part of the learner's hook. Records this invocation's
# stdin verbatim, replays it unmodified to the real hook script, and mirrors
# that script's stdout/stderr/exit code. See NOTES.md in this case's
# recording directory.
set -u
REAL_SCRIPT="$real_script"
DIR="\${CLAUDE_HOOK_STDIN_DIR:-.}"
mkdir -p "\$DIR"
INPUT="\$(cat)"
EVENT=\$(printf '%s' "\$INPUT" | jq -r '.hook_event_name // "Unknown"')
TOOL=\$(printf '%s' "\$INPUT" | jq -r '.tool_name // "Unknown"')
COUNTER_FILE="\$DIR/.counter-\${EVENT}-\${TOOL}"
N=\$(( \$(cat "\$COUNTER_FILE" 2>/dev/null || echo 0) + 1 ))
echo "\$N" > "\$COUNTER_FILE"
BASE=\$(printf '%s-%s-%03d' "\$EVENT" "\$TOOL" "\$N")
printf '%s' "\$INPUT" > "\$DIR/\$BASE.json"
STDOUT_FILE=\$(mktemp)
STDERR_FILE=\$(mktemp)
printf '%s' "\$INPUT" | "\$REAL_SCRIPT" > "\$STDOUT_FILE" 2> "\$STDERR_FILE"
EXIT=\$?
jq -n --argjson exit "\$EXIT" --rawfile stdout "\$STDOUT_FILE" --rawfile stderr "\$STDERR_FILE" \\
  '{exit: \$exit, stdout: \$stdout, stderr: \$stderr}' > "\$DIR/\$BASE.result.json"
cat "\$STDOUT_FILE"
cat "\$STDERR_FILE" >&2
rm -f "\$STDOUT_FILE" "\$STDERR_FILE"
exit "\$EXIT"
WRAPEOF
  chmod +x "$wrapper_path"
}
