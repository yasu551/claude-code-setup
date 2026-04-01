import { describe, it, expect } from "vitest";
import {
  getProfileWizardQuestions,
  resolveProfileAnswers,
  SUPPORTED_OVERLAYS,
} from "../lib/wizard.js";
import type { ProfileWizardAnswers } from "../lib/wizard.js";

describe("getProfileWizardQuestions", () => {
  it("returns 5 questions (3 shared + 2 team convention)", () => {
    const questions = getProfileWizardQuestions();
    expect(questions).toHaveLength(5);
    expect(questions.map((q) => q.id)).toEqual([
      "testingRigor",
      "codeChangeStyle",
      "securityPosture",
      "commitStyle",
      "documentationLevel",
    ]);
  });

  it("all questions should always be asked", () => {
    const questions = getProfileWizardQuestions();
    for (const q of questions) {
      expect(q.shouldAsk()).toBe(true);
    }
  });

  it("no questions can be inferred", () => {
    const questions = getProfileWizardQuestions();
    for (const q of questions) {
      expect(q.inferAnswer()).toBeNull();
    }
  });
});

describe("resolveProfileAnswers", () => {
  it("resolves full answers with defaults", () => {
    const answers = resolveProfileAnswers({ overlays: ["javascript"] });
    expect(answers.testingRigor).toBe("standard");
    expect(answers.codeChangeStyle).toBe("balanced");
    expect(answers.securityPosture).toBe("standard");
    expect(answers.commitStyle).toBe("conventional");
    expect(answers.documentationLevel).toBe("standard");
    expect(answers.overlays).toEqual(["javascript"]);
  });

  it("respects explicit user answers", () => {
    const answers = resolveProfileAnswers({
      testingRigor: "strict",
      codeChangeStyle: "surgical",
      securityPosture: "strict",
      commitStyle: "freeform",
      documentationLevel: "comprehensive",
      overlays: ["python", "go"],
    });
    expect(answers.testingRigor).toBe("strict");
    expect(answers.commitStyle).toBe("freeform");
    expect(answers.documentationLevel).toBe("comprehensive");
    expect(answers.overlays).toEqual(["python", "go"]);
  });

  it("throws if no overlays selected", () => {
    expect(() => resolveProfileAnswers({ overlays: [] }))
      .toThrow("At least one language overlay must be selected.");
  });

  it("throws if overlays omitted entirely", () => {
    expect(() => resolveProfileAnswers({}))
      .toThrow("At least one language overlay must be selected.");
  });
});

describe("SUPPORTED_OVERLAYS", () => {
  it("contains all 5 languages", () => {
    expect(SUPPORTED_OVERLAYS).toEqual([
      "javascript",
      "python",
      "go",
      "rust",
      "ruby",
    ]);
  });
});
