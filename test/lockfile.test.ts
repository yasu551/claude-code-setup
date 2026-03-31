import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  checksum,
  readLockfile,
  writeLockfile,
  lockfileExists,
  buildLockfile,
} from "../lib/lockfile.js";

describe("checksum", () => {
  it("produces consistent sha256 checksums", () => {
    const c1 = checksum("hello");
    const c2 = checksum("hello");
    expect(c1).toBe(c2);
    expect(c1).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("produces different checksums for different content", () => {
    expect(checksum("hello")).not.toBe(checksum("world"));
  });
});

describe("lockfile read/write", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "lockfile-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns null when lockfile does not exist", () => {
    expect(readLockfile(tempDir)).toBe(null);
    expect(lockfileExists(tempDir)).toBe(false);
  });

  it("writes and reads back a lockfile", () => {
    const lockfile = buildLockfile({
      profileUrl: "https://github.com/myorg/profile",
      version: "1.0.0",
      overlays: ["javascript"],
      managedSectionContent: "team rules",
      mcpJsonProfileContent: "{}",
      settingsJsonProfileContent: "{}",
      hooksProfileContent: "{}",
      teamHookRefs: {},
    });

    writeLockfile(tempDir, lockfile);
    expect(lockfileExists(tempDir)).toBe(true);

    const read = readLockfile(tempDir);
    expect(read).not.toBe(null);
    expect(read!.profile).toBe("https://github.com/myorg/profile");
    expect(read!.version).toBe("1.0.0");
    expect(read!.overlays).toEqual(["javascript"]);
    expect(read!.checksums["CLAUDE.md.managed"]).toMatch(/^sha256:/);
  });
});
