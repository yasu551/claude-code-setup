import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { init } from "../lib/init.js";
import { status, readVersionCache, writeVersionCache } from "../lib/status.js";
import { MARKERS } from "../lib/merge.js";

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "status-test-"));
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
    "## Team Rules\n\n- Follow standards"
  );
}

describe("status", () => {
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

  it("reports not configured when no lockfile", () => {
    const result = status(repoDir);
    expect(result.configured).toBe(false);
    expect(result.drift).toHaveLength(0);
  });

  it("reports configured status after init", () => {
    createTestProfile(profileDir);
    init({ repoRoot: repoDir, profileUrl: profileDir });

    const result = status(repoDir);
    expect(result.configured).toBe(true);
    expect(result.profileUrl).toBe(profileDir);
    expect(result.currentVersion).toBe("1.0.0");
    expect(result.updateAvailable).toBe(false);
    expect(result.drift.length).toBeGreaterThan(0);
  });

  it("detects no drift when everything is clean", () => {
    createTestProfile(profileDir);
    init({ repoRoot: repoDir, profileUrl: profileDir });

    const result = status(repoDir);
    const claudeDrift = result.drift.find((d) => d.file === "CLAUDE.md");
    expect(claudeDrift?.status).toBe("ok");
  });

  it("detects managed section drift", () => {
    createTestProfile(profileDir);
    init({ repoRoot: repoDir, profileUrl: profileDir });

    // Tamper with managed section
    const claudeMd = readFileSync(join(repoDir, "CLAUDE.md"), "utf-8");
    writeFileSync(
      join(repoDir, "CLAUDE.md"),
      claudeMd.replace("Follow standards", "I changed this")
    );

    const result = status(repoDir);
    const claudeDrift = result.drift.find((d) => d.file === "CLAUDE.md");
    expect(claudeDrift?.status).toBe("modified");
  });

  it("detects missing CLAUDE.md", () => {
    createTestProfile(profileDir);
    init({ repoRoot: repoDir, profileUrl: profileDir });

    rmSync(join(repoDir, "CLAUDE.md"));

    const result = status(repoDir);
    const claudeDrift = result.drift.find((d) => d.file === "CLAUDE.md");
    expect(claudeDrift?.status).toBe("missing");
  });

  it("detects update available via cache", () => {
    createTestProfile(profileDir);
    init({ repoRoot: repoDir, profileUrl: profileDir });

    // Write a fake cache showing newer version
    writeVersionCache(repoDir, "2.0.0");

    const result = status(repoDir);
    expect(result.updateAvailable).toBe(true);
    expect(result.latestVersion).toBe("2.0.0");
  });
});

describe("version cache", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns null when no cache exists", () => {
    expect(readVersionCache(tempDir)).toBe(null);
  });

  it("writes and reads cache", () => {
    writeVersionCache(tempDir, "1.5.0");
    const cached = readVersionCache(tempDir);
    expect(cached).not.toBe(null);
    expect(cached!.latestVersion).toBe("1.5.0");
  });

  it("returns null for expired cache", () => {
    const path = join(tempDir, ".claude-team-cache", "version-check.json");
    mkdirSync(join(tempDir, ".claude-team-cache"), { recursive: true });
    writeFileSync(
      path,
      JSON.stringify({
        latestVersion: "1.0.0",
        checkedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
      })
    );
    expect(readVersionCache(tempDir)).toBe(null);
  });
});
