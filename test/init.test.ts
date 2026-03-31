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
import { MARKERS } from "../lib/merge.js";
import { readLockfile } from "../lib/lockfile.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "init-test-"));
}

/**
 * Create a minimal local profile directory for testing.
 */
function createTestProfile(dir: string, opts?: {
  overlays?: string[];
  baseClaudeMd?: string;
  baseMcpJson?: Record<string, unknown>;
  baseHooksJson?: Record<string, unknown>;
  baseSettingsJson?: Record<string, unknown>;
  overlayClaudeMd?: Record<string, string>;
  version?: string;
}) {
  const {
    overlays = [],
    baseClaudeMd = "## Team Rules\n\n- Follow the standards",
    baseMcpJson,
    baseHooksJson,
    baseSettingsJson,
    overlayClaudeMd = {},
    version = "1.0.0",
  } = opts ?? {};

  // profile.json
  writeFileSync(
    join(dir, "profile.json"),
    JSON.stringify({
      name: "test-profile",
      version,
      description: "Test profile",
      overlays,
      defaultOverlay: null,
      minimumPluginVersion: "0.1.0",
    })
  );

  // base/
  mkdirSync(join(dir, "base"), { recursive: true });
  writeFileSync(join(dir, "base", "CLAUDE.md.sections"), baseClaudeMd);

  if (baseMcpJson) {
    writeFileSync(
      join(dir, "base", ".mcp.json"),
      JSON.stringify(baseMcpJson, null, 2)
    );
  }

  if (baseHooksJson) {
    writeFileSync(
      join(dir, "base", "hooks.json"),
      JSON.stringify(baseHooksJson, null, 2)
    );
  }

  if (baseSettingsJson) {
    writeFileSync(
      join(dir, "base", "settings.json"),
      JSON.stringify(baseSettingsJson, null, 2)
    );
  }

  // overlays/
  for (const overlay of overlays) {
    const overlayDir = join(dir, "overlays", overlay);
    mkdirSync(overlayDir, { recursive: true });
    if (overlayClaudeMd[overlay]) {
      writeFileSync(
        join(overlayDir, "CLAUDE.md.sections"),
        overlayClaudeMd[overlay]
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("init", () => {
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

  it("initializes a repo with a basic profile", () => {
    createTestProfile(profileDir);

    const result = init({
      repoRoot: repoDir,
      profileUrl: profileDir,
    });

    expect(result.profileName).toBe("test-profile");
    expect(result.profileVersion).toBe("1.0.0");
    expect(result.filesModified).toContain("CLAUDE.md");

    // Check CLAUDE.md has managed sections
    const claudeMd = readFileSync(join(repoDir, "CLAUDE.md"), "utf-8");
    expect(claudeMd).toContain(MARKERS.BEGIN);
    expect(claudeMd).toContain(MARKERS.END);
    expect(claudeMd).toContain("## Team Rules");
    expect(claudeMd).toContain("Follow the standards");

    // Check lockfile was created
    const lockfile = readLockfile(repoDir);
    expect(lockfile).not.toBe(null);
    expect(lockfile!.version).toBe("1.0.0");
    expect(lockfile!.profile).toBe(profileDir);
  });

  it("preserves existing CLAUDE.md content", () => {
    writeFileSync(
      join(repoDir, "CLAUDE.md"),
      "# My Project\n\nMy custom instructions here.\n"
    );
    createTestProfile(profileDir);

    init({ repoRoot: repoDir, profileUrl: profileDir });

    const claudeMd = readFileSync(join(repoDir, "CLAUDE.md"), "utf-8");
    expect(claudeMd).toContain("My custom instructions here.");
    expect(claudeMd).toContain(MARKERS.BEGIN);
    expect(claudeMd).toContain("## Team Rules");
  });

  it("deep merges .mcp.json", () => {
    // Existing local .mcp.json
    writeFileSync(
      join(repoDir, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          mylocal: { command: "local-mcp" },
        },
      })
    );

    createTestProfile(profileDir, {
      baseMcpJson: {
        mcpServers: {
          github: { command: "gh-mcp", args: ["--org", "myorg"] },
        },
      },
    });

    init({ repoRoot: repoDir, profileUrl: profileDir });

    const mcpJson = JSON.parse(
      readFileSync(join(repoDir, ".mcp.json"), "utf-8")
    );
    // Profile key added
    expect(mcpJson.mcpServers.github.command).toBe("gh-mcp");
    // Local key preserved
    expect(mcpJson.mcpServers.mylocal.command).toBe("local-mcp");
  });

  it("merges hooks into settings.json", () => {
    createTestProfile(profileDir, {
      baseHooksJson: {
        hooks: {
          PreToolUse: [
            { matcher: "Bash", command: "team-lint.sh" },
          ],
        },
      },
    });

    init({ repoRoot: repoDir, profileUrl: profileDir });

    const settings = JSON.parse(
      readFileSync(join(repoDir, ".claude", "settings.json"), "utf-8")
    );
    expect(settings.hooks.PreToolUse).toHaveLength(1);
    expect(settings.hooks.PreToolUse[0].command).toBe("team-lint.sh");

    // Check lockfile has team hook refs
    const lockfile = readLockfile(repoDir);
    expect(lockfile!.teamHookRefs).toBeDefined();
    expect(lockfile!.teamHookRefs!["PreToolUse"]).toEqual([
      { matcher: "Bash", command: "team-lint.sh" },
    ]);
  });

  it("applies overlay when detected", () => {
    writeFileSync(join(repoDir, "package.json"), "{}");

    createTestProfile(profileDir, {
      overlays: ["javascript"],
      overlayClaudeMd: {
        javascript: "## JavaScript Rules\n\n- Use ESLint",
      },
    });

    const result = init({ repoRoot: repoDir, profileUrl: profileDir });
    expect(result.overlay).toBe("javascript");

    const claudeMd = readFileSync(join(repoDir, "CLAUDE.md"), "utf-8");
    expect(claudeMd).toContain("## Team Rules");
    expect(claudeMd).toContain("## JavaScript Rules");
  });

  it("refuses to init when lockfile exists without --force", () => {
    createTestProfile(profileDir);

    // First init
    init({ repoRoot: repoDir, profileUrl: profileDir });

    // Second init should fail
    expect(() =>
      init({ repoRoot: repoDir, profileUrl: profileDir })
    ).toThrow("already has a team profile");
  });

  it("allows re-init with --force", () => {
    createTestProfile(profileDir);

    init({ repoRoot: repoDir, profileUrl: profileDir });

    // Create a new profile with updated version
    rmSync(profileDir, { recursive: true, force: true });
    const newProfileDir = createTempDir();
    createTestProfile(newProfileDir, { version: "2.0.0" });

    const result = init({
      repoRoot: repoDir,
      profileUrl: newProfileDir,
      force: true,
    });

    expect(result.profileVersion).toBe("2.0.0");

    rmSync(newProfileDir, { recursive: true, force: true });
  });

  it("adds .claude-team-cache/ to .gitignore", () => {
    createTestProfile(profileDir);

    init({ repoRoot: repoDir, profileUrl: profileDir });

    const gitignore = readFileSync(join(repoDir, ".gitignore"), "utf-8");
    expect(gitignore).toContain(".claude-team-cache/");
  });

  it("does not duplicate .gitignore entry", () => {
    writeFileSync(join(repoDir, ".gitignore"), ".claude-team-cache/\n");
    createTestProfile(profileDir);

    const result = init({ repoRoot: repoDir, profileUrl: profileDir });

    const gitignore = readFileSync(join(repoDir, ".gitignore"), "utf-8");
    const count = gitignore.split(".claude-team-cache/").length - 1;
    expect(count).toBe(1);
    expect(result.filesModified).not.toContain(".gitignore");
  });

  it("rolls back on profile fetch error", () => {
    // Write existing CLAUDE.md
    writeFileSync(join(repoDir, "CLAUDE.md"), "original content");

    // Use a non-existent profile path
    expect(() =>
      init({ repoRoot: repoDir, profileUrl: "/nonexistent/profile" })
    ).toThrow();

    // Original file should be restored
    const claudeMd = readFileSync(join(repoDir, "CLAUDE.md"), "utf-8");
    expect(claudeMd).toBe("original content");

    // No lockfile should exist
    expect(existsSync(join(repoDir, ".claude-team-lock.json"))).toBe(false);
  });

  it("deep merges settings.json (non-hook keys)", () => {
    mkdirSync(join(repoDir, ".claude"), { recursive: true });
    writeFileSync(
      join(repoDir, ".claude", "settings.json"),
      JSON.stringify({ model: "claude-sonnet-4-6", customKey: true })
    );

    createTestProfile(profileDir, {
      baseSettingsJson: { model: "claude-sonnet-4-6", teamSetting: "enabled" },
    });

    init({ repoRoot: repoDir, profileUrl: profileDir });

    const settings = JSON.parse(
      readFileSync(join(repoDir, ".claude", "settings.json"), "utf-8")
    );
    expect(settings.model).toBe("claude-sonnet-4-6");
    expect(settings.customKey).toBe(true); // user key preserved
    expect(settings.teamSetting).toBe("enabled"); // profile key added
  });
});
