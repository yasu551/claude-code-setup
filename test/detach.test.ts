import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  rmSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { init } from "../lib/init.js";
import { detach } from "../lib/detach.js";
import { MARKERS } from "../lib/merge.js";

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "detach-test-"));
}

function createTestProfile(
  dir: string,
  opts?: {
    hooksJson?: Record<string, unknown>;
  }
) {
  const { hooksJson } = opts ?? {};

  writeFileSync(
    join(dir, "profile.json"),
    JSON.stringify({
      name: "test-profile",
      version: "1.0.0",
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

  if (hooksJson) {
    writeFileSync(
      join(dir, "base", "hooks.json"),
      JSON.stringify(hooksJson, null, 2)
    );
  }
}

describe("detach", () => {
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

  it("throws when no lockfile exists", () => {
    expect(() => detach(repoDir)).toThrow("No profile configured");
  });

  it("removes managed section markers but preserves content", () => {
    createTestProfile(profileDir);
    init({ repoRoot: repoDir, profileUrl: profileDir });

    detach(repoDir);

    const claudeMd = readFileSync(join(repoDir, "CLAUDE.md"), "utf-8");
    expect(claudeMd).not.toContain(MARKERS.BEGIN);
    expect(claudeMd).not.toContain(MARKERS.END);
    expect(claudeMd).toContain("## Team Rules");
    expect(claudeMd).toContain("Follow standards");
  });

  it("deletes lockfile", () => {
    createTestProfile(profileDir);
    init({ repoRoot: repoDir, profileUrl: profileDir });

    detach(repoDir);

    expect(existsSync(join(repoDir, ".claude-team-lock.json"))).toBe(false);
  });

  it("deletes cache directory", () => {
    createTestProfile(profileDir);
    init({ repoRoot: repoDir, profileUrl: profileDir });

    // Create cache dir (normally created by status/drift-check)
    mkdirSync(join(repoDir, ".claude-team-cache"), { recursive: true });
    writeFileSync(
      join(repoDir, ".claude-team-cache", "version-check.json"),
      "{}"
    );

    detach(repoDir);

    expect(existsSync(join(repoDir, ".claude-team-cache"))).toBe(false);
  });

  it("removes team hooks from settings.json", () => {
    createTestProfile(profileDir, {
      hooksJson: {
        hooks: {
          PreToolUse: [{ matcher: "Bash", command: "team-lint.sh" }],
        },
      },
    });
    init({ repoRoot: repoDir, profileUrl: profileDir });

    // Add a user hook
    const settings = JSON.parse(
      readFileSync(join(repoDir, ".claude", "settings.json"), "utf-8")
    );
    settings.hooks.PreToolUse.push({
      matcher: "Write",
      command: "my-hook.sh",
    });
    writeFileSync(
      join(repoDir, ".claude", "settings.json"),
      JSON.stringify(settings, null, 2)
    );

    detach(repoDir);

    const updated = JSON.parse(
      readFileSync(join(repoDir, ".claude", "settings.json"), "utf-8")
    );
    // Team hook removed
    const hooks = updated.hooks?.PreToolUse ?? [];
    expect(hooks.find((h: any) => h.command === "team-lint.sh")).toBeFalsy();
    // User hook preserved
    expect(hooks.find((h: any) => h.command === "my-hook.sh")).toBeTruthy();
  });

  it("leaves .mcp.json and settings.json content intact", () => {
    createTestProfile(profileDir);
    init({ repoRoot: repoDir, profileUrl: profileDir });

    // settings.json should still exist after detach
    detach(repoDir);

    expect(existsSync(join(repoDir, ".claude", "settings.json"))).toBe(true);
  });

  it("returns list of actions taken", () => {
    createTestProfile(profileDir);
    init({ repoRoot: repoDir, profileUrl: profileDir });

    const result = detach(repoDir);
    expect(result.actions.length).toBeGreaterThan(0);
    expect(result.actions.some((a) => a.includes("markers"))).toBe(true);
    expect(result.actions.some((a) => a.includes("lockfile") || a.includes("lock"))).toBe(true);
  });
});
