import type { StackTemplate } from "./index.js";
import type { RepoFingerprint } from "../inspect.js";
import type { WizardAnswers } from "../wizard.js";
import type { ProfileLayer } from "../profile.js";

function generateLayer(fp: RepoFingerprint, answers: WizardAnswers): ProfileLayer {
  const sections: string[] = [
    "## Go Conventions",
    "",
    "- Follow Effective Go guidelines",
    "- Use `gofmt` for formatting (non-negotiable)",
    "- Handle errors explicitly — no blank `_` for error returns",
    "- Use table-driven tests",
  ];

  sections.push("");
  sections.push("## Testing", "");
  sections.push("- Test runner: `go test ./...`");
  if (answers.testingRigor === "strict") {
    sections.push("- All new code must have tests");
    sections.push("- Run `go test ./...` before committing");
    sections.push("- Use `go vet ./...` for static analysis");
  } else if (answers.testingRigor === "standard") {
    sections.push("- Write tests for new features and bug fixes");
  }

  if (fp.linter) {
    sections.push("");
    sections.push("## Code Quality", "");
    sections.push(`- Linter: ${fp.linter} (\`golangci-lint run\`)`);
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

export const goTemplate: StackTemplate = {
  name: "go",
  match: (fp) => fp.language === "go",
  priority: 10,
  generate: generateLayer,
};
