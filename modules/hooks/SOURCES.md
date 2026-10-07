# Sources: the hooks explainers

## PostToolUse

`posttooluse.html` is canned. This note says what it was checked against and where it simplifies.

### The recordings

`recordings/hooks/posttooluse/` (local only, see `CLAUDE.md`): headless Claude Code runs (`claude -p`, Claude Code 2.1.292, Sonnet 5), 7 October 2026, made with `tools/record/hooks-posttooluse.sh`. The fixture is a small JavaScript project with `fetchUser` and `getJson` in `api.js`, ESLint 9, and one hook: `PostToolUse`, matcher `Edit|Write`, command `npx eslint . >&2 || exit 2`. The prompt is the page's, "Add a retry to fetchUser in api.js." Three runs per case.

| Case | What the runs did |
|---|---|
| `natural`: `api.js` lints clean | 3/3: Glob, Read, one Edit adding a retry loop, then the reply. The hook ran once, after the Edit, and passed. No run left an unused variable. |
| `seeded`: `getJson` already has an unused `const started = Date.now();` | 3/3: Glob, Read, Edit; the hook exited 2; the model deleted the unused line with a second Edit; the hook exited 0; the reply mentioned the extra change. |

What they show about the mechanism, which the page follows:

- `PostToolUse` runs after the tool, so the first edit is already on disk when the hook fails. Exit 2 doesn't undo it.
- On exit 2 the model gets the hook's `stderr` (not `stdout`) as a system message after the tool's result, which itself still says the edit succeeded. It reads `PostToolUse:Edit hook blocking error from command: "<command>": [<command>]: <stderr>`.
- On exit 0 nothing reaches the model at all.
- The hook's `stdin` has `hook_event_name`, `tool_name`, `tool_input` (`file_path`, `old_string`, `new_string`, `replace_all`), `tool_response`, `session_id`, `cwd` and a few more.
- No `PreToolUse`, `UserPromptSubmit` or `Stop` hook is configured, so the harness finds none at each of those points.

### Simplifications

- **The unused variable.** On the page the model's own edit leaves `res` unused. In the runs the model never did that; the error only appeared when it was already in the file (`seeded`). The mechanism from the hook onwards is the same, and the page's version is easier to follow.
- **Exploration.** The runs Glob and Read before editing. The page goes straight to the Edit.
- **The hook error line** in the conversation is shortened from the text the model receives (above) to `PostToolUse:Edit hook blocking error: <the lint error>`. How Claude Code's interactive screen shows it can't be recorded headlessly, so that line's look is invented.
- **ESLint's output** is one line (`api.js 14:11 'res' is assigned a value but never used no-unused-vars`). Real output names the file with its full path on a line of its own, then the problem, then a count.
- **`stdin`** shows three of its keys, with `tool_input`'s contents left out.
- **The code** in the diffs was written for the page, not taken from a run.
- **The harness** is drawn as a loop of nine states. The real one does more (permissions, compaction, other hook events); the page shows the states and events this scenario passes through.

## Blocking edits (PreToolUse)

`pretooluse.html` is canned, from the example on the hooks module's "Blocking a Tool Call" slide: a `PreToolUse` hook on `Edit|Write` that runs a script, which blocks any edit to `.env`.

### What it's checked against

No new runs. The read-guard recordings (`recordings/hooks/read-guard/`, local only: Claude Code 2.1.278, Sonnet 5, 21 Sep 2026, three runs per case) record a `PreToolUse` command hook that reads the tool call from `stdin` and exits 2. The page follows what they show:

- The hook's `stdin` carries `hook_event_name`, `tool_name` and `tool_input` (with `file_path`), among other keys.
- On exit 2 the tool doesn't run, and the model gets an errored tool result in its place, reading `PreToolUse:<Tool> hook error: [<command>]: <stderr>`.
- The model reads the reason back to the user, names the hook, and leaves changing it to the user. It didn't try another way round in any run.

### Simplifications

- **The tool.** The recordings block `Read`; the page blocks `Edit`. The hook mechanism is the same for any tool its matcher covers.
- **The script** is shortened from the slide's (`jq` reads `stdin` directly; no comments). The registry and the note show the command as `.claude/hooks/protect.sh`; the slide's version uses `$CLAUDE_PROJECT_DIR`, which is more robust.
- **`stdin`** shows `tool_name` and `tool_input` only.
- **The hook error line** in the conversation leaves out the bracketed command.
- **The model's replies** were written for the page.

## Prompt hooks

`prompt-hook.html` is canned, from the example on the hooks module's "Hook Actions" slide: a `PreToolUse` prompt hook on `Bash` that denies commands which could lose work, with `continueOnBlock`.

### The runs

Three headless runs (`claude -p`, Claude Code 2.1.292, Sonnet 5), 7 October 2026, in a git repo where `checkout.py` had an uncommitted change, with the slide's hook word for word and the page's prompt ("Put checkout.py back to how it was in the last commit."). Not kept in this repo; this note is the record.

- 3/3: the agent's first command discarded the change (`git checkout -- checkout.py` twice, `git restore checkout.py` once), and the hook denied it.
- The denial reaches the agent as an errored tool result: `PreToolUse:Bash hook error: [<the prompt>]: <the hook model's reason>`. The reasons named the command and said it would discard uncommitted changes.
- After the denial, the agent carried on each time (`continueOnBlock`). Once it tried `git stash push -- checkout.py`, which the hook also denied ("could lose uncommitted work"), and then asked the user to confirm. Twice it read the committed file with `git show HEAD:checkout.py` and rewrote `checkout.py` with its file tools, which a hook matching only `Bash` doesn't see.

### Simplifications

- **The ending.** On the page the agent stashes the change and the hook allows it. That wasn't seen in the runs (see above). Kay chose to keep it (7 Oct 2026): it shows an allowed command, and prompt hooks' answers vary.
- **The hook model's reasoning** ("thinking") and its JSON answers were written for the page. The runs record only the reason.
- **The hook error line** in the conversation leaves out the bracketed prompt.
- **`$ARGUMENTS`** shows `tool_name` and `tool_input` only.
- **The registry** shows the action as `prompt`, and the settings note abbreviates the prompt.
- **The first step's state.** The page starts at Waiting for a prompt, with the registry already loaded.
