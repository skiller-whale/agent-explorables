# Sources: the spec-driven explainers

Both pages are canned. The restaurant's code is in `restaurant.js`, which both pages share.

## Plan mode

`plan-mode.html` is canned. This note says what it is based on and where it was simplified.

### The runs

Headless Claude Code runs (`claude -p`, Claude Code 2.1.289, Sonnet 5.5, plan mode), 4 October 2026, three runs per case. They were made while designing the page and aren't kept in this repo. The spec-driven explainers need no recordings (see `CLAUDE.md`), so this note is the record.

The repo the runs used is the one on the page: `v0` in `plan-mode.js` is the starting repo, and `v1` is the repo with the weekend deposits.

| Page | Run | What the runs did |
|---|---|---|
| Act 1, the request and plan | `v0`, "Charge a deposit of £10 per head on every Friday and Saturday booking." (without the sentence about members) | 3/3 noticed the supper club and raised members themselves, as an assumption or a question. |
| Act 2, the request and plan | `v1`, "Give every new customer a free month's membership when they make their first booking." | 3/3 asked nothing before the plan and granted the month before the deposit check, so a new guest's first weekend booking needs no deposit. 3/3 planned to change the Friday deposit test to use a returning guest. One run presented the deposit-free first booking as part of the design without asking about it. The other two flagged it for the user to decide. |

### Simplifications

- **Act 1's prompt** includes "Members don't have to pay it." The runs used the prompt without it, and Claude raised members itself. The page skips that exchange. Its plan is written to match the code the runs planned, not quoted from a run.
- **Act 2's plan** follows the run that didn't flag the deposit side effect, shortened. Two of the three runs did flag it. The page shows a plausible outcome, not the most common one.
- **Exploration** is shown as three `Read` calls. The runs sent an Explore subagent to read the repo first.
- **Approval** is a single "Yes, start building". Headless runs can't show the plan-approval prompt, so its wording is not from a run.
- **The code after each build** (`v1`, `v2` in `restaurant.js`) was written by hand to match the plans. The tests pass (5, then 9), as the page says. It is not Claude's output.

## OpenSpec

`openspec.html` takes the plan-mode page's two prompts through `/opsx:explore`, `/opsx:propose`, `/opsx:apply` and `/opsx:archive`.

### The runs

Headless Claude Code runs (`claude -p`, Sonnet 5.5, auto mode, OpenSpec's default profile), 4 October 2026, three runs. They started from `v0` with `openspec init` and ran both acts as one chain: Act 1 in one session, then Act 2 in a fresh session in the same repo. Each stage got the bare command, and explore got the plan-mode prompt word for word.

| Page | What the runs did |
|---|---|
| Act 1, explore | 3/3 read the code and asked one blocking question, whether the waiver covers the member's whole party or only the member. 3/3 recommended the whole party. None asked why members are exempt. |
| Act 1, propose | A bare `/opsx:propose` with explore's question unanswered stopped and asked it again (3/3). Once it was answered, propose wrote the four files, with three requirements (the deposit, members exempt, a failed charge) and 7–10 scenarios. |
| Act 1, apply | Tasks ticked as they were done. Tests passed. |
| Act 1 and 2, archive | 6/6 archives stopped to ask before syncing the change's spec into the main specs. |
| Act 2, explore | 3/3 read the `booking-deposit` spec and made "does the free month cover the first booking?" the blocking question. 3/3 recommended that the first booking still pays, because the deposit spec then stays correct as written. |
| Act 2, propose, apply, archive | 3/3 added a new membership spec and left the deposit spec unchanged. Tests passed. |

### Simplifications

- **The answers.** The runs answered explore's question with "Go with your recommendations." on the propose command. The page has the developer answer "A." and "B." in the conversation, then send a bare `/opsx:propose`. Claude's replies to "A." and "B." are written for the page.
- **Claude's words are shortened.** The real explore replies also sketched the booking flow and listed smaller open questions. The page keeps only the blocking question, worded as close to the runs as space allows.
- **The OpenSpec files are simplified** so they read at a glance. They keep the real structure (proposal Why/What Changes/Capabilities, spec requirements with SHALL and scenarios, design decisions, numbered tasks) with fewer requirements and scenarios than the runs wrote. The runs' specs also had a "failed charge" requirement, left out here.
- **The code** is the same hand-written `v1` as the plan-mode page, and `openspecV2` grants the free month after the deposit, as the runs did. The tests pass (5, then 10). It is not Claude's output.
- **`openspec init` also makes `openspec/config.yaml` and an empty `changes/archive/`.** The page shows only the empty `specs/` and `changes/`.
- **Archive** is shown as a `Write` of the main spec and a `mv` of the change folder. The runs did the same work in more steps.
- **Dates.** The runs were all on 4 October. The page dates the archived changes 12 May and 13 October to fit "five months later".
