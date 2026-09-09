## What it does

`ai-usage-report` reads the Claude Code transcripts in `~/.claude/projects` alongside your local git history and reports what share of your commits were AI-assisted, broken down per repository.

It never claims to have watched you work. A commit counts as AI-assisted when Claude edited one of its changed files at any point in the previous 21 days, which means the number it prints is an **upper bound** rather than a measurement. That window is deliberately generous, and everything else on this page follows from it.

Everything runs on your machine. Nothing is uploaded, and the script reads no prompt or response text: only tool names, file paths, timestamps, and token counts.

## When to reach for it

You invoke this by typing `/ai-usage-report`, and the agent won't reach for it on its own.

Reach for it when someone has asked how much of your work is AI-assisted and you would rather answer with a number than a guess: a retro, a team rollout you want to show moved, a personal check on whether a tool you installed three months ago actually changed anything. It measures work that already happened, so it sits outside every build flow here and answers to nothing downstream.

It is the wrong tool for measuring cost or token spend. The transcripts carry token counts, but the report is about authorship share, not billing.

## Prerequisites

**Transcript retention has to have been set in advance.** Claude Code deletes transcripts older than `cleanupPeriodDays`, which defaults to 30. A window longer than that needs `{ "cleanupPeriodDays": 365 }` in `~/.claude/settings.json` from now on, and transcripts already past the cutoff are gone rather than hidden. If you expect to want a year-long number later, set it today; the script will tell you when it has clamped a window, but it cannot recover what was deleted.

A directory holding your repos, for `--scan`. Node 18 or later, which is already present anywhere Claude Code runs.

## The denominator is the whole argument

The interesting half of this skill is not the transcripts, it is what you divide by.

Left alone, the script can only see repositories Claude ran in. Every repo where you worked without AI is invisible, so it never reaches the denominator, and the percentage comes back flattering and wrong. `--scan <dir>` points at a directory of repos and pulls the untouched ones back into the count.

| Flag | What it changes |
| --- | --- |
| `--scan <dir>` | Widens the denominator to every repo under `<dir>`. Lowers the number, and makes it true. |
| `--since YYYY-MM-DD` | Sets the window. Clamped to whatever transcripts survive. |
| `--author <email>` | Use when your commit email differs from `git config --global user.email`. |

Two runs are comparable only when both used `--scan` and the same `--since`. A run without `--scan` sits higher than one with it, so a number that improved between January and March may only mean you scanned differently.

## Reading the number

Three things move the result more than your actual habits do:

- **The 21-day window.** A file Claude touched three weeks ago still marks today's commit as AI-assisted, even if you wrote today's change by hand.
- **Claude Code only.** Work done in another [harness](https://www.aihero.dev/ai-coding-dictionary/harness), or pasted in from claude.ai, reads as zero. The report undercounts AI use as readily as the 21-day window overcounts it.
- **The per-repo breakdown carries the signal.** The aggregate is one number with all of the above baked in. A repository sitting at 0% usually just means Claude never ran there, and that is the more useful fact when you are deciding where to look next.

## Common questions

**Why is my number so high?**
Almost always the 21-day attribution window, sometimes a missing `--scan`. Both inflate rather than deflate. Treat the headline as a ceiling and read the per-repo rows for anything you want to act on.

**I set `cleanupPeriodDays` and my old transcripts still aren't there.**
The setting governs deletion from the moment you set it. Anything already older than the previous limit was deleted before you changed it and cannot be recovered, so a long window only starts accumulating from the day you set the setting.

**Where did the report go?**
A timestamped folder under the OS temp directory; the script prints the absolute path plus `report.csv` and `report.json`. Temp is reclaimed on the OS's own schedule, so copy the files out if the number is going in a deck.

**Does this send my code anywhere?**
No. It runs locally, and it reads only tool names, file paths, timestamps, and token counts. Prompts and responses are never opened.

**I run sessions inside git worktrees. Do those commits match?**
Yes. Paths are resolved by repo-relative suffix, so a session run in a worktree still matches commits landing in the main repo.

## It's working if

- The script prints a summary table, a per-repository breakdown, and an absolute output path.
- Repos you know you never opened Claude in show up in the breakdown at 0%, rather than being missing.
- Adding `--scan` lowers your headline percentage.
- The agent tells you which directory it passed to `--scan`, so you can re-run against a different one.
- A `NOTE:` about a clamped window reaches you rather than being swallowed.

## Where it fits

`ai-usage-report` is a **reach-for-it-anytime standalone**, and an unusually detached one: it is the only skill here that measures your work instead of moving it forward, so nothing feeds it and nothing consumes what it produces. Its nearest neighbour in spirit is [improve-codebase-architecture](https://aihero.dev/skills-improve-codebase-architecture), because both are surveys you run in a spare moment rather than steps in a build. For the rest of the set and how the flows connect, [ask-matt](https://aihero.dev/skills-ask-matt) is the router.
