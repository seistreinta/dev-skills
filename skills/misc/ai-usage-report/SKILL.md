---
name: ai-usage-report
description: Measure what share of your commits were written with Claude Code.
disable-model-invocation: true
---

# AI Usage Report

Reads the local Claude Code transcripts in `~/.claude/projects` and the local git history, and reports what share of the user's commits were AI-assisted.

Everything runs on the machine. Nothing is uploaded, and the script reads no prompt or response text: only tool names, file paths, timestamps, and token counts. Say this when a user asks what it collects.

## Steps

### 1. Pick the scan directory

The script needs a directory holding the user's repos. Without it the denominator covers only repos Claude ran in, which overstates the percentage by ignoring work done without AI.

Default to the parent of the current git repo root. If that parent holds no other repos, ask the user where their repos live.

Done when you have a path containing at least one directory with a `.git` folder.

### 2. Run the script

```bash
node scripts/ai-usage-report.js --scan <dir>
```

Paths are relative to this skill's directory. Requires Node 18 or later, already present anywhere Claude Code runs.

Add `--since YYYY-MM-DD` to set the window, or `--author <email>` when the user's git email differs from `git config --global user.email`.

Done when the script prints a summary table and an output path.

### 3. Report back

Give the user, in this order:

1. The headline percentages: commits with AI, files with AI.
2. The per-repository breakdown.
3. The absolute path the script printed, and the two filenames (`report.csv`, `report.json`).
4. Which directory you passed to `--scan`, so they can re-run against a different one.

The reports live under the OS temp directory, which the OS reclaims on its own schedule. Tell the user to copy the files out if they want to keep them.

If the script printed a `NOTE:` about clamping the window, relay it: Claude Code deletes transcripts older than `cleanupPeriodDays` (default 30), so measuring a longer window needs `{ "cleanupPeriodDays": 365 }` in `~/.claude/settings.json` from now on. Older transcripts are already gone and cannot be recovered.

## Reading the number

Carry these into the summary when they change how the user should read the result.

**It is an upper bound.** A commit counts as AI-assisted when Claude edited one of its changed files within the previous 21 days. That window is generous, so a file touched three weeks ago still marks today's commit.

**It counts Claude Code only.** Work done in Cursor, Copilot, or by pasting from claude.ai reads as zero.

**Comparisons need matching flags.** Two runs are comparable only when both used `--scan` and the same `--since`. A run without `--scan` sits higher than one with it.

**Per-repo rates carry the signal.** A repository at 0% usually means Claude never ran there, which is worth more than the aggregate when the user is deciding where to look next.
