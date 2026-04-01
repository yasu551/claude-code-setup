# CLAUDE.md

## Project Overview

claude-code-setup is a Claude Code plugin that standardizes team configuration across repositories. It manages CLAUDE.md, .mcp.json, settings.json, and hooks from a shared profile repo or via an interactive wizard that generates config from repo inspection.

## Architecture

The plugin has 4 commands (`/init`, `/sync`, `/status`, `/detach`) backed by a merge engine with three strategies. `/init` has four paths: fetch a team profile, generate config from repo inspection, create a team profile repo in an empty repo, or vision-first project creation (DESIGN.md + scaffold + config) in an empty repo.

- **Managed sections** — marker-delimited blocks in CLAUDE.md (team-owned between markers, user-owned outside)
- **Recursive deep merge** — for .mcp.json and settings.json (profile keys win at leaf level, user-only keys preserved)
- **Hook array merge** — team hooks tracked by matcher+command pair in lockfile, replaced on sync, user hooks untouched

## Source Layout

```
lib/
├── merge.ts            # Core merge engine (managed sections, deep merge, hook merge)
├── detect.ts           # Repo-type detection (JS, Python, Go, Rust, Ruby)
├── inspect.ts          # Rich repo fingerprinting (language, framework, tools, CI, etc.)
├── wizard.ts           # Adaptive question flow for interactive /init (repo, profile, project modes)
├── generate.ts         # Fingerprint + answers → ProfileLayer + provenance
├── templates/          # Built-in stack templates (JS, Python, Go, Rust, Ruby)
├── profile.ts          # Profile fetching (GitHub API with auth fallback chain)
├── profile-create.ts   # Team profile creation wizard for empty repos
├── profile-serialize.ts # ProfileLayer → directory files serializer
├── project-create.ts   # Vision-first project creation orchestrator
├── project-design.ts   # DESIGN.md generator from wizard answers
├── project-scaffold.ts # Project file generator per language/framework/systemType
├── lockfile.ts         # .claude-team-lock.json read/write/build
├── backup.ts           # Backup/rollback for safe applies
├── init.ts             # /init orchestrator (URL fetch, wizard, profile create, project create)
├── sync.ts             # /sync orchestrator (supports generated profiles)
├── status.ts           # /status command + version cache
├── detach.ts           # /detach command
└── drift-check.ts      # Pre-session drift check hook
```

## Key Design Decisions

- **Profile source checksums**: lockfile checksums track the profile's intended content, not the merged output. This allows drift detection to work even when the local file has user additions.
- **Hook tagging via lockfile**: team hooks are identified by matcher+command pair stored in the lockfile (not a custom field in hooks.json), since Claude Code's parser may strip unknown fields.
- **GitHub API over git clone**: profiles are fetched via API to avoid git binary and SSH key dependencies in the plugin sandbox.
- **Single overlay per repo (v1)**: polyglot repos get the first-match overlay. Multi-overlay composition is deferred to v2.
- **AGENTS.md deferred to v2**: the standard is still evolving.
- **Quad-source init**: `/init` supports fetched profiles (URL), generated profiles (repo wizard), team profile creation (empty repo), and vision-first project creation (empty repo with DESIGN.md + scaffold). All paths share the same merge engine and lockfile system.
- **Stable fingerprint hashing**: fingerprint hash excludes volatile fields (hasClaudeMd, hasSettings, etc.) that change as a result of init itself, so sync can reliably detect when repo tooling changed.

## Testing

```bash
npm test
```

All tests use local profile directories (no network). Tests cover:
- Merge engine: managed sections insert/replace/extract/remove, deep merge, hook merge
- Detection: all 5 ecosystems, priority order, polyglot repos
- Inspection: fingerprinting for all ecosystems + frameworks + tools + CI + Docker + DB
- Wizard: question filtering, answer inference, answer resolution
- Profile wizard: profile mode questions, overlay selection, answer resolution
- Project wizard: project mode questions, conditional framework logic, name validation per language, answer resolution
- Generation: template matching, ProfileLayer output, provenance entries
- Init: happy path, existing content preservation, deep merge, overlays, --force, rollback
- Init wizard: generated profiles, lockfile source, provenance reports, backward compat
- Init project: DESIGN.md + scaffold + config creation, round-trip fingerprint matching for all 5 languages
- Sync: version check, conflict detection, force override, hook replacement, rollback
- Sync generated: fingerprint change detection, wizard answer preservation
- Status: drift detection, version cache TTL, update available
- Detach: marker removal, hook cleanup, lockfile deletion
- Drift check: warm cache, cold cache, error resilience
- Project design: DESIGN.md generation per systemType, section presence, line count
- Project scaffold: per-language scaffolds (JS/Python/Go/Rust/Ruby), framework-specific files, persistence scaffolding, detection trigger files
- Project create: orchestrator happy path, --force, rollback, synthetic fingerprint, provenance report

## Conventions

- TypeScript with strict mode, ES modules
- Tests use vitest
- No external runtime dependencies — only Node.js built-ins and `gh` CLI (optional)
- All file writes go through `writeFileSafe` (creates parent dirs) or the backup system
- Errors during apply trigger automatic rollback via the backup system

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
