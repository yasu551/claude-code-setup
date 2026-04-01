import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import type { ProfileMetadata, ProfileLayer } from "./profile.js";
import type { OverlayName } from "./detect.js";

export interface SerializeOptions {
  repoRoot: string;
  metadata: ProfileMetadata;
  baseLayer: ProfileLayer;
  overlays: Record<string, ProfileLayer>;
}

export interface SerializeResult {
  filesWritten: string[];
}

/**
 * Write a file, creating parent directories if needed.
 */
function writeSafe(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf-8");
}

/**
 * Write a ProfileLayer's non-null fields into a directory.
 * Returns the list of relative paths written.
 */
function writeLayerFiles(
  repoRoot: string,
  prefix: string,
  layer: ProfileLayer
): string[] {
  const written: string[] = [];

  if (layer.claudeMdSections) {
    const rel = `${prefix}/CLAUDE.md.sections`;
    writeSafe(join(repoRoot, rel), layer.claudeMdSections);
    written.push(rel);
  }

  if (layer.hooksJson) {
    const rel = `${prefix}/hooks.json`;
    writeSafe(join(repoRoot, rel), JSON.stringify(layer.hooksJson, null, 2) + "\n");
    written.push(rel);
  }

  if (layer.settingsJson) {
    const rel = `${prefix}/settings.json`;
    writeSafe(join(repoRoot, rel), JSON.stringify(layer.settingsJson, null, 2) + "\n");
    written.push(rel);
  }

  if (layer.mcpJson) {
    const rel = `${prefix}/.mcp.json`;
    writeSafe(join(repoRoot, rel), JSON.stringify(layer.mcpJson, null, 2) + "\n");
    written.push(rel);
  }

  return written;
}

/**
 * Generate a README.md for the profile repo.
 */
function generateReadme(metadata: ProfileMetadata, overlayNames: string[]): string {
  const lines: string[] = [
    `# ${metadata.name}`,
    "",
    metadata.description || "A Claude Code team profile.",
    "",
    "## Usage",
    "",
    "Initialize a repo with this profile:",
    "",
    "```",
    "/init github.com/<your-org>/<profile-repo>",
    "```",
    "",
    "## Structure",
    "",
    "- `base/` — Configuration applied to all repos regardless of language",
    "- `overlays/` — Language-specific configuration (" + overlayNames.join(", ") + ")",
    "- `profile.json` — Profile metadata",
    "",
    "## Customizing",
    "",
    "Edit files in `base/` or `overlays/` to change what gets applied.",
    "Add new overlay directories for additional language support.",
    "",
    "## Syncing",
    "",
    "Repos that consumed this profile can pull updates with `/sync`.",
    "",
  ];
  return lines.join("\n");
}

/**
 * Serialize a profile into a directory structure that fetchProfile() can consume.
 *
 * Output:
 *   profile.json
 *   base/CLAUDE.md.sections, base/hooks.json, base/settings.json, base/.mcp.json
 *   overlays/<name>/CLAUDE.md.sections, overlays/<name>/hooks.json, ...
 *   README.md
 */
export function serializeProfile(options: SerializeOptions): SerializeResult {
  const { repoRoot, metadata, baseLayer, overlays } = options;
  const filesWritten: string[] = [];

  // Validate metadata.overlays matches overlay keys
  const overlayKeys = Object.keys(overlays);
  for (const key of overlayKeys) {
    if (!metadata.overlays.includes(key)) {
      throw new Error(
        `Overlay "${key}" is in overlays Record but not in metadata.overlays. ` +
          "metadata.overlays must list all overlay names."
      );
    }
  }

  // Write profile.json
  const profileJsonRel = "profile.json";
  writeSafe(
    join(repoRoot, profileJsonRel),
    JSON.stringify(metadata, null, 2) + "\n"
  );
  filesWritten.push(profileJsonRel);

  // Write base layer
  const baseFiles = writeLayerFiles(repoRoot, "base", baseLayer);
  filesWritten.push(...baseFiles);

  // Write overlay layers
  for (const [name, layer] of Object.entries(overlays)) {
    const overlayFiles = writeLayerFiles(repoRoot, `overlays/${name}`, layer);
    filesWritten.push(...overlayFiles);
  }

  // Write README.md
  const readmeRel = "README.md";
  writeSafe(
    join(repoRoot, readmeRel),
    generateReadme(metadata, overlayKeys)
  );
  filesWritten.push(readmeRel);

  return { filesWritten };
}
