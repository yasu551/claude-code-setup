/**
 * Pre-session drift check hook.
 *
 * Designed to run on Claude Code startup via hooks.json.
 * Reads lockfile and cached version info, prints a one-line warning
 * if the team profile has a newer version available.
 *
 * Performance target: < 100ms when cache is warm (no network).
 * On cold cache: fetches profile.json from GitHub API (may take longer).
 */

import { readLockfile } from "./lockfile.js";
import { readVersionCache, writeVersionCache } from "./status.js";
import { createFetchContext, fetchProfileMetadata } from "./profile.js";

export interface DriftCheckResult {
  hasUpdate: boolean;
  currentVersion?: string;
  latestVersion?: string;
  message: string;
}

/**
 * Run the drift check. Returns a result with the message to display.
 * This function never throws — all errors are caught and result in a silent pass.
 */
export function driftCheck(repoRoot: string): DriftCheckResult {
  try {
    const lockfile = readLockfile(repoRoot);
    if (!lockfile) {
      return { hasUpdate: false, message: "" };
    }

    // Check cached version first (fast path, no network)
    const cached = readVersionCache(repoRoot);
    if (cached) {
      if (cached.latestVersion !== lockfile.version) {
        return {
          hasUpdate: true,
          currentVersion: lockfile.version,
          latestVersion: cached.latestVersion,
          message: `Team profile v${cached.latestVersion} available (you're on v${lockfile.version}). Run /sync to update.`,
        };
      }
      return { hasUpdate: false, message: "" };
    }

    // Cold cache — fetch from remote
    try {
      const ctx = createFetchContext(lockfile.profile);
      const metadata = fetchProfileMetadata(ctx);
      writeVersionCache(repoRoot, metadata.version);

      if (metadata.version !== lockfile.version) {
        return {
          hasUpdate: true,
          currentVersion: lockfile.version,
          latestVersion: metadata.version,
          message: `Team profile v${metadata.version} available (you're on v${lockfile.version}). Run /sync to update.`,
        };
      }
    } catch {
      // Network error on cold cache — skip silently
    }

    return { hasUpdate: false, message: "" };
  } catch {
    // Any error — fail silently, don't block the session
    return { hasUpdate: false, message: "" };
  }
}

// When run directly as a script
const repoRoot = process.cwd();
const result = driftCheck(repoRoot);
if (result.message) {
  console.log(result.message);
}
