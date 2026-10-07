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
