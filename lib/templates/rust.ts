import type { StackTemplate } from "./index.js";
import type { RepoFingerprint } from "../inspect.js";
import type { WizardAnswers } from "../wizard.js";
import type { ProfileLayer } from "../profile.js";

function generateLayer(_fp: RepoFingerprint, answers: WizardAnswers): ProfileLayer {
  const sections: string[] = [
    "## Rust Conventions",
    "",
    "- Use `cargo fmt` for formatting",
    "- Use `cargo clippy` for linting — address all warnings",
    "- Prefer owned types in public APIs unless lifetime is clearly beneficial",
    "- Use `Result` and `?` for error handling — avoid `unwrap()` in production code",
  ];

  sections.push("");
  sections.push("## Testing", "");
  sections.push("- Test runner: `cargo test`");
  if (answers.testingRigor === "strict") {
    sections.push("- All new code must have tests");
    sections.push("- Run `cargo test` and `cargo clippy` before committing");
  } else if (answers.testingRigor === "standard") {
    sections.push("- Write tests for new features and bug fixes");
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

export const rustTemplate: StackTemplate = {
  name: "rust",
  match: (fp) => fp.language === "rust",
  priority: 10,
  generate: generateLayer,
};
