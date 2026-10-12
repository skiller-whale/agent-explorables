# Subagents explainers: sources

## Research (`research.html`)

Based on `recordings/subagents/research/local-opus-5-5/run-1` (Claude Code 2.1.295, 9 Oct 2026): Opus 5.5 asked to "Use a subagent on a cheaper model to research how to use the installed Flask-Limiter in this project. Don't use the web, just read its source in .venv.", in `fixture-local/` with a real `.venv`. All 3 runs of that prompt called the built-in `Explore` subagent with `model: "haiku"` and read the source with Bash (see the recordings' `NOTES.md`).

Real, from the run: the Agent call's `subagent_type: Explore`, `model: haiku` and prompt; the Explore subagent's 13 Bash calls, in order and batches; the files it read (the METADATA and `_extension.py` excerpts are the installed package's own text); the context sizes (from each message's usage; Explore's final 40.1k is the run's `totalTokens`); the `Done` line's 14 tool uses, 40.1k tokens and 42s; the per-model totals and the session's $0.122 (`modelUsage`).

Simplified:
- The subagents list is shortened. It leaves out `statusline-setup`, and a `claude` entry that came from the recording machine's own setup, not a learner's. Explore's tool list leaves out tools a learner's session doesn't have (Artifact and the like).
- The developer's prompt is shortened to "Research how to use Flask-Limiter. Use a cheaper subagent. Don't use the web, read its source locally."
- The Agent call's prompt is the run's, word for word, cut off after its first lines with a count of the lines left out (in the Agent call, wrapped at 50 columns). The subagent's report is the run's `SubagentHandback` message, word for word: cut off in its conversation, in full on the right. The main agent's reply is the run's, word for word (363 words, with a code example), cut off on its own step and scrolled afterwards; its Markdown shows as the terminal shows it, bold kept, backticks and code fences dropped.
- The Bash commands are shortened, and their output isn't shown; the view shows a file the subagent was reading at that point instead.
- The `_extension.py` constructor leaves out some of its arguments.
- Opus's cost is split between its two turns by each turn's usage in the transcript: about $0.040 for the Agent call and $0.072 for the reply, of which about $0.046 is reading its context (shown when the report arrives) and $0.026 is writing the reply's 1,321 output tokens (scaled to the run's real $0.112). The reply costs more because it writes about twice as many output tokens and caches the 5.5k the report added. Haiku's $0.010 is shared out across its steps by eye. The totals are real.
- The tool lines' wording in Claude Code's display (e.g. `Explore(…)`) is from memory, not checked against the TUI.

Prices: Opus 5.5 $4/$20, Haiku 5.5 $0.10/$0.50 per million input/output tokens (list prices, as of Oct 2026).

Figures in the notes:
- "about 29k further tokens": Explore's context went from 7.1k (its first call) to 35.8k (its last call before the report), from each message's usage.
- "about 25c" without the subagent: `recordings/subagents/research/local-no-subagent-opus-5-5`, 3 runs of the same task on Opus 5.5 with the Agent tool left out, cost $0.251, $0.240 and $0.299. (An estimate from Haiku's token counts at Opus prices had said about 50c; Opus read less than Haiku did.)

## Fan out (`fan-out.html`)

Based on `recordings/subagents/fan-out/codebase-opus-5-5/run-1` (9 Oct 2026): Opus 5.5 asked to "Fan out and thoroughly review this codebase.", with no skill, in microblog (github.com/miguelgrinberg/microblog, MIT) at chapter 23, committed as one commit (`fixture-codebase/`, about 3,000 lines). Nothing planted. Rig: `tools/record/subagents-fan-out.sh` with `REC_FIXTURE=fixture-codebase REC_UNCOMMITTED=1`.

Every text on the page is generated word for word from the run by `tools/extract/fan-out-run.py` into `fan-out-run.js`. Rerun the script, don't edit its output.

Real, from the run: the prompt; the `git ls-files | xargs wc -l` call and its output; the three `general-purpose` Agent calls, made in one message, in the background, on Opus, and their prompts; each subagent's tool calls, in order; the API reviewer's `probe2.py` and its output (in `/tmp/probe_scr`, which it made itself: Claude Code gives subagents no scratch area of their own, and the models reviewer wrote to `/tmp` directly); the reports (`SubagentHandback`), the main agent's messages, its spot-check call and output, and its reply; each subagent's tool-use count and final tokens; the context sizes (from each message's usage); the session's 3m35s (the transcript's first and last timestamps) and $1.91 (`total_cost_usd`). The subagents reported after 1m45s, 1m52s and 2m41s. Summed API time was 7m02s, about twice the wall clock, because the three ran at once.

Simplified:
- The three reports come back on one step, in the order the run had them (models, API, deploy).
- On the right, the Agent call is shown as YAML-like fields, its prompt wrapped at 54 columns. The reports and the reply are shown as plain text: bold and backticks dropped, Markdown headings kept.
- In the conversations, commands are cut at 64 characters or their first line, with " …".
- The views at #4 and #5 (`config.py`, the nginx config) are files that subagent read at that point, from the fixture, not tool output.
- Costs: the main agent's per-turn costs come from usage ($0.31 in all). The subagents' $1.60 is the run's total less that, spread across the steps by eye, because their transcripts don't record all their output tokens. The first and last figures are real.
- Not checked against the real TUI: the `general-purpose(…)` tool lines, the agents list's names, and the " …" in shortened commands.

## Custom subagents (`custom.html`)

Artificial, by Kay's choice (12 Oct 2026): no run behind it. Scenario agreed with her at https://claude.ai/artifact/8GarZs7dHgXvdzXPhbEY7L (copy in `sketches/custom-subagent-scenario.html`).

Made up: Fernway, its code, the issues FIN-212 and PAY-301, the wiki page ADR-014, the payments-service grep, the prompts, the report and the reply. Context sizes, timings and costs are plausible figures, not measured ones: the main agent's starting context is close to Research's (9.9k there), and the costs are in proportion to the Research run's.

Kept true to Claude Code, from the subagent docs (code.claude.com/docs/en/sub-agents, checked 12 Oct 2026):
- A custom subagent is a markdown file in `.claude/agents/`: settings in the frontmatter, the system prompt in the body. The main agent decides to delegate from the `description`, and calls it with `subagent_type: <name>`.
- `mcpServers` entries defined inline are connected when the subagent starts and disconnected when it finishes, so the main agent never gets their tools. Entries given by name share the main session's connection instead, so the main agent would have them too.
- When `tools` is set, MCP tools are only available if listed (`mcp__<server>` grants a whole server). The docs don't say whether inline servers' tools are exempt; listing them is safe either way.

Not checked against the real TUI: how MCP tool calls are shown (`tracker - search_issues (MCP)(…)` is a guess), and `Search(…)` for Grep.

Prices: Opus 5.5 $4/$20, Sonnet 5.5 $2/$10 per million input/output tokens. Sonnet's price is worked out from two recorded runs' `modelUsage` (`recordings/subagents/research/sonnet-5-5/run-2`, `run-3`), with cache reads at 0.1× and one-hour cache writes at 2× the input price; both fit exactly.
