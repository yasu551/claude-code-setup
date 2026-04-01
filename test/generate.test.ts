import { describe, it, expect } from "vitest";
import { generateProfile, formatProvenanceReport } from "../lib/generate.js";
import type { RepoFingerprint } from "../lib/inspect.js";
import type { WizardAnswers } from "../lib/wizard.js";

function makeFingerprint(overrides: Partial<RepoFingerprint> = {}): RepoFingerprint {
  return {
    language: null,
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
    ...overrides,
  };
}

const DEFAULT_ANSWERS: WizardAnswers = {
  testingRigor: "standard",
  codeChangeStyle: "balanced",
  securityPosture: "standard",
};

describe("generateProfile", () => {
  it("generates a JavaScript profile with CLAUDE.md sections", () => {
    const fp = makeFingerprint({
      language: "javascript",
      framework: "next",
      testRunner: "vitest",
      linter: "eslint",
      evidence: {
        framework: ["package.json (next)"],
        testRunner: ["vitest.config.ts"],
        linter: ["eslint.config.js"],
      },
    });

    const result = generateProfile(fp, DEFAULT_ANSWERS);
    expect(result.layer.claudeMdSections).toContain("Next.js");
    expect(result.layer.claudeMdSections).toContain("vitest");
    expect(result.layer.claudeMdSections).toContain("eslint");
  });

  it("generates a Python profile", () => {
    const fp = makeFingerprint({
      language: "python",
      framework: "fastapi",
      evidence: { framework: ["requirements.txt (fastapi)"] },
    });

    const result = generateProfile(fp, DEFAULT_ANSWERS);
    expect(result.layer.claudeMdSections).toContain("FastAPI");
  });

  it("generates a Go profile", () => {
    const fp = makeFingerprint({ language: "go", testRunner: "go-test" });
    const result = generateProfile(fp, DEFAULT_ANSWERS);
    expect(result.layer.claudeMdSections).toContain("Go");
    expect(result.layer.claudeMdSections).toContain("go test");
  });

  it("generates a Rust profile", () => {
    const fp = makeFingerprint({ language: "rust", testRunner: "cargo-test" });
    const result = generateProfile(fp, DEFAULT_ANSWERS);
    expect(result.layer.claudeMdSections).toContain("Rust");
    expect(result.layer.claudeMdSections).toContain("cargo test");
  });

  it("generates a Ruby/Rails profile", () => {
    const fp = makeFingerprint({
      language: "ruby",
      framework: "rails",
      testRunner: "rspec",
      evidence: { framework: ["Gemfile (rails)"] },
    });
    const result = generateProfile(fp, DEFAULT_ANSWERS);
    expect(result.layer.claudeMdSections).toContain("Rails");
  });

  it("generates a generic profile for unknown language", () => {
    const fp = makeFingerprint();
    const result = generateProfile(fp, DEFAULT_ANSWERS);
    expect(result.layer.claudeMdSections).toContain("Project Conventions");
  });

  it("includes provenance entries for detected tooling", () => {
    const fp = makeFingerprint({
      language: "javascript",
      framework: "next",
      testRunner: "vitest",
      linter: "eslint",
      evidence: {
        framework: ["package.json (next)"],
        testRunner: ["vitest.config.ts"],
        linter: ["eslint.config.js"],
      },
    });

    const result = generateProfile(fp, DEFAULT_ANSWERS);
    expect(result.provenance.length).toBeGreaterThan(0);

    const targets = result.provenance.map((p) => p.target);
    expect(targets).toContain("CLAUDE.md");
  });

  it("includes hooks for strict testing with linter", () => {
    const fp = makeFingerprint({
      language: "javascript",
      linter: "eslint",
      testRunner: "vitest",
    });

    const result = generateProfile(fp, {
      ...DEFAULT_ANSWERS,
      testingRigor: "standard",
    });
    expect(result.layer.hooksJson).not.toBe(null);
  });

  it("includes settings for strict security posture", () => {
    const fp = makeFingerprint({ language: "javascript" });

    const result = generateProfile(fp, {
      ...DEFAULT_ANSWERS,
      securityPosture: "strict",
    });
    expect(result.layer.settingsJson).not.toBe(null);
  });

  it("respects surgical code change style in CLAUDE.md", () => {
    const fp = makeFingerprint({ language: "javascript" });
    const result = generateProfile(fp, {
      ...DEFAULT_ANSWERS,
      codeChangeStyle: "surgical",
    });
    expect(result.layer.claudeMdSections).toContain("minimal, targeted changes");
  });

  it("respects thorough code change style in CLAUDE.md", () => {
    const fp = makeFingerprint({ language: "javascript" });
    const result = generateProfile(fp, {
      ...DEFAULT_ANSWERS,
      codeChangeStyle: "thorough",
    });
    expect(result.layer.claudeMdSections).toContain("improve closely related code");
  });
});

describe("formatProvenanceReport", () => {
  it("formats a readable report", () => {
    const fp = makeFingerprint({
      language: "javascript",
      framework: "next",
      testRunner: "vitest",
      linter: "eslint",
      hasCI: true,
    });
    const provenance = [
      {
        target: "CLAUDE.md" as const,
        rule: "Next.js conventions added",
        reason: "Detected from package.json (next)",
      },
    ];

    const report = formatProvenanceReport(
      fp,
      DEFAULT_ANSWERS,
      provenance,
      ["CLAUDE.md", ".claude/settings.json"]
    );

    expect(report).toContain("javascript");
    expect(report).toContain("next");
    expect(report).toContain("vitest");
    expect(report).toContain("eslint");
    expect(report).toContain("CI");
    expect(report).toContain("CLAUDE.md");
    expect(report).toContain("Next.js conventions added");
  });
});
