# CLAUDE.md

## Project Overview

claude-code-setup is a Claude Code plugin that standardizes team configuration across repositories. It manages CLAUDE.md, .mcp.json, settings.json, and hooks from a shared profile repo.

## Architecture

The plugin has 4 commands (`/init`, `/sync`, `/status`, `/detach`) backed by a merge engine with three strategies:

- **Managed sections** — marker-delimited blocks in CLAUDE.md (team-owned between markers, user-owned outside)
- **Recursive deep merge** — for .mcp.json and settings.json (profile keys win at leaf level, user-only keys preserved)
- **Hook array merge** — team hooks tracked by matcher+command pair in lockfile, replaced on sync, user hooks untouched

## Source Layout

```
lib/
├── merge.ts        # Core merge engine (managed sections, deep merge, hook merge)
├── detect.ts       # Repo-type detection (JS, Python, Go, Rust, Ruby)
├── profile.ts      # Profile fetching (GitHub API with auth fallback chain)
├── lockfile.ts     # .claude-team-lock.json read/write/build
├── backup.ts       # Backup/rollback for safe applies
├── init.ts         # /init orchestrator
├── sync.ts         # /sync orchestrator
├── status.ts       # /status command + version cache
├── detach.ts       # /detach command
└── drift-check.ts  # Pre-session drift check hook
```

## Key Design Decisions

- **Profile source checksums**: lockfile checksums track the profile's intended content, not the merged output. This allows drift detection to work even when the local file has user additions.
- **Hook tagging via lockfile**: team hooks are identified by matcher+command pair stored in the lockfile (not a custom field in hooks.json), since Claude Code's parser may strip unknown fields.
- **GitHub API over git clone**: profiles are fetched via API to avoid git binary and SSH key dependencies in the plugin sandbox.
- **Single overlay per repo (v1)**: polyglot repos get the first-match overlay. Multi-overlay composition is deferred to v2.
- **AGENTS.md deferred to v2**: the standard is still evolving.

## Testing

```bash
npm test
```

All tests use local profile directories (no network). Tests cover:
- Merge engine: managed sections insert/replace/extract/remove, deep merge, hook merge
- Detection: all 5 ecosystems, priority order, polyglot repos
- Init: happy path, existing content preservation, deep merge, overlays, --force, rollback
- Sync: version check, conflict detection, force override, hook replacement, rollback
- Status: drift detection, version cache TTL, update available
- Detach: marker removal, hook cleanup, lockfile deletion
- Drift check: warm cache, cold cache, error resilience

## Conventions

- TypeScript with strict mode, ES modules
- Tests use vitest
- No external runtime dependencies — only Node.js built-ins and `gh` CLI (optional)
- All file writes go through `writeFileSafe` (creates parent dirs) or the backup system
- Errors during apply trigger automatic rollback via the backup system
