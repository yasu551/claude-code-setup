import { describe, it, expect } from "vitest";
import { getWizardQuestions, resolveAnswers } from "../lib/wizard.js";
import type { RepoFingerprint } from "../lib/inspect.js";

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

describe("getWizardQuestions", () => {
  it("returns all 3 questions for empty fingerprint", () => {
    const fp = makeFingerprint();
    const questions = getWizardQuestions(fp);
    expect(questions).toHaveLength(3);
    expect(questions.map((q) => q.id)).toEqual([
      "testingRigor",
      "codeChangeStyle",
      "securityPosture",
    ]);
  });

  it("skips testingRigor when test runner + CI detected", () => {
    const fp = makeFingerprint({ testRunner: "vitest", hasCI: true });
    const questions = getWizardQuestions(fp);
    const ids = questions.map((q) => q.id);
    expect(ids).not.toContain("testingRigor");
  });

  it("skips testingRigor when test runner detected (infers standard)", () => {
    const fp = makeFingerprint({ testRunner: "vitest", hasCI: false });
    const questions = getWizardQuestions(fp);
    const ids = questions.map((q) => q.id);
    // testRunner alone infers "standard", so question is skipped
    expect(ids).not.toContain("testingRigor");
  });

  it("always asks codeChangeStyle (cannot be inferred)", () => {
    const fp = makeFingerprint({
      testRunner: "vitest",
      hasCI: true,
      hasMcpJson: true,
    });
    const questions = getWizardQuestions(fp);
    const ids = questions.map((q) => q.id);
    expect(ids).toContain("codeChangeStyle");
  });

  it("skips securityPosture when .mcp.json exists", () => {
    const fp = makeFingerprint({ hasMcpJson: true });
    const questions = getWizardQuestions(fp);
    const ids = questions.map((q) => q.id);
    expect(ids).not.toContain("securityPosture");
  });
});

describe("resolveAnswers", () => {
  it("uses inferred values when no user answers provided", () => {
    const fp = makeFingerprint({ testRunner: "vitest", hasCI: true, hasMcpJson: true });
    const answers = resolveAnswers(fp, {});
    expect(answers.testingRigor).toBe("strict");
    expect(answers.securityPosture).toBe("standard");
    // codeChangeStyle defaults to middle option (balanced)
    expect(answers.codeChangeStyle).toBe("balanced");
  });

  it("user answers override inferences", () => {
    const fp = makeFingerprint({ testRunner: "vitest", hasCI: true });
    const answers = resolveAnswers(fp, { testingRigor: "minimal" });
    expect(answers.testingRigor).toBe("minimal");
  });

  it("defaults to middle option when no inference and no user answer", () => {
    const fp = makeFingerprint();
    const answers = resolveAnswers(fp, {});
    expect(answers.testingRigor).toBe("standard");
    expect(answers.codeChangeStyle).toBe("balanced");
    expect(answers.securityPosture).toBe("standard");
  });

  it("handles partial user answers", () => {
    const fp = makeFingerprint();
    const answers = resolveAnswers(fp, { securityPosture: "strict" });
    expect(answers.securityPosture).toBe("strict");
    expect(answers.testingRigor).toBe("standard"); // default
    expect(answers.codeChangeStyle).toBe("balanced"); // default
  });
});
