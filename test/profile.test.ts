import { describe, it, expect } from "vitest";
import { parseProfileUrl, combineLayers } from "../lib/profile.js";
import type { ProfileLayer } from "../lib/profile.js";

describe("parseProfileUrl", () => {
  it("parses owner/repo", () => {
    expect(parseProfileUrl("myorg/my-profile")).toEqual({
      owner: "myorg",
      repo: "my-profile",
    });
  });

  it("parses github.com/owner/repo", () => {
    expect(parseProfileUrl("github.com/myorg/my-profile")).toEqual({
      owner: "myorg",
      repo: "my-profile",
    });
  });

  it("parses https://github.com/owner/repo", () => {
    expect(parseProfileUrl("https://github.com/myorg/my-profile")).toEqual({
      owner: "myorg",
      repo: "my-profile",
    });
  });

  it("strips .git suffix", () => {
    expect(parseProfileUrl("https://github.com/myorg/my-profile.git")).toEqual({
      owner: "myorg",
      repo: "my-profile",
    });
  });

  it("strips trailing slash", () => {
    expect(parseProfileUrl("github.com/myorg/my-profile/")).toEqual({
      owner: "myorg",
      repo: "my-profile",
    });
  });

  it("throws on invalid URL", () => {
    expect(() => parseProfileUrl("just-a-name")).toThrow("Invalid profile URL");
  });
});

describe("combineLayers", () => {
  const baseLayer: ProfileLayer = {
    claudeMdSections: "base rules",
    hooksJson: { hooks: { PreToolUse: [{ matcher: "Bash", command: "lint.sh" }] } },
    settingsJson: { model: "claude-sonnet-4-6" },
    mcpJson: { mcpServers: { github: { command: "gh" } } },
  };

  it("returns base when overlay is null", () => {
    const result = combineLayers(baseLayer, null);
    expect(result).toEqual(baseLayer);
  });

  it("appends overlay CLAUDE.md sections", () => {
    const overlay: ProfileLayer = {
      claudeMdSections: "overlay rules",
      hooksJson: null,
      settingsJson: null,
      mcpJson: null,
    };
    const result = combineLayers(baseLayer, overlay);
    expect(result.claudeMdSections).toBe("base rules\n\noverlay rules");
  });

  it("merges overlay JSON on top of base", () => {
    const overlay: ProfileLayer = {
      claudeMdSections: null,
      hooksJson: null,
      settingsJson: { extraSetting: true },
      mcpJson: null,
    };
    const result = combineLayers(baseLayer, overlay);
    expect(result.settingsJson).toEqual({
      model: "claude-sonnet-4-6",
      extraSetting: true,
    });
  });

  it("uses overlay when base is null", () => {
    const emptyBase: ProfileLayer = {
      claudeMdSections: null,
      hooksJson: null,
      settingsJson: null,
      mcpJson: null,
    };
    const overlay: ProfileLayer = {
      claudeMdSections: "only overlay",
      hooksJson: null,
      settingsJson: null,
      mcpJson: null,
    };
    const result = combineLayers(emptyBase, overlay);
    expect(result.claudeMdSections).toBe("only overlay");
  });
});
