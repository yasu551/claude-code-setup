import type { RepoFingerprint } from "./inspect.js";
import type { OverlayName } from "./detect.js";

export interface WizardQuestion {
  id: keyof WizardAnswers;
  text: string;
  options: { label: string; value: string; description: string }[];
  shouldAsk: (fp: RepoFingerprint) => boolean;
  inferAnswer: (fp: RepoFingerprint) => string | null;
}

export interface WizardAnswers {
  testingRigor: "minimal" | "standard" | "strict";
  codeChangeStyle: "surgical" | "balanced" | "thorough";
  securityPosture: "relaxed" | "standard" | "strict";
}

// ---------------------------------------------------------------------------
// Profile mode wizard (for creating team profile repos)
// ---------------------------------------------------------------------------

export interface ProfileWizardQuestion {
  id: keyof ProfileWizardAnswers;
  text: string;
  options: { label: string; value: string; description: string }[];
  shouldAsk: (fp?: RepoFingerprint) => boolean;
  inferAnswer: (fp?: RepoFingerprint) => string | null;
}

export interface ProfileWizardAnswers extends WizardAnswers {
  commitStyle: "conventional" | "freeform";
  documentationLevel: "minimal" | "standard" | "comprehensive";
  overlays: OverlayName[];
}

const QUESTION_POOL: WizardQuestion[] = [
  {
    id: "testingRigor",
    text: "How rigorous should testing be?",
    options: [
      {
        label: "Minimal",
        value: "minimal",
        description: "Basic happy-path tests only",
      },
      {
        label: "Standard",
        value: "standard",
        description: "Good coverage with edge cases",
      },
      {
        label: "Strict",
        value: "strict",
        description: "Comprehensive tests, coverage enforcement, CI gating",
      },
    ],
    shouldAsk(fp) {
      // Skip if we can infer from test runner + CI presence
      return this.inferAnswer(fp) === null;
    },
    inferAnswer(fp) {
      if (fp.testRunner && fp.hasCI) return "strict";
      if (fp.testRunner) return "standard";
      return null;
    },
  },
  {
    id: "codeChangeStyle",
    text: "How should Claude approach code changes?",
    options: [
      {
        label: "Surgical",
        value: "surgical",
        description: "Minimal changes, touch only what's asked",
      },
      {
        label: "Balanced",
        value: "balanced",
        description: "Fix the issue plus closely related improvements",
      },
      {
        label: "Thorough",
        value: "thorough",
        description: "Broader refactoring when it improves the codebase",
      },
    ],
    shouldAsk(fp) {
      // Always ask — this is a preference, can't be inferred from tooling
      return this.inferAnswer(fp) === null;
    },
    inferAnswer(_fp) {
      return null;
    },
  },
  {
    id: "securityPosture",
    text: "What security posture do you want?",
    options: [
      {
        label: "Relaxed",
        value: "relaxed",
        description: "Minimal restrictions, fast iteration",
      },
      {
        label: "Standard",
        value: "standard",
        description: "Reasonable guardrails, block obvious risks",
      },
      {
        label: "Strict",
        value: "strict",
        description: "Locked-down: no network tools, restricted file access",
      },
    ],
    shouldAsk(fp) {
      return this.inferAnswer(fp) === null;
    },
    inferAnswer(fp) {
      // If MCP config exists, assume the user already has a posture
      if (fp.hasMcpJson) return "standard";
      return null;
    },
  },
];

/**
 * Returns the questions that need to be asked (those that can't be inferred).
 */
export function getWizardQuestions(fp: RepoFingerprint): WizardQuestion[] {
  return QUESTION_POOL.filter((q) => q.shouldAsk(fp));
}

/**
 * Resolve all answers by merging inferred answers with explicit user answers.
 * User answers override inferences.
 */
export function resolveAnswers(
  fp: RepoFingerprint,
  userAnswers: Partial<WizardAnswers>
): WizardAnswers {
  const resolved: Record<string, string> = {};

  for (const q of QUESTION_POOL) {
    const userVal = userAnswers[q.id];
    if (userVal) {
      resolved[q.id] = userVal;
    } else {
      const inferred = q.inferAnswer(fp);
      resolved[q.id] = inferred ?? q.options[1].value; // Default to middle option
    }
  }

  return resolved as unknown as WizardAnswers;
}

// ---------------------------------------------------------------------------
// Profile mode question pool and resolution
// ---------------------------------------------------------------------------

const PROFILE_QUESTION_POOL: ProfileWizardQuestion[] = [
  {
    id: "testingRigor",
    text: "How rigorous should testing be across your team's repos?",
    options: [
      { label: "Minimal", value: "minimal", description: "Basic happy-path tests only" },
      { label: "Standard", value: "standard", description: "Good coverage with edge cases" },
      { label: "Strict", value: "strict", description: "Comprehensive tests, coverage enforcement, CI gating" },
    ],
    shouldAsk: () => true,
    inferAnswer: () => null,
  },
  {
    id: "codeChangeStyle",
    text: "How should Claude approach code changes?",
    options: [
      { label: "Surgical", value: "surgical", description: "Minimal changes, touch only what's asked" },
      { label: "Balanced", value: "balanced", description: "Fix the issue plus closely related improvements" },
      { label: "Thorough", value: "thorough", description: "Broader refactoring when it improves the codebase" },
    ],
    shouldAsk: () => true,
    inferAnswer: () => null,
  },
  {
    id: "securityPosture",
    text: "What security posture do you want?",
    options: [
      { label: "Relaxed", value: "relaxed", description: "Minimal restrictions, fast iteration" },
      { label: "Standard", value: "standard", description: "Reasonable guardrails, block obvious risks" },
      { label: "Strict", value: "strict", description: "Locked-down: no network tools, restricted file access" },
    ],
    shouldAsk: () => true,
    inferAnswer: () => null,
  },
  {
    id: "commitStyle",
    text: "What commit message style does your team use?",
    options: [
      { label: "Conventional", value: "conventional", description: "feat:/fix:/chore: prefix format" },
      { label: "Freeform", value: "freeform", description: "Clear descriptive messages, no required format" },
    ],
    shouldAsk: () => true,
    inferAnswer: () => null,
  },
  {
    id: "documentationLevel",
    text: "How much documentation should Claude generate?",
    options: [
      { label: "Minimal", value: "minimal", description: "Don't add docs unless asked" },
      { label: "Standard", value: "standard", description: "JSDoc/docstrings for public APIs" },
      { label: "Comprehensive", value: "comprehensive", description: "Document everything including internals" },
    ],
    shouldAsk: () => true,
    inferAnswer: () => null,
  },
];

/**
 * All supported overlay names for the profile wizard language selection.
 */
export const SUPPORTED_OVERLAYS: OverlayName[] = [
  "javascript",
  "python",
  "go",
  "rust",
  "ruby",
];

/**
 * Returns all profile mode questions (all are always asked, no inference).
 */
export function getProfileWizardQuestions(): ProfileWizardQuestion[] {
  return [...PROFILE_QUESTION_POOL];
}

/**
 * Resolve profile wizard answers, applying defaults for missing values.
 * Throws if no overlays are selected.
 */
export function resolveProfileAnswers(
  userAnswers: Partial<ProfileWizardAnswers>
): ProfileWizardAnswers {
  const overlays = userAnswers.overlays ?? [];
  if (overlays.length === 0) {
    throw new Error("At least one language overlay must be selected.");
  }

  return {
    testingRigor: userAnswers.testingRigor ?? "standard",
    codeChangeStyle: userAnswers.codeChangeStyle ?? "balanced",
    securityPosture: userAnswers.securityPosture ?? "standard",
    commitStyle: userAnswers.commitStyle ?? "conventional",
    documentationLevel: userAnswers.documentationLevel ?? "standard",
    overlays,
  };
}

// ---------------------------------------------------------------------------
// Project mode wizard (for vision-first project creation in empty repos)
// ---------------------------------------------------------------------------

export type SystemType = "web-app" | "api" | "cli" | "library" | "fullstack";
export type PersistenceType = "none" | "sql" | "nosql" | "file-based";

export interface ProjectWizardAnswers extends WizardAnswers {
  systemType: SystemType;
  language: OverlayName;
  framework: string | null;
  persistence: PersistenceType;
  projectName: string;
  projectDescription: string;
}

export interface ProjectWizardQuestion {
  id: keyof ProjectWizardAnswers;
  text: string;
  options: { label: string; value: string; description: string }[];
  shouldAsk: (answers: Partial<ProjectWizardAnswers>) => boolean;
}

/**
 * Valid framework choices per language + systemType combination.
 */
const FRAMEWORK_OPTIONS: Record<string, { label: string; value: string; description: string }[]> = {
  "javascript:web-app": [
    { label: "Next.js", value: "next", description: "React framework with SSR and file-based routing" },
    { label: "React", value: "react", description: "Client-side React with Vite" },
    { label: "Vue", value: "vue", description: "Vue.js with Vite" },
    { label: "None", value: "", description: "No framework" },
  ],
  "javascript:fullstack": [
    { label: "Next.js", value: "next", description: "React framework with SSR, API routes, and full-stack capabilities" },
    { label: "React", value: "react", description: "Client-side React with separate API" },
    { label: "Vue", value: "vue", description: "Vue.js with separate API" },
    { label: "None", value: "", description: "No framework" },
  ],
  "javascript:api": [
    { label: "Express", value: "express", description: "Minimal, flexible Node.js web framework" },
    { label: "Fastify", value: "fastify", description: "Fast and low-overhead web framework" },
    { label: "Hono", value: "hono", description: "Lightweight, ultrafast web framework" },
    { label: "None", value: "", description: "No framework, raw Node.js HTTP" },
  ],
  "python:web-app": [
    { label: "Django", value: "django", description: "Full-featured web framework with ORM and admin" },
    { label: "Flask", value: "flask", description: "Lightweight web framework" },
    { label: "None", value: "", description: "No framework" },
  ],
  "python:fullstack": [
    { label: "Django", value: "django", description: "Full-featured web framework with ORM and admin" },
    { label: "Flask", value: "flask", description: "Lightweight web framework" },
    { label: "None", value: "", description: "No framework" },
  ],
  "python:api": [
    { label: "FastAPI", value: "fastapi", description: "Modern, fast API framework with auto-docs" },
    { label: "Flask", value: "flask", description: "Lightweight web framework" },
    { label: "None", value: "", description: "No framework" },
  ],
  "go:web-app": [
    { label: "Gin", value: "gin", description: "High-performance HTTP web framework" },
    { label: "Echo", value: "echo", description: "Minimalist Go web framework" },
    { label: "Chi", value: "chi", description: "Lightweight, idiomatic router" },
    { label: "net/http", value: "net-http", description: "Standard library HTTP server" },
  ],
  "go:api": [
    { label: "Gin", value: "gin", description: "High-performance HTTP web framework" },
    { label: "Echo", value: "echo", description: "Minimalist Go web framework" },
    { label: "Chi", value: "chi", description: "Lightweight, idiomatic router" },
    { label: "net/http", value: "net-http", description: "Standard library HTTP server" },
  ],
  "go:fullstack": [
    { label: "Gin", value: "gin", description: "High-performance HTTP web framework" },
    { label: "Echo", value: "echo", description: "Minimalist Go web framework" },
    { label: "Chi", value: "chi", description: "Lightweight, idiomatic router" },
    { label: "net/http", value: "net-http", description: "Standard library HTTP server" },
  ],
  "ruby:web-app": [
    { label: "Rails", value: "rails", description: "Full-featured web framework" },
    { label: "Sinatra", value: "sinatra", description: "Lightweight web framework" },
    { label: "None", value: "", description: "No framework" },
  ],
  "ruby:fullstack": [
    { label: "Rails", value: "rails", description: "Full-featured web framework" },
    { label: "Sinatra", value: "sinatra", description: "Lightweight web framework" },
    { label: "None", value: "", description: "No framework" },
  ],
  "ruby:api": [
    { label: "Rails", value: "rails", description: "Rails API mode" },
    { label: "Sinatra", value: "sinatra", description: "Lightweight web framework" },
    { label: "None", value: "", description: "No framework" },
  ],
  "rust:api": [
    { label: "Actix", value: "actix", description: "Powerful, pragmatic web framework" },
    { label: "Axum", value: "axum", description: "Ergonomic and modular web framework" },
    { label: "None", value: "", description: "No framework" },
  ],
  "rust:web-app": [
    { label: "Actix", value: "actix", description: "Powerful, pragmatic web framework" },
    { label: "Axum", value: "axum", description: "Ergonomic and modular web framework" },
    { label: "None", value: "", description: "No framework" },
  ],
  "rust:fullstack": [
    { label: "Actix", value: "actix", description: "Powerful, pragmatic web framework" },
    { label: "Axum", value: "axum", description: "Ergonomic and modular web framework" },
    { label: "None", value: "", description: "No framework" },
  ],
};

const PROJECT_QUESTION_POOL: ProjectWizardQuestion[] = [
  {
    id: "projectName",
    text: "What's the project name?",
    options: [], // Free text — Claude asks directly, no predefined options
    shouldAsk: () => true,
  },
  {
    id: "projectDescription",
    text: "Describe the project in one sentence.",
    options: [], // Free text
    shouldAsk: () => true,
  },
  {
    id: "systemType",
    text: "What kind of system are you building?",
    options: [
      { label: "Web App", value: "web-app", description: "Server-rendered pages, browser UI" },
      { label: "API", value: "api", description: "HTTP/gRPC service, consumed by other systems" },
      { label: "CLI", value: "cli", description: "Command-line tool" },
      { label: "Library", value: "library", description: "Reusable package published for others" },
      { label: "Full-stack", value: "fullstack", description: "Frontend + backend in one repo" },
    ],
    shouldAsk: () => true,
  },
  {
    id: "language",
    text: "What language?",
    options: [
      { label: "JavaScript/TypeScript", value: "javascript", description: "Node.js with TypeScript" },
      { label: "Python", value: "python", description: "Python 3" },
      { label: "Go", value: "go", description: "Go" },
      { label: "Rust", value: "rust", description: "Rust" },
    ],
    shouldAsk: () => true,
  },
  {
    id: "framework",
    text: "Which framework?",
    options: [], // Populated dynamically from FRAMEWORK_OPTIONS
    shouldAsk: (answers) => {
      if (!answers.language || !answers.systemType) return false;
      // No framework question for CLI or library
      if (answers.systemType === "cli" || answers.systemType === "library") return false;
      const key = `${answers.language}:${answers.systemType}`;
      return key in FRAMEWORK_OPTIONS;
    },
  },
  {
    id: "persistence",
    text: "Does this project need data storage?",
    options: [
      { label: "None", value: "none", description: "Stateless, or persistence deferred" },
      { label: "SQL", value: "sql", description: "PostgreSQL, MySQL, SQLite" },
      { label: "NoSQL", value: "nosql", description: "Redis, MongoDB, DynamoDB" },
      { label: "File-based", value: "file-based", description: "Local files, JSON, CSV" },
    ],
    shouldAsk: (answers) => {
      // Skip for library and CLI
      return answers.systemType !== "library" && answers.systemType !== "cli";
    },
  },
  {
    id: "testingRigor",
    text: "How rigorous should testing be?",
    options: [
      { label: "Minimal", value: "minimal", description: "Basic happy-path tests only" },
      { label: "Standard", value: "standard", description: "Good coverage with edge cases" },
      { label: "Strict", value: "strict", description: "Comprehensive tests, coverage enforcement" },
    ],
    shouldAsk: () => true,
  },
  {
    id: "securityPosture",
    text: "What security posture do you want?",
    options: [
      { label: "Relaxed", value: "relaxed", description: "Minimal restrictions, fast iteration" },
      { label: "Standard", value: "standard", description: "Reasonable guardrails, block obvious risks" },
      { label: "Strict", value: "strict", description: "Locked-down: no network tools, restricted file access" },
    ],
    shouldAsk: () => true,
  },
];

/**
 * Get the framework options for a given language + systemType combination.
 */
export function getFrameworkOptions(
  language: OverlayName,
  systemType: SystemType
): { label: string; value: string; description: string }[] {
  return FRAMEWORK_OPTIONS[`${language}:${systemType}`] ?? [];
}

/**
 * Returns all project mode questions.
 */
export function getProjectWizardQuestions(): ProjectWizardQuestion[] {
  return [...PROJECT_QUESTION_POOL];
}

/**
 * Language-specific project name validation patterns.
 */
const NAME_PATTERNS: Record<OverlayName, { pattern: RegExp; description: string }> = {
  javascript: {
    pattern: /^[a-z0-9][a-z0-9._-]*$/,
    description: "lowercase, no spaces, valid npm package name",
  },
  python: {
    pattern: /^[a-z][a-z0-9_]*$/,
    description: "lowercase with underscores (PEP 8 module name)",
  },
  go: {
    pattern: /^[a-z][a-z0-9-]*$/,
    description: "lowercase with hyphens",
  },
  rust: {
    pattern: /^[a-z][a-z0-9-]*$/,
    description: "lowercase with hyphens (valid crate name)",
  },
  ruby: {
    pattern: /^[a-z][a-z0-9_-]*$/,
    description: "lowercase with underscores or hyphens (valid gem name)",
  },
};

/**
 * Validate a project name for the given language.
 */
export function validateProjectName(
  name: string,
  language: OverlayName
): { valid: boolean; reason?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, reason: "Project name cannot be empty." };
  }
  const rule = NAME_PATTERNS[language];
  if (!rule.pattern.test(name)) {
    return {
      valid: false,
      reason: `Invalid project name for ${language}: must be ${rule.description}.`,
    };
  }
  return { valid: true };
}

/**
 * Resolve project wizard answers, applying defaults for missing values.
 * Validates projectName against language-specific rules and framework against systemType.
 */
export function resolveProjectAnswers(
  userAnswers: Partial<ProjectWizardAnswers>
): ProjectWizardAnswers {
  const language = userAnswers.language;
  if (!language || !SUPPORTED_OVERLAYS.includes(language)) {
    throw new Error(`Invalid language: ${language}. Must be one of: ${SUPPORTED_OVERLAYS.join(", ")}`);
  }

  const projectName = userAnswers.projectName ?? "";
  const nameValidation = validateProjectName(projectName, language);
  if (!nameValidation.valid) {
    throw new Error(nameValidation.reason!);
  }

  const systemType = userAnswers.systemType ?? "api";
  const framework = userAnswers.framework ?? null;

  // Validate framework against language+systemType
  if (framework) {
    const key = `${language}:${systemType}`;
    const validOptions = FRAMEWORK_OPTIONS[key];
    if (validOptions) {
      const validValues = validOptions.map((o) => o.value).filter(Boolean);
      if (!validValues.includes(framework)) {
        throw new Error(
          `Invalid framework "${framework}" for ${language}/${systemType}. Valid: ${validValues.join(", ")}`
        );
      }
    }
  }

  return {
    testingRigor: userAnswers.testingRigor ?? "standard",
    codeChangeStyle: userAnswers.codeChangeStyle ?? "balanced",  // defaulted; never asked
    securityPosture: userAnswers.securityPosture ?? "standard",
    systemType,
    language,
    framework: framework || null,
    persistence: userAnswers.persistence ?? "none",
    projectName,
    projectDescription: userAnswers.projectDescription ?? "",
  };
}
