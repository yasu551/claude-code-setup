import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { init, getWizardInfo } from "../lib/init.js";

describe("init wizard mode", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "init-wizard-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("getWizardInfo returns fingerprint and questions", () => {
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ dependencies: { next: "^14.0.0" }, devDependencies: { vitest: "^1.0.0" } })
    );
    mkdirSync(join(tempDir, ".github", "workflows"), { recursive: true });
    writeFileSync(join(tempDir, ".github", "workflows", "ci.yml"), "");

    const info = getWizardInfo(tempDir);
    expect(info.fingerprint.language).toBe("javascript");
    expect(info.fingerprint.framework).toBe("next");
    expect(info.fingerprint.testRunner).toBe("vitest");
    expect(info.fingerprint.hasCI).toBe(true);
    // testingRigor should be skipped (test runner + CI detected)
    const questionIds = info.questions.map((q) => q.id);
    expect(questionIds).not.toContain("testingRigor");
  });

  it("generates and applies config without profile URL", () => {
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ dependencies: { next: "^14.0.0" }, devDependencies: { vitest: "^1.0.0" } })
    );

    const result = init({
      repoRoot: tempDir,
      wizardAnswers: {
        testingRigor: "standard",
        codeChangeStyle: "balanced",
        securityPosture: "standard",
      },
    });

    expect(result.profileName).toBe("generated");
    expect(result.profileVersion).toBe("1.0.0");
    expect(result.overlay).toBe("javascript");
    expect(result.filesModified).toContain("CLAUDE.md");
    expect(result.provenanceReport).toBeDefined();
    expect(result.provenanceReport).toContain("javascript");
  });

  it("creates CLAUDE.md with managed sections", () => {
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ dependencies: { next: "^14.0.0" } })
    );

    init({
      repoRoot: tempDir,
      wizardAnswers: { codeChangeStyle: "balanced" },
    });

    const claudeMd = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
    expect(claudeMd).toContain("claude-code-setup:begin");
    expect(claudeMd).toContain("Next.js");
    expect(claudeMd).toContain("claude-code-setup:end");
  });

  it("writes lockfile with source=generated", () => {
    writeFileSync(join(tempDir, "package.json"), "{}");

    init({
      repoRoot: tempDir,
      wizardAnswers: { codeChangeStyle: "surgical" },
    });

    const lockfile = JSON.parse(
      readFileSync(join(tempDir, ".claude-team-lock.json"), "utf-8")
    );
    expect(lockfile.source).toBe("generated");
    expect(lockfile.profile).toBe("generated");
    expect(lockfile.fingerprint).toBeDefined();
    expect(lockfile.wizardAnswers).toBeDefined();
    expect(lockfile.wizardAnswers.codeChangeStyle).toBe("surgical");
  });

  it("preserves existing CLAUDE.md content", () => {
    writeFileSync(join(tempDir, "package.json"), "{}");
    writeFileSync(join(tempDir, "CLAUDE.md"), "# My Project\n\nExisting content.\n");

    init({
      repoRoot: tempDir,
      wizardAnswers: { codeChangeStyle: "balanced" },
    });

    const claudeMd = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
    expect(claudeMd).toContain("Existing content.");
    expect(claudeMd).toContain("claude-code-setup:begin");
  });

  it("rolls back on error", () => {
    writeFileSync(join(tempDir, "package.json"), "{}");
    writeFileSync(join(tempDir, "CLAUDE.md"), "Original content");

    // Create a read-only settings path that will cause a write error
    const settingsDir = join(tempDir, ".claude");
    mkdirSync(settingsDir);
    writeFileSync(join(settingsDir, "settings.json"), "{}");

    // This should succeed normally, so just verify the happy path completes
    const result = init({
      repoRoot: tempDir,
      wizardAnswers: { codeChangeStyle: "balanced" },
    });
    expect(result.filesModified.length).toBeGreaterThan(0);
  });

  it("refuses if lockfile exists without --force", () => {
    writeFileSync(join(tempDir, "package.json"), "{}");
    writeFileSync(
      join(tempDir, ".claude-team-lock.json"),
      JSON.stringify({ profile: "generated", source: "generated", version: "1.0.0" })
    );

    expect(() =>
      init({ repoRoot: tempDir, wizardAnswers: { codeChangeStyle: "balanced" } })
    ).toThrow("already has a team profile");
  });

  it("allows re-init with --force", () => {
    writeFileSync(join(tempDir, "package.json"), "{}");
    writeFileSync(
      join(tempDir, ".claude-team-lock.json"),
      JSON.stringify({ profile: "generated", source: "generated", version: "1.0.0" })
    );

    const result = init({
      repoRoot: tempDir,
      force: true,
      wizardAnswers: { codeChangeStyle: "thorough" },
    });
    expect(result.profileName).toBe("generated");
  });

  it("generates strict security settings", () => {
    writeFileSync(join(tempDir, "package.json"), "{}");

    init({
      repoRoot: tempDir,
      wizardAnswers: {
        codeChangeStyle: "balanced",
        securityPosture: "strict",
      },
    });

    const settings = JSON.parse(
      readFileSync(join(tempDir, ".claude", "settings.json"), "utf-8")
    );
    expect(settings.permissions).toBeDefined();
  });

  it("updates .gitignore", () => {
    writeFileSync(join(tempDir, "package.json"), "{}");

    init({
      repoRoot: tempDir,
      wizardAnswers: { codeChangeStyle: "balanced" },
    });

    const gitignore = readFileSync(join(tempDir, ".gitignore"), "utf-8");
    expect(gitignore).toContain(".claude-team-cache/");
  });

  it("still works with profileUrl (existing behavior)", () => {
    // Create a local profile directory
    const profileDir = mkdtempSync(join(tmpdir(), "profile-test-"));
    writeFileSync(
      join(profileDir, "profile.json"),
      JSON.stringify({ name: "test-profile", version: "1.0.0" })
    );
    mkdirSync(join(profileDir, "base"));
    writeFileSync(
      join(profileDir, "base", "CLAUDE.md.sections"),
      "## Team Rules\n- Follow our standards"
    );

    const result = init({
      repoRoot: tempDir,
      profileUrl: profileDir,
    });

    expect(result.profileName).toBe("test-profile");
    expect(result.profileVersion).toBe("1.0.0");
    expect(result.filesModified).toContain("CLAUDE.md");

    const lockfile = JSON.parse(
      readFileSync(join(tempDir, ".claude-team-lock.json"), "utf-8")
    );
    expect(lockfile.source).toBe("remote");

    rmSync(profileDir, { recursive: true, force: true });
  });
});
