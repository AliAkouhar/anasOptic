import { addMonths, format } from "date-fns";
import type { FixedCharge, FixedChargeType, ID } from "@/lib/types";
import { commit, getDb, type UndoHandle } from "../store";
import { RepoError, newId, requireAuth, requirePermission, settle } from "./base";

function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return format(addMonths(new Date(y, m - 1, 1), -1), "yyyy-MM");
}

export const chargesRepo = {
  /** Upserts one cell of the month × location grid. */
  async setFixedCharge(input: { locationId: ID; month: string; type: FixedChargeType; amount: number }): Promise<{ undo: UndoHandle["undo"] }> {
    const db = getDb();
    const auth = requireAuth(db);
    requirePermission(auth, "charges.manage");
    if (!(input.amount >= 0)) throw new RepoError("invalid_amount");
    const handle = commit((d) => {
      const existing = d.fixedCharges.find((c) => c.locationId === input.locationId && c.month === input.month && c.type === input.type);
      if (existing) {
        return { fixedCharges: d.fixedCharges.map((c) => (c === existing ? { ...c, amount: input.amount } : c)) };
      }
      const row: FixedCharge = { id: newId("fc"), ...input };
      return { fixedCharges: [...d.fixedCharges, row] };
    });
    return settle({ undo: handle.undo });
  },

  /** Copies every row of the previous month into `month` (overwriting what is there). */
  async duplicatePreviousMonth(month: string, locationIds: ID[]): Promise<{ undo: UndoHandle["undo"]; copied: number }> {
    const db = getDb();
    const auth = requireAuth(db);
    requirePermission(auth, "charges.manage");
    const prev = previousMonth(month);
    const source = db.fixedCharges.filter((c) => c.month === prev && locationIds.includes(c.locationId));
    const handle = commit((d) => {
      const kept = d.fixedCharges.filter(
        (c) => !(c.month === month && source.some((s) => s.locationId === c.locationId && s.type === c.type)),
      );
      return { fixedCharges: [...kept, ...source.map((s) => ({ ...s, id: newId("fc"), month }))] };
    });
    return settle({ undo: handle.undo, copied: source.length });
  },
};
