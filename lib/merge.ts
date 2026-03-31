/**
 * Merge engine for claude-code-setup.
 *
 * Three merge strategies:
 * 1. Managed sections — for CLAUDE.md (marker-delimited team-owned blocks)
 * 2. Recursive deep merge — for .mcp.json and settings.json (profile keys win at leaf)
 * 3. Hook array merge — for hooks in settings.json (team hooks replaced, user hooks preserved)
 */

// ---------------------------------------------------------------------------
// Managed Sections
// ---------------------------------------------------------------------------

const BEGIN_MARKER = "<!-- claude-code-setup:begin — DO NOT EDIT THIS SECTION -->";
const END_MARKER = "<!-- claude-code-setup:end -->";

export interface ManagedSectionsResult {
  content: string;
  hadExistingSection: boolean;
  existingManagedContent: string | null;
}

/**
 * Insert or replace managed section content in a document.
 * If markers already exist, replaces content between them.
 * If no markers exist, prepends the managed section to the document.
 */
export function upsertManagedSection(
  document: string,
  sectionContent: string
): ManagedSectionsResult {
  const existing = extractManagedSection(document);
  const managedBlock = `${BEGIN_MARKER}\n${sectionContent}\n${END_MARKER}`;

  if (existing !== null) {
    const beginIdx = document.indexOf(BEGIN_MARKER);
    const endIdx = document.indexOf(END_MARKER) + END_MARKER.length;
    const before = document.slice(0, beginIdx);
    const after = document.slice(endIdx);
    return {
      content: before + managedBlock + after,
      hadExistingSection: true,
      existingManagedContent: existing,
    };
  }

  // No existing section — prepend
  const prefix = document.length > 0 ? managedBlock + "\n\n" : managedBlock + "\n";
  return {
    content: prefix + document,
    hadExistingSection: false,
    existingManagedContent: null,
  };
}

/**
 * Extract the content between managed section markers.
 * Returns null if no markers found.
 */
export function extractManagedSection(document: string): string | null {
  const beginIdx = document.indexOf(BEGIN_MARKER);
  const endIdx = document.indexOf(END_MARKER);

  if (beginIdx === -1 || endIdx === -1 || endIdx <= beginIdx) {
    return null;
  }

  const contentStart = beginIdx + BEGIN_MARKER.length;
  const raw = document.slice(contentStart, endIdx);

  // Trim the leading and trailing newline that we add during upsert
  if (raw.startsWith("\n") && raw.endsWith("\n")) {
    return raw.slice(1, -1);
  }
  return raw;
}

/**
 * Remove managed section markers but keep the content.
 * Used by /detach to cleanly remove the plugin's footprint.
 */
export function removeManagedMarkers(document: string): string {
  const beginIdx = document.indexOf(BEGIN_MARKER);
  const endIdx = document.indexOf(END_MARKER);

  if (beginIdx === -1 || endIdx === -1 || endIdx <= beginIdx) {
    return document;
  }

  const before = document.slice(0, beginIdx);
  const innerContent = document.slice(beginIdx + BEGIN_MARKER.length, endIdx);
  const after = document.slice(endIdx + END_MARKER.length);

  // Clean up: the inner content has a leading \n, trim it
  const cleaned = innerContent.startsWith("\n") ? innerContent.slice(1) : innerContent;
  // The inner content has a trailing \n before END_MARKER, trim it
  const finalInner = cleaned.endsWith("\n") ? cleaned.slice(0, -1) : cleaned;

  return before + finalInner + after;
}

// ---------------------------------------------------------------------------
// Recursive Deep Merge
// ---------------------------------------------------------------------------

type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;
interface JsonObject {
  [key: string]: JsonValue;
}

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Recursive deep merge where profile keys win at leaf level.
 *
 * Algorithm:
 * - Key only in local → preserve
 * - Key only in profile → add
 * - Both exist, profile value is not an object → profile wins
 * - Both are objects → recurse
 * - Arrays are leaf values (profile wins, not merged element-wise)
 */
export function deepMerge(local: JsonObject, profile: JsonObject): JsonObject {
  const result: JsonObject = {};

  // Start with all local keys
  for (const key of Object.keys(local)) {
    if (!(key in profile)) {
      // Key only in local — preserve
      result[key] = local[key];
    } else {
      // Key in both
      const localVal = local[key];
      const profileVal = profile[key];

      if (isPlainObject(localVal) && isPlainObject(profileVal)) {
        // Both objects — recurse
        result[key] = deepMerge(localVal, profileVal);
      } else {
        // Profile wins (including arrays)
        result[key] = profileVal;
      }
    }
  }

  // Add keys only in profile
  for (const key of Object.keys(profile)) {
    if (!(key in local)) {
      result[key] = profile[key];
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Hook Array Merge
// ---------------------------------------------------------------------------

export interface HookEntry {
  matcher: string;
  command: string;
  [key: string]: unknown;
}

export interface TeamHookRef {
  matcher: string;
  command: string;
}

/**
 * Merge hook arrays. Team hooks (identified by matcher+command pairs in
 * teamHookRefs) are replaced with the new profile hooks. User hooks
 * (not in teamHookRefs) are preserved.
 *
 * Returns the merged hook array and the new team hook refs for the lockfile.
 */
export function mergeHooks(
  localHooks: HookEntry[],
  profileHooks: HookEntry[],
  teamHookRefs: TeamHookRef[]
): { merged: HookEntry[]; newTeamRefs: TeamHookRef[] } {
  // Remove old team hooks from local
  const userHooks = localHooks.filter(
    (h) => !teamHookRefs.some((ref) => ref.matcher === h.matcher && ref.command === h.command)
  );

  // New team refs from the profile
  const newTeamRefs: TeamHookRef[] = profileHooks.map((h) => ({
    matcher: h.matcher,
    command: h.command,
  }));

  // Combine: profile hooks first, then user hooks
  const merged = [...profileHooks, ...userHooks];

  return { merged, newTeamRefs };
}

/**
 * Merge hooks within a full settings object.
 * Profile provides a hooks.json with structure { hooks: { EventName: [...] } }.
 * Local settings may have a hooks key with the same structure.
 */
export function mergeHooksInSettings(
  localSettings: JsonObject,
  profileHooks: JsonObject,
  teamHookRefs: Record<string, TeamHookRef[]>
): { settings: JsonObject; newTeamRefs: Record<string, TeamHookRef[]> } {
  const localHooksObj = (localSettings["hooks"] ?? {}) as JsonObject;
  const profileHooksObj = (profileHooks["hooks"] ?? profileHooks) as JsonObject;
  const newTeamRefs: Record<string, TeamHookRef[]> = {};

  const mergedHooks: JsonObject = { ...localHooksObj };

  for (const eventName of Object.keys(profileHooksObj)) {
    const profileArray = profileHooksObj[eventName] as HookEntry[];
    const localArray = (localHooksObj[eventName] ?? []) as HookEntry[];
    const refs = teamHookRefs[eventName] ?? [];

    const result = mergeHooks(localArray, profileArray, refs);
    mergedHooks[eventName] = result.merged as unknown as JsonValue;
    newTeamRefs[eventName] = result.newTeamRefs;
  }

  return {
    settings: { ...localSettings, hooks: mergedHooks },
    newTeamRefs,
  };
}

// ---------------------------------------------------------------------------
// Exports for marker constants (useful for tests and other modules)
// ---------------------------------------------------------------------------

export const MARKERS = { BEGIN: BEGIN_MARKER, END: END_MARKER } as const;
