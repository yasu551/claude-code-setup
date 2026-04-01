import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { TeamHookRef } from "./merge.js";
import type { WizardAnswers } from "./wizard.js";

const LOCKFILE_NAME = ".claude-team-lock.json";

export interface Lockfile {
  profile: string;
  source: "remote" | "generated";
  version: string;
  appliedAt: string;
  overlays: string[];
  checksums: Record<string, string>;
  teamHookRefs?: Record<string, TeamHookRef[]>;
  fingerprint?: string;
  wizardAnswers?: WizardAnswers;
}

/**
 * Compute a sha256 checksum of a string.
 */
export function checksum(content: string): string {
  return "sha256:" + createHash("sha256").update(content, "utf-8").digest("hex");
}

/**
 * Read the lockfile from the repo root. Returns null if not found.
 */
export function readLockfile(repoRoot: string): Lockfile | null {
  const path = join(repoRoot, LOCKFILE_NAME);
  if (!existsSync(path)) {
    return null;
  }
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw) as Lockfile;
}

/**
 * Write the lockfile to the repo root.
 */
export function writeLockfile(repoRoot: string, lockfile: Lockfile): void {
  const path = join(repoRoot, LOCKFILE_NAME);
  writeFileSync(path, JSON.stringify(lockfile, null, 2) + "\n", "utf-8");
}

/**
 * Check if a lockfile exists in the repo root.
 */
export function lockfileExists(repoRoot: string): boolean {
  return existsSync(join(repoRoot, LOCKFILE_NAME));
}

/**
 * Build a lockfile from the given profile data and applied content.
 */
export function buildLockfile(opts: {
  profileUrl: string;
  version: string;
  overlays: string[];
  managedSectionContent: string;
  mcpJsonProfileContent: string;
  settingsJsonProfileContent: string;
  hooksProfileContent: string;
  teamHookRefs: Record<string, TeamHookRef[]>;
  source?: "remote" | "generated";
  fingerprint?: string;
  wizardAnswers?: WizardAnswers;
}): Lockfile {
  const lockfile: Lockfile = {
    profile: opts.profileUrl,
    source: opts.source ?? "remote",
    version: opts.version,
    appliedAt: new Date().toISOString(),
    overlays: opts.overlays,
    checksums: {
      "CLAUDE.md.managed": checksum(opts.managedSectionContent),
      ".mcp.json.profile": checksum(opts.mcpJsonProfileContent),
      "settings.json.profile": checksum(opts.settingsJsonProfileContent),
      "hooks.json.team": checksum(opts.hooksProfileContent),
    },
    teamHookRefs: opts.teamHookRefs,
  };

  if (opts.fingerprint) lockfile.fingerprint = opts.fingerprint;
  if (opts.wizardAnswers) lockfile.wizardAnswers = opts.wizardAnswers;

  return lockfile;
}
