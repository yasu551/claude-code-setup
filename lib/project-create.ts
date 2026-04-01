import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import type { OverlayName } from "./detect.js";
import type { RepoFingerprint } from "./inspect.js";
import type { ProfileLayer } from "./profile.js";
import type { WizardAnswers, ProjectWizardAnswers } from "./wizard.js";
import { generateProfile } from "./generate.js";
import { generateDesignDoc } from "./project-design.js";
import { scaffoldProject } from "./project-scaffold.js";

export interface ProjectCreateResult {
  filesWritten: string[];
  designDocPath: string;
  provenanceReport: string;
  /** The generated ProfileLayer for init.ts to apply via applyLayer. */
  layer: ProfileLayer;
  /** The synthetic fingerprint for lockfile hash. */
  syntheticFingerprint: RepoFingerprint;
  /** The shared WizardAnswers subset for lockfile. */
  sharedAnswers: WizardAnswers;
}

// ---------------------------------------------------------------------------
// Inference helpers (private) — pick sensible modern defaults per language
// ---------------------------------------------------------------------------

function inferPackageManager(language: OverlayName): RepoFingerprint["packageManager"] {
  const map: Record<OverlayName, RepoFingerprint["packageManager"]> = {
    javascript: "npm",
    python: "pip",
    go: "go-modules",
    rust: "cargo",
    ruby: "bundler",
  };
  return map[language];
}

function inferTestRunner(language: OverlayName): string {
  const map: Record<OverlayName, string> = {
    javascript: "vitest",
    python: "pytest",
    go: "go-test",
    rust: "cargo-test",
    ruby: "rspec",
  };
  return map[language];
}

function inferLinter(language: OverlayName): string {
  const map: Record<OverlayName, string> = {
    javascript: "biome",
    python: "ruff",
    go: "golangci-lint",
    rust: "clippy",
    ruby: "rubocop",
  };
  return map[language];
}

function inferFormatter(language: OverlayName): string {
  const map: Record<OverlayName, string> = {
    javascript: "biome",
    python: "ruff",
    go: "gofmt",
    rust: "rustfmt",
    ruby: "rubocop",
  };
  return map[language];
}

/**
 * Build a synthetic RepoFingerprint from user's project wizard answers.
 * See lib/inspect.ts for the full RepoFingerprint type definition.
 */
function buildSyntheticFingerprint(answers: ProjectWizardAnswers): RepoFingerprint {
  return {
    language: answers.language,
    packageManager: inferPackageManager(answers.language),
    framework: answers.framework,
    testRunner: inferTestRunner(answers.language),
    linter: inferLinter(answers.language),
    formatter: inferFormatter(answers.language),
    hasCI: false,
    hasDocker: false,
    hasDatabase: answers.persistence !== "none",
    hasClaudeMd: false,
    hasMcpJson: false,
    hasSettings: false,
    hasHooks: false,
    evidence: {},
  };
}

/**
 * Detection trigger files per language — scaffold must produce these
 * so inspectRepo() round-trips correctly.
 */
const DETECTION_TRIGGERS: Record<OverlayName, string[]> = {
  javascript: ["package.json"],
  python: ["pyproject.toml"],
  go: ["go.mod"],
  rust: ["Cargo.toml"],
  ruby: ["Gemfile"],
};

/**
 * Check if project files already exist that would conflict.
 */
function checkExistingFiles(repoRoot: string, language: OverlayName): string | null {
  const triggers = DETECTION_TRIGGERS[language];
  for (const file of triggers) {
    if (existsSync(join(repoRoot, file))) {
      return file;
    }
  }
  if (existsSync(join(repoRoot, "DESIGN.md"))) {
    return "DESIGN.md";
  }
  return null;
}

/**
 * Format a provenance report for the created project.
 */
function formatProjectProvenance(
  answers: ProjectWizardAnswers,
  designDocPath: string,
  scaffoldFiles: string[],
  configFiles: string[]
): string {
  const lines: string[] = [];

  lines.push("Project Created");
  lines.push("");
  lines.push(`Project: ${answers.projectName}`);
  lines.push(`System type: ${answers.systemType}`);
  lines.push(`Language: ${answers.language}`);
  if (answers.framework) {
    lines.push(`Framework: ${answers.framework}`);
  }
  if (answers.persistence !== "none") {
    lines.push(`Persistence: ${answers.persistence}`);
  }
  lines.push(`Testing: ${answers.testingRigor}`);
  lines.push(`Security: ${answers.securityPosture}`);
  lines.push("");

  lines.push("Design doc:");
  lines.push(`  ${designDocPath}`);
  lines.push("");

  lines.push("Project files:");
  for (const f of scaffoldFiles) {
    lines.push(`  ${f}`);
  }
  lines.push("");

  lines.push("Claude config:");
  for (const f of configFiles) {
    lines.push(`  ${f}`);
  }

  lines.push("");
  lines.push("Next: Review DESIGN.md and refine the architecture before starting implementation.");

  return lines.join("\n");
}

/**
 * Create a new project from wizard answers.
 *
 * Generates: DESIGN.md, CLAUDE.md + settings + hooks, and project scaffold.
 * Uses the existing template system via a synthetic RepoFingerprint.
 */
export function createProject(
  repoRoot: string,
  answers: ProjectWizardAnswers,
  options: { force?: boolean } = {}
): ProjectCreateResult {
  // Check for existing files
  const existingFile = checkExistingFiles(repoRoot, answers.language);
  if (existingFile && !options.force) {
    throw new Error(
      `${existingFile} already exists. Use --force to overwrite.`
    );
  }

  // Generate DESIGN.md
  const designDoc = generateDesignDoc(answers);

  // Build synthetic fingerprint from answers
  const syntheticFp = buildSyntheticFingerprint(answers);

  // Extract shared WizardAnswers subset (testingRigor, codeChangeStyle, securityPosture only)
  const sharedAnswers: WizardAnswers = {
    testingRigor: answers.testingRigor,
    codeChangeStyle: answers.codeChangeStyle,
    securityPosture: answers.securityPosture,
  };

  // Generate CLAUDE.md config via existing template system
  const { layer } = generateProfile(syntheticFp, sharedAnswers);

  // Scaffold project files
  const scaffoldResult = scaffoldProject(repoRoot, answers);

  // Write DESIGN.md
  const designPath = join(repoRoot, designDoc.filePath);
  mkdirSync(dirname(designPath), { recursive: true });
  writeFileSync(designPath, designDoc.content, "utf-8");

  // Prepend DESIGN.md reference to CLAUDE.md sections
  const designReference = "See [DESIGN.md](DESIGN.md) for the full architecture blueprint.\n\n";
  if (layer.claudeMdSections) {
    layer.claudeMdSections = designReference + layer.claudeMdSections;
  } else {
    layer.claudeMdSections = designReference;
  }

  const allFilesWritten = [
    designDoc.filePath,
    ...scaffoldResult.filesWritten,
  ];

  const provenanceReport = formatProjectProvenance(
    answers,
    designDoc.filePath,
    scaffoldResult.filesWritten,
    [] // config files listed separately after applyLayer in init.ts
  );

  return {
    filesWritten: allFilesWritten,
    designDocPath: designDoc.filePath,
    provenanceReport,
    layer,
    syntheticFingerprint: syntheticFp,
    sharedAnswers,
  };
}
