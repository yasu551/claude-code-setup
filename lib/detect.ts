import { existsSync } from "node:fs";
import { join } from "node:path";

export type OverlayName = "javascript" | "python" | "go" | "rust" | "ruby";

interface DetectionRule {
  files: string[];
  overlay: OverlayName;
}

const DETECTION_RULES: DetectionRule[] = [
  { files: ["package.json"], overlay: "javascript" },
  { files: ["pyproject.toml", "requirements.txt"], overlay: "python" },
  { files: ["go.mod"], overlay: "go" },
  { files: ["Cargo.toml"], overlay: "rust" },
  { files: ["Gemfile"], overlay: "ruby" },
];

/**
 * Detect the project type from files in the given directory.
 * Returns the overlay name for the first match, or null if no match.
 * Priority order: javascript > python > go > rust > ruby.
 */
export function detectOverlay(repoRoot: string): OverlayName | null {
  for (const rule of DETECTION_RULES) {
    for (const file of rule.files) {
      if (existsSync(join(repoRoot, file))) {
        return rule.overlay;
      }
    }
  }
  return null;
}
