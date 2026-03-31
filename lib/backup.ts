import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  copyFileSync,
} from "node:fs";
import { join, dirname } from "node:path";

const CACHE_DIR = ".claude-team-cache";
const BACKUP_DIR = "backup";
const MANIFEST_FILE = "manifest.json";

interface BackupManifest {
  files: Record<string, "existed" | "did_not_exist">;
  createdAt: string;
}

/**
 * Create a backup of target files before applying changes.
 * Returns a restore function that can undo all changes.
 */
export function createBackup(
  repoRoot: string,
  targetFiles: string[]
): { restore: () => void; cleanup: () => void } {
  const backupRoot = join(repoRoot, CACHE_DIR, BACKUP_DIR);
  mkdirSync(backupRoot, { recursive: true });

  const manifest: BackupManifest = {
    files: {},
    createdAt: new Date().toISOString(),
  };

  for (const relPath of targetFiles) {
    const fullPath = join(repoRoot, relPath);
    if (existsSync(fullPath)) {
      const backupPath = join(backupRoot, relPath);
      mkdirSync(dirname(backupPath), { recursive: true });
      copyFileSync(fullPath, backupPath);
      manifest.files[relPath] = "existed";
    } else {
      manifest.files[relPath] = "did_not_exist";
    }
  }

  writeFileSync(
    join(backupRoot, MANIFEST_FILE),
    JSON.stringify(manifest, null, 2),
    "utf-8"
  );

  return {
    restore: () => restoreBackup(repoRoot),
    cleanup: () => cleanupBackup(repoRoot),
  };
}

/**
 * Restore all files from backup to their original state.
 */
function restoreBackup(repoRoot: string): void {
  const backupRoot = join(repoRoot, CACHE_DIR, BACKUP_DIR);
  const manifestPath = join(backupRoot, MANIFEST_FILE);

  if (!existsSync(manifestPath)) {
    return;
  }

  const manifest: BackupManifest = JSON.parse(
    readFileSync(manifestPath, "utf-8")
  );

  for (const [relPath, state] of Object.entries(manifest.files)) {
    const fullPath = join(repoRoot, relPath);
    if (state === "existed") {
      const backupPath = join(backupRoot, relPath);
      if (existsSync(backupPath)) {
        mkdirSync(dirname(fullPath), { recursive: true });
        copyFileSync(backupPath, fullPath);
      }
    } else {
      // File didn't exist before — remove it
      if (existsSync(fullPath)) {
        rmSync(fullPath);
      }
    }
  }

  cleanupBackup(repoRoot);
}

/**
 * Remove the backup directory after a successful apply.
 */
function cleanupBackup(repoRoot: string): void {
  const backupRoot = join(repoRoot, CACHE_DIR, BACKUP_DIR);
  if (existsSync(backupRoot)) {
    rmSync(backupRoot, { recursive: true, force: true });
  }
}
