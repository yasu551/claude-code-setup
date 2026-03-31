import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { detectOverlay } from "./detect.js";
import { createFetchContext, fetchProfile, combineLayers } from "./profile.js";
import {
  upsertManagedSection,
  deepMerge,
  mergeHooksInSettings,
} from "./merge.js";
import type { TeamHookRef } from "./merge.js";
import { buildLockfile, writeLockfile, lockfileExists } from "./lockfile.js";
import { createBackup } from "./backup.js";

export interface InitOptions {
  repoRoot: string;
  profileUrl: string;
  force?: boolean;
  overlayOverride?: string | null;
}

export interface InitResult {
  profileName: string;
  profileVersion: string;
  overlay: string | null;
  filesModified: string[];
}

// Target file paths relative to repo root
const TARGETS = {
  claudeMd: "CLAUDE.md",
  mcpJson: ".mcp.json",
  settingsJson: ".claude/settings.json",
  lockfile: ".claude-team-lock.json",
  gitignore: ".gitignore",
} as const;

/**
 * Read a file from the repo, returning empty/default content if it doesn't exist.
 */
function readFileOrDefault(path: string, defaultContent: string): string {
  if (existsSync(path)) {
    return readFileSync(path, "utf-8");
  }
  return defaultContent;
}

/**
 * Write a file, creating parent directories if needed.
 */
function writeFileSafe(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf-8");
}

/**
 * Ensure .claude-team-cache/ is in .gitignore.
 */
function ensureGitignore(repoRoot: string): boolean {
  const gitignorePath = join(repoRoot, TARGETS.gitignore);
  const entry = ".claude-team-cache/";

  const existing = readFileOrDefault(gitignorePath, "");
  if (existing.split("\n").some((line) => line.trim() === entry)) {
    return false; // Already present
  }

  const newContent = existing.endsWith("\n") || existing === ""
    ? existing + entry + "\n"
    : existing + "\n" + entry + "\n";

  writeFileSync(gitignorePath, newContent, "utf-8");
  return true;
}

/**
 * Run the full /init flow.
 */
export function init(options: InitOptions): InitResult {
  const { repoRoot, profileUrl, force = false, overlayOverride } = options;

  // Step 1: Check for existing lockfile
  if (lockfileExists(repoRoot) && !force) {
    throw new Error(
      "This repo already has a team profile configured (.claude-team-lock.json exists). " +
        "Use --force to re-initialize."
    );
  }

  // Step 2: Detect repo type
  const detectedOverlay = overlayOverride ?? detectOverlay(repoRoot);

  // Step 3: Fetch profile
  const ctx = createFetchContext(profileUrl);
  const profile = fetchProfile(ctx, detectedOverlay);

  // Step 4: Combine base + overlay into a single layer
  const combined = combineLayers(profile.base, profile.overlay);

  // Step 5: Determine which files will be modified
  const filesToBackup = [
    TARGETS.claudeMd,
    TARGETS.mcpJson,
    TARGETS.settingsJson,
  ];

  // Step 6: Create backup
  const backup = createBackup(repoRoot, filesToBackup);

  try {
    const filesModified: string[] = [];

    // Step 7: Apply managed sections to CLAUDE.md
    if (combined.claudeMdSections) {
      const claudeMdPath = join(repoRoot, TARGETS.claudeMd);
      const existing = readFileOrDefault(claudeMdPath, "");
      const result = upsertManagedSection(existing, combined.claudeMdSections);
      writeFileSafe(claudeMdPath, result.content);
      filesModified.push(TARGETS.claudeMd);
    }

    // Step 8: Deep merge .mcp.json
    if (combined.mcpJson) {
      const mcpPath = join(repoRoot, TARGETS.mcpJson);
      const existing = readFileOrDefault(mcpPath, "{}");
      const local = JSON.parse(existing);
      const merged = deepMerge(local, combined.mcpJson as Record<string, unknown>);
      writeFileSafe(mcpPath, JSON.stringify(merged, null, 2) + "\n");
      filesModified.push(TARGETS.mcpJson);
    }

    // Step 9: Deep merge settings.json and hooks
    let teamHookRefs: Record<string, TeamHookRef[]> = {};

    const settingsPath = join(repoRoot, TARGETS.settingsJson);
    const existingSettings = readFileOrDefault(settingsPath, "{}");
    let localSettings = JSON.parse(existingSettings);

    // Merge non-hook settings first
    if (combined.settingsJson) {
      const { hooks: _profileHooks, ...profileSettingsWithoutHooks } =
        combined.settingsJson as Record<string, unknown>;
      if (Object.keys(profileSettingsWithoutHooks).length > 0) {
        localSettings = deepMerge(localSettings, profileSettingsWithoutHooks);
      }
    }

    // Merge hooks
    if (combined.hooksJson) {
      const hookResult = mergeHooksInSettings(
        localSettings,
        combined.hooksJson as Record<string, unknown>,
        {} // No existing team refs on init
      );
      localSettings = hookResult.settings;
      teamHookRefs = hookResult.newTeamRefs;
    }

    writeFileSafe(settingsPath, JSON.stringify(localSettings, null, 2) + "\n");
    filesModified.push(TARGETS.settingsJson);

    // Step 10: Write lockfile
    const lockfile = buildLockfile({
      profileUrl,
      version: profile.metadata.version,
      overlays: detectedOverlay ? [detectedOverlay] : [],
      managedSectionContent: combined.claudeMdSections ?? "",
      mcpJsonProfileContent: combined.mcpJson
        ? JSON.stringify(combined.mcpJson)
        : "",
      settingsJsonProfileContent: combined.settingsJson
        ? JSON.stringify(combined.settingsJson)
        : "",
      hooksProfileContent: combined.hooksJson
        ? JSON.stringify(combined.hooksJson)
        : "",
      teamHookRefs,
    });
    writeLockfile(repoRoot, lockfile);
    filesModified.push(TARGETS.lockfile);

    // Step 11: Update .gitignore
    if (ensureGitignore(repoRoot)) {
      filesModified.push(TARGETS.gitignore);
    }

    // Success — clean up backup
    backup.cleanup();

    return {
      profileName: profile.metadata.name,
      profileVersion: profile.metadata.version,
      overlay: detectedOverlay,
      filesModified,
    };
  } catch (error) {
    // Rollback on any error
    backup.restore();
    throw error;
  }
}
