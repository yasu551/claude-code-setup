import type { StackTemplate } from "./index.js";
import type { RepoFingerprint } from "../inspect.js";
import type { WizardAnswers } from "../wizard.js";
import type { ProfileLayer } from "../profile.js";

function generateLayer(fp: RepoFingerprint, answers: WizardAnswers): ProfileLayer {
  const sections: string[] = [];

  // Framework-specific conventions
  if (fp.framework === "next") {
    sections.push(
      "## Next.js Conventions",
      "",
      "- Use the App Router (app/) for new pages unless the project uses Pages Router",
      "- Prefer Server Components by default; use 'use client' only when needed",
      "- Use Next.js built-in Image, Link, and Font components",
    );
  } else if (fp.framework === "react") {
    sections.push(
      "## React Conventions",
      "",
      "- Use functional components with hooks",
      "- Prefer composition over inheritance",
    );
  } else {
    sections.push("## JavaScript/TypeScript Conventions", "");
  }

  // TypeScript
  sections.push("- TypeScript strict mode is expected");

  // Testing
  if (fp.testRunner) {
    sections.push("");
    sections.push("## Testing", "");
    const testCmd = fp.testRunner === "vitest" ? "npx vitest run" : "npx jest";
    sections.push(`- Test runner: ${fp.testRunner} (\`${testCmd}\`)`);
    if (answers.testingRigor === "strict") {
      sections.push("- All new code must have tests");
      sections.push("- Run tests before committing");
    } else if (answers.testingRigor === "standard") {
      sections.push("- Write tests for new features and bug fixes");
    }
  }

  // Linting
  if (fp.linter) {
    sections.push("");
    sections.push("## Code Quality", "");
    const lintCmd =
      fp.linter === "eslint" ? "npx eslint ." :
      fp.linter === "biome" ? "npx biome check ." : `npx ${fp.linter}`;
    sections.push(`- Linter: ${fp.linter} (\`${lintCmd}\`)`);
    if (fp.formatter) {
      sections.push(`- Formatter: ${fp.formatter}`);
    }
    sections.push("- Fix lint errors before committing");
  }

  // Code change style
  sections.push("");
  sections.push("## Code Changes", "");
  if (answers.codeChangeStyle === "surgical") {
    sections.push("- Make minimal, targeted changes — only modify what is explicitly asked");
  } else if (answers.codeChangeStyle === "thorough") {
    sections.push("- When fixing an issue, also improve closely related code if it benefits readability or correctness");
  } else {
    sections.push("- Fix the issue and closely related improvements, but don't refactor unrelated code");
  }

  // Hooks
  const hooks: Record<string, unknown> = {};
  if (fp.linter && answers.testingRigor !== "minimal") {
    const lintCmd =
      fp.linter === "eslint" ? "npx eslint --max-warnings 0 ." :
      fp.linter === "biome" ? "npx biome check ." : `npx ${fp.linter}`;

    hooks.PreToolUse = [
      {
        matcher: "Bash",
        hooks: [
          {
            type: "command",
            command: `echo "Remember to run lint: ${lintCmd}"`,
          },
        ],
      },
    ];
  }

  // Settings
  const settings: Record<string, unknown> = {};
  if (answers.securityPosture === "strict") {
    settings.permissions = {
      allow: ["Read", "Glob", "Grep"],
      deny: ["Bash"],
    };
  }

  return {
    claudeMdSections: sections.join("\n"),
    hooksJson: Object.keys(hooks).length > 0 ? hooks : null,
    settingsJson: Object.keys(settings).length > 0 ? settings : null,
    mcpJson: null,
  };
}

export const javascriptTemplate: StackTemplate = {
  name: "javascript",
  match: (fp) => fp.language === "javascript",
  priority: 10,
  generate: generateLayer,
};
