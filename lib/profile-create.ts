import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ProfileMetadata, ProfileLayer } from "./profile.js";
import type { OverlayName } from "./detect.js";
import type { RepoFingerprint } from "./inspect.js";
import type { WizardAnswers } from "./wizard.js";
import type { ProfileWizardAnswers } from "./wizard.js";
import { generateProfile } from "./generate.js";
import { serializeProfile } from "./profile-serialize.js";

export interface ProfileCreateResult {
  filesWritten: string[];
  provenanceReport: string;
}

/**
 * Generate base layer CLAUDE.md.sections from team convention answers.
 */
function generateBaseLayer(answers: ProfileWizardAnswers): ProfileLayer {
  const sections: string[] = [];

  // Commit conventions
  if (answers.commitStyle === "conventional") {
    sections.push(
      "## Commit Conventions",
      "",
      "Use conventional commit format: feat:, fix:, chore:, docs:, refactor:, test:.",
      "Include scope when applicable (e.g., feat(auth): add login flow).",
    );
  } else {
    sections.push(
      "## Commit Conventions",
      "",
      "Write clear, descriptive commit messages. Lead with what changed and why.",
    );
  }

  sections.push("");

  // Documentation
  if (answers.documentationLevel === "minimal") {
    sections.push(
      "## Documentation",
      "",
      "Do not add documentation unless explicitly asked.",
    );
  } else if (answers.documentationLevel === "standard") {
    sections.push(
      "## Documentation",
      "",
      "Add JSDoc/docstrings for public APIs and exported functions.",
      "Skip internal implementation details.",
    );
  } else {
    sections.push(
      "## Documentation",
      "",
      "Document all public APIs, exported functions, and non-trivial internal functions.",
      "Include parameter descriptions, return values, and usage examples.",
    );
  }

  sections.push("");

  // Testing (language-agnostic version)
  if (answers.testingRigor === "strict") {
    sections.push(
      "## Testing",
      "",
      "All new code must have tests. Run tests before committing.",
      "Aim for high coverage including edge cases.",
    );
  } else if (answers.testingRigor === "standard") {
    sections.push(
      "## Testing",
      "",
      "Write tests for new features and bug fixes.",
      "Cover the happy path and key edge cases.",
    );
  }
  // minimal: no testing section in base

  if (answers.testingRigor !== "minimal") {
    sections.push("");
  }

  // Code change style (language-agnostic)
  sections.push(
    "## Code Changes",
    "",
  );
  if (answers.codeChangeStyle === "surgical") {
    sections.push("Make minimal, targeted changes. Only modify what is explicitly asked.");
  } else if (answers.codeChangeStyle === "balanced") {
    sections.push("Fix the issue plus closely related improvements. Stay focused.");
  } else {
    sections.push("Broader refactoring is acceptable when it improves the codebase.");
  }

  return {
    claudeMdSections: sections.join("\n"),
    hooksJson: null,
    settingsJson: answers.securityPosture === "strict"
      ? { permissions: { allow: ["Read", "Glob", "Grep"], deny: ["Bash"] } }
      : null,
    mcpJson: null,
  };
}

/**
 * Create a synthetic RepoFingerprint for overlay generation.
 */
function syntheticFingerprint(language: OverlayName): RepoFingerprint {
  return {
    language,
    packageManager: null,
    framework: null,
    testRunner: null,
    linter: null,
    formatter: null,
    hasCI: false,
    hasDocker: false,
    hasDatabase: false,
    hasClaudeMd: false,
    hasMcpJson: false,
    hasSettings: false,
    hasHooks: false,
    evidence: {},
  };
}

/**
 * Format a provenance report for the created profile.
 */
function formatProfileProvenance(
  answers: ProfileWizardAnswers,
  filesWritten: string[]
): string {
  const lines: string[] = [];

  lines.push("Team Profile Created");
  lines.push("");
  lines.push(`Testing rigor: ${answers.testingRigor}`);
  lines.push(`Code style: ${answers.codeChangeStyle}`);
  lines.push(`Security: ${answers.securityPosture}`);
  lines.push(`Commits: ${answers.commitStyle}`);
  lines.push(`Documentation: ${answers.documentationLevel}`);
  lines.push(`Overlays: ${answers.overlays.join(", ")}`);
  lines.push("");
  lines.push("Files written:");
  for (const f of filesWritten) {
    lines.push(`  ${f}`);
  }

  return lines.join("\n");
}

/**
 * Create a team profile repo from wizard answers.
 *
 * Generates the full profile directory structure:
 *   profile.json, base/, overlays/<language>/, README.md
 *
 * No lockfile is written — the profile repo is a source, not a consumer.
 */
export function createTeamProfile(
  repoRoot: string,
  answers: ProfileWizardAnswers,
  options: { force?: boolean } = {}
): ProfileCreateResult {
  // Check for existing profile
  if (existsSync(join(repoRoot, "profile.json")) && !options.force) {
    throw new Error(
      "profile.json already exists. Use --force to overwrite."
    );
  }

  // Generate base layer from team convention answers
  const baseLayer = generateBaseLayer(answers);

  // Extract shared WizardAnswers for overlay generation
  const sharedAnswers: WizardAnswers = {
    testingRigor: answers.testingRigor,
    codeChangeStyle: answers.codeChangeStyle,
    securityPosture: answers.securityPosture,
  };

  // Generate overlay layers using existing templates
  const overlays: Record<string, ProfileLayer> = {};
  for (const overlayName of answers.overlays) {
    const fp = syntheticFingerprint(overlayName);
    const { layer } = generateProfile(fp, sharedAnswers);
    overlays[overlayName] = layer;
  }

  // Build metadata
  const metadata: ProfileMetadata = {
    name: "team-profile",
    version: "1.0.0",
    description: "Team Claude Code configuration profile",
    overlays: [...answers.overlays],
    defaultOverlay: null,
    minimumPluginVersion: "0.0.0",
  };

  // Serialize to disk
  const { filesWritten } = serializeProfile({
    repoRoot,
    metadata,
    baseLayer,
    overlays,
  });

  const provenanceReport = formatProfileProvenance(answers, filesWritten);

  return { filesWritten, provenanceReport };
}
