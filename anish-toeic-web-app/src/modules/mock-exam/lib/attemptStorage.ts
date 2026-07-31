/**
 * Offline persistence for the L&R attempt runner (AC11 offline/resume).
 *
 * IndexedDB stores:
 *   - `pending`:   queued PATCH payloads (offline queue), flushed on reconnect
 *   - `snapshot`:  last known attempt state per attempt, used for offline resume
 *
 * localStorage mirrors the same data when IndexedDB is unavailable (private
 * mode / old WebViews) so the runner degrades gracefully instead of dropping
 * acknowledged answers.
 */

export interface PendingResponse {
  key: string;
  attemptId: number;
  questionId: number;
  body: Record<string, unknown>;
  queuedAt: number;
}

export interface AttemptSnapshot {
  attemptId: number;
  savedAt: number;
  data: Record<string, unknown>;
}

const DB_NAME = 'anish-toeic-attempt';
const DB_VERSION = 1;
const PENDING_STORE = 'pending';
const SNAPSHOT_STORE = 'snapshot';
const LS_PREFIX = 'anish-toeic-attempt:';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(PENDING_STORE)) {
            db.createObjectStore(PENDING_STORE, { keyPath: 'key' });
          }
          if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
            db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'attemptId' });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

/** Runs a single readwrite request against a store; null means backend failed. */
async function idbRequest<T>(store: string, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const tx = db.transaction(store, 'readwrite');
    const request = run(tx.objectStore(store));
    return await new Promise<T>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

async function idbGetAll<T>(store: string, predicate: (value: T) => boolean): Promise<T[]> {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, 'readonly');
      const request = tx.objectStore(store).getAll();
      request.onsuccess = () => resolve(request.result.filter(predicate));
      request.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

function lsRead<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function lsWrite(key: string, value: unknown): void {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
  } catch {
    // quota / privacy mode: ignore, best effort only
  }
}

export async function queuePending(attemptId: number, questionId: number, body: Record<string, unknown>): Promise<void> {
  const record: PendingResponse = {
    key: `${attemptId}:${questionId}`,
    attemptId,
    questionId,
    body,
    queuedAt: Date.now(),
  };
  const written = await idbRequest(PENDING_STORE, (s) => s.put(record));
  if (written === null) {
    const list = lsRead<PendingResponse[]>(PENDING_STORE) ?? [];
    const existing = list.findIndex((p) => p.key === record.key);
    if (existing >= 0) list[existing] = record;
    else list.push(record);
    lsWrite(PENDING_STORE, list);
  }
}

export async function getPending(attemptId: number): Promise<PendingResponse[]> {
  const fromDb = await idbGetAll<PendingResponse>(PENDING_STORE, (p) => p.attemptId === attemptId);
  const fromLs = (lsRead<PendingResponse[]>(PENDING_STORE) ?? []).filter((p) => p.attemptId === attemptId);
  const merged = new Map<string, PendingResponse>();
  for (const p of [...fromDb, ...fromLs]) merged.set(p.key, p);
  return Array.from(merged.values());
}

export async function clearPending(attemptId: number, questionIds: number[]): Promise<void> {
  const keys = new Set(questionIds.map((q) => `${attemptId}:${q}`));
  const db = await openDb();
  if (db) {
    try {
      const tx = db.transaction(PENDING_STORE, 'readwrite');
      const store = tx.objectStore(PENDING_STORE);
      const request = store.getAll();
      request.onsuccess = () => {
        for (const record of request.result as PendingResponse[]) {
          if (keys.has(record.key)) store.delete(record.key);
        }
      };
    } catch {
      // ignore, LS mirror below still applies
    }
  }
  const list = lsRead<PendingResponse[]>(PENDING_STORE) ?? [];
  lsWrite(
    PENDING_STORE,
    list.filter((p) => !keys.has(p.key)),
  );
}

export async function saveSnapshot(attemptId: number, data: Record<string, unknown>): Promise<void> {
  const record: AttemptSnapshot = { attemptId, savedAt: Date.now(), data };
  const written = await idbRequest(SNAPSHOT_STORE, (s) => s.put(record));
  if (written === null) lsWrite(SNAPSHOT_STORE, record);
}

export async function loadSnapshot(attemptId: number): Promise<Record<string, unknown> | null> {
  const fromDb = await idbRequest<AttemptSnapshot | undefined>(SNAPSHOT_STORE, (s) => s.get(attemptId));
  if (fromDb) return fromDb.data;
  const fromLs = lsRead<AttemptSnapshot>(SNAPSHOT_STORE);
  if (fromLs && fromLs.attemptId === attemptId) return fromLs.data;
  return null;
}

export async function clearSnapshot(attemptId: number): Promise<void> {
  await idbRequest(SNAPSHOT_STORE, (s) => s.delete(attemptId));
  const fromLs = lsRead<AttemptSnapshot>(SNAPSHOT_STORE);
  if (fromLs && fromLs.attemptId === attemptId) lsWrite(SNAPSHOT_STORE, null);
}
