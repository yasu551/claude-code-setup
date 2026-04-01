import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { init } from "../lib/init.js";
import { sync } from "../lib/sync.js";

describe("sync with generated profiles", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sync-gen-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("reports up_to_date when fingerprint unchanged", () => {
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({ dependencies: { express: "^4.0.0" } }));

    init({
      repoRoot: tempDir,
      wizardAnswers: { codeChangeStyle: "balanced" },
    });

    const result = sync({ repoRoot: tempDir });
    expect(result.status).toBe("up_to_date");
  });

  it("updates when repo tooling changes", () => {
    // Init with basic JS
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({ dependencies: {} }));

    init({
      repoRoot: tempDir,
      wizardAnswers: { codeChangeStyle: "balanced" },
    });

    // Add a linter (changes fingerprint)
    writeFileSync(join(tempDir, "eslint.config.js"), "");

    const result = sync({ repoRoot: tempDir });
    expect(result.status).toBe("updated");

    // Verify CLAUDE.md now mentions eslint
    const claudeMd = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
    expect(claudeMd).toContain("eslint");
  });

  it("preserves wizard answers across syncs", () => {
    writeFileSync(join(tempDir, "package.json"), "{}");

    init({
      repoRoot: tempDir,
      wizardAnswers: { codeChangeStyle: "surgical", securityPosture: "strict" },
    });

    // Add something to change fingerprint
    writeFileSync(join(tempDir, "vitest.config.ts"), "");

    sync({ repoRoot: tempDir });

    const lockfile = JSON.parse(
      readFileSync(join(tempDir, ".claude-team-lock.json"), "utf-8")
    );
    expect(lockfile.wizardAnswers.codeChangeStyle).toBe("surgical");
    expect(lockfile.wizardAnswers.securityPosture).toBe("strict");
  });

  it("lockfile retains source=generated after sync", () => {
    writeFileSync(join(tempDir, "package.json"), "{}");

    init({
      repoRoot: tempDir,
      wizardAnswers: { codeChangeStyle: "balanced" },
    });

    // Change fingerprint
    writeFileSync(join(tempDir, "Dockerfile"), "FROM node:20");

    sync({ repoRoot: tempDir });

    const lockfile = JSON.parse(
      readFileSync(join(tempDir, ".claude-team-lock.json"), "utf-8")
    );
    expect(lockfile.source).toBe("generated");
  });
});
