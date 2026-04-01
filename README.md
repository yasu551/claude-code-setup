# claude-code-setup

A Claude Code plugin that standardizes team configuration across repositories. The "ESLint shared config" for Claude Code.

Every developer on your team gets different CLAUDE.md files, different hooks, different MCP servers, different settings. This plugin fixes that. Define your team's config once in a profile repo, or let the interactive wizard generate tailored config by inspecting your repo.

## Quick Start

### 1. Register the marketplace and install

```bash
/plugin marketplace add https://github.com/yasu551/claude-code-setup
/plugin install claude-code-setup@yasu551-plugins
```

> **Note:** The `@yasu551-plugins` qualifier distinguishes this from the official `claude-code-setup@claude-plugins-official` plugin. Both can coexist.

### 2. Create a team profile repo

```
team-claude-profile/
├── base/
│   ├── CLAUDE.md.sections     # Managed sections for CLAUDE.md
│   ├── hooks.json             # Team hooks
│   ├── settings.json          # Team settings
│   └── .mcp.json              # Team MCP servers
├── overlays/
│   ├── javascript/            # JS/TS-specific config
│   ├── python/                # Python-specific config
│   └── ...
└── profile.json               # Profile metadata + version
```

Example `profile.json`:

```json
{
  "name": "myorg-claude-profile",
  "version": "1.0.0",
  "description": "Standard Claude Code configuration for MyOrg",
  "overlays": ["javascript", "python", "go", "rust", "ruby"],
  "defaultOverlay": null,
  "minimumPluginVersion": "0.1.0"
}
```

Example `base/CLAUDE.md.sections`:

```markdown
## Team Standards

- Always use TypeScript strict mode
- Write tests for all new functions
- Use the team's approved MCP servers listed in .mcp.json
```

### 3. Initialize a project

**Option A: From a team profile repo**

```bash
/init github.com/myorg/team-claude-profile
```

This detects your repo type (JS, Python, Go, Rust, Ruby), fetches the profile, and applies base + overlay config. Your CLAUDE.md gets a managed section with team rules, .mcp.json and settings.json are deep merged, and hooks are installed.

**Option B: Interactive wizard (no profile repo needed)**

```bash
/init
```

Without a URL, the plugin inspects your repo (language, framework, test runner, linter, CI, Docker, etc.), asks a few adaptive questions about your preferences, and generates tailored config. Every generated rule traces back to evidence found in your repo.

### 4. Keep it in sync

```bash
/sync
```

When the team profile is updated, `/sync` pulls the latest version and applies changes non-destructively. Your custom content outside managed sections is never touched.

## Commands

### `/init [profile-url]`

Bootstrap this repo with a team profile or interactive wizard.

**With a profile URL:**
- Detects repo type automatically (package.json, pyproject.toml, go.mod, Cargo.toml, Gemfile)
- Fetches profile from GitHub (or a local path)
- Applies base config + matching overlay
- Writes managed sections to CLAUDE.md
- Deep merges .mcp.json and .claude/settings.json
- Creates `.claude-team-lock.json` to track the applied version
- Use `--force` to re-initialize an already configured repo

**Without a URL (interactive wizard):**
- Inspects your repo: language, framework, package manager, test runner, linter, formatter, CI, Docker, database
- Asks adaptive questions (skips what it can infer from your tooling):
  - Testing rigor: minimal / standard / strict
  - Code change style: surgical / balanced / thorough
  - Security posture: relaxed / standard / strict
- Generates tailored config from built-in stack templates
- Displays a provenance report showing what was detected and why each config was applied
- Lockfile records `source: "generated"` with fingerprint and answers for reproducible syncs

### `/sync`

Update to the latest profile version.

- Compares versions and skips if already up to date
- Replaces managed sections in CLAUDE.md (user content outside markers is preserved)
- Deep merges JSON configs (profile keys win, user-only keys preserved)
- Replaces team hooks, preserves user hooks
- Detects if you edited inside managed sections and asks to confirm before overwriting
- Use `--force` to skip conflict confirmation
- Rolls back all changes on error
- For generated profiles: re-runs repo inspection with stored wizard answers, updates config if tooling changed

### `/status`

Show config drift and available updates.

- Reports current profile version and whether an update is available
- Per-file drift detection (managed section modifications, missing files)
- Uses a 1-hour TTL cache for version checks (no network on warm cache)

### `/detach`

Remove the profile from this repo.

- Removes managed section markers from CLAUDE.md (content is preserved)
- Removes team-owned hooks from settings.json (user hooks preserved)
- Deletes lockfile and cache
- Leaves .mcp.json and settings.json as-is (merged state becomes the new baseline)

## How Merging Works

The plugin uses three merge strategies:

### Managed Sections (CLAUDE.md)

Team content lives between markers. Everything outside is yours.

```markdown
<!-- claude-code-setup:begin — DO NOT EDIT THIS SECTION -->
## Team Standards

- Follow the coding guidelines
- Use approved MCP servers

<!-- claude-code-setup:end -->

## My Custom Instructions

This part is never touched by sync.
```

### Recursive Deep Merge (.mcp.json, settings.json)

Profile keys win at the leaf level. Your keys are preserved.

```
Profile:  { mcpServers: { github: { command: "gh-mcp" } } }
Local:    { mcpServers: { github: { timeout: 30 }, mylocal: { command: "local" } } }
Result:   { mcpServers: { github: { command: "gh-mcp", timeout: 30 }, mylocal: { command: "local" } } }
```

- Keys only in local: preserved
- Keys only in profile: added
- Keys in both, profile value is not an object: profile wins
- Both values are objects: recurse
- Arrays: profile wins (not merged element-wise)

### Hook Array Merge

Team hooks are tracked by matcher+command pair in the lockfile. On sync, team hooks are replaced with updated versions. Your hooks are never touched.

## Profile Fetch

Profiles are fetched via GitHub API with a fallback chain:

1. `gh api` (if gh CLI is installed and authenticated)
2. Raw HTTPS with `GITHUB_TOKEN` env var
3. Raw HTTPS without auth (public repos)
4. Local file path (always works)

## Files Created

| File | Purpose |
|------|---------|
| `.claude-team-lock.json` | Tracks profile version, checksums, and team hook refs |
| `.claude-team-cache/` | Version check cache and backups (gitignored) |

## Development

```bash
npm install
npm test          # Run tests
npm run test:watch  # Watch mode
```

146 tests covering merge engine, repo detection, repo inspection, wizard flow, config generation, profile fetching, init/sync/status/detach flows, backup/rollback, and drift checking.

## License

MIT
