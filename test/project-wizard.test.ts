import { describe, it, expect } from "vitest";
import {
  getProjectWizardQuestions,
  resolveProjectAnswers,
  getFrameworkOptions,
  validateProjectName,
} from "../lib/wizard.js";
import type { ProjectWizardAnswers } from "../lib/wizard.js";

describe("getProjectWizardQuestions", () => {
  it("returns 8 questions", () => {
    const questions = getProjectWizardQuestions();
    expect(questions).toHaveLength(8);
    expect(questions.map((q) => q.id)).toEqual([
      "projectName",
      "projectDescription",
      "systemType",
      "language",
      "framework",
      "persistence",
      "testingRigor",
      "securityPosture",
    ]);
  });

  it("framework question should not ask for CLI systemType", () => {
    const questions = getProjectWizardQuestions();
    const frameworkQ = questions.find((q) => q.id === "framework")!;
    expect(frameworkQ.shouldAsk({ systemType: "cli", language: "javascript" })).toBe(false);
  });

  it("framework question should not ask for library systemType", () => {
    const questions = getProjectWizardQuestions();
    const frameworkQ = questions.find((q) => q.id === "framework")!;
    expect(frameworkQ.shouldAsk({ systemType: "library", language: "python" })).toBe(false);
  });

  it("framework question should ask for API + javascript", () => {
    const questions = getProjectWizardQuestions();
    const frameworkQ = questions.find((q) => q.id === "framework")!;
    expect(frameworkQ.shouldAsk({ systemType: "api", language: "javascript" })).toBe(true);
  });

  it("persistence question skips for library and CLI", () => {
    const questions = getProjectWizardQuestions();
    const persistenceQ = questions.find((q) => q.id === "persistence")!;
    expect(persistenceQ.shouldAsk({ systemType: "library" })).toBe(false);
    expect(persistenceQ.shouldAsk({ systemType: "cli" })).toBe(false);
    expect(persistenceQ.shouldAsk({ systemType: "api" })).toBe(true);
  });
});

describe("getFrameworkOptions", () => {
  it("returns options for javascript + api", () => {
    const options = getFrameworkOptions("javascript", "api");
    expect(options.length).toBeGreaterThan(0);
    const values = options.map((o) => o.value);
    expect(values).toContain("express");
    expect(values).toContain("fastify");
    expect(values).toContain("hono");
  });

  it("returns options for python + api", () => {
    const options = getFrameworkOptions("python", "api");
    const values = options.map((o) => o.value);
    expect(values).toContain("fastapi");
    expect(values).toContain("flask");
  });

  it("returns options for go + api", () => {
    const options = getFrameworkOptions("go", "api");
    const values = options.map((o) => o.value);
    expect(values).toContain("gin");
    expect(values).toContain("echo");
    expect(values).toContain("chi");
  });

  it("returns empty array for cli (no framework options)", () => {
    const options = getFrameworkOptions("javascript", "cli");
    expect(options).toEqual([]);
  });

  it("returns options for rust + api", () => {
    const options = getFrameworkOptions("rust", "api");
    const values = options.map((o) => o.value);
    expect(values).toContain("actix");
    expect(values).toContain("axum");
  });
});

describe("validateProjectName", () => {
  it("validates JavaScript project names", () => {
    expect(validateProjectName("my-app", "javascript").valid).toBe(true);
    expect(validateProjectName("my_app", "javascript").valid).toBe(true);
    expect(validateProjectName("My-App", "javascript").valid).toBe(false);
    expect(validateProjectName("", "javascript").valid).toBe(false);
  });

  it("validates Python project names", () => {
    expect(validateProjectName("my_app", "python").valid).toBe(true);
    expect(validateProjectName("my-app", "python").valid).toBe(false);
    expect(validateProjectName("MyApp", "python").valid).toBe(false);
  });

  it("validates Go project names", () => {
    expect(validateProjectName("my-app", "go").valid).toBe(true);
    expect(validateProjectName("my_app", "go").valid).toBe(false);
  });

  it("validates Rust project names", () => {
    expect(validateProjectName("my-app", "rust").valid).toBe(true);
    expect(validateProjectName("my_app", "rust").valid).toBe(false);
  });

  it("validates Ruby project names", () => {
    expect(validateProjectName("my-app", "ruby").valid).toBe(true);
    expect(validateProjectName("my_app", "ruby").valid).toBe(true);
  });
});

describe("resolveProjectAnswers", () => {
  it("resolves valid answers", () => {
    const answers = resolveProjectAnswers({
      projectName: "my-app",
      projectDescription: "A test app",
      systemType: "api",
      language: "javascript",
      framework: "express",
      persistence: "sql",
      testingRigor: "strict",
      securityPosture: "standard",
    });
    expect(answers.projectName).toBe("my-app");
    expect(answers.language).toBe("javascript");
    expect(answers.framework).toBe("express");
    expect(answers.codeChangeStyle).toBe("balanced"); // defaulted
  });

  it("throws on missing language", () => {
    expect(() =>
      resolveProjectAnswers({ projectName: "test" })
    ).toThrow("Invalid language");
  });

  it("throws on empty project name", () => {
    expect(() =>
      resolveProjectAnswers({ projectName: "", language: "javascript" })
    ).toThrow("Project name cannot be empty");
  });

  it("throws on invalid project name for language", () => {
    expect(() =>
      resolveProjectAnswers({ projectName: "My App", language: "javascript" })
    ).toThrow("Invalid project name");
  });

  it("throws on invalid framework for language/systemType combo", () => {
    expect(() =>
      resolveProjectAnswers({
        projectName: "my-app",
        language: "javascript",
        systemType: "api",
        framework: "django", // wrong language
      })
    ).toThrow('Invalid framework "django"');
  });

  it("allows null framework", () => {
    const answers = resolveProjectAnswers({
      projectName: "my-app",
      language: "javascript",
      systemType: "cli",
    });
    expect(answers.framework).toBeNull();
  });

  it("defaults persistence to none", () => {
    const answers = resolveProjectAnswers({
      projectName: "my-app",
      language: "javascript",
      systemType: "api",
    });
    expect(answers.persistence).toBe("none");
  });

  it("converts empty string framework to null", () => {
    const answers = resolveProjectAnswers({
      projectName: "my-app",
      language: "javascript",
      systemType: "api",
      framework: "",
    });
    expect(answers.framework).toBeNull();
  });
});
