import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { extractManagedSection } from "./merge.js";
import { readLockfile, checksum } from "./lockfile.js";
import type { Lockfile } from "./lockfile.js";
import { createFetchContext, fetchProfileMetadata } from "./profile.js";

const TARGETS = {
  claudeMd: "CLAUDE.md",
  mcpJson: ".mcp.json",
  settingsJson: ".claude/settings.json",
} as const;

const VERSION_CACHE_FILE = ".claude-team-cache/version-check.json";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface VersionCache {
  latestVersion: string;
  checkedAt: string;
}

export interface FileDrift {
  file: string;
  status: "ok" | "modified" | "missing";
  detail?: string;
}

export interface StatusResult {
  configured: boolean;
  profileUrl?: string;
  currentVersion?: string;
  latestVersion?: string;
  lastSyncDate?: string;
  updateAvailable: boolean;
  drift: FileDrift[];
}

/**
 * Read the version check cache. Returns null if missing or expired.
 */
export function readVersionCache(repoRoot: string): VersionCache | null {
  const path = join(repoRoot, VERSION_CACHE_FILE);
  if (!existsSync(path)) return null;

  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as VersionCache;
    const checkedAt = new Date(raw.checkedAt).getTime();
    if (Date.now() - checkedAt > CACHE_TTL_MS) return null;
    return raw;
  } catch {
    return null;
  }
}

/**
 * Write the version check cache.
 */
export function writeVersionCache(
  repoRoot: string,
  latestVersion: string
): void {
  const path = join(repoRoot, VERSION_CACHE_FILE);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify({
      latestVersion,
      checkedAt: new Date().toISOString(),
    }),
    "utf-8"
  );
}

/**
 * Detect drift for each managed file by comparing checksums.
 */
function detectDrift(repoRoot: string, lockfile: Lockfile): FileDrift[] {
  const drifts: FileDrift[] = [];

  // CLAUDE.md managed section
  const claudeMdPath = join(repoRoot, TARGETS.claudeMd);
  if (!existsSync(claudeMdPath)) {
    drifts.push({ file: TARGETS.claudeMd, status: "missing" });
  } else {
    const doc = readFileSync(claudeMdPath, "utf-8");
    const managed = extractManagedSection(doc);
    const expected = lockfile.checksums["CLAUDE.md.managed"];
    if (managed === null) {
      drifts.push({
        file: TARGETS.claudeMd,
        status: "modified",
        detail: "Managed section markers removed",
      });
    } else if (expected && checksum(managed) !== expected) {
      drifts.push({
        file: TARGETS.claudeMd,
        status: "modified",
        detail: "Managed section content changed",
      });
    } else {
      drifts.push({ file: TARGETS.claudeMd, status: "ok" });
    }
  }

  // .mcp.json — just check existence, not content drift
  // (deep merge means local always differs from profile source)
  const mcpPath = join(repoRoot, TARGETS.mcpJson);
  if (lockfile.checksums[".mcp.json.profile"]) {
    if (!existsSync(mcpPath)) {
      drifts.push({ file: TARGETS.mcpJson, status: "missing" });
    } else {
      drifts.push({ file: TARGETS.mcpJson, status: "ok" });
    }
  }

  // settings.json — same approach
  const settingsPath = join(repoRoot, TARGETS.settingsJson);
  if (lockfile.checksums["settings.json.profile"]) {
    if (!existsSync(settingsPath)) {
      drifts.push({ file: TARGETS.settingsJson, status: "missing" });
    } else {
      drifts.push({ file: TARGETS.settingsJson, status: "ok" });
    }
  }

  return drifts;
}

/**
 * Run the /status command.
 */
export function status(repoRoot: string): StatusResult {
  const lockfile = readLockfile(repoRoot);

  if (!lockfile) {
    return {
      configured: false,
      updateAvailable: false,
      drift: [],
    };
  }

  // Check version: use cache if warm, otherwise fetch
  let latestVersion: string = lockfile.version;
  const cached = readVersionCache(repoRoot);

  if (cached) {
    latestVersion = cached.latestVersion;
  } else {
    try {
      const ctx = createFetchContext(lockfile.profile);
      const metadata = fetchProfileMetadata(ctx);
      latestVersion = metadata.version;
      writeVersionCache(repoRoot, latestVersion);
    } catch {
      // Network error — use lockfile version as fallback
      latestVersion = lockfile.version;
    }
  }

  const drift = detectDrift(repoRoot, lockfile);

  return {
    configured: true,
    profileUrl: lockfile.profile,
    currentVersion: lockfile.version,
    latestVersion,
    lastSyncDate: lockfile.appliedAt,
    updateAvailable: latestVersion !== lockfile.version,
    drift,
  };
}
