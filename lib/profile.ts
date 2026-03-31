import { execSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface ProfileMetadata {
  name: string;
  version: string;
  description: string;
  overlays: string[];
  defaultOverlay: string | null;
  minimumPluginVersion: string;
}

export interface ProfileFiles {
  metadata: ProfileMetadata;
  base: ProfileLayer;
  overlay: ProfileLayer | null;
}

export interface ProfileLayer {
  claudeMdSections: string | null;
  hooksJson: Record<string, unknown> | null;
  settingsJson: Record<string, unknown> | null;
  mcpJson: Record<string, unknown> | null;
}

/**
 * Parse a GitHub URL into owner/repo format.
 * Accepts:
 *   - github.com/owner/repo
 *   - https://github.com/owner/repo
 *   - owner/repo
 */
export function parseProfileUrl(url: string): { owner: string; repo: string } {
  const cleaned = url
    .replace(/^https?:\/\//, "")
    .replace(/^github\.com\//, "")
    .replace(/\.git$/, "")
    .replace(/\/$/, "");

  const parts = cleaned.split("/");
  if (parts.length < 2) {
    throw new Error(
      `Invalid profile URL: "${url}". Expected format: owner/repo or github.com/owner/repo`
    );
  }
  return { owner: parts[0], repo: parts[1] };
}

// ---------------------------------------------------------------------------
// Fetch strategies
// ---------------------------------------------------------------------------

type FetchFn = (owner: string, repo: string, path: string) => string | null;

function fetchViaGh(owner: string, repo: string, path: string): string | null {
  try {
    execSync("gh auth status", { stdio: "pipe" });
    const result = execSync(
      `gh api repos/${owner}/${repo}/contents/${path} --jq '.content' 2>/dev/null`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    );
    if (!result.trim()) return null;
    return Buffer.from(result.trim(), "base64").toString("utf-8");
  } catch {
    return null;
  }
}

function fetchViaHttps(owner: string, repo: string, path: string): string | null {
  const token = process.env.GITHUB_TOKEN;
  const headers = token ? `-H "Authorization: Bearer ${token}"` : "";
  try {
    const result = execSync(
      `curl -sfL ${headers} "https://api.github.com/repos/${owner}/${repo}/contents/${path}" 2>/dev/null`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    );
    const parsed = JSON.parse(result);
    if (parsed.content) {
      return Buffer.from(parsed.content, "base64").toString("utf-8");
    }
    return null;
  } catch {
    return null;
  }
}

function fetchFromLocal(localPath: string, filePath: string): string | null {
  const full = join(localPath, filePath);
  if (existsSync(full)) {
    return readFileSync(full, "utf-8");
  }
  return null;
}

function listDirViaGh(owner: string, repo: string, dirPath: string): string[] {
  try {
    const result = execSync(
      `gh api repos/${owner}/${repo}/contents/${dirPath} --jq '.[].name' 2>/dev/null`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    );
    return result.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function listDirViaHttps(owner: string, repo: string, dirPath: string): string[] {
  const token = process.env.GITHUB_TOKEN;
  const headers = token ? `-H "Authorization: Bearer ${token}"` : "";
  try {
    const result = execSync(
      `curl -sfL ${headers} "https://api.github.com/repos/${owner}/${repo}/contents/${dirPath}" 2>/dev/null`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    );
    const parsed = JSON.parse(result);
    if (Array.isArray(parsed)) {
      return parsed.map((item: { name: string }) => item.name);
    }
    return [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Profile loader
// ---------------------------------------------------------------------------

export interface FetchContext {
  mode: "github" | "local";
  owner?: string;
  repo?: string;
  localPath?: string;
  fetchFile: (path: string) => string | null;
  listDir: (path: string) => string[];
}

/**
 * Create a fetch context from a profile URL or local path.
 */
export function createFetchContext(profileUrl: string): FetchContext {
  // Check if it's a local path
  if (existsSync(profileUrl) || profileUrl.startsWith("/") || profileUrl.startsWith("./")) {
    return {
      mode: "local",
      localPath: profileUrl,
      fetchFile: (path) => fetchFromLocal(profileUrl, path),
      listDir: (path) => {
        const full = join(profileUrl, path);
        if (existsSync(full)) {
          return readdirSync(full);
        }
        return [];
      },
    };
  }

  const { owner, repo } = parseProfileUrl(profileUrl);

  // Try gh first, fall back to https
  const ghAvailable = (() => {
    try {
      execSync("gh auth status", { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  })();

  const fetchFile: FetchFn = ghAvailable ? fetchViaGh : fetchViaHttps;
  const listDir = ghAvailable
    ? (path: string) => listDirViaGh(owner, repo, path)
    : (path: string) => listDirViaHttps(owner, repo, path);

  return {
    mode: "github",
    owner,
    repo,
    fetchFile: (path) => fetchFile(owner, repo, path),
    listDir,
  };
}

/**
 * Fetch and parse profile metadata.
 */
export function fetchProfileMetadata(ctx: FetchContext): ProfileMetadata {
  const raw = ctx.fetchFile("profile.json");
  if (!raw) {
    throw new Error("Could not fetch profile.json from profile repository");
  }

  const parsed = JSON.parse(raw);

  // Validate required fields
  if (!parsed.name || !parsed.version) {
    throw new Error("Invalid profile.json: missing required fields 'name' and 'version'");
  }

  return {
    name: parsed.name,
    version: parsed.version,
    description: parsed.description ?? "",
    overlays: parsed.overlays ?? [],
    defaultOverlay: parsed.defaultOverlay ?? null,
    minimumPluginVersion: parsed.minimumPluginVersion ?? "0.0.0",
  };
}

/**
 * Fetch a profile layer (base or overlay).
 */
function fetchLayer(ctx: FetchContext, prefix: string): ProfileLayer {
  const claudeMd = ctx.fetchFile(`${prefix}/CLAUDE.md.sections`);
  const hooksRaw = ctx.fetchFile(`${prefix}/hooks.json`);
  const settingsRaw = ctx.fetchFile(`${prefix}/settings.json`);
  const mcpRaw = ctx.fetchFile(`${prefix}/.mcp.json`);

  return {
    claudeMdSections: claudeMd,
    hooksJson: hooksRaw ? JSON.parse(hooksRaw) : null,
    settingsJson: settingsRaw ? JSON.parse(settingsRaw) : null,
    mcpJson: mcpRaw ? JSON.parse(mcpRaw) : null,
  };
}

/**
 * Fetch all profile files: metadata, base layer, and optional overlay.
 */
export function fetchProfile(
  ctx: FetchContext,
  overlayName: string | null
): ProfileFiles {
  const metadata = fetchProfileMetadata(ctx);

  // Resolve overlay: profile default takes precedence, then detected
  const effectiveOverlay = metadata.defaultOverlay ?? overlayName;

  const base = fetchLayer(ctx, "base");

  let overlay: ProfileLayer | null = null;
  if (effectiveOverlay && metadata.overlays.includes(effectiveOverlay)) {
    overlay = fetchLayer(ctx, `overlays/${effectiveOverlay}`);
  }

  return { metadata, base, overlay };
}

/**
 * Combine base and overlay layers into a single merged layer.
 * For CLAUDE.md.sections: overlay appends to base.
 * For JSON files: overlay deep-merges on top of base.
 */
export function combineLayers(base: ProfileLayer, overlay: ProfileLayer | null): ProfileLayer {
  if (!overlay) return base;

  // CLAUDE.md sections: concatenate (overlay appended after base)
  let claudeMd = base.claudeMdSections;
  if (overlay.claudeMdSections) {
    claudeMd = claudeMd
      ? claudeMd + "\n\n" + overlay.claudeMdSections
      : overlay.claudeMdSections;
  }

  // JSON files: simple shallow merge (overlay on top of base)
  // Note: this is base+overlay composition, not profile+local merge.
  // The deep merge with local files happens in init.ts.
  const mergeJson = (
    a: Record<string, unknown> | null,
    b: Record<string, unknown> | null
  ): Record<string, unknown> | null => {
    if (!a && !b) return null;
    if (!a) return b;
    if (!b) return a;
    return { ...a, ...b };
  };

  return {
    claudeMdSections: claudeMd,
    hooksJson: mergeJson(base.hooksJson, overlay.hooksJson),
    settingsJson: mergeJson(base.settingsJson, overlay.settingsJson),
    mcpJson: mergeJson(base.mcpJson, overlay.mcpJson),
  };
}
