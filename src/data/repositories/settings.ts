import { can, resolveAuthUser, type PermissionKey } from "@/lib/permissions";
import type {
  CustomField,
  CustomFieldType,
  DB,
  ID,
  Location,
  LocationType,
  LoyaltySettings,
  Option,
  OptionListKey,
  Role,
  User,
} from "@/lib/types";
import { getOptionUsage, totalUsage } from "../indexes";
import { commit, getDb, updateById, type UndoHandle } from "../store";
import { RepoError, newId, nowIso, requireAuth, requirePermission, settle } from "./base";

function admin(permission: PermissionKey) {
  const db = getDb();
  const auth = requireAuth(db);
  requirePermission(auth, permission);
  return { db, auth };
}

function reorder<T extends { id: ID; sortOrder: number }>(rows: T[], orderedIds: ID[]): T[] {
  const position = new Map(orderedIds.map((id, i) => [id, i]));
  return rows.map((r) => (position.has(r.id) ? { ...r, sortOrder: position.get(r.id)! } : r));
}

/** At least one active user must keep the right to manage roles, or nobody could fix things. */
function assertAdminRemains(db: DB) {
  const ok = db.users.some((u) => u.isActive && can(resolveAuthUser(u, db.roles), "roles.manage"));
  if (!ok) throw new RepoError("last_admin");
}

export const optionsRepo = {
  async create(listKey: OptionListKey, labels: { labelFr: string; labelEn: string }): Promise<{ option: Option }> {
    const { db } = admin("settings.manage");
    if (!labels.labelFr.trim()) throw new RepoError("name_required");
    const siblings = db.options.filter((o) => o.listKey === listKey);
    const option: Option = {
      id: newId("opt"),
      listKey,
      labelFr: labels.labelFr.trim(),
      labelEn: labels.labelEn.trim() || labels.labelFr.trim(),
      sortOrder: siblings.reduce((m, o) => Math.max(m, o.sortOrder), -1) + 1,
      isActive: true,
    };
    commit((d) => ({ options: [...d.options, option] }));
    return settle({ option });
  },

  /** Rule 11: entities store ids, so a rename shows everywhere at once. */
  async rename(id: ID, labels: { labelFr: string; labelEn: string }): Promise<{ undo: UndoHandle["undo"] }> {
    admin("settings.manage");
    if (!labels.labelFr.trim()) throw new RepoError("name_required");
    const handle = commit((d) => ({
      options: updateById(d.options, id, { labelFr: labels.labelFr.trim(), labelEn: labels.labelEn.trim() || labels.labelFr.trim() }),
    }));
    return settle({ undo: handle.undo });
  },

  async reorder(orderedIds: ID[]): Promise<{ undo: UndoHandle["undo"] }> {
    admin("settings.manage");
    const handle = commit((d) => ({ options: reorder(d.options, orderedIds) }));
    return settle({ undo: handle.undo });
  },

  async setActive(id: ID, isActive: boolean): Promise<{ undo: UndoHandle["undo"] }> {
    admin("settings.manage");
    const handle = commit((d) => ({ options: updateById(d.options, id, { isActive }) }));
    return settle({ undo: handle.undo });
  },

  /** Rule 11: an option used anywhere can only be archived. */
  async remove(id: ID): Promise<void> {
    const { db } = admin("settings.manage");
    if (totalUsage(getOptionUsage(db).get(id)) > 0) throw new RepoError("option_in_use");
    commit((d) => ({ options: d.options.filter((o) => o.id !== id) }));
    return settle(undefined);
  },
};

export interface CustomFieldInput {
  labelFr: string;
  labelEn: string;
  type: CustomFieldType;
  optionsFr?: string[];
  optionsEn?: string[];
}

export function customFieldUsage(db: DB, fieldId: ID): number {
  return db.orders.reduce((n, o) => n + (o.customValues[fieldId] !== undefined && o.customValues[fieldId] !== "" ? 1 : 0), 0);
}

export const customFieldsRepo = {
  async create(input: CustomFieldInput): Promise<{ field: CustomField }> {
    const { db } = admin("settings.manage");
    if (!input.labelFr.trim()) throw new RepoError("name_required");
    const field: CustomField = {
      id: newId("cf"),
      labelFr: input.labelFr.trim(),
      labelEn: input.labelEn.trim() || input.labelFr.trim(),
      type: input.type,
      optionsFr: input.type === "select" ? input.optionsFr : undefined,
      optionsEn: input.type === "select" ? input.optionsEn : undefined,
      isActive: true,
      sortOrder: db.customFields.reduce((m, f) => Math.max(m, f.sortOrder), -1) + 1,
    };
    commit((d) => ({ customFields: [...d.customFields, field] }));
    return settle({ field });
  },

  async update(id: ID, input: CustomFieldInput): Promise<{ undo: UndoHandle["undo"] }> {
    admin("settings.manage");
    if (!input.labelFr.trim()) throw new RepoError("name_required");
    const handle = commit((d) => ({
      customFields: updateById(d.customFields, id, {
        labelFr: input.labelFr.trim(),
        labelEn: input.labelEn.trim() || input.labelFr.trim(),
        type: input.type,
        optionsFr: input.type === "select" ? input.optionsFr : undefined,
        optionsEn: input.type === "select" ? input.optionsEn : undefined,
      }),
    }));
    return settle({ undo: handle.undo });
  },

  async reorder(orderedIds: ID[]): Promise<{ undo: UndoHandle["undo"] }> {
    admin("settings.manage");
    const handle = commit((d) => ({ customFields: reorder(d.customFields, orderedIds) }));
    return settle({ undo: handle.undo });
  },

  async setActive(id: ID, isActive: boolean): Promise<{ undo: UndoHandle["undo"] }> {
    admin("settings.manage");
    const handle = commit((d) => ({ customFields: updateById(d.customFields, id, { isActive }) }));
    return settle({ undo: handle.undo });
  },

  async remove(id: ID): Promise<void> {
    const { db } = admin("settings.manage");
    if (customFieldUsage(db, id) > 0) throw new RepoError("option_in_use");
    commit((d) => ({ customFields: d.customFields.filter((f) => f.id !== id) }));
    return settle(undefined);
  },
};

export interface LocationInput {
  name: string;
  type: LocationType;
  address: string;
  whatsappNumber: string;
}

export const locationsRepo = {
  /** A new store appears in every selector at once; its invoice numbering starts at 1. */
  async create(input: LocationInput): Promise<{ location: Location }> {
    admin("settings.manage");
    if (!input.name.trim()) throw new RepoError("name_required");
    const location: Location = {
      id: newId("loc"),
      name: input.name.trim(),
      type: input.type,
      address: input.address.trim(),
      whatsappNumber: input.whatsappNumber.trim(),
      isActive: true,
      createdAt: nowIso(),
    };
    commit((d) => ({ locations: [...d.locations, location] }));
    return settle({ location });
  },

  async update(id: ID, input: LocationInput): Promise<{ undo: UndoHandle["undo"] }> {
    admin("settings.manage");
    if (!input.name.trim()) throw new RepoError("name_required");
    const handle = commit((d) => ({ locations: updateById(d.locations, id, { ...input, name: input.name.trim() }) }));
    return settle({ undo: handle.undo });
  },

  async setActive(id: ID, isActive: boolean): Promise<{ undo: UndoHandle["undo"] }> {
    admin("settings.manage");
    const handle = commit((d) => ({ locations: updateById(d.locations, id, { isActive }) }));
    return settle({ undo: handle.undo });
  },
};

export const usersRepo = {
  /** Demo: no email is really sent; the user shows "Invitation envoyée". */
  async invite(input: { fullName: string; email: string; roleId: ID; locationId: ID | null }): Promise<{ user: User }> {
    const { db } = admin("users.manage");
    const email = input.email.trim().toLowerCase();
    if (!input.fullName.trim()) throw new RepoError("name_required");
    if (db.users.some((u) => u.email.toLowerCase() === email)) throw new RepoError("email_taken");
    const now = nowIso();
    const user: User = {
      id: newId("u"),
      fullName: input.fullName.trim(),
      email,
      roleId: input.roleId,
      locationId: input.locationId,
      isActive: true,
      invitedAt: now,
      createdAt: now,
    };
    commit((d) => ({ users: [...d.users, user] }));
    return settle({ user });
  },

  async update(id: ID, input: { roleId: ID; locationId: ID | null }): Promise<{ undo: UndoHandle["undo"] }> {
    const { db } = admin("users.manage");
    const users = updateById(db.users, id, input);
    assertAdminRemains({ ...db, users });
    const handle = commit(() => ({ users }));
    return settle({ undo: handle.undo });
  },

  /** Deactivation blocks access immediately; the history is kept. */
  async setActive(id: ID, isActive: boolean): Promise<{ undo: UndoHandle["undo"] }> {
    const { db, auth } = admin("users.manage");
    if (!isActive && id === auth.user.id) throw new RepoError("self_deactivation");
    const users = updateById(db.users, id, { isActive });
    assertAdminRemains({ ...db, users });
    const handle = commit(() => ({ users }));
    return settle({ undo: handle.undo });
  },
};

export const rolesRepo = {
  async create(input: { labelFr: string; labelEn: string; permissions: PermissionKey[] }): Promise<{ role: Role }> {
    admin("roles.manage");
    if (!input.labelFr.trim()) throw new RepoError("name_required");
    const role: Role = {
      id: newId("role"),
      labelFr: input.labelFr.trim(),
      labelEn: input.labelEn.trim() || input.labelFr.trim(),
      permissions: input.permissions,
      isSystem: false,
      createdAt: nowIso(),
    };
    commit((d) => ({ roles: [...d.roles, role] }));
    return settle({ role });
  },

  async update(id: ID, input: { labelFr: string; labelEn: string; permissions: PermissionKey[] }): Promise<{ undo: UndoHandle["undo"] }> {
    const { db } = admin("roles.manage");
    if (!input.labelFr.trim()) throw new RepoError("name_required");
    const roles = updateById(db.roles, id, {
      labelFr: input.labelFr.trim(),
      labelEn: input.labelEn.trim() || input.labelFr.trim(),
      permissions: input.permissions,
    });
    assertAdminRemains({ ...db, roles });
    const handle = commit(() => ({ roles }));
    return settle({ undo: handle.undo });
  },

  async remove(id: ID): Promise<void> {
    const { db } = admin("roles.manage");
    const role = db.roles.find((r) => r.id === id);
    if (!role) throw new RepoError("not_found");
    if (role.isSystem) throw new RepoError("forbidden");
    if (db.users.some((u) => u.roleId === id)) throw new RepoError("role_in_use");
    commit((d) => ({ roles: d.roles.filter((r) => r.id !== id) }));
    return settle(undefined);
  },
};

export const appSettingsRepo = {
  async setLoyalty(input: LoyaltySettings): Promise<{ undo: UndoHandle["undo"] }> {
    admin("settings.manage");
    const { regularMinOrders, loyalMinOrders } = input;
    if (!Number.isInteger(regularMinOrders) || !Number.isInteger(loyalMinOrders) || regularMinOrders < 1 || loyalMinOrders <= regularMinOrders) {
      throw new RepoError("invalid_amount");
    }
    const handle = commit(() => ({ loyalty: { regularMinOrders, loyalMinOrders } }));
    return settle({ undo: handle.undo });
  },

  async setAppName(appName: string): Promise<{ undo: UndoHandle["undo"] }> {
    admin("settings.manage");
    if (!appName.trim()) throw new RepoError("name_required");
    const handle = commit((d) => ({ settings: { ...d.settings, appName: appName.trim() } }));
    return settle({ undo: handle.undo });
  },
};
