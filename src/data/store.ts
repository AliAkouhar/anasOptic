/**
 * The "mock database": a Zustand store holding every table.
 * Only repositories (src/data/repositories) write to it; the UI reads through hooks.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { DB, ID } from "@/lib/types";
import { createDiffStorage, safeLocalStorage, setPersistenceBase, type PersistedDbState } from "./persistence";
import { SEED_VERSION } from "./constants";
import { loadSeed } from "./seed-loader";

interface DbStore extends PersistedDbState {
  ready: boolean;
}

export const DB_STORAGE_KEY = "anass-vision:db";

export const useDbStore = create<DbStore>()(
  persist<DbStore, [], [], PersistedDbState>(() => ({ db: null, ready: false }), {
    name: DB_STORAGE_KEY,
    version: 1,
    storage: createDiffStorage(SEED_VERSION),
    partialize: (s) => ({ db: s.db }),
    skipHydration: true,
  }),
);

/** Loads the persisted demo, or generates a fresh seed. Safe to call more than once. */
let booting: Promise<void> | null = null;
export function bootDatabase(): Promise<void> {
  if (useDbStore.getState().ready) return Promise.resolve();
  booting ??= (async () => {
    await useDbStore.persist.rehydrate();
    if (!useDbStore.getState().db) {
      const db = await loadSeed(new Date());
      setPersistenceBase(db);
      useDbStore.setState({ db });
    }
    useDbStore.setState({ ready: true });
  })();
  return booting;
}

/** Re-seeds the whole demo (anchored to now). */
export async function reseedDatabase(): Promise<void> {
  const db = await loadSeed(new Date());
  setPersistenceBase(db);
  useDbStore.setState({ db, ready: true });
}

export function getDb(): DB {
  const db = useDbStore.getState().db;
  if (!db) throw new Error("The mock database is not ready yet.");
  return db;
}

/** Subscribe a component to one slice of the database (the app shell guarantees it is loaded). */
export function useDb<T>(selector: (db: DB) => T): T {
  return useDbStore((s) => selector(s.db as DB));
}

// ─── Transactions with undo ──────────────────────────────────────────────────

export interface UndoHandle {
  /** Returns false when a later action already changed the same tables. */
  undo: () => boolean;
}

/**
 * Applies a set of table changes atomically (one store update = one transaction).
 * Undo restores the touched tables, unless something else changed them since.
 */
export function commit(mutator: (db: DB) => Partial<DB>): UndoHandle {
  const before = getDb();
  const changes = mutator(before);
  const after: DB = { ...before, ...changes };
  useDbStore.setState({ db: after });
  const keys = Object.keys(changes) as (keyof DB)[];
  return {
    undo() {
      const current = getDb();
      if (keys.some((k) => current[k] !== after[k])) return false;
      const restored = { ...current } as Record<keyof DB, unknown>;
      for (const k of keys) restored[k] = before[k];
      useDbStore.setState({ db: restored as unknown as DB });
      return true;
    },
  };
}

// ─── Immutable helpers used by repositories ─────────────────────────────────

export function updateById<T extends { id: ID }>(rows: T[], id: ID, patch: Partial<T> | ((row: T) => T)): T[] {
  return rows.map((r) => (r.id === id ? (typeof patch === "function" ? patch(r) : { ...r, ...patch }) : r));
}

// ─── Session (who is signed in, active location, UI prefs) ──────────────────

interface SessionStore {
  userId: ID | null;
  /** Topbar location selector (admin only). */
  activeLocationId: ID | "all";
  sidebarCollapsed: boolean;
  hydrated: boolean;
  signIn: (userId: ID) => void;
  signOut: () => void;
  setActiveLocation: (id: ID | "all") => void;
  toggleSidebar: () => void;
}

export const useSession = create<SessionStore>()(
  persist(
    (set) => ({
      userId: null,
      activeLocationId: "all",
      sidebarCollapsed: false,
      hydrated: false,
      signIn: (userId) => set({ userId, activeLocationId: "all" }),
      signOut: () => set({ userId: null, activeLocationId: "all" }),
      setActiveLocation: (activeLocationId) => set({ activeLocationId }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    {
      name: "anass-vision:session",
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (s) => ({ userId: s.userId, activeLocationId: s.activeLocationId, sidebarCollapsed: s.sidebarCollapsed }),
      skipHydration: true,
      onRehydrateStorage: () => () => useSession.setState({ hydrated: true }),
    },
  ),
);
