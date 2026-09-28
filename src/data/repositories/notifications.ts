import type { ID } from "@/lib/types";
import { commit, getDb, reseedDatabase, useSession } from "../store";
import { requireAuth, settle } from "./base";

export const notificationsRepo = {
  async markRead(ids: ID[]): Promise<void> {
    const db = getDb();
    const auth = requireAuth(db);
    const set = new Set(ids);
    if (!db.notifications.some((n) => set.has(n.id) && n.userId === auth.user.id && !n.read)) return;
    commit((d) => ({
      notifications: d.notifications.map((n) => (set.has(n.id) && n.userId === auth.user.id ? { ...n, read: true } : n)),
    }));
    return settle(undefined, 0);
  },

  async markAllRead(): Promise<void> {
    const db = getDb();
    const auth = requireAuth(db);
    commit((d) => ({
      notifications: d.notifications.map((n) => (n.userId === auth.user.id && !n.read ? { ...n, read: true } : n)),
    }));
    return settle(undefined);
  },
};

export const demoRepo = {
  /** Re-seeds the whole store. The current user stays signed in when they still exist. */
  async reset(): Promise<void> {
    await reseedDatabase();
    const userId = useSession.getState().userId;
    if (userId && !getDb().users.some((u) => u.id === userId && u.isActive)) useSession.getState().signOut();
    useSession.getState().setActiveLocation("all");
    return settle(undefined, 400);
  },
};
