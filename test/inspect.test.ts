import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { inspectRepo } from "../lib/inspect.js";

describe("inspectRepo", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "inspect-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns all nulls for empty directory", () => {
    const fp = inspectRepo(tempDir);
    expect(fp.language).toBe(null);
    expect(fp.packageManager).toBe(null);
    expect(fp.framework).toBe(null);
    expect(fp.testRunner).toBe(null);
    expect(fp.linter).toBe(null);
    expect(fp.formatter).toBe(null);
    expect(fp.hasCI).toBe(false);
    expect(fp.hasDocker).toBe(false);
    expect(fp.hasDatabase).toBe(false);
  });

  it("detects JavaScript + npm + Next.js + vitest + eslint", () => {
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({
        dependencies: { next: "^14.0.0", react: "^18.0.0" },
        devDependencies: { vitest: "^1.0.0" },
      })
    );
    writeFileSync(join(tempDir, "package-lock.json"), "{}");
    writeFileSync(join(tempDir, "eslint.config.js"), "");

    const fp = inspectRepo(tempDir);
    expect(fp.language).toBe("javascript");
    expect(fp.packageManager).toBe("npm");
    expect(fp.framework).toBe("next");
    expect(fp.testRunner).toBe("vitest");
    expect(fp.linter).toBe("eslint");
  });

  it("detects pnpm from pnpm-lock.yaml", () => {
    writeFileSync(join(tempDir, "package.json"), "{}");
    writeFileSync(join(tempDir, "pnpm-lock.yaml"), "");
    const fp = inspectRepo(tempDir);
    expect(fp.packageManager).toBe("pnpm");
  });

  it("detects yarn from yarn.lock", () => {
    writeFileSync(join(tempDir, "package.json"), "{}");
    writeFileSync(join(tempDir, "yarn.lock"), "");
    const fp = inspectRepo(tempDir);
    expect(fp.packageManager).toBe("yarn");
  });

  it("detects bun from bun.lockb", () => {
    writeFileSync(join(tempDir, "package.json"), "{}");
    writeFileSync(join(tempDir, "bun.lockb"), "");
    const fp = inspectRepo(tempDir);
    expect(fp.packageManager).toBe("bun");
  });

  it("detects Python + FastAPI from requirements.txt", () => {
    writeFileSync(join(tempDir, "requirements.txt"), "fastapi==0.100.0\nuvicorn\n");
    const fp = inspectRepo(tempDir);
    expect(fp.language).toBe("python");
    expect(fp.packageManager).toBe("pip");
    expect(fp.framework).toBe("fastapi");
  });

  it("detects Django from manage.py", () => {
    writeFileSync(join(tempDir, "requirements.txt"), "django\n");
    writeFileSync(join(tempDir, "manage.py"), "");
    const fp = inspectRepo(tempDir);
    expect(fp.framework).toBe("django");
  });

  it("detects Python + poetry from poetry.lock", () => {
    writeFileSync(join(tempDir, "pyproject.toml"), "[tool.poetry]");
    writeFileSync(join(tempDir, "poetry.lock"), "");
    const fp = inspectRepo(tempDir);
    expect(fp.language).toBe("python");
    expect(fp.packageManager).toBe("poetry");
  });

  it("detects Go", () => {
    writeFileSync(join(tempDir, "go.mod"), "module example.com/foo");
    const fp = inspectRepo(tempDir);
    expect(fp.language).toBe("go");
    expect(fp.packageManager).toBe("go-modules");
    expect(fp.testRunner).toBe("go-test");
    expect(fp.formatter).toBe("gofmt");
  });

  it("detects Rust", () => {
    writeFileSync(join(tempDir, "Cargo.toml"), "[package]");
    const fp = inspectRepo(tempDir);
    expect(fp.language).toBe("rust");
    expect(fp.packageManager).toBe("cargo");
    expect(fp.testRunner).toBe("cargo-test");
    expect(fp.linter).toBe("clippy");
    expect(fp.formatter).toBe("rustfmt");
  });

  it("detects Ruby + Rails + RSpec", () => {
    writeFileSync(join(tempDir, "Gemfile"), "gem 'rails'\ngem 'rspec'");
    writeFileSync(join(tempDir, ".rspec"), "");
    const fp = inspectRepo(tempDir);
    expect(fp.language).toBe("ruby");
    expect(fp.packageManager).toBe("bundler");
    expect(fp.framework).toBe("rails");
    expect(fp.testRunner).toBe("rspec");
  });

  it("detects CI from .github/workflows", () => {
    mkdirSync(join(tempDir, ".github", "workflows"), { recursive: true });
    writeFileSync(join(tempDir, ".github", "workflows", "ci.yml"), "");
    const fp = inspectRepo(tempDir);
    expect(fp.hasCI).toBe(true);
    expect(fp.evidence.ci).toContain(".github/workflows/");
  });

  it("detects Docker from Dockerfile", () => {
    writeFileSync(join(tempDir, "Dockerfile"), "FROM node:20");
    const fp = inspectRepo(tempDir);
    expect(fp.hasDocker).toBe(true);
  });

  it("detects database from prisma directory", () => {
    mkdirSync(join(tempDir, "prisma"));
    writeFileSync(join(tempDir, "prisma", "schema.prisma"), "");
    const fp = inspectRepo(tempDir);
    expect(fp.hasDatabase).toBe(true);
  });

  it("detects existing Claude Code config", () => {
    writeFileSync(join(tempDir, "CLAUDE.md"), "# My Project");
    writeFileSync(join(tempDir, ".mcp.json"), "{}");
    mkdirSync(join(tempDir, ".claude"));
    writeFileSync(join(tempDir, ".claude", "settings.json"), "{}");
    const fp = inspectRepo(tempDir);
    expect(fp.hasClaudeMd).toBe(true);
    expect(fp.hasMcpJson).toBe(true);
    expect(fp.hasSettings).toBe(true);
  });

  it("detects vitest from config file even without package.json dep", () => {
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({ dependencies: {} }));
    writeFileSync(join(tempDir, "vitest.config.ts"), "");
    const fp = inspectRepo(tempDir);
    expect(fp.testRunner).toBe("vitest");
  });

  it("detects biome linter", () => {
    writeFileSync(join(tempDir, "package.json"), "{}");
    writeFileSync(join(tempDir, "biome.json"), "{}");
    const fp = inspectRepo(tempDir);
    expect(fp.linter).toBe("biome");
    expect(fp.formatter).toBe("biome");
  });

  it("detects prettier formatter", () => {
    writeFileSync(join(tempDir, "package.json"), "{}");
    writeFileSync(join(tempDir, ".prettierrc"), "{}");
    const fp = inspectRepo(tempDir);
    expect(fp.formatter).toBe("prettier");
  });

  it("populates evidence map", () => {
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ dependencies: { next: "^14.0.0" } })
    );
    const fp = inspectRepo(tempDir);
    expect(fp.evidence.language).toBeDefined();
    expect(fp.evidence.framework).toContain("package.json (next)");
  });

  it("detects ruff for Python", () => {
    writeFileSync(join(tempDir, "pyproject.toml"), "[tool.ruff]");
    writeFileSync(join(tempDir, "ruff.toml"), "");
    const fp = inspectRepo(tempDir);
    expect(fp.linter).toBe("ruff");
    expect(fp.formatter).toBe("ruff");
  });

  it("detects express framework", () => {
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ dependencies: { express: "^4.0.0" } })
    );
    const fp = inspectRepo(tempDir);
    expect(fp.framework).toBe("express");
  });
});
