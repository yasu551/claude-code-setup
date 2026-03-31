import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { removeManagedMarkers } from "./merge.js";
import { readLockfile } from "./lockfile.js";
import type { TeamHookRef } from "./merge.js";

const TARGETS = {
  claudeMd: "CLAUDE.md",
  settingsJson: ".claude/settings.json",
  lockfile: ".claude-team-lock.json",
  cache: ".claude-team-cache",
} as const;

export interface DetachResult {
  actions: string[];
}

/**
 * Remove team hooks from settings.json using lockfile's teamHookRefs.
 */
function removeTeamHooks(
  repoRoot: string,
  teamHookRefs: Record<string, TeamHookRef[]>
): boolean {
  const settingsPath = join(repoRoot, TARGETS.settingsJson);
  if (!existsSync(settingsPath)) return false;

  const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
  if (!settings.hooks) return false;

  let modified = false;

  for (const [eventName, refs] of Object.entries(teamHookRefs)) {
    const hooks = settings.hooks[eventName];
    if (!Array.isArray(hooks)) continue;

    const filtered = hooks.filter(
      (h: { matcher: string; command: string }) =>
        !refs.some(
          (ref) => ref.matcher === h.matcher && ref.command === h.command
        )
    );

    if (filtered.length !== hooks.length) {
      settings.hooks[eventName] = filtered;
      modified = true;
    }

    // Clean up empty arrays
    if (filtered.length === 0) {
      delete settings.hooks[eventName];
    }
  }

  // Clean up empty hooks object
  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  if (modified) {
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
  }

  return modified;
}

/**
 * Run the /detach command — remove profile from repo.
 */
export function detach(repoRoot: string): DetachResult {
  const lockfile = readLockfile(repoRoot);
  if (!lockfile) {
    throw new Error(
      "No profile configured. Nothing to detach."
    );
  }

  const actions: string[] = [];

  // Step 1: Remove managed section markers from CLAUDE.md
  const claudeMdPath = join(repoRoot, TARGETS.claudeMd);
  if (existsSync(claudeMdPath)) {
    const doc = readFileSync(claudeMdPath, "utf-8");
    const cleaned = removeManagedMarkers(doc);
    if (cleaned !== doc) {
      writeFileSync(claudeMdPath, cleaned);
      actions.push("Removed managed section markers from CLAUDE.md (content preserved)");
    }
  }

  // Step 2: .mcp.json and settings.json — leave as-is
  actions.push(".mcp.json and settings.json left as-is (merged state is the new baseline)");

  // Step 3: Remove team hooks
  if (lockfile.teamHookRefs && Object.keys(lockfile.teamHookRefs).length > 0) {
    const removed = removeTeamHooks(repoRoot, lockfile.teamHookRefs);
    if (removed) {
      actions.push("Removed team-owned hooks from settings.json");
    }
  }

  // Step 4: Delete lockfile
  const lockfilePath = join(repoRoot, TARGETS.lockfile);
  if (existsSync(lockfilePath)) {
    rmSync(lockfilePath);
    actions.push("Deleted .claude-team-lock.json");
  }

  // Step 5: Delete cache directory
  const cachePath = join(repoRoot, TARGETS.cache);
  if (existsSync(cachePath)) {
    rmSync(cachePath, { recursive: true, force: true });
    actions.push("Deleted .claude-team-cache/");
  }

  return { actions };
}
