---
"mattpocock-skills": patch
---

Add the `ai-usage-report` skill (misc bucket, user-invoked). It reads the local Claude Code transcripts in `~/.claude/projects` alongside local git history and reports what share of the user's commits were AI-assisted, with a per-repository breakdown. Attribution matches a commit to a session when Claude edited one of its changed files in the previous 21 days, resolving paths by repo-relative suffix so sessions run inside git worktrees still match commits in the main repo. The bundled Node script takes no dependencies, reads no prompt or response text, and writes `report.csv` and `report.json` into a timestamped folder under the OS temp directory.
