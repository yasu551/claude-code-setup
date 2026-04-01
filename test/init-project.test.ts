import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { init, getWizardInfo, getProjectWizardInfo } from "../lib/init.js";
import { resolveProjectAnswers } from "../lib/wizard.js";
import type { ProjectWizardAnswers } from "../lib/wizard.js";
import { inspectRepo } from "../lib/inspect.js";

function makeAnswers(overrides: Partial<ProjectWizardAnswers> = {}): ProjectWizardAnswers {
  return {
    testingRigor: "standard",
    codeChangeStyle: "balanced",
    securityPosture: "standard",
    systemType: "api",
    language: "javascript",
    framework: "express",
    persistence: "none",
    projectName: "my-app",
    projectDescription: "A test app",
    ...overrides,
  };
}

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "init-project-test-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("init with project creation", () => {
  it("detects empty repo", () => {
    const info = getWizardInfo(tempDir);
    expect(info.isEmptyRepo).toBe(true);
  });

  it("returns project wizard questions", () => {
    const info = getProjectWizardInfo();
    expect(info.questions.length).toBeGreaterThan(0);
    expect(info.questions.map((q) => q.id)).toContain("systemType");
    expect(info.questions.map((q) => q.id)).toContain("language");
  });

  it("creates project with DESIGN.md, CLAUDE.md, and scaffold", () => {
    const result = init({
      repoRoot: tempDir,
      projectWizardAnswers: makeAnswers(),
    });

    expect(result.projectCreation).toBe(true);
    expect(result.designDocPath).toBe("DESIGN.md");
    expect(result.overlay).toBe("javascript");

    // DESIGN.md exists
    expect(existsSync(join(tempDir, "DESIGN.md"))).toBe(true);
    const design = readFileSync(join(tempDir, "DESIGN.md"), "utf-8");
    expect(design).toContain("# my-app");

    // CLAUDE.md exists with DESIGN.md reference
    expect(existsSync(join(tempDir, "CLAUDE.md"))).toBe(true);
    const claudeMd = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
    expect(claudeMd).toContain("DESIGN.md");

    // Scaffold files exist
    expect(existsSync(join(tempDir, "package.json"))).toBe(true);
    expect(existsSync(join(tempDir, "src/index.ts"))).toBe(true);

    // Lockfile exists
    expect(existsSync(join(tempDir, ".claude-team-lock.json"))).toBe(true);
    const lockfile = JSON.parse(readFileSync(join(tempDir, ".claude-team-lock.json"), "utf-8"));
    expect(lockfile.source).toBe("generated");
  });

  it("round-trip: scaffold → inspectRepo detects same language", () => {
    init({
      repoRoot: tempDir,
      projectWizardAnswers: makeAnswers({ language: "javascript" }),
    });

    const fp = inspectRepo(tempDir);
    expect(fp.language).toBe("javascript");
  });

  it("round-trip: Go scaffold → inspectRepo detects go", () => {
    init({
      repoRoot: tempDir,
      projectWizardAnswers: makeAnswers({ language: "go", framework: "gin" }),
    });

    const fp = inspectRepo(tempDir);
    expect(fp.language).toBe("go");
  });

  it("round-trip: Python scaffold → inspectRepo detects python", () => {
    init({
      repoRoot: tempDir,
      projectWizardAnswers: makeAnswers({
        language: "python",
        projectName: "my_app",
        framework: "fastapi",
      }),
    });

    const fp = inspectRepo(tempDir);
    expect(fp.language).toBe("python");
  });

  it("round-trip: Rust scaffold → inspectRepo detects rust", () => {
    init({
      repoRoot: tempDir,
      projectWizardAnswers: makeAnswers({ language: "rust", framework: "axum" }),
    });

    const fp = inspectRepo(tempDir);
    expect(fp.language).toBe("rust");
  });

  it("round-trip: Ruby scaffold → inspectRepo detects ruby", () => {
    init({
      repoRoot: tempDir,
      projectWizardAnswers: makeAnswers({
        language: "ruby",
        projectName: "my-app",
        framework: null,
        systemType: "library",
      }),
    });

    const fp = inspectRepo(tempDir);
    expect(fp.language).toBe("ruby");
  });

  it("existing init paths still work", () => {
    // Normal wizard path (non-empty repo simulated by writing package.json first)
    const { writeFileSync, mkdirSync } = require("node:fs");
    writeFileSync(join(tempDir, "package.json"), '{"name": "test"}');

    const result = init({
      repoRoot: tempDir,
      wizardAnswers: { testingRigor: "strict" },
    });

    expect(result.profileName).toBe("generated");
    expect(result.projectCreation).toBeUndefined();
    expect(result.profileCreation).toBeUndefined();
  });
});
