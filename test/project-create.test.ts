import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createProject } from "../lib/project-create.js";
import type { ProjectWizardAnswers } from "../lib/wizard.js";

function makeAnswers(overrides: Partial<ProjectWizardAnswers> = {}): ProjectWizardAnswers {
  return {
    testingRigor: "standard",
    codeChangeStyle: "balanced",
    securityPosture: "standard",
    systemType: "api",
    language: "javascript",
    framework: "express",
    persistence: "sql",
    projectName: "my-api",
    projectDescription: "A test API service",
    ...overrides,
  };
}

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "project-create-test-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("createProject", () => {
  it("creates DESIGN.md", () => {
    const result = createProject(tempDir, makeAnswers());
    expect(result.designDocPath).toBe("DESIGN.md");
    expect(existsSync(join(tempDir, "DESIGN.md"))).toBe(true);

    const content = readFileSync(join(tempDir, "DESIGN.md"), "utf-8");
    expect(content).toContain("# my-api");
    expect(content).toContain("A test API service");
    expect(content).toContain("## Architecture");
  });

  it("creates scaffold files", () => {
    const result = createProject(tempDir, makeAnswers());
    expect(result.filesWritten).toContain("DESIGN.md");
    expect(result.filesWritten).toContain("package.json");
    expect(result.filesWritten).toContain("src/index.ts");
  });

  it("returns layer with DESIGN.md reference in CLAUDE.md sections", () => {
    const result = createProject(tempDir, makeAnswers());
    expect(result.layer.claudeMdSections).toContain("DESIGN.md");
    expect(result.layer.claudeMdSections).toContain("architecture blueprint");
  });

  it("returns synthetic fingerprint with correct language", () => {
    const result = createProject(tempDir, makeAnswers({ language: "python", projectName: "my_app", framework: "fastapi" }));
    expect(result.syntheticFingerprint.language).toBe("python");
    expect(result.syntheticFingerprint.testRunner).toBe("pytest");
    expect(result.syntheticFingerprint.linter).toBe("ruff");
  });

  it("returns shared WizardAnswers subset", () => {
    const result = createProject(tempDir, makeAnswers({
      testingRigor: "strict",
      securityPosture: "relaxed",
    }));
    expect(result.sharedAnswers.testingRigor).toBe("strict");
    expect(result.sharedAnswers.securityPosture).toBe("relaxed");
    expect(result.sharedAnswers.codeChangeStyle).toBe("balanced");
  });

  it("returns provenance report", () => {
    const result = createProject(tempDir, makeAnswers());
    expect(result.provenanceReport).toContain("Project Created");
    expect(result.provenanceReport).toContain("my-api");
    expect(result.provenanceReport).toContain("DESIGN.md");
  });

  it("throws when project files already exist", () => {
    createProject(tempDir, makeAnswers());
    expect(() => createProject(tempDir, makeAnswers())).toThrow("already exists");
  });

  it("allows overwrite with --force", () => {
    createProject(tempDir, makeAnswers());
    const result = createProject(tempDir, makeAnswers(), { force: true });
    expect(result.designDocPath).toBe("DESIGN.md");
  });

  it("works for Go projects", () => {
    const result = createProject(tempDir, makeAnswers({
      language: "go",
      framework: "gin",
      projectName: "my-api",
    }));
    expect(existsSync(join(tempDir, "go.mod"))).toBe(true);
    expect(existsSync(join(tempDir, "DESIGN.md"))).toBe(true);
    expect(result.syntheticFingerprint.packageManager).toBe("go-modules");
  });

  it("works for Rust projects", () => {
    const result = createProject(tempDir, makeAnswers({
      language: "rust",
      framework: "axum",
      projectName: "my-api",
    }));
    expect(existsSync(join(tempDir, "Cargo.toml"))).toBe(true);
    expect(existsSync(join(tempDir, "DESIGN.md"))).toBe(true);
    expect(result.syntheticFingerprint.packageManager).toBe("cargo");
  });

  it("works for Ruby projects", () => {
    const result = createProject(tempDir, makeAnswers({
      language: "ruby",
      framework: null,
      systemType: "library",
      projectName: "my-gem",
    }));
    expect(existsSync(join(tempDir, "Gemfile"))).toBe(true);
    expect(existsSync(join(tempDir, "DESIGN.md"))).toBe(true);
    expect(result.syntheticFingerprint.packageManager).toBe("bundler");
  });
});
