import type { RepoFingerprint } from "../inspect.js";
import type { WizardAnswers } from "../wizard.js";
import type { ProfileLayer } from "../profile.js";
import { javascriptTemplate } from "./javascript.js";
import { pythonTemplate } from "./python.js";
import { goTemplate } from "./go.js";
import { rustTemplate } from "./rust.js";
import { rubyTemplate } from "./ruby.js";

export interface StackTemplate {
  name: string;
  match: (fp: RepoFingerprint) => boolean;
  priority: number;
  generate: (fp: RepoFingerprint, answers: WizardAnswers) => ProfileLayer;
}

const TEMPLATES: StackTemplate[] = [
  javascriptTemplate,
  pythonTemplate,
  goTemplate,
  rustTemplate,
  rubyTemplate,
];

/**
 * Find the best matching template for a repo fingerprint.
 * Returns null if no template matches (empty repo).
 */
export function findTemplate(fp: RepoFingerprint): StackTemplate | null {
  const matches = TEMPLATES
    .filter((t) => t.match(fp))
    .sort((a, b) => b.priority - a.priority);
  return matches[0] ?? null;
}

/**
 * Generate a generic fallback ProfileLayer for repos with no matching template.
 */
export function generateGenericLayer(
  _fp: RepoFingerprint,
  answers: WizardAnswers
): ProfileLayer {
  const sections: string[] = [
    "## Project Conventions",
    "",
    `- Code change approach: ${answers.codeChangeStyle}`,
  ];

  if (answers.testingRigor !== "minimal") {
    sections.push("- Write tests for new functionality");
  }
  if (answers.testingRigor === "strict") {
    sections.push("- All tests must pass before committing");
  }

  return {
    claudeMdSections: sections.join("\n"),
    hooksJson: null,
    settingsJson: null,
    mcpJson: null,
  };
}
