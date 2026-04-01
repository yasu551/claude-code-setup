import type { StackTemplate } from "./index.js";
import type { RepoFingerprint } from "../inspect.js";
import type { WizardAnswers } from "../wizard.js";
import type { ProfileLayer } from "../profile.js";

function generateLayer(fp: RepoFingerprint, answers: WizardAnswers): ProfileLayer {
  const sections: string[] = [];

  if (fp.framework === "rails") {
    sections.push(
      "## Rails Conventions",
      "",
      "- Follow Rails conventions (CoC, DRY)",
      "- Use Active Record for database access",
      "- Use Strong Parameters for mass assignment protection",
      "- Place business logic in models or service objects, not controllers",
    );
  } else {
    sections.push("## Ruby Conventions", "");
  }

  sections.push("- Follow Ruby Style Guide");

  if (fp.testRunner) {
    sections.push("");
    sections.push("## Testing", "");
    const testCmd = fp.testRunner === "rspec" ? "bundle exec rspec" : "bundle exec rake test";
    sections.push(`- Test runner: ${fp.testRunner} (\`${testCmd}\`)`);
    if (answers.testingRigor === "strict") {
      sections.push("- All new code must have tests");
      sections.push("- Run tests before committing");
    } else if (answers.testingRigor === "standard") {
      sections.push("- Write tests for new features and bug fixes");
    }
  }

  if (fp.linter) {
    sections.push("");
    sections.push("## Code Quality", "");
    sections.push(`- Linter: ${fp.linter} (\`bundle exec rubocop\`)`);
  }

  sections.push("");
  sections.push("## Code Changes", "");
  if (answers.codeChangeStyle === "surgical") {
    sections.push("- Make minimal, targeted changes — only modify what is explicitly asked");
  } else if (answers.codeChangeStyle === "thorough") {
    sections.push("- When fixing an issue, also improve closely related code if it benefits readability or correctness");
  } else {
    sections.push("- Fix the issue and closely related improvements, but don't refactor unrelated code");
  }

  return {
    claudeMdSections: sections.join("\n"),
    hooksJson: null,
    settingsJson: null,
    mcpJson: null,
  };
}

export const rubyTemplate: StackTemplate = {
  name: "ruby",
  match: (fp) => fp.language === "ruby",
  priority: 10,
  generate: generateLayer,
};
