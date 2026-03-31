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
import { sync } from "../lib/sync.js";
import { MARKERS } from "../lib/merge.js";
import { readLockfile } from "../lib/lockfile.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "sync-test-"));
}

function createTestProfile(
  dir: string,
  opts?: {
    version?: string;
    claudeMd?: string;
    mcpJson?: Record<string, unknown>;
    hooksJson?: Record<string, unknown>;
    settingsJson?: Record<string, unknown>;
    overlays?: string[];
  }
) {
  const {
    version = "1.0.0",
    claudeMd = "## Team Rules\n\n- Follow standards",
    mcpJson,
    hooksJson,
    settingsJson,
    overlays = [],
  } = opts ?? {};

  writeFileSync(
    join(dir, "profile.json"),
    JSON.stringify({
      name: "test-profile",
      version,
      description: "Test",
      overlays,
      defaultOverlay: null,
      minimumPluginVersion: "0.1.0",
    })
  );

  mkdirSync(join(dir, "base"), { recursive: true });
  writeFileSync(join(dir, "base", "CLAUDE.md.sections"), claudeMd);

  if (mcpJson) {
    writeFileSync(
      join(dir, "base", ".mcp.json"),
      JSON.stringify(mcpJson, null, 2)
    );
  }
  if (hooksJson) {
    writeFileSync(
      join(dir, "base", "hooks.json"),
      JSON.stringify(hooksJson, null, 2)
    );
  }
  if (settingsJson) {
    writeFileSync(
      join(dir, "base", "settings.json"),
      JSON.stringify(settingsJson, null, 2)
    );
  }

  for (const overlay of overlays) {
    mkdirSync(join(dir, "overlays", overlay), { recursive: true });
  }
}

/**
 * Update an existing test profile's version and content.
 */
function updateTestProfile(
  dir: string,
  opts: {
    version: string;
    claudeMd?: string;
    mcpJson?: Record<string, unknown>;
    hooksJson?: Record<string, unknown>;
    settingsJson?: Record<string, unknown>;
  }
) {
  // Update profile.json version
  const profileJson = JSON.parse(
    readFileSync(join(dir, "profile.json"), "utf-8")
  );
  profileJson.version = opts.version;
  writeFileSync(join(dir, "profile.json"), JSON.stringify(profileJson));

  if (opts.claudeMd !== undefined) {
    writeFileSync(join(dir, "base", "CLAUDE.md.sections"), opts.claudeMd);
  }
  if (opts.mcpJson) {
    writeFileSync(
      join(dir, "base", ".mcp.json"),
      JSON.stringify(opts.mcpJson, null, 2)
    );
  }
  if (opts.hooksJson) {
    writeFileSync(
      join(dir, "base", "hooks.json"),
      JSON.stringify(opts.hooksJson, null, 2)
    );
  }
  if (opts.settingsJson) {
    writeFileSync(
      join(dir, "base", "settings.json"),
      JSON.stringify(opts.settingsJson, null, 2)
    );
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("sync", () => {
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
    expect(() => sync({ repoRoot: repoDir })).toThrow("No profile configured");
  });

  it("reports up_to_date when versions match", () => {
    createTestProfile(profileDir);
    init({ repoRoot: repoDir, profileUrl: profileDir });

    const result = sync({ repoRoot: repoDir });
    expect(result.status).toBe("up_to_date");
    expect(result.fromVersion).toBe("1.0.0");
    expect(result.toVersion).toBe("1.0.0");
  });

  it("updates managed sections on version bump", () => {
    createTestProfile(profileDir);
    init({ repoRoot: repoDir, profileUrl: profileDir });

    // Update profile
    updateTestProfile(profileDir, {
      version: "1.1.0",
      claudeMd: "## Updated Rules\n\n- New rule added",
    });

    const result = sync({ repoRoot: repoDir });
    expect(result.status).toBe("updated");
    expect(result.fromVersion).toBe("1.0.0");
    expect(result.toVersion).toBe("1.1.0");

    // Check CLAUDE.md was updated
    const claudeMd = readFileSync(join(repoDir, "CLAUDE.md"), "utf-8");
    expect(claudeMd).toContain("## Updated Rules");
    expect(claudeMd).toContain("New rule added");
    expect(claudeMd).not.toContain("Follow standards");

    // Check lockfile was updated
    const lockfile = readLockfile(repoDir);
    expect(lockfile!.version).toBe("1.1.0");
  });

  it("preserves user content outside managed sections", () => {
    createTestProfile(profileDir);

    // Create repo with user content
    writeFileSync(join(repoDir, "CLAUDE.md"), "# My Project\n\nUser notes\n");
    init({ repoRoot: repoDir, profileUrl: profileDir, force: true });

    // Append user content after managed section
    const claudeMd = readFileSync(join(repoDir, "CLAUDE.md"), "utf-8");
    writeFileSync(
      join(repoDir, "CLAUDE.md"),
      claudeMd + "\n## My Custom Section\n\nDo not touch this\n"
    );

    // Update profile
    updateTestProfile(profileDir, {
      version: "1.1.0",
      claudeMd: "## New Team Rules\n\n- Rule A\n- Rule B",
    });

    sync({ repoRoot: repoDir, force: true });

    const updated = readFileSync(join(repoDir, "CLAUDE.md"), "utf-8");
    expect(updated).toContain("## New Team Rules");
    expect(updated).toContain("## My Custom Section");
    expect(updated).toContain("Do not touch this");
  });

  it("detects managed section conflict", () => {
    createTestProfile(profileDir);
    init({ repoRoot: repoDir, profileUrl: profileDir });

    // User edits inside managed section
    const claudeMd = readFileSync(join(repoDir, "CLAUDE.md"), "utf-8");
    const tampered = claudeMd.replace("Follow standards", "I changed this");
    writeFileSync(join(repoDir, "CLAUDE.md"), tampered);

    // Update profile
    updateTestProfile(profileDir, {
      version: "1.1.0",
      claudeMd: "## Updated Rules\n\n- Brand new",
    });

    const result = sync({ repoRoot: repoDir });
    expect(result.conflict).not.toBe(null);
    expect(result.conflict!.currentContent).toContain("I changed this");
    expect(result.conflict!.newContent).toContain("Brand new");
    // Files should NOT be changed yet (conflict needs confirmation)
    expect(result.diffs).toHaveLength(0);
  });

  it("force sync overrides managed section conflict", () => {
    createTestProfile(profileDir);
    init({ repoRoot: repoDir, profileUrl: profileDir });

    // Tamper with managed section
    const claudeMd = readFileSync(join(repoDir, "CLAUDE.md"), "utf-8");
    writeFileSync(
      join(repoDir, "CLAUDE.md"),
      claudeMd.replace("Follow standards", "Tampered")
    );

    updateTestProfile(profileDir, {
      version: "1.1.0",
      claudeMd: "## Forced Update\n\n- Override",
    });

    const result = sync({ repoRoot: repoDir, force: true });
    expect(result.conflict).toBe(null);
    expect(result.status).toBe("updated");

    const updated = readFileSync(join(repoDir, "CLAUDE.md"), "utf-8");
    expect(updated).toContain("Forced Update");
    expect(updated).not.toContain("Tampered");
  });

  it("updates .mcp.json with deep merge", () => {
    createTestProfile(profileDir, {
      mcpJson: { mcpServers: { github: { command: "gh-v1" } } },
    });
    init({ repoRoot: repoDir, profileUrl: profileDir });

    // User adds local MCP server
    const mcpJson = JSON.parse(
      readFileSync(join(repoDir, ".mcp.json"), "utf-8")
    );
    mcpJson.mcpServers.mylocal = { command: "local" };
    writeFileSync(
      join(repoDir, ".mcp.json"),
      JSON.stringify(mcpJson, null, 2)
    );

    // Profile updates github server
    updateTestProfile(profileDir, {
      version: "1.1.0",
      mcpJson: { mcpServers: { github: { command: "gh-v2" } } },
    });

    sync({ repoRoot: repoDir, force: true });

    const updated = JSON.parse(
      readFileSync(join(repoDir, ".mcp.json"), "utf-8")
    );
    expect(updated.mcpServers.github.command).toBe("gh-v2"); // updated
    expect(updated.mcpServers.mylocal.command).toBe("local"); // preserved
  });

  it("replaces team hooks and preserves user hooks", () => {
    createTestProfile(profileDir, {
      hooksJson: {
        hooks: {
          PreToolUse: [{ matcher: "Bash", command: "team-lint-v1.sh" }],
        },
      },
    });
    init({ repoRoot: repoDir, profileUrl: profileDir });

    // User adds their own hook
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

    // Profile updates team hook
    updateTestProfile(profileDir, {
      version: "1.1.0",
      hooksJson: {
        hooks: {
          PreToolUse: [{ matcher: "Bash", command: "team-lint-v2.sh" }],
        },
      },
    });

    sync({ repoRoot: repoDir, force: true });

    const updated = JSON.parse(
      readFileSync(join(repoDir, ".claude", "settings.json"), "utf-8")
    );
    const preToolUse = updated.hooks.PreToolUse;
    expect(preToolUse).toHaveLength(2);
    // Team hook updated
    expect(preToolUse.find((h: any) => h.command === "team-lint-v2.sh")).toBeTruthy();
    // Old team hook gone
    expect(preToolUse.find((h: any) => h.command === "team-lint-v1.sh")).toBeFalsy();
    // User hook preserved
    expect(preToolUse.find((h: any) => h.command === "my-hook.sh")).toBeTruthy();
  });

  it("rolls back on error during sync", () => {
    createTestProfile(profileDir, {
      mcpJson: { mcpServers: { github: { command: "gh" } } },
    });
    init({ repoRoot: repoDir, profileUrl: profileDir });

    const originalMcp = readFileSync(join(repoDir, ".mcp.json"), "utf-8");

    // Corrupt the profile to cause an error during sync
    updateTestProfile(profileDir, { version: "2.0.0" });
    writeFileSync(join(profileDir, "base", ".mcp.json"), "INVALID JSON");

    expect(() => sync({ repoRoot: repoDir, force: true })).toThrow();

    // .mcp.json should be rolled back
    const restoredMcp = readFileSync(join(repoDir, ".mcp.json"), "utf-8");
    expect(restoredMcp).toBe(originalMcp);

    // Lockfile should still show old version
    const lockfile = readLockfile(repoDir);
    expect(lockfile!.version).toBe("1.0.0");
  });

  it("updates settings.json non-hook keys", () => {
    createTestProfile(profileDir, {
      settingsJson: { teamSetting: "v1" },
    });
    init({ repoRoot: repoDir, profileUrl: profileDir });

    // User adds own setting
    const settings = JSON.parse(
      readFileSync(join(repoDir, ".claude", "settings.json"), "utf-8")
    );
    settings.userSetting = "mine";
    writeFileSync(
      join(repoDir, ".claude", "settings.json"),
      JSON.stringify(settings, null, 2)
    );

    // Profile updates team setting
    updateTestProfile(profileDir, {
      version: "1.1.0",
      settingsJson: { teamSetting: "v2" },
    });

    sync({ repoRoot: repoDir, force: true });

    const updated = JSON.parse(
      readFileSync(join(repoDir, ".claude", "settings.json"), "utf-8")
    );
    expect(updated.teamSetting).toBe("v2");
    expect(updated.userSetting).toBe("mine");
  });
});
