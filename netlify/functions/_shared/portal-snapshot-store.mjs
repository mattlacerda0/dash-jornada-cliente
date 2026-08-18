import { mkdir, readFile, writeFile, unlink, stat } from "fs/promises";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const SNAPSHOT_PATH = resolve(ROOT, "data", "portal-snapshot.json");
export const LOCK_PATH = resolve(ROOT, "data", ".portal-snapshot.lock");
export const LOCK_MAX_AGE_MS = 15 * 60 * 1000;

let memoryLock = false;

export function isRefreshLocked() {
  return memoryLock;
}

export async function readLockInfo() {
  try {
    const raw = await readFile(LOCK_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function acquireRefreshLock() {
  if (memoryLock) return false;

  const existing = await readLockInfo();
  if (existing?.startedAt) {
    const age = Date.now() - Date.parse(existing.startedAt);
    if (Number.isFinite(age) && age >= 0 && age < LOCK_MAX_AGE_MS) {
      return false;
    }
    await releaseRefreshLock();
  }

  memoryLock = true;
  await mkdir(dirname(LOCK_PATH), { recursive: true });
  await writeFile(
    LOCK_PATH,
    JSON.stringify({ startedAt: new Date().toISOString(), pid: process.pid }),
    "utf8",
  );
  return true;
}

export async function releaseRefreshLock() {
  memoryLock = false;
  try {
    await unlink(LOCK_PATH);
  } catch {
    // lock file may already be gone
  }
}

export async function readPortalSnapshot() {
  try {
    const raw = await readFile(SNAPSHOT_PATH, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return null;
    throw error;
  }
}

export async function writePortalSnapshot(snapshot) {
  await mkdir(dirname(SNAPSHOT_PATH), { recursive: true });
  const payload = {
    ...snapshot,
    meta: {
      ...(snapshot.meta || {}),
      generatedAt: snapshot.meta?.generatedAt || new Date().toISOString(),
      version: snapshot.meta?.version || 1,
    },
  };
  await writeFile(SNAPSHOT_PATH, `${JSON.stringify(payload)}\n`, "utf8");
  return payload;
}

export async function portalSnapshotStats() {
  try {
    const info = await stat(SNAPSHOT_PATH);
    return { exists: true, sizeBytes: info.size, mtime: info.mtime.toISOString() };
  } catch {
    return { exists: false, sizeBytes: 0, mtime: null };
  }
}
