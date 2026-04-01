import type { StackTemplate } from "./index.js";
import type { RepoFingerprint } from "../inspect.js";
import type { WizardAnswers } from "../wizard.js";
import type { ProfileLayer } from "../profile.js";

function generateLayer(fp: RepoFingerprint, answers: WizardAnswers): ProfileLayer {
  const sections: string[] = [];

  if (fp.framework === "fastapi") {
    sections.push(
      "## FastAPI Conventions",
      "",
      "- Use Pydantic models for request/response validation",
      "- Use dependency injection for shared resources",
      "- Use async endpoints where appropriate",
    );
  } else if (fp.framework === "django") {
    sections.push(
      "## Django Conventions",
      "",
      "- Follow Django's MVT pattern",
      "- Use Django ORM for database access",
      "- Use class-based views for standard CRUD",
    );
  } else if (fp.framework === "flask") {
    sections.push(
      "## Flask Conventions",
      "",
      "- Use Blueprints for route organization",
    );
  } else {
    sections.push("## Python Conventions", "");
  }

  sections.push("- Use type hints for function signatures");
  sections.push("- Follow PEP 8 style guidelines");

  if (fp.testRunner) {
    sections.push("");
    sections.push("## Testing", "");
    const testCmd = fp.testRunner === "pytest" ? "pytest" : "python -m unittest";
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
    const lintCmd = fp.linter === "ruff" ? "ruff check ." : `${fp.linter} .`;
    sections.push(`- Linter: ${fp.linter} (\`${lintCmd}\`)`);
    if (fp.formatter) {
      const fmtCmd = fp.formatter === "ruff" ? "ruff format ." : `${fp.formatter} .`;
      sections.push(`- Formatter: ${fp.formatter} (\`${fmtCmd}\`)`);
    }
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

  const settings: Record<string, unknown> = {};
  if (answers.securityPosture === "strict") {
    settings.permissions = {
      allow: ["Read", "Glob", "Grep"],
      deny: ["Bash"],
    };
  }

  return {
    claudeMdSections: sections.join("\n"),
    hooksJson: null,
    settingsJson: Object.keys(settings).length > 0 ? settings : null,
    mcpJson: null,
  };
}

export const pythonTemplate: StackTemplate = {
  name: "python",
  match: (fp) => fp.language === "python",
  priority: 10,
  generate: generateLayer,
};
