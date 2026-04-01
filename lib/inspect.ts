import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { detectOverlay, type OverlayName } from "./detect.js";

export interface RepoFingerprint {
  language: OverlayName | null;
  packageManager:
    | "npm"
    | "yarn"
    | "pnpm"
    | "bun"
    | "pip"
    | "poetry"
    | "cargo"
    | "bundler"
    | "go-modules"
    | null;
  framework: string | null;
  testRunner: string | null;
  linter: string | null;
  formatter: string | null;
  hasCI: boolean;
  hasDocker: boolean;
  hasDatabase: boolean;
  hasClaudeMd: boolean;
  hasMcpJson: boolean;
  hasSettings: boolean;
  hasHooks: boolean;
  evidence: Record<string, string[]>;
}

function fileExists(repoRoot: string, path: string): boolean {
  return existsSync(join(repoRoot, path));
}

function readJsonSafe(repoRoot: string, path: string): Record<string, unknown> | null {
  const full = join(repoRoot, path);
  if (!existsSync(full)) return null;
  try {
    return JSON.parse(readFileSync(full, "utf-8"));
  } catch {
    return null;
  }
}

function hasDep(
  deps: Record<string, string> | undefined,
  name: string
): boolean {
  return deps != null && name in deps;
}

function detectPackageManager(repoRoot: string, language: OverlayName | null): { pm: RepoFingerprint["packageManager"]; evidence: string[] } {
  const evidence: string[] = [];

  if (fileExists(repoRoot, "bun.lockb") || fileExists(repoRoot, "bun.lock")) {
    evidence.push(fileExists(repoRoot, "bun.lockb") ? "bun.lockb" : "bun.lock");
    return { pm: "bun", evidence };
  }
  if (fileExists(repoRoot, "pnpm-lock.yaml")) {
    evidence.push("pnpm-lock.yaml");
    return { pm: "pnpm", evidence };
  }
  if (fileExists(repoRoot, "yarn.lock")) {
    evidence.push("yarn.lock");
    return { pm: "yarn", evidence };
  }
  if (fileExists(repoRoot, "package-lock.json")) {
    evidence.push("package-lock.json");
    return { pm: "npm", evidence };
  }
  if (language === "javascript" && fileExists(repoRoot, "package.json")) {
    evidence.push("package.json");
    return { pm: "npm", evidence };
  }

  if (fileExists(repoRoot, "poetry.lock")) {
    evidence.push("poetry.lock");
    return { pm: "poetry", evidence };
  }
  if (language === "python" && fileExists(repoRoot, "pyproject.toml")) {
    evidence.push("pyproject.toml");
    return { pm: "poetry", evidence };
  }
  if (language === "python") {
    if (fileExists(repoRoot, "requirements.txt")) evidence.push("requirements.txt");
    return { pm: "pip", evidence };
  }

  if (language === "rust") {
    evidence.push("Cargo.toml");
    return { pm: "cargo", evidence };
  }
  if (language === "ruby") {
    evidence.push("Gemfile");
    return { pm: "bundler", evidence };
  }
  if (language === "go") {
    evidence.push("go.mod");
    return { pm: "go-modules", evidence };
  }

  return { pm: null, evidence };
}

function detectFramework(repoRoot: string, language: OverlayName | null): { framework: string | null; evidence: string[] } {
  const evidence: string[] = [];

  if (language === "javascript") {
    const pkg = readJsonSafe(repoRoot, "package.json") as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    } | null;
    if (!pkg) return { framework: null, evidence };

    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (hasDep(deps, "next")) {
      evidence.push("package.json (next)");
      return { framework: "next", evidence };
    }
    if (hasDep(deps, "nuxt")) {
      evidence.push("package.json (nuxt)");
      return { framework: "nuxt", evidence };
    }
    if (hasDep(deps, "express")) {
      evidence.push("package.json (express)");
      return { framework: "express", evidence };
    }
    if (hasDep(deps, "fastify")) {
      evidence.push("package.json (fastify)");
      return { framework: "fastify", evidence };
    }
    if (hasDep(deps, "react")) {
      evidence.push("package.json (react)");
      return { framework: "react", evidence };
    }
    if (hasDep(deps, "vue")) {
      evidence.push("package.json (vue)");
      return { framework: "vue", evidence };
    }
    if (hasDep(deps, "svelte")) {
      evidence.push("package.json (svelte)");
      return { framework: "svelte", evidence };
    }
  }

  if (language === "python") {
    const pyproject = readJsonSafe(repoRoot, "pyproject.toml");
    // pyproject.toml is TOML not JSON, so readJsonSafe won't parse it.
    // Fall back to checking requirements.txt and common directories.
    if (fileExists(repoRoot, "manage.py")) {
      evidence.push("manage.py");
      return { framework: "django", evidence };
    }

    const reqPath = join(repoRoot, "requirements.txt");
    if (existsSync(reqPath)) {
      const reqs = readFileSync(reqPath, "utf-8").toLowerCase();
      if (reqs.includes("fastapi")) {
        evidence.push("requirements.txt (fastapi)");
        return { framework: "fastapi", evidence };
      }
      if (reqs.includes("flask")) {
        evidence.push("requirements.txt (flask)");
        return { framework: "flask", evidence };
      }
      if (reqs.includes("django")) {
        evidence.push("requirements.txt (django)");
        return { framework: "django", evidence };
      }
    }

    // Check pyproject.toml as text for dependencies
    const pyprojectPath = join(repoRoot, "pyproject.toml");
    if (existsSync(pyprojectPath)) {
      const content = readFileSync(pyprojectPath, "utf-8").toLowerCase();
      if (content.includes("fastapi")) {
        evidence.push("pyproject.toml (fastapi)");
        return { framework: "fastapi", evidence };
      }
      if (content.includes("flask")) {
        evidence.push("pyproject.toml (flask)");
        return { framework: "flask", evidence };
      }
      if (content.includes("django")) {
        evidence.push("pyproject.toml (django)");
        return { framework: "django", evidence };
      }
    }
  }

  if (language === "ruby" && fileExists(repoRoot, "Gemfile")) {
    const gemfile = readFileSync(join(repoRoot, "Gemfile"), "utf-8").toLowerCase();
    if (gemfile.includes("rails")) {
      evidence.push("Gemfile (rails)");
      return { framework: "rails", evidence };
    }
    if (gemfile.includes("sinatra")) {
      evidence.push("Gemfile (sinatra)");
      return { framework: "sinatra", evidence };
    }
  }

  // Go and Rust: no dominant framework detection for v1
  return { framework: null, evidence };
}

function detectTestRunner(repoRoot: string, language: OverlayName | null): { testRunner: string | null; evidence: string[] } {
  const evidence: string[] = [];

  if (language === "javascript") {
    if (fileExists(repoRoot, "vitest.config.ts") || fileExists(repoRoot, "vitest.config.js") || fileExists(repoRoot, "vitest.config.mts")) {
      evidence.push("vitest.config.*");
      return { testRunner: "vitest", evidence };
    }
    if (fileExists(repoRoot, "jest.config.ts") || fileExists(repoRoot, "jest.config.js") || fileExists(repoRoot, "jest.config.mjs")) {
      evidence.push("jest.config.*");
      return { testRunner: "jest", evidence };
    }
    const pkg = readJsonSafe(repoRoot, "package.json") as {
      devDependencies?: Record<string, string>;
      dependencies?: Record<string, string>;
    } | null;
    if (pkg) {
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (hasDep(deps, "vitest")) {
        evidence.push("package.json (vitest)");
        return { testRunner: "vitest", evidence };
      }
      if (hasDep(deps, "jest")) {
        evidence.push("package.json (jest)");
        return { testRunner: "jest", evidence };
      }
    }
  }

  if (language === "python") {
    if (fileExists(repoRoot, "pytest.ini") || fileExists(repoRoot, "conftest.py")) {
      evidence.push(fileExists(repoRoot, "pytest.ini") ? "pytest.ini" : "conftest.py");
      return { testRunner: "pytest", evidence };
    }
  }

  if (language === "go") {
    evidence.push("go.mod (built-in)");
    return { testRunner: "go-test", evidence };
  }

  if (language === "rust") {
    evidence.push("Cargo.toml (built-in)");
    return { testRunner: "cargo-test", evidence };
  }

  if (language === "ruby") {
    if (fileExists(repoRoot, ".rspec") || fileExists(repoRoot, "spec")) {
      evidence.push(fileExists(repoRoot, ".rspec") ? ".rspec" : "spec/");
      return { testRunner: "rspec", evidence };
    }
  }

  return { testRunner: null, evidence };
}

function detectLinter(repoRoot: string, language: OverlayName | null): { linter: string | null; evidence: string[] } {
  const evidence: string[] = [];

  if (language === "javascript") {
    if (fileExists(repoRoot, "biome.json") || fileExists(repoRoot, "biome.jsonc")) {
      evidence.push(fileExists(repoRoot, "biome.json") ? "biome.json" : "biome.jsonc");
      return { linter: "biome", evidence };
    }
    const eslintFiles = [".eslintrc.json", ".eslintrc.js", ".eslintrc.yml", ".eslintrc.cjs", "eslint.config.js", "eslint.config.mjs", "eslint.config.ts"];
    for (const f of eslintFiles) {
      if (fileExists(repoRoot, f)) {
        evidence.push(f);
        return { linter: "eslint", evidence };
      }
    }
  }

  if (language === "python") {
    if (fileExists(repoRoot, "ruff.toml") || fileExists(repoRoot, ".ruff.toml")) {
      evidence.push(fileExists(repoRoot, "ruff.toml") ? "ruff.toml" : ".ruff.toml");
      return { linter: "ruff", evidence };
    }
  }

  if (language === "go" && fileExists(repoRoot, ".golangci.yml")) {
    evidence.push(".golangci.yml");
    return { linter: "golangci-lint", evidence };
  }

  // Rust clippy is built-in, Ruby rubocop detected from Gemfile
  if (language === "rust") {
    return { linter: "clippy", evidence: ["Cargo.toml (built-in)"] };
  }

  if (language === "ruby" && fileExists(repoRoot, ".rubocop.yml")) {
    evidence.push(".rubocop.yml");
    return { linter: "rubocop", evidence };
  }

  return { linter: null, evidence };
}

function detectFormatter(repoRoot: string, language: OverlayName | null): { formatter: string | null; evidence: string[] } {
  const evidence: string[] = [];

  if (language === "javascript") {
    if (fileExists(repoRoot, ".prettierrc") || fileExists(repoRoot, ".prettierrc.json") || fileExists(repoRoot, "prettier.config.js") || fileExists(repoRoot, ".prettierrc.js")) {
      evidence.push(".prettierrc*");
      return { formatter: "prettier", evidence };
    }
    // Biome also formats
    if (fileExists(repoRoot, "biome.json") || fileExists(repoRoot, "biome.jsonc")) {
      evidence.push("biome.json (formatter)");
      return { formatter: "biome", evidence };
    }
  }

  if (language === "python") {
    // black or ruff format
    if (fileExists(repoRoot, "ruff.toml") || fileExists(repoRoot, ".ruff.toml")) {
      return { formatter: "ruff", evidence: ["ruff.toml (formatter)"] };
    }
    return { formatter: "black", evidence: ["default"] };
  }

  if (language === "go") {
    return { formatter: "gofmt", evidence: ["built-in"] };
  }

  if (language === "rust") {
    return { formatter: "rustfmt", evidence: ["built-in"] };
  }

  return { formatter: null, evidence };
}

/**
 * Inspect a repository and return a rich fingerprint of its tooling.
 */
export function inspectRepo(repoRoot: string): RepoFingerprint {
  const evidence: Record<string, string[]> = {};

  // Language detection (reuses existing detect.ts)
  const language = detectOverlay(repoRoot);
  if (language) {
    evidence.language = [language];
  }

  // Package manager
  const pm = detectPackageManager(repoRoot, language);
  if (pm.evidence.length > 0) evidence.packageManager = pm.evidence;

  // Framework
  const fw = detectFramework(repoRoot, language);
  if (fw.evidence.length > 0) evidence.framework = fw.evidence;

  // Test runner
  const tr = detectTestRunner(repoRoot, language);
  if (tr.evidence.length > 0) evidence.testRunner = tr.evidence;

  // Linter
  const lt = detectLinter(repoRoot, language);
  if (lt.evidence.length > 0) evidence.linter = lt.evidence;

  // Formatter
  const fmt = detectFormatter(repoRoot, language);
  if (fmt.evidence.length > 0) evidence.formatter = fmt.evidence;

  // Infrastructure
  const hasCI =
    fileExists(repoRoot, ".github/workflows") ||
    fileExists(repoRoot, ".gitlab-ci.yml") ||
    fileExists(repoRoot, ".circleci");
  if (hasCI) {
    const ciEvidence: string[] = [];
    if (fileExists(repoRoot, ".github/workflows")) ciEvidence.push(".github/workflows/");
    if (fileExists(repoRoot, ".gitlab-ci.yml")) ciEvidence.push(".gitlab-ci.yml");
    if (fileExists(repoRoot, ".circleci")) ciEvidence.push(".circleci/");
    evidence.ci = ciEvidence;
  }

  const hasDocker =
    fileExists(repoRoot, "Dockerfile") ||
    fileExists(repoRoot, "docker-compose.yml") ||
    fileExists(repoRoot, "docker-compose.yaml");
  if (hasDocker) {
    const dockerEvidence: string[] = [];
    if (fileExists(repoRoot, "Dockerfile")) dockerEvidence.push("Dockerfile");
    if (fileExists(repoRoot, "docker-compose.yml")) dockerEvidence.push("docker-compose.yml");
    if (fileExists(repoRoot, "docker-compose.yaml")) dockerEvidence.push("docker-compose.yaml");
    evidence.docker = dockerEvidence;
  }

  const hasDatabase =
    fileExists(repoRoot, "prisma") ||
    fileExists(repoRoot, "drizzle.config.ts") ||
    fileExists(repoRoot, "knexfile.js") ||
    fileExists(repoRoot, "alembic.ini");
  if (hasDatabase) {
    const dbEvidence: string[] = [];
    if (fileExists(repoRoot, "prisma")) dbEvidence.push("prisma/");
    if (fileExists(repoRoot, "drizzle.config.ts")) dbEvidence.push("drizzle.config.ts");
    if (fileExists(repoRoot, "knexfile.js")) dbEvidence.push("knexfile.js");
    if (fileExists(repoRoot, "alembic.ini")) dbEvidence.push("alembic.ini");
    evidence.database = dbEvidence;
  }

  // Existing Claude Code config
  const hasClaudeMd = fileExists(repoRoot, "CLAUDE.md");
  const hasMcpJson = fileExists(repoRoot, ".mcp.json");
  const hasSettings = fileExists(repoRoot, ".claude/settings.json");
  const hasHooks = hasSettings; // Hooks live inside settings.json

  return {
    language,
    packageManager: pm.pm,
    framework: fw.framework,
    testRunner: tr.testRunner,
    linter: lt.linter,
    formatter: fmt.formatter,
    hasCI,
    hasDocker,
    hasDatabase,
    hasClaudeMd,
    hasMcpJson,
    hasSettings,
    hasHooks,
    evidence,
  };
}

/**
 * Compute a stable hash of the fingerprint's tooling fields.
 * Excludes volatile fields (hasClaudeMd, hasMcpJson, hasSettings, hasHooks)
 * that change as a result of init/sync itself.
 */
export function hashFingerprint(fp: RepoFingerprint): string {
  const stable = {
    language: fp.language,
    packageManager: fp.packageManager,
    framework: fp.framework,
    testRunner: fp.testRunner,
    linter: fp.linter,
    formatter: fp.formatter,
    hasCI: fp.hasCI,
    hasDocker: fp.hasDocker,
    hasDatabase: fp.hasDatabase,
  };
  return createHash("sha256")
    .update(JSON.stringify(stable), "utf-8")
    .digest("hex")
    .slice(0, 16);
}
