import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { detectOverlay } from "../lib/detect.js";

describe("detectOverlay", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "detect-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("detects javascript from package.json", () => {
    writeFileSync(join(tempDir, "package.json"), "{}");
    expect(detectOverlay(tempDir)).toBe("javascript");
  });

  it("detects python from pyproject.toml", () => {
    writeFileSync(join(tempDir, "pyproject.toml"), "");
    expect(detectOverlay(tempDir)).toBe("python");
  });

  it("detects python from requirements.txt", () => {
    writeFileSync(join(tempDir, "requirements.txt"), "");
    expect(detectOverlay(tempDir)).toBe("python");
  });

  it("detects go from go.mod", () => {
    writeFileSync(join(tempDir, "go.mod"), "");
    expect(detectOverlay(tempDir)).toBe("go");
  });

  it("detects rust from Cargo.toml", () => {
    writeFileSync(join(tempDir, "Cargo.toml"), "");
    expect(detectOverlay(tempDir)).toBe("rust");
  });

  it("detects ruby from Gemfile", () => {
    writeFileSync(join(tempDir, "Gemfile"), "");
    expect(detectOverlay(tempDir)).toBe("ruby");
  });

  it("returns null for empty directory", () => {
    expect(detectOverlay(tempDir)).toBe(null);
  });

  it("javascript wins over python in polyglot repo (priority order)", () => {
    writeFileSync(join(tempDir, "package.json"), "{}");
    writeFileSync(join(tempDir, "pyproject.toml"), "");
    expect(detectOverlay(tempDir)).toBe("javascript");
  });

  it("python wins over go in polyglot repo", () => {
    writeFileSync(join(tempDir, "pyproject.toml"), "");
    writeFileSync(join(tempDir, "go.mod"), "");
    expect(detectOverlay(tempDir)).toBe("python");
  });
});
