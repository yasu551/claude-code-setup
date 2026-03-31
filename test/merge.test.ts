import { describe, it, expect } from "vitest";
import {
  upsertManagedSection,
  extractManagedSection,
  removeManagedMarkers,
  deepMerge,
  mergeHooks,
  mergeHooksInSettings,
  MARKERS,
} from "../lib/merge.js";

// ---------------------------------------------------------------------------
// Managed Sections
// ---------------------------------------------------------------------------

describe("extractManagedSection", () => {
  it("returns null when no markers present", () => {
    expect(extractManagedSection("# My Project\n\nSome content")).toBe(null);
  });

  it("extracts content between markers", () => {
    const doc = [
      MARKERS.BEGIN,
      "team content here",
      MARKERS.END,
      "",
      "user content",
    ].join("\n");
    expect(extractManagedSection(doc)).toBe("team content here");
  });

  it("extracts multiline content", () => {
    const doc = [
      MARKERS.BEGIN,
      "line 1",
      "line 2",
      "line 3",
      MARKERS.END,
    ].join("\n");
    expect(extractManagedSection(doc)).toBe("line 1\nline 2\nline 3");
  });

  it("returns null if end marker comes before begin", () => {
    const doc = `${MARKERS.END}\nstuff\n${MARKERS.BEGIN}`;
    expect(extractManagedSection(doc)).toBe(null);
  });
});

describe("upsertManagedSection", () => {
  it("prepends managed section to empty document", () => {
    const result = upsertManagedSection("", "team content");
    expect(result.hadExistingSection).toBe(false);
    expect(result.existingManagedContent).toBe(null);
    expect(result.content).toBe(`${MARKERS.BEGIN}\nteam content\n${MARKERS.END}\n`);
  });

  it("prepends managed section to existing document", () => {
    const result = upsertManagedSection("# My Project\n\nUser stuff", "team rules");
    expect(result.hadExistingSection).toBe(false);
    expect(result.content).toContain(MARKERS.BEGIN);
    expect(result.content).toContain("team rules");
    expect(result.content).toContain("# My Project");
    // Managed section comes first
    expect(result.content.indexOf(MARKERS.BEGIN)).toBeLessThan(
      result.content.indexOf("# My Project")
    );
  });

  it("replaces existing managed section", () => {
    const existing = [
      "# Header",
      "",
      MARKERS.BEGIN,
      "old content",
      MARKERS.END,
      "",
      "user stuff",
    ].join("\n");

    const result = upsertManagedSection(existing, "new content");
    expect(result.hadExistingSection).toBe(true);
    expect(result.existingManagedContent).toBe("old content");
    expect(result.content).toContain("new content");
    expect(result.content).not.toContain("old content");
    // User content preserved
    expect(result.content).toContain("user stuff");
    expect(result.content).toContain("# Header");
  });

  it("preserves content before and after markers exactly", () => {
    const existing = `before\n${MARKERS.BEGIN}\nold\n${MARKERS.END}\nafter`;
    const result = upsertManagedSection(existing, "new");
    expect(result.content).toBe(`before\n${MARKERS.BEGIN}\nnew\n${MARKERS.END}\nafter`);
  });
});

describe("removeManagedMarkers", () => {
  it("returns document unchanged if no markers", () => {
    const doc = "# No markers here";
    expect(removeManagedMarkers(doc)).toBe(doc);
  });

  it("removes markers but keeps content", () => {
    const doc = [
      "before",
      MARKERS.BEGIN,
      "team content",
      MARKERS.END,
      "after",
    ].join("\n");
    const result = removeManagedMarkers(doc);
    expect(result).not.toContain(MARKERS.BEGIN);
    expect(result).not.toContain(MARKERS.END);
    expect(result).toContain("team content");
    expect(result).toContain("before");
    expect(result).toContain("after");
  });
});

// ---------------------------------------------------------------------------
// Recursive Deep Merge
// ---------------------------------------------------------------------------

describe("deepMerge", () => {
  it("preserves local-only keys", () => {
    const local = { a: 1, b: 2 };
    const profile = { a: 10 };
    expect(deepMerge(local, profile)).toEqual({ a: 10, b: 2 });
  });

  it("adds profile-only keys", () => {
    const local = { a: 1 };
    const profile = { b: 2 };
    expect(deepMerge(local, profile)).toEqual({ a: 1, b: 2 });
  });

  it("profile wins for leaf values", () => {
    const local = { a: "old", b: "keep" };
    const profile = { a: "new" };
    expect(deepMerge(local, profile)).toEqual({ a: "new", b: "keep" });
  });

  it("recurses into nested objects", () => {
    const local = {
      mcpServers: {
        github: { command: "old-cmd", timeout: 30 },
        mylocal: { command: "local-mcp" },
      },
    };
    const profile = {
      mcpServers: {
        github: { command: "gh-mcp", args: ["--org", "myorg"] },
      },
    };
    const result = deepMerge(local, profile);
    expect(result).toEqual({
      mcpServers: {
        github: { command: "gh-mcp", args: ["--org", "myorg"], timeout: 30 },
        mylocal: { command: "local-mcp" },
      },
    });
  });

  it("profile arrays win (not element-wise merge)", () => {
    const local = { tags: ["a", "b", "c"] };
    const profile = { tags: ["x", "y"] };
    expect(deepMerge(local, profile)).toEqual({ tags: ["x", "y"] });
  });

  it("handles empty objects", () => {
    expect(deepMerge({}, { a: 1 })).toEqual({ a: 1 });
    expect(deepMerge({ a: 1 }, {})).toEqual({ a: 1 });
    expect(deepMerge({}, {})).toEqual({});
  });

  it("profile object overwrites local non-object", () => {
    const local = { a: "string" } as Record<string, unknown>;
    const profile = { a: { nested: true } };
    expect(deepMerge(local, profile)).toEqual({ a: { nested: true } });
  });

  it("profile non-object overwrites local object", () => {
    const local = { a: { nested: true } };
    const profile = { a: "replaced" } as Record<string, unknown>;
    expect(deepMerge(local, profile)).toEqual({ a: "replaced" });
  });

  it("handles deeply nested merge (3+ levels)", () => {
    const local = { a: { b: { c: { d: 1, e: 2 }, f: 3 } } };
    const profile = { a: { b: { c: { d: 99 } } } };
    expect(deepMerge(local, profile)).toEqual({
      a: { b: { c: { d: 99, e: 2 }, f: 3 } },
    });
  });

  it("handles null values (profile null wins)", () => {
    const local = { a: 1 };
    const profile = { a: null };
    expect(deepMerge(local, profile)).toEqual({ a: null });
  });
});

// ---------------------------------------------------------------------------
// Hook Merge
// ---------------------------------------------------------------------------

describe("mergeHooks", () => {
  it("replaces team hooks and preserves user hooks", () => {
    const local = [
      { matcher: "Bash", command: "old-team-lint.sh" },
      { matcher: "Write", command: "my-custom-check.sh" },
    ];
    const profile = [{ matcher: "Bash", command: "new-team-lint.sh" }];
    const teamRefs = [{ matcher: "Bash", command: "old-team-lint.sh" }];

    const result = mergeHooks(local, profile, teamRefs);

    expect(result.merged).toEqual([
      { matcher: "Bash", command: "new-team-lint.sh" },
      { matcher: "Write", command: "my-custom-check.sh" },
    ]);
    expect(result.newTeamRefs).toEqual([
      { matcher: "Bash", command: "new-team-lint.sh" },
    ]);
  });

  it("handles empty local hooks", () => {
    const profile = [{ matcher: "Bash", command: "lint.sh" }];
    const result = mergeHooks([], profile, []);

    expect(result.merged).toEqual(profile);
    expect(result.newTeamRefs).toEqual([{ matcher: "Bash", command: "lint.sh" }]);
  });

  it("handles empty profile hooks (removes team hooks)", () => {
    const local = [
      { matcher: "Bash", command: "team-lint.sh" },
      { matcher: "Write", command: "user-hook.sh" },
    ];
    const teamRefs = [{ matcher: "Bash", command: "team-lint.sh" }];

    const result = mergeHooks(local, [], teamRefs);

    expect(result.merged).toEqual([
      { matcher: "Write", command: "user-hook.sh" },
    ]);
    expect(result.newTeamRefs).toEqual([]);
  });

  it("preserves all user hooks when no team refs", () => {
    const local = [
      { matcher: "Bash", command: "a.sh" },
      { matcher: "Write", command: "b.sh" },
    ];
    const profile = [{ matcher: "Read", command: "c.sh" }];

    const result = mergeHooks(local, profile, []);

    expect(result.merged).toHaveLength(3);
    expect(result.merged[0]).toEqual({ matcher: "Read", command: "c.sh" });
  });
});

describe("mergeHooksInSettings", () => {
  it("merges hooks into settings object", () => {
    const localSettings = {
      model: "claude-sonnet-4-6",
      hooks: {
        PreToolUse: [
          { matcher: "Write", command: "user-check.sh" },
        ],
      },
    };
    const profileHooks = {
      hooks: {
        PreToolUse: [
          { matcher: "Bash", command: "team-lint.sh" },
        ],
      },
    };
    const teamRefs = {};

    const result = mergeHooksInSettings(localSettings, profileHooks, teamRefs);

    expect(result.settings["model"]).toBe("claude-sonnet-4-6");
    const hooks = result.settings["hooks"] as Record<string, unknown[]>;
    expect(hooks["PreToolUse"]).toHaveLength(2);
    expect(result.newTeamRefs["PreToolUse"]).toEqual([
      { matcher: "Bash", command: "team-lint.sh" },
    ]);
  });
});
