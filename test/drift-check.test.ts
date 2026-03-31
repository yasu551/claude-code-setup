import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { init } from "../lib/init.js";
import { driftCheck } from "../lib/drift-check.js";
import { writeVersionCache } from "../lib/status.js";

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "drift-test-"));
}

function createTestProfile(dir: string, version = "1.0.0") {
  writeFileSync(
    join(dir, "profile.json"),
    JSON.stringify({
      name: "test-profile",
      version,
      description: "Test",
      overlays: [],
      defaultOverlay: null,
      minimumPluginVersion: "0.1.0",
    })
  );
  mkdirSync(join(dir, "base"), { recursive: true });
  writeFileSync(
    join(dir, "base", "CLAUDE.md.sections"),
    "## Rules\n\n- Standard"
  );
}

describe("driftCheck", () => {
  let repoDir: string;
  let profileDir: string;

  beforeEach(() => {
    repoDir = createTempDir();
    profileDir = createTempDir();
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
    rmSync(profileDir, { recursive: true, force: true });
  });

  it("returns no update when no lockfile exists", () => {
    const result = driftCheck(repoDir);
    expect(result.hasUpdate).toBe(false);
    expect(result.message).toBe("");
  });

  it("returns no update when versions match (via cache)", () => {
    createTestProfile(profileDir);
    init({ repoRoot: repoDir, profileUrl: profileDir });
    writeVersionCache(repoDir, "1.0.0");

    const result = driftCheck(repoDir);
    expect(result.hasUpdate).toBe(false);
  });

  it("detects update available via warm cache", () => {
    createTestProfile(profileDir);
    init({ repoRoot: repoDir, profileUrl: profileDir });
    writeVersionCache(repoDir, "2.0.0");

    const result = driftCheck(repoDir);
    expect(result.hasUpdate).toBe(true);
    expect(result.currentVersion).toBe("1.0.0");
    expect(result.latestVersion).toBe("2.0.0");
    expect(result.message).toContain("v2.0.0 available");
    expect(result.message).toContain("v1.0.0");
    expect(result.message).toContain("/sync");
  });

  it("never throws — returns safe default on any error", () => {
    // Corrupt scenario: lockfile points to non-existent profile, no cache
    createTestProfile(profileDir);
    init({ repoRoot: repoDir, profileUrl: profileDir });

    // Nuke the profile so cold-cache fetch fails
    rmSync(profileDir, { recursive: true, force: true });

    const result = driftCheck(repoDir);
    // Should not throw, just return no update
    expect(result.hasUpdate).toBe(false);
  });
});
