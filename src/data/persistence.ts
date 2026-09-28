/**
 * Zustand `persist` storage for the mock database.
 *
 * The full seed is ~4 MB of JSON, too close to the localStorage quota. Because the seed is
 * deterministic (same anchor date → same data), we only persist the *changes* made during the
 * demo: per collection, the upserted and deleted rows compared with the seed. On load the seed is
 * regenerated from its anchor and the patch is re-applied.
 *
 * Every storage access is wrapped in try/catch: private mode or a full quota never breaks the demo,
 * it just stops persisting.
 */

import type { PersistStorage, StorageValue } from "zustand/middleware";
import type { DB } from "@/lib/types";

type Row = Record<string, unknown>;
interface CollectionPatch {
  upserts: Row[];
  deletes: string[];
}
type DbPatch = Partial<Record<keyof DB, CollectionPatch | unknown>>;

interface PersistedPayload {
  seedVersion: number;
  anchor: string;
  version: number;
  patch: DbPatch;
}

export interface PersistedDbState {
  db: DB | null;
}

// The seed the current patch is computed against (kept in memory, never persisted).
let baseDb: DB | null = null;

export function setPersistenceBase(db: DB) {
  baseDb = db;
}

const rowKey = (collection: string, row: Row): string =>
  collection === "stockThresholds" ? `${row.productId}|${row.locationId}` : String(row.id);

export function diffDb(base: DB, current: DB): DbPatch {
  const patch: DbPatch = {};
  for (const k of Object.keys(current) as (keyof DB)[]) {
    const b = base[k];
    const c = current[k];
    if (b === c) continue;
    if (Array.isArray(c) && Array.isArray(b)) {
      const baseByKey = new Map<string, unknown>();
      for (const row of b as unknown as Row[]) baseByKey.set(rowKey(k, row), row);
      const upserts: Row[] = [];
      const seen = new Set<string>();
      for (const row of c as unknown as Row[]) {
        const key = rowKey(k, row);
        seen.add(key);
        if (baseByKey.get(key) !== row) upserts.push(row);
      }
      const deletes: string[] = [];
      for (const key of baseByKey.keys()) if (!seen.has(key)) deletes.push(key);
      if (upserts.length || deletes.length) patch[k] = { upserts, deletes } satisfies CollectionPatch;
    } else {
      patch[k] = c;
    }
  }
  return patch;
}

export function applyPatch(base: DB, patch: DbPatch): DB {
  const next = { ...base } as Record<keyof DB, unknown>;
  for (const k of Object.keys(patch) as (keyof DB)[]) {
    const p = patch[k];
    const b = base[k];
    if (Array.isArray(b)) {
      const { upserts, deletes } = p as CollectionPatch;
      const byKey = new Map(upserts.map((row) => [rowKey(k, row), row]));
      const deleted = new Set(deletes);
      const used = new Set<string>();
      const rows: unknown[] = [];
      for (const row of b as unknown as Row[]) {
        const key = rowKey(k, row);
        if (deleted.has(key)) continue;
        const replacement = byKey.get(key);
        if (replacement) used.add(key);
        rows.push(replacement ?? row);
      }
      for (const [key, row] of byKey) if (!used.has(key)) rows.push(row);
      next[k] = rows;
    } else {
      next[k] = p;
    }
  }
  return next as unknown as DB;
}

// ─── Safe localStorage ───────────────────────────────────────────────────────

export const safeLocalStorage = {
  getItem(name: string): string | null {
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem(name: string, value: string): void {
    try {
      window.localStorage.setItem(name, value);
    } catch {
      // Quota exceeded or storage disabled: keep working in memory.
    }
  },
  removeItem(name: string): void {
    try {
      window.localStorage.removeItem(name);
    } catch {
      // ignore
    }
  },
};

// ─── Debounced diff storage ──────────────────────────────────────────────────

let pending: { name: string; value: StorageValue<PersistedDbState> } | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!pending) return;
  const { name, value } = pending;
  pending = null;
  const db = value.state.db;
  if (!db || !baseDb) return;
  try {
    const payload: PersistedPayload = {
      seedVersion: db.meta.seedVersion,
      anchor: db.meta.anchor,
      version: value.version ?? 0,
      patch: diffDb(baseDb, db),
    };
    safeLocalStorage.setItem(name, JSON.stringify(payload));
  } catch {
    // Never let persistence break the UI.
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flush);
  window.addEventListener("beforeunload", flush);
}

export function createDiffStorage(seedVersion: number): PersistStorage<PersistedDbState> {
  return {
    async getItem(name) {
      const raw = safeLocalStorage.getItem(name);
      if (!raw) return null;
      try {
        const payload = JSON.parse(raw) as PersistedPayload;
        if (payload.seedVersion !== seedVersion) return null;
        const { loadSeed } = await import("./seed-loader");
        const seeded = await loadSeed(new Date(payload.anchor));
        setPersistenceBase(seeded);
        return { state: { db: applyPatch(seeded, payload.patch) }, version: payload.version };
      } catch {
        return null;
      }
    },
    setItem(name, value) {
      pending = { name, value };
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, 400);
    },
    removeItem(name) {
      pending = null;
      safeLocalStorage.removeItem(name);
    },
  };
}
