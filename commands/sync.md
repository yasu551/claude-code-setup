# /sync — Update to latest profile

Sync this repository's Claude Code configuration to the latest version of the team profile.

## Arguments

- `--force` — Skip confirmation on managed section conflicts.

## Behavior

1. Read `.claude-team-lock.json` for current profile version and URL.
2. Fetch the latest profile from GitHub API.
3. Compare profile versions. If already up to date, report and exit.
4. Create backup of current config files.
5. Apply changes using merge ownership rules:
   - CLAUDE.md: replace content between managed section markers
   - .mcp.json / settings.json: recursive deep merge (profile keys win at leaf level)
   - hooks: replace team-owned hooks (tracked in lockfile), preserve user hooks
6. If user modified managed sections: show diff, ask to confirm (or skip with `--force`).
7. Update lockfile with new version and checksums.
8. Report what changed.

On error, roll back to pre-sync backup.
