import { isValidMoroccanMobile, normalizePhone } from "@/lib/format";
import type { Client, ID } from "@/lib/types";
import { commit, getDb, updateById, type UndoHandle } from "../store";
import { RepoError, newId, nowIso, requireAuth, requirePermission, settle } from "./base";

export interface ClientInput {
  fullName: string;
  phone: string;
  isWhatsapp: boolean;
  locationId: ID;
}

function validate(input: Omit<ClientInput, "locationId">, clients: Client[], selfId?: ID) {
  const fullName = input.fullName.trim();
  const phone = normalizePhone(input.phone);
  if (!fullName) throw new RepoError("name_required");
  if (!isValidMoroccanMobile(phone)) throw new RepoError("invalid_phone");
  const duplicate = clients.find((c) => c.id !== selfId && normalizePhone(c.phone) === phone);
  if (duplicate) throw new RepoError("duplicate_phone", { clientId: duplicate.id, name: duplicate.fullName });
  return { fullName, phone };
}

export const clientsRepo = {
  async create(input: ClientInput): Promise<{ client: Client }> {
    const db = getDb();
    const auth = requireAuth(db);
    requirePermission(auth, "clients.manage", "orders.create");
    const { fullName, phone } = validate(input, db.clients);
    const client: Client = { id: newId("c"), fullName, phone, isWhatsapp: input.isWhatsapp, locationId: input.locationId, createdAt: nowIso() };
    commit((d) => ({ clients: [...d.clients, client] }));
    return settle({ client });
  },

  async update(id: ID, input: Omit<ClientInput, "locationId">): Promise<{ undo: UndoHandle["undo"] }> {
    const db = getDb();
    const auth = requireAuth(db);
    requirePermission(auth, "clients.manage");
    const { fullName, phone } = validate(input, db.clients, id);
    const handle = commit((d) => ({ clients: updateById(d.clients, id, { fullName, phone, isWhatsapp: input.isWhatsapp }) }));
    return settle({ undo: handle.undo });
  },
};
