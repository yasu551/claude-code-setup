import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { detectOverlay } from "./detect.js";
import { createFetchContext, fetchProfile, combineLayers } from "./profile.js";
import type { ProfileLayer } from "./profile.js";
import {
  upsertManagedSection,
  deepMerge,
  mergeHooksInSettings,
} from "./merge.js";
import type { TeamHookRef } from "./merge.js";
import { buildLockfile, writeLockfile, lockfileExists } from "./lockfile.js";
import { createBackup } from "./backup.js";
import { inspectRepo, hashFingerprint } from "./inspect.js";
import type { RepoFingerprint } from "./inspect.js";
import { getWizardQuestions, resolveAnswers } from "./wizard.js";
import type { WizardQuestion, WizardAnswers, ProfileWizardAnswers, ProfileWizardQuestion } from "./wizard.js";
import { getProfileWizardQuestions } from "./wizard.js";
import { generateProfile, formatProvenanceReport } from "./generate.js";
import { createTeamProfile } from "./profile-create.js";
import type { ProfileCreateResult } from "./profile-create.js";

export interface InitOptions {
  repoRoot: string;
  profileUrl?: string;
  force?: boolean;
  overlayOverride?: string | null;
  wizardAnswers?: Partial<WizardAnswers>;
  profileWizardAnswers?: ProfileWizardAnswers;
}

export interface InitResult {
  profileName: string;
  profileVersion: string;
  overlay: string | null;
  filesModified: string[];
  provenanceReport?: string;
  profileCreation?: boolean;
}

export interface WizardInfo {
  fingerprint: RepoFingerprint;
  questions: WizardQuestion[];
  isEmptyRepo: boolean;
}

export interface ProfileWizardInfo {
  questions: ProfileWizardQuestion[];
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
 * Inspect the repo and return the wizard questions that need to be asked.
 * Call this when /init is invoked without a profile URL.
 */
export function getWizardInfo(repoRoot: string): WizardInfo {
  const fingerprint = inspectRepo(repoRoot);
  const questions = getWizardQuestions(fingerprint);
  const isEmptyRepo = fingerprint.language === null;
  return { fingerprint, questions, isEmptyRepo };
}

/**
 * Get profile wizard questions for creating a team profile repo.
 * Call this when /init detects an empty repo (no language files).
 */
export function getProfileWizardInfo(): ProfileWizardInfo {
  const questions = getProfileWizardQuestions();
  return { questions };
}

/**
 * Apply a ProfileLayer to the repo (shared between fetched and generated paths).
 */
function applyLayer(
  repoRoot: string,
  combined: ProfileLayer,
  lockfileOpts: Parameters<typeof buildLockfile>[0]
): { filesModified: string[] } {
  const filesToBackup = [
    TARGETS.claudeMd,
    TARGETS.mcpJson,
    TARGETS.settingsJson,
  ];
  const backup = createBackup(repoRoot, filesToBackup);

  try {
    const filesModified: string[] = [];

    // Apply managed sections to CLAUDE.md
    if (combined.claudeMdSections) {
      const claudeMdPath = join(repoRoot, TARGETS.claudeMd);
      const existing = readFileOrDefault(claudeMdPath, "");
      const result = upsertManagedSection(existing, combined.claudeMdSections);
      writeFileSafe(claudeMdPath, result.content);
      filesModified.push(TARGETS.claudeMd);
    }

    // Deep merge .mcp.json
    if (combined.mcpJson) {
      const mcpPath = join(repoRoot, TARGETS.mcpJson);
      const existing = readFileOrDefault(mcpPath, "{}");
      const local = JSON.parse(existing);
      const merged = deepMerge(local, combined.mcpJson as Record<string, unknown>);
      writeFileSafe(mcpPath, JSON.stringify(merged, null, 2) + "\n");
      filesModified.push(TARGETS.mcpJson);
    }

    // Deep merge settings.json and hooks
    let teamHookRefs: Record<string, TeamHookRef[]> = {};

    const settingsPath = join(repoRoot, TARGETS.settingsJson);
    const existingSettings = readFileOrDefault(settingsPath, "{}");
    let localSettings = JSON.parse(existingSettings);

    if (combined.settingsJson) {
      const { hooks: _profileHooks, ...profileSettingsWithoutHooks } =
        combined.settingsJson as Record<string, unknown>;
      if (Object.keys(profileSettingsWithoutHooks).length > 0) {
        localSettings = deepMerge(localSettings, profileSettingsWithoutHooks);
      }
    }

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

    // Write lockfile
    const lockfile = buildLockfile({ ...lockfileOpts, teamHookRefs });
    writeLockfile(repoRoot, lockfile);
    filesModified.push(TARGETS.lockfile);

    // Update .gitignore
    if (ensureGitignore(repoRoot)) {
      filesModified.push(TARGETS.gitignore);
    }

    backup.cleanup();
    return { filesModified };
  } catch (error) {
    backup.restore();
    throw error;
  }
}

/**
 * Run the full /init flow.
 * If profileUrl is provided, fetches from the remote profile (existing behavior).
 * If profileUrl is omitted, uses the wizard to generate a profile.
 */
export function init(options: InitOptions): InitResult {
  const { repoRoot, profileUrl, force = false, overlayOverride, wizardAnswers: userAnswers } = options;

  // Step 1: Check for existing lockfile
  if (lockfileExists(repoRoot) && !force) {
    throw new Error(
      "This repo already has a team profile configured (.claude-team-lock.json exists). " +
        "Use --force to re-initialize."
    );
  }

  // === PROFILE CREATION PATH (empty repo → create team profile) ===
  if (!profileUrl && options.profileWizardAnswers) {
    const result = createTeamProfile(repoRoot, options.profileWizardAnswers, { force });
    return {
      profileName: "team-profile",
      profileVersion: "1.0.0",
      overlay: null,
      filesModified: result.filesWritten,
      provenanceReport: result.provenanceReport,
      profileCreation: true,
    };
  }

  // === FETCHED PROFILE PATH (existing behavior) ===
  if (profileUrl) {
    const detectedOverlay = overlayOverride ?? detectOverlay(repoRoot);
    const ctx = createFetchContext(profileUrl);
    const profile = fetchProfile(ctx, detectedOverlay);
    const combined = combineLayers(profile.base, profile.overlay);

    const { filesModified } = applyLayer(repoRoot, combined, {
      profileUrl,
      version: profile.metadata.version,
      overlays: detectedOverlay ? [detectedOverlay] : [],
      managedSectionContent: combined.claudeMdSections ?? "",
      mcpJsonProfileContent: combined.mcpJson ? JSON.stringify(combined.mcpJson) : "",
      settingsJsonProfileContent: combined.settingsJson ? JSON.stringify(combined.settingsJson) : "",
      hooksProfileContent: combined.hooksJson ? JSON.stringify(combined.hooksJson) : "",
      teamHookRefs: {},
      source: "remote",
    });

    return {
      profileName: profile.metadata.name,
      profileVersion: profile.metadata.version,
      overlay: detectedOverlay,
      filesModified,
    };
  }

  // === GENERATED PROFILE PATH (wizard) ===
  const fingerprint = inspectRepo(repoRoot);
  const answers = resolveAnswers(fingerprint, userAnswers ?? {});
  const { layer, provenance } = generateProfile(fingerprint, answers);

  const fpHash = hashFingerprint(fingerprint);

  const { filesModified } = applyLayer(repoRoot, layer, {
    profileUrl: "generated",
    version: "1.0.0",
    overlays: fingerprint.language ? [fingerprint.language] : [],
    managedSectionContent: layer.claudeMdSections ?? "",
    mcpJsonProfileContent: layer.mcpJson ? JSON.stringify(layer.mcpJson) : "",
    settingsJsonProfileContent: layer.settingsJson ? JSON.stringify(layer.settingsJson) : "",
    hooksProfileContent: layer.hooksJson ? JSON.stringify(layer.hooksJson) : "",
    teamHookRefs: {},
    source: "generated",
    fingerprint: fpHash,
    wizardAnswers: answers,
  });

  const provenanceReport = formatProvenanceReport(fingerprint, answers, provenance, filesModified);

  return {
    profileName: "generated",
    profileVersion: "1.0.0",
    overlay: fingerprint.language,
    filesModified,
    provenanceReport,
  };
}
