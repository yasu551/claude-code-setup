import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { serializeProfile } from "../lib/profile-serialize.js";
import type { ProfileMetadata, ProfileLayer } from "../lib/profile.js";

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "serialize-test-"));
}

describe("serializeProfile", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes full profile structure with base and overlays", () => {
    const metadata: ProfileMetadata = {
      name: "test-profile",
      version: "1.0.0",
      description: "A test profile",
      overlays: ["javascript", "python"],
      defaultOverlay: null,
      minimumPluginVersion: "0.0.0",
    };

    const baseLayer: ProfileLayer = {
      claudeMdSections: "## Team Rules\n\nFollow the standards.",
      hooksJson: null,
      settingsJson: null,
      mcpJson: null,
    };

    const overlays: Record<string, ProfileLayer> = {
      javascript: {
        claudeMdSections: "## JavaScript\n\nUse TypeScript strict mode.",
        hooksJson: { "pre-tool-use": [{ matcher: "Bash", command: "echo lint" }] },
        settingsJson: null,
        mcpJson: null,
      },
      python: {
        claudeMdSections: "## Python\n\nUse type hints.",
        hooksJson: null,
        settingsJson: null,
        mcpJson: null,
      },
    };

    const result = serializeProfile({ repoRoot: tempDir, metadata, baseLayer, overlays });

    // Check files written
    expect(result.filesWritten).toContain("profile.json");
    expect(result.filesWritten).toContain("base/CLAUDE.md.sections");
    expect(result.filesWritten).toContain("overlays/javascript/CLAUDE.md.sections");
    expect(result.filesWritten).toContain("overlays/javascript/hooks.json");
    expect(result.filesWritten).toContain("overlays/python/CLAUDE.md.sections");
    expect(result.filesWritten).toContain("README.md");

    // Check profile.json content
    const profileJson = JSON.parse(readFileSync(join(tempDir, "profile.json"), "utf-8"));
    expect(profileJson.name).toBe("test-profile");
    expect(profileJson.overlays).toEqual(["javascript", "python"]);

    // Check base layer
    const baseClaude = readFileSync(join(tempDir, "base/CLAUDE.md.sections"), "utf-8");
    expect(baseClaude).toContain("Team Rules");

    // Check overlay files
    const jsClaude = readFileSync(join(tempDir, "overlays/javascript/CLAUDE.md.sections"), "utf-8");
    expect(jsClaude).toContain("TypeScript strict mode");

    const jsHooks = JSON.parse(readFileSync(join(tempDir, "overlays/javascript/hooks.json"), "utf-8"));
    expect(jsHooks["pre-tool-use"]).toBeDefined();

    // Check README
    const readme = readFileSync(join(tempDir, "README.md"), "utf-8");
    expect(readme).toContain("test-profile");
    expect(readme).toContain("/init");
  });

  it("skips null fields in layers", () => {
    const metadata: ProfileMetadata = {
      name: "minimal",
      version: "1.0.0",
      description: "",
      overlays: ["go"],
      defaultOverlay: null,
      minimumPluginVersion: "0.0.0",
    };

    const baseLayer: ProfileLayer = {
      claudeMdSections: "## Base",
      hooksJson: null,
      settingsJson: null,
      mcpJson: null,
    };

    const overlays: Record<string, ProfileLayer> = {
      go: {
        claudeMdSections: "## Go",
        hooksJson: null,
        settingsJson: null,
        mcpJson: null,
      },
    };

    const result = serializeProfile({ repoRoot: tempDir, metadata, baseLayer, overlays });

    // hooks.json, settings.json, .mcp.json should NOT be written
    expect(result.filesWritten).not.toContain("base/hooks.json");
    expect(result.filesWritten).not.toContain("base/settings.json");
    expect(result.filesWritten).not.toContain("base/.mcp.json");
    expect(existsSync(join(tempDir, "base/hooks.json"))).toBe(false);
  });

  it("throws if overlay key not in metadata.overlays", () => {
    const metadata: ProfileMetadata = {
      name: "bad",
      version: "1.0.0",
      description: "",
      overlays: ["javascript"], // missing "python"
      defaultOverlay: null,
      minimumPluginVersion: "0.0.0",
    };

    const baseLayer: ProfileLayer = {
      claudeMdSections: null,
      hooksJson: null,
      settingsJson: null,
      mcpJson: null,
    };

    const overlays: Record<string, ProfileLayer> = {
      javascript: { claudeMdSections: "js", hooksJson: null, settingsJson: null, mcpJson: null },
      python: { claudeMdSections: "py", hooksJson: null, settingsJson: null, mcpJson: null },
    };

    expect(() => serializeProfile({ repoRoot: tempDir, metadata, baseLayer, overlays }))
      .toThrow("not in metadata.overlays");
  });

  it("writes settings.json and .mcp.json when present", () => {
    const metadata: ProfileMetadata = {
      name: "full",
      version: "1.0.0",
      description: "",
      overlays: [],
      defaultOverlay: null,
      minimumPluginVersion: "0.0.0",
    };

    const baseLayer: ProfileLayer = {
      claudeMdSections: "## Base",
      hooksJson: { "pre-tool-use": [] },
      settingsJson: { permissions: { allow: ["Read"] } },
      mcpJson: { mcpServers: {} },
    };

    const result = serializeProfile({ repoRoot: tempDir, metadata, baseLayer, overlays: {} });

    expect(result.filesWritten).toContain("base/hooks.json");
    expect(result.filesWritten).toContain("base/settings.json");
    expect(result.filesWritten).toContain("base/.mcp.json");

    const settings = JSON.parse(readFileSync(join(tempDir, "base/settings.json"), "utf-8"));
    expect(settings.permissions.allow).toEqual(["Read"]);
  });
});
