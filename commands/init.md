# /init — Bootstrap from team profile or interactive wizard

Initialize this repository with Claude Code configuration, either from a team profile or by generating config interactively.

## Arguments

- `$ARGUMENTS` — Profile URL (e.g., `github.com/myorg/team-claude-profile`). If omitted, runs the interactive wizard.
- `--force` — Rebuild mode. Overwrite existing lockfile and re-initialize.

## Behavior

### With profile URL (team profile mode)

1. Check if `.claude-team-lock.json` already exists. If so, refuse unless `--force` is passed.
2. Detect repo type from project files (package.json, pyproject.toml, go.mod, Cargo.toml, Gemfile).
3. Fetch the profile via GitHub API.
4. Validate `profile.json` schema.
5. Apply base config + detected overlay:
   - Insert managed sections into CLAUDE.md
   - Deep merge .mcp.json
   - Deep merge .claude/settings.json (including hooks)
6. Write `.claude-team-lock.json` with profile version and checksums.
7. Add `.claude-team-cache/` to `.gitignore` if not present.
8. Report what was applied.

### Without profile URL (interactive wizard mode)

1. Check if `.claude-team-lock.json` already exists. If so, refuse unless `--force` is passed.
2. Inspect the repository to detect language, framework, test runner, linter, formatter, CI, Docker, and database.
3. Determine which configuration questions need to be asked (questions whose answers can't be inferred from the repo inspection are presented to the user).
4. Present unanswered questions to the user:
   - **Testing rigor**: minimal / standard / strict
   - **Code change style**: surgical / balanced / thorough
   - **Security posture**: relaxed / standard / strict
5. Generate a tailored configuration based on the fingerprint + answers.
6. Apply the generated config:
   - Insert managed sections into CLAUDE.md
   - Deep merge .mcp.json (if applicable)
   - Deep merge .claude/settings.json (including hooks, if applicable)
7. Write `.claude-team-lock.json` with `source: "generated"`, fingerprint hash, and wizard answers.
8. Add `.claude-team-cache/` to `.gitignore` if not present.
9. Display provenance report showing what was detected and why each config was applied.

On any error, roll back all changes to pre-init state.

## Implementation

When running the wizard flow, use `getWizardInfo()` from `lib/init.ts` to get the fingerprint and questions, then call `init()` with the collected `wizardAnswers`.

```typescript
import { getWizardInfo, init } from "../lib/init.js";

// Step 1: Get wizard info
const { fingerprint, questions } = getWizardInfo(repoRoot);

// Step 2: Present questions to user and collect answers
// (only questions that couldn't be inferred are returned)
const userAnswers = {}; // collect from user interaction

// Step 3: Run init with wizard answers
const result = init({ repoRoot, wizardAnswers: userAnswers });

// Step 4: Display provenance report
if (result.provenanceReport) {
  console.log(result.provenanceReport);
}
```
