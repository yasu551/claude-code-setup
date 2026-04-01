import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createTeamProfile } from "../lib/profile-create.js";
import type { ProfileWizardAnswers } from "../lib/wizard.js";
import { fetchProfile, createFetchContext } from "../lib/profile.js";

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "profile-create-test-"));
}

const DEFAULT_ANSWERS: ProfileWizardAnswers = {
  testingRigor: "standard",
  codeChangeStyle: "balanced",
  securityPosture: "standard",
  commitStyle: "conventional",
  documentationLevel: "standard",
  overlays: ["javascript"],
};

describe("createTeamProfile", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates a complete profile structure", () => {
    const result = createTeamProfile(tempDir, DEFAULT_ANSWERS);

    // Check essential files exist
    expect(existsSync(join(tempDir, "profile.json"))).toBe(true);
    expect(existsSync(join(tempDir, "base/CLAUDE.md.sections"))).toBe(true);
    expect(existsSync(join(tempDir, "overlays/javascript/CLAUDE.md.sections"))).toBe(true);
    expect(existsSync(join(tempDir, "README.md"))).toBe(true);

    // Check profile.json
    const meta = JSON.parse(readFileSync(join(tempDir, "profile.json"), "utf-8"));
    expect(meta.name).toBe("team-profile");
    expect(meta.overlays).toEqual(["javascript"]);
    expect(meta.minimumPluginVersion).toBe("0.0.0");

    // Check provenance report
    expect(result.provenanceReport).toContain("Team Profile Created");
    expect(result.provenanceReport).toContain("javascript");
  });

  it("generates base layer with commit conventions", () => {
    const result = createTeamProfile(tempDir, {
      ...DEFAULT_ANSWERS,
      commitStyle: "conventional",
    });

    const base = readFileSync(join(tempDir, "base/CLAUDE.md.sections"), "utf-8");
    expect(base).toContain("Commit Conventions");
    expect(base).toContain("feat:");
  });

  it("generates base layer with freeform commits", () => {
    createTeamProfile(tempDir, {
      ...DEFAULT_ANSWERS,
      commitStyle: "freeform",
    });

    const base = readFileSync(join(tempDir, "base/CLAUDE.md.sections"), "utf-8");
    expect(base).toContain("Commit Conventions");
    expect(base).toContain("descriptive commit messages");
    expect(base).not.toContain("feat:");
  });

  it("generates documentation sections based on level", () => {
    createTeamProfile(tempDir, {
      ...DEFAULT_ANSWERS,
      documentationLevel: "comprehensive",
    });

    const base = readFileSync(join(tempDir, "base/CLAUDE.md.sections"), "utf-8");
    expect(base).toContain("Documentation");
    expect(base).toContain("non-trivial internal functions");
  });

  it("generates multiple overlays", () => {
    const result = createTeamProfile(tempDir, {
      ...DEFAULT_ANSWERS,
      overlays: ["javascript", "python", "go"],
    });

    expect(existsSync(join(tempDir, "overlays/javascript/CLAUDE.md.sections"))).toBe(true);
    expect(existsSync(join(tempDir, "overlays/python/CLAUDE.md.sections"))).toBe(true);
    expect(existsSync(join(tempDir, "overlays/go/CLAUDE.md.sections"))).toBe(true);

    const meta = JSON.parse(readFileSync(join(tempDir, "profile.json"), "utf-8"));
    expect(meta.overlays).toEqual(["javascript", "python", "go"]);
  });

  it("throws if profile.json already exists without --force", () => {
    writeFileSync(join(tempDir, "profile.json"), "{}");

    expect(() => createTeamProfile(tempDir, DEFAULT_ANSWERS))
      .toThrow("profile.json already exists");
  });

  it("overwrites with --force", () => {
    writeFileSync(join(tempDir, "profile.json"), "{}");

    const result = createTeamProfile(tempDir, DEFAULT_ANSWERS, { force: true });
    expect(result.filesWritten.length).toBeGreaterThan(0);

    const meta = JSON.parse(readFileSync(join(tempDir, "profile.json"), "utf-8"));
    expect(meta.name).toBe("team-profile");
  });

  it("generates strict security settings in base layer", () => {
    createTeamProfile(tempDir, {
      ...DEFAULT_ANSWERS,
      securityPosture: "strict",
    });

    expect(existsSync(join(tempDir, "base/settings.json"))).toBe(true);
    const settings = JSON.parse(readFileSync(join(tempDir, "base/settings.json"), "utf-8"));
    expect(settings.permissions).toBeDefined();
  });

  it("does not write lockfile (profile repo is source, not consumer)", () => {
    createTeamProfile(tempDir, DEFAULT_ANSWERS);
    expect(existsSync(join(tempDir, ".claude-team-lock.json"))).toBe(false);
  });

  it("is idempotent with --force", () => {
    createTeamProfile(tempDir, DEFAULT_ANSWERS);
    const first = readFileSync(join(tempDir, "profile.json"), "utf-8");

    createTeamProfile(tempDir, DEFAULT_ANSWERS, { force: true });
    const second = readFileSync(join(tempDir, "profile.json"), "utf-8");

    expect(first).toBe(second);
  });
});

describe("round-trip: create profile then consume it", () => {
  let profileDir: string;
  let consumerDir: string;

  beforeEach(() => {
    profileDir = createTempDir();
    consumerDir = createTempDir();
  });

  afterEach(() => {
    rmSync(profileDir, { recursive: true, force: true });
    rmSync(consumerDir, { recursive: true, force: true });
  });

  it("created profile can be fetched and consumed", () => {
    // Step 1: Create a profile
    createTeamProfile(profileDir, {
      ...DEFAULT_ANSWERS,
      overlays: ["javascript"],
    });

    // Step 2: Consume it via fetchProfile (local path)
    const ctx = createFetchContext(profileDir);
    const profile = fetchProfile(ctx, "javascript");

    // Verify metadata
    expect(profile.metadata.name).toBe("team-profile");
    expect(profile.metadata.overlays).toEqual(["javascript"]);

    // Verify base layer
    expect(profile.base.claudeMdSections).toContain("Commit Conventions");

    // Verify overlay loaded
    expect(profile.overlay).not.toBeNull();
    expect(profile.overlay!.claudeMdSections).toBeTruthy();
  });

  it("overlay selection matches during consumption", () => {
    createTeamProfile(profileDir, {
      ...DEFAULT_ANSWERS,
      overlays: ["javascript", "python"],
    });

    // Fetch with python overlay
    const ctx = createFetchContext(profileDir);
    const profile = fetchProfile(ctx, "python");

    expect(profile.overlay).not.toBeNull();
    expect(profile.overlay!.claudeMdSections).toBeTruthy();
  });

  it("non-matching overlay returns null overlay", () => {
    createTeamProfile(profileDir, {
      ...DEFAULT_ANSWERS,
      overlays: ["javascript"],
    });

    // Fetch with go overlay (not in this profile)
    const ctx = createFetchContext(profileDir);
    const profile = fetchProfile(ctx, "go");

    expect(profile.overlay).toBeNull();
  });
});
