# /detach — Remove profile from repo

Detach this repository from the team profile. Removes managed section markers and team hooks, but preserves all content.

## Behavior

1. Remove managed section markers from CLAUDE.md (leave content between markers as-is, just strip the marker comments).
2. Leave .mcp.json and settings.json as-is (merged state becomes the new baseline).
3. Remove team-owned hooks (identified by matcher+command pairs tracked in lockfile).
4. Delete `.claude-team-lock.json` and `.claude-team-cache/`.
5. Report what was removed.
