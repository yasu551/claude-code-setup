import type { RepoFingerprint } from "./inspect.js";

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
