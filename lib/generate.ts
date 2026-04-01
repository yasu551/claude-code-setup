import type { RepoFingerprint } from "./inspect.js";
import type { WizardAnswers } from "./wizard.js";
import type { ProfileLayer } from "./profile.js";
import { findTemplate, generateGenericLayer } from "./templates/index.js";

export interface ProvenanceEntry {
  target: "CLAUDE.md" | "hooks" | "settings" | ".mcp.json";
  rule: string;
  reason: string;
}

export interface GeneratedProfile {
  layer: ProfileLayer;
  provenance: ProvenanceEntry[];
}

/**
 * Build provenance entries from a fingerprint, explaining why each config was generated.
 */
function buildProvenance(fp: RepoFingerprint, layer: ProfileLayer): ProvenanceEntry[] {
  const entries: ProvenanceEntry[] = [];

  if (layer.claudeMdSections) {
    // Language/framework
    if (fp.framework) {
      entries.push({
        target: "CLAUDE.md",
        rule: `${fp.framework} conventions added`,
        reason: `Detected from ${(fp.evidence.framework ?? []).join(", ")}`,
      });
    } else if (fp.language) {
      entries.push({
        target: "CLAUDE.md",
        rule: `${fp.language} conventions added`,
        reason: `Detected from ${(fp.evidence.language ?? []).join(", ")}`,
      });
    }

    // Test runner
    if (fp.testRunner) {
      entries.push({
        target: "CLAUDE.md",
        rule: `Testing section with ${fp.testRunner}`,
        reason: `Detected from ${(fp.evidence.testRunner ?? []).join(", ")}`,
      });
    }

    // Linter
    if (fp.linter) {
      entries.push({
        target: "CLAUDE.md",
        rule: `Code quality section with ${fp.linter}`,
        reason: `Detected from ${(fp.evidence.linter ?? []).join(", ")}`,
      });
    }
  }

  if (layer.hooksJson) {
    entries.push({
      target: "hooks",
      rule: "Pre-tool-use hooks configured",
      reason: `Based on detected tooling (${[fp.linter, fp.testRunner].filter(Boolean).join(", ")})`,
    });
  }

  if (layer.settingsJson) {
    entries.push({
      target: "settings",
      rule: "Security permissions configured",
      reason: "Based on selected security posture",
    });
  }

  return entries;
}

/**
 * Generate a complete profile from a repo fingerprint and wizard answers.
 */
export function generateProfile(
  fp: RepoFingerprint,
  answers: WizardAnswers
): GeneratedProfile {
  const template = findTemplate(fp);
  const layer = template
    ? template.generate(fp, answers)
    : generateGenericLayer(fp, answers);

  const provenance = buildProvenance(fp, layer);

  return { layer, provenance };
}

/**
 * Format a provenance report as a human-readable string.
 */
export function formatProvenanceReport(
  fp: RepoFingerprint,
  answers: WizardAnswers,
  provenance: ProvenanceEntry[],
  filesModified: string[]
): string {
  const lines: string[] = [];

  // Detection summary
  const detected: string[] = [];
  if (fp.language) detected.push(fp.language);
  if (fp.framework) detected.push(fp.framework);
  if (fp.testRunner) detected.push(fp.testRunner);
  if (fp.linter) detected.push(fp.linter);
  if (fp.formatter && fp.formatter !== fp.linter) detected.push(fp.formatter);
  if (fp.hasCI) detected.push("CI");

  lines.push(`Detected: ${detected.length > 0 ? detected.join(" + ") : "no specific tooling"}`);

  // Answers summary
  lines.push(`Testing rigor: ${answers.testingRigor}`);
  lines.push(`Code style: ${answers.codeChangeStyle}`);
  lines.push(`Security: ${answers.securityPosture}`);
  lines.push("");

  // Files modified
  lines.push("Applied:");
  for (const file of filesModified) {
    lines.push(`  ${file}`);
  }
  lines.push("");

  // Provenance
  if (provenance.length > 0) {
    lines.push("Reasoning:");
    for (const entry of provenance) {
      lines.push(`  [${entry.target}] ${entry.rule} — ${entry.reason}`);
    }
  }

  return lines.join("\n");
}
