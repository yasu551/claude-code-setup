import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { createFetchContext, fetchProfile, combineLayers } from "./profile.js";
import type { ProfileLayer } from "./profile.js";
import {
  upsertManagedSection,
  extractManagedSection,
  deepMerge,
  mergeHooksInSettings,
} from "./merge.js";
import type { TeamHookRef } from "./merge.js";
import {
  readLockfile,
  writeLockfile,
  buildLockfile,
  checksum,
} from "./lockfile.js";
import type { Lockfile } from "./lockfile.js";
import { createBackup } from "./backup.js";
import { inspectRepo, hashFingerprint } from "./inspect.js";
import { resolveAnswers } from "./wizard.js";
import { generateProfile } from "./generate.js";

export interface SyncOptions {
  repoRoot: string;
  force?: boolean;
}

export interface SyncDiff {
  file: string;
  type: "updated" | "added" | "unchanged";
  detail?: string;
}

export interface ManagedSectionConflict {
  currentContent: string;
  newContent: string;
}

export interface SyncResult {
  status: "updated" | "up_to_date";
  fromVersion: string;
  toVersion: string;
  diffs: SyncDiff[];
  conflict: ManagedSectionConflict | null;
}

// Target file paths (same as init.ts)
const TARGETS = {
  claudeMd: "CLAUDE.md",
  mcpJson: ".mcp.json",
  settingsJson: ".claude/settings.json",
} as const;

function readFileOrDefault(path: string, defaultContent: string): string {
  if (existsSync(path)) {
    return readFileSync(path, "utf-8");
  }
  return defaultContent;
}

function writeFileSafe(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf-8");
}

/**
 * Check if the user has modified the managed section since the last sync.
 * Compares the current managed section content against the checksum in the lockfile.
 */
function detectManagedSectionConflict(
  repoRoot: string,
  lockfile: Lockfile
): boolean {
  const claudeMdPath = join(repoRoot, TARGETS.claudeMd);
  if (!existsSync(claudeMdPath)) return false;

  const doc = readFileSync(claudeMdPath, "utf-8");
  const currentManaged = extractManagedSection(doc);
  if (currentManaged === null) return false;

  const expectedChecksum = lockfile.checksums["CLAUDE.md.managed"];
  if (!expectedChecksum) return false;

  const actualChecksum = checksum(currentManaged);
  return actualChecksum !== expectedChecksum;
}

/**
 * Run the full /sync flow.
 */
export function sync(options: SyncOptions): SyncResult {
  const { repoRoot, force = false } = options;

  // Step 1: Read lockfile
  const lockfile = readLockfile(repoRoot);
  if (!lockfile) {
    throw new Error(
      "No profile configured. Run /init first to set up a team profile."
    );
  }

  // Step 2: Get latest profile (fetched or regenerated)
  let combined: ProfileLayer;
  let newVersion: string;
  let newProfileUrl: string;
  let newFingerprint: string | undefined;

  if (lockfile.source === "generated") {
    // Re-run inspection with stored wizard answers
    const fingerprint = inspectRepo(repoRoot);
    const answers = resolveAnswers(fingerprint, lockfile.wizardAnswers ?? {});
    const { layer } = generateProfile(fingerprint, answers);
    combined = layer;
    newVersion = "1.0.0";
    newProfileUrl = "generated";
    newFingerprint = hashFingerprint(fingerprint);

    // For generated profiles, check if fingerprint changed (instead of version)
    if (newFingerprint === lockfile.fingerprint) {
      return {
        status: "up_to_date",
        fromVersion: lockfile.version,
        toVersion: newVersion,
        diffs: [],
        conflict: null,
      };
    }
  } else {
    const ctx = createFetchContext(lockfile.profile);
    const overlayName = lockfile.overlays.length > 0 ? lockfile.overlays[0] : null;
    const profile = fetchProfile(ctx, overlayName);
    combined = combineLayers(profile.base, profile.overlay);
    newVersion = profile.metadata.version;
    newProfileUrl = lockfile.profile;

    // Check if already up to date
    if (profile.metadata.version === lockfile.version) {
      return {
        status: "up_to_date",
        fromVersion: lockfile.version,
        toVersion: profile.metadata.version,
        diffs: [],
        conflict: null,
      };
    }
  }

  // Step 4: Detect managed section conflict
  let conflict: ManagedSectionConflict | null = null;
  if (!force && detectManagedSectionConflict(repoRoot, lockfile)) {
    const doc = readFileSync(join(repoRoot, TARGETS.claudeMd), "utf-8");
    const currentContent = extractManagedSection(doc) ?? "";
    conflict = {
      currentContent,
      newContent: combined.claudeMdSections ?? "",
    };
  }

  // If there's a conflict and not forced, return with the conflict info
  // The caller (command handler) should present this to the user
  if (conflict && !force) {
    return {
      status: "updated",
      fromVersion: lockfile.version,
      toVersion: newVersion,
      diffs: [],
      conflict,
    };
  }

  // Step 5: Create backup
  const filesToBackup = [
    TARGETS.claudeMd,
    TARGETS.mcpJson,
    TARGETS.settingsJson,
  ];
  const backup = createBackup(repoRoot, filesToBackup);

  try {
    const diffs: SyncDiff[] = [];

    // Step 6: Update managed sections in CLAUDE.md
    if (combined.claudeMdSections) {
      const claudeMdPath = join(repoRoot, TARGETS.claudeMd);
      const existing = readFileOrDefault(claudeMdPath, "");
      const result = upsertManagedSection(existing, combined.claudeMdSections);
      writeFileSafe(claudeMdPath, result.content);

      diffs.push({
        file: TARGETS.claudeMd,
        type: result.hadExistingSection ? "updated" : "added",
        detail: result.hadExistingSection
          ? "Managed section updated"
          : "Managed section added",
      });
    }

    // Step 7: Deep merge .mcp.json
    if (combined.mcpJson) {
      const mcpPath = join(repoRoot, TARGETS.mcpJson);
      const existing = readFileOrDefault(mcpPath, "{}");
      const local = JSON.parse(existing);
      const merged = deepMerge(local, combined.mcpJson as Record<string, unknown>);
      const newContent = JSON.stringify(merged, null, 2) + "\n";
      const oldContent = JSON.stringify(local, null, 2) + "\n";

      if (newContent !== oldContent) {
        writeFileSafe(mcpPath, newContent);
        diffs.push({ file: TARGETS.mcpJson, type: "updated" });
      } else {
        diffs.push({ file: TARGETS.mcpJson, type: "unchanged" });
      }
    }

    // Step 8: Deep merge settings.json + hooks
    let teamHookRefs: Record<string, TeamHookRef[]> =
      lockfile.teamHookRefs ?? {};

    const settingsPath = join(repoRoot, TARGETS.settingsJson);
    const existingSettings = readFileOrDefault(settingsPath, "{}");
    let localSettings = JSON.parse(existingSettings);
    const originalSettings = JSON.stringify(localSettings, null, 2);

    // Merge non-hook settings
    if (combined.settingsJson) {
      const { hooks: _h, ...profileSettingsWithoutHooks } =
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
        teamHookRefs
      );
      localSettings = hookResult.settings;
      teamHookRefs = hookResult.newTeamRefs;
    }

    const newSettings = JSON.stringify(localSettings, null, 2);
    if (newSettings !== originalSettings) {
      writeFileSafe(settingsPath, newSettings + "\n");
      diffs.push({ file: TARGETS.settingsJson, type: "updated" });
    } else {
      diffs.push({ file: TARGETS.settingsJson, type: "unchanged" });
    }

    // Step 9: Write updated lockfile
    const newLockfile = buildLockfile({
      profileUrl: newProfileUrl,
      version: newVersion,
      overlays: lockfile.overlays,
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
      source: lockfile.source ?? "remote",
      fingerprint: newFingerprint,
      wizardAnswers: lockfile.wizardAnswers,
    });
    writeLockfile(repoRoot, newLockfile);

    // Success — clean up backup
    backup.cleanup();

    return {
      status: "updated",
      fromVersion: lockfile.version,
      toVersion: newVersion,
      diffs,
      conflict: null,
    };
  } catch (error) {
    backup.restore();
    throw error;
  }
}

/**
 * Apply a sync after the user has confirmed a managed section conflict.
 * Re-runs sync with force=true.
 */
export function syncForceAfterConflict(repoRoot: string): SyncResult {
  return sync({ repoRoot, force: true });
}
