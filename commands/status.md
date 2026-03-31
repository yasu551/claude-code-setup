# /status — Drift report

Show the current state of this repository's Claude Code configuration relative to the team profile.

## Behavior

1. Read `.claude-team-lock.json`. If missing, report "No profile configured. Run /init first."
2. Check cached version info (`.claude-team-cache/version-check.json`, 1-hour TTL).
3. Report:
   - Profile URL and current version
   - Last sync date
   - Whether a newer version is available
   - Per-file drift detection (managed sections modified, JSON keys changed, hooks altered)
4. Suggest `/sync` if behind or drift detected.
