import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scaffoldProject } from "../lib/project-scaffold.js";
import type { ProjectWizardAnswers } from "../lib/wizard.js";

function makeAnswers(overrides: Partial<ProjectWizardAnswers> = {}): ProjectWizardAnswers {
  return {
    testingRigor: "standard",
    codeChangeStyle: "balanced",
    securityPosture: "standard",
    systemType: "api",
    language: "javascript",
    framework: "express",
    persistence: "none",
    projectName: "my-app",
    projectDescription: "A test app",
    ...overrides,
  };
}

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "scaffold-test-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("scaffoldProject", () => {
  // Detection trigger files per language
  describe("detection trigger files", () => {
    it("JavaScript scaffold includes package.json", () => {
      scaffoldProject(tempDir, makeAnswers({ language: "javascript" }));
      expect(existsSync(join(tempDir, "package.json"))).toBe(true);
    });

    it("Python scaffold includes pyproject.toml", () => {
      scaffoldProject(tempDir, makeAnswers({ language: "python", projectName: "my_app", framework: "fastapi" }));
      expect(existsSync(join(tempDir, "pyproject.toml"))).toBe(true);
    });

    it("Go scaffold includes go.mod", () => {
      scaffoldProject(tempDir, makeAnswers({ language: "go", framework: "gin" }));
      expect(existsSync(join(tempDir, "go.mod"))).toBe(true);
    });

    it("Rust scaffold includes Cargo.toml", () => {
      scaffoldProject(tempDir, makeAnswers({ language: "rust", framework: null }));
      expect(existsSync(join(tempDir, "Cargo.toml"))).toBe(true);
    });

    it("Ruby scaffold includes Gemfile", () => {
      scaffoldProject(tempDir, makeAnswers({ language: "ruby", projectName: "my-app", framework: null }));
      expect(existsSync(join(tempDir, "Gemfile"))).toBe(true);
    });
  });

  describe("JavaScript scaffolds", () => {
    it("creates API scaffold with express", () => {
      const result = scaffoldProject(tempDir, makeAnswers({
        language: "javascript",
        systemType: "api",
        framework: "express",
      }));
      expect(result.filesWritten).toContain("package.json");
      expect(result.filesWritten).toContain("tsconfig.json");
      expect(result.filesWritten).toContain("src/index.ts");
      expect(result.filesWritten).toContain("tests/index.test.ts");
      expect(result.filesWritten).toContain(".gitignore");

      const pkg = JSON.parse(readFileSync(join(tempDir, "package.json"), "utf-8"));
      expect(pkg.name).toBe("my-app");
      expect(pkg.dependencies.express).toBeDefined();
      expect(pkg.scripts.test).toBe("vitest run");
    });

    it("creates Next.js scaffold", () => {
      scaffoldProject(tempDir, makeAnswers({
        language: "javascript",
        systemType: "web-app",
        framework: "next",
      }));
      expect(existsSync(join(tempDir, "next.config.ts"))).toBe(true);
      expect(existsSync(join(tempDir, "app/page.tsx"))).toBe(true);
      expect(existsSync(join(tempDir, "app/layout.tsx"))).toBe(true);
    });

    it("creates CLI scaffold", () => {
      scaffoldProject(tempDir, makeAnswers({
        language: "javascript",
        systemType: "cli",
        framework: null,
      }));
      const content = readFileSync(join(tempDir, "src/index.ts"), "utf-8");
      expect(content).toContain("parseArgs");
    });

    it("creates library scaffold", () => {
      scaffoldProject(tempDir, makeAnswers({
        language: "javascript",
        systemType: "library",
        framework: null,
      }));
      const content = readFileSync(join(tempDir, "src/index.ts"), "utf-8");
      expect(content).toContain("export function greet");
    });

    it("adds Prisma for SQL persistence", () => {
      scaffoldProject(tempDir, makeAnswers({
        language: "javascript",
        persistence: "sql",
      }));
      expect(existsSync(join(tempDir, "prisma/schema.prisma"))).toBe(true);
      const pkg = JSON.parse(readFileSync(join(tempDir, "package.json"), "utf-8"));
      expect(pkg.dependencies.prisma).toBeDefined();
    });
  });

  describe("Python scaffolds", () => {
    it("creates FastAPI scaffold", () => {
      const result = scaffoldProject(tempDir, makeAnswers({
        language: "python",
        projectName: "my_app",
        systemType: "api",
        framework: "fastapi",
      }));
      expect(result.filesWritten).toContain("pyproject.toml");
      expect(existsSync(join(tempDir, "src/my_app/__init__.py"))).toBe(true);
      expect(existsSync(join(tempDir, "src/my_app/app.py"))).toBe(true);
      expect(existsSync(join(tempDir, "tests/test_main.py"))).toBe(true);

      const content = readFileSync(join(tempDir, "src/my_app/app.py"), "utf-8");
      expect(content).toContain("FastAPI");
    });

    it("creates Django scaffold with 4 specific files", () => {
      scaffoldProject(tempDir, makeAnswers({
        language: "python",
        projectName: "my_app",
        systemType: "web-app",
        framework: "django",
      }));
      expect(existsSync(join(tempDir, "src/my_app/settings.py"))).toBe(true);
      expect(existsSync(join(tempDir, "src/my_app/urls.py"))).toBe(true);
      expect(existsSync(join(tempDir, "src/my_app/wsgi.py"))).toBe(true);
      expect(existsSync(join(tempDir, "manage.py"))).toBe(true);
    });

    it("creates CLI scaffold", () => {
      scaffoldProject(tempDir, makeAnswers({
        language: "python",
        projectName: "my_app",
        systemType: "cli",
        framework: null,
      }));
      const content = readFileSync(join(tempDir, "src/my_app/main.py"), "utf-8");
      expect(content).toContain("argparse");
    });
  });

  describe("Go scaffolds", () => {
    it("creates API scaffold with gin", () => {
      scaffoldProject(tempDir, makeAnswers({
        language: "go",
        systemType: "api",
        framework: "gin",
      }));
      expect(existsSync(join(tempDir, "go.mod"))).toBe(true);
      expect(existsSync(join(tempDir, "main.go"))).toBe(true);

      const goMod = readFileSync(join(tempDir, "go.mod"), "utf-8");
      expect(goMod).toContain("module example.com/my-app");
      expect(goMod).toContain("gin-gonic");
    });

    it("creates CLI scaffold with cmd/ structure", () => {
      scaffoldProject(tempDir, makeAnswers({
        language: "go",
        systemType: "cli",
        framework: null,
      }));
      expect(existsSync(join(tempDir, "cmd/my-app/main.go"))).toBe(true);
    });

    it("creates library scaffold", () => {
      scaffoldProject(tempDir, makeAnswers({
        language: "go",
        systemType: "library",
        framework: null,
      }));
      expect(existsSync(join(tempDir, "my-app.go"))).toBe(true);
      expect(existsSync(join(tempDir, "my-app_test.go"))).toBe(true);
    });
  });

  describe("Rust scaffolds", () => {
    it("creates API scaffold with axum", () => {
      scaffoldProject(tempDir, makeAnswers({
        language: "rust",
        systemType: "api",
        framework: "axum",
      }));
      const cargo = readFileSync(join(tempDir, "Cargo.toml"), "utf-8");
      expect(cargo).toContain("axum");
      expect(existsSync(join(tempDir, "src/main.rs"))).toBe(true);
    });

    it("creates library scaffold with lib.rs", () => {
      scaffoldProject(tempDir, makeAnswers({
        language: "rust",
        systemType: "library",
        framework: null,
      }));
      expect(existsSync(join(tempDir, "src/lib.rs"))).toBe(true);
      expect(existsSync(join(tempDir, "src/main.rs"))).toBe(false);
    });
  });

  describe("Ruby scaffolds", () => {
    it("creates standard Ruby scaffold", () => {
      scaffoldProject(tempDir, makeAnswers({
        language: "ruby",
        projectName: "my-app",
        systemType: "library",
        framework: null,
      }));
      expect(existsSync(join(tempDir, "Gemfile"))).toBe(true);
      expect(existsSync(join(tempDir, "lib/my_app.rb"))).toBe(true);
      expect(existsSync(join(tempDir, "lib/my_app/version.rb"))).toBe(true);
      expect(existsSync(join(tempDir, "spec/spec_helper.rb"))).toBe(true);
    });

    it("creates Rails scaffold with 5 specific files", () => {
      scaffoldProject(tempDir, makeAnswers({
        language: "ruby",
        projectName: "my-app",
        systemType: "web-app",
        framework: "rails",
      }));
      expect(existsSync(join(tempDir, "config.ru"))).toBe(true);
      expect(existsSync(join(tempDir, "Rakefile"))).toBe(true);
      expect(existsSync(join(tempDir, "config/routes.rb"))).toBe(true);
      expect(existsSync(join(tempDir, "config/application.rb"))).toBe(true);
      expect(existsSync(join(tempDir, "app/controllers/application_controller.rb"))).toBe(true);
    });
  });

  describe("persistence scaffolding", () => {
    it("creates data/ for file-based persistence", () => {
      scaffoldProject(tempDir, makeAnswers({ persistence: "file-based" }));
      expect(existsSync(join(tempDir, "data/.gitkeep"))).toBe(true);
    });
  });
});
