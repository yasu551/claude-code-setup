# /init — Bootstrap from team profile

Initialize this repository with your team's Claude Code configuration profile.

## Arguments

- `$ARGUMENTS` — Profile URL (e.g., `github.com/myorg/team-claude-profile`). If omitted, prompts interactively.
- `--force` — Rebuild mode. Overwrite existing lockfile and re-initialize.

## Behavior

1. Check if `.claude-team-lock.json` already exists. If so, refuse unless `--force` is passed.
2. Detect repo type from project files (package.json, pyproject.toml, go.mod, Cargo.toml, Gemfile).
3. Prompt user for profile URL if not provided via arguments.
4. Fetch the profile via GitHub API.
5. Validate `profile.json` schema.
6. Apply base config + detected overlay:
   - Insert managed sections into CLAUDE.md
   - Deep merge .mcp.json
   - Deep merge .claude/settings.json (including hooks)
7. Write `.claude-team-lock.json` with profile version and checksums.
8. Add `.claude-team-cache/` to `.gitignore` if not present.
9. Report what was applied.

On any error, roll back all changes to pre-init state.
