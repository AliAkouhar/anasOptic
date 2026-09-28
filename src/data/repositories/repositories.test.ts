import { beforeEach, describe, expect, it } from "vitest";
import { orderReste, stockKey } from "@/lib/calculations";
import { SUPPLIER_SOURCE } from "@/lib/types";
import { DEMO_ADMIN_ID, DEMO_SECRETARY_ID } from "../constants";
import { paymentsByOrder, stockIndex } from "../indexes";
import { setPersistenceBase } from "../persistence";
import { generateSeed } from "../seed";
import { getDb, useDbStore, useSession } from "../store";
import { RepoError } from "./base";
import { optionsRepo, ordersRepo, purchasesRepo, stockRepo } from "./index";

const seed = generateSeed(new Date("2026-09-27T17:30:00"));

function level(productId: string, locationId: string) {
  return stockIndex(getDb().stockMovements).get(stockKey(productId, locationId)) ?? 0;
}

function signIn(userId: string) {
  useSession.setState({ userId, activeLocationId: "all" });
}

async function expectCode(p: Promise<unknown>, code: RepoError["code"]) {
  await expect(p).rejects.toMatchObject({ name: "RepoError", code });
}

function inStockFrame(locationId: string) {
  const db = getDb();
  const frame = db.products.find((p) => p.kind === "frame" && level(p.id, locationId) >= 2)!;
  return frame.id;
}

function baseOrder(locationId = "loc_centre") {
  const db = getDb();
  return {
    locationId,
    client: { fullName: "Salma Idrissi", phone: "0612345678", isWhatsapp: true },
    od: { sph: -1.25, cyl: -0.5, axis: 90, add: null },
    og: { sph: -1, cyl: null, axis: null, add: null },
    customValues: {},
    frameProductId: inStockFrame(locationId),
    lensProductId: db.products.find((p) => p.kind === "lens")!.id,
    lensQty: 2,
    lensTreatmentIds: [],
    total: 2400,
    deposit: 1000,
    paymentMethodId: db.options.find((o) => o.listKey === "payment_method")!.id,
  };
}

beforeEach(() => {
  setPersistenceBase(seed);
  useDbStore.setState({ db: seed, ready: true });
  signIn(DEMO_SECRETARY_ID);
});

describe("order creation", () => {
  it("numbers invoices sequentially per location", async () => {
    const maxCentre = Math.max(...seed.orders.filter((o) => o.locationId === "loc_centre").map((o) => o.invoiceNumber));
    const a = await ordersRepo.create(baseOrder());
    const b = await ordersRepo.create({ ...baseOrder(), client: { id: a.client.id } });
    expect(a.order.invoiceNumber).toBe(maxCentre + 1);
    expect(b.order.invoiceNumber).toBe(maxCentre + 2);

    signIn(DEMO_ADMIN_ID);
    const maxNord = Math.max(...seed.orders.filter((o) => o.locationId === "loc_nord").map((o) => o.invoiceNumber));
    const c = await ordersRepo.create({ ...baseOrder("loc_nord"), client: { id: a.client.id } });
    expect(c.order.invoiceNumber).toBe(maxNord + 1);
  });

  it("confirms immediately, takes the frame out of stock and asks the admin for costs", async () => {
    const input = baseOrder();
    const before = level(input.frameProductId, "loc_centre");
    const { order } = await ordersRepo.create(input);
    const db = getDb();
    expect(order.status).toBe("confirmed");
    expect(level(input.frameProductId, "loc_centre")).toBe(before - 1);
    expect(orderReste(order, paymentsByOrder(db.payments).get(order.id) ?? [])).toBe(1400);
    expect(db.notifications.some((n) => n.type === "order_costs_needed" && n.refId === order.id && n.userId === DEMO_ADMIN_ID)).toBe(true);
    expect(db.orderStatusEvents.filter((e) => e.orderId === order.id).map((e) => e.to)).toEqual(["confirmed"]);
  });

  it("rejects a deposit above the total", async () => {
    await expectCode(ordersRepo.create({ ...baseOrder(), deposit: 3000 }), "deposit_exceeds_total");
  });

  it("does not let a secrétaire create an order for another shop", async () => {
    await expectCode(ordersRepo.create(baseOrder("loc_nord")), "forbidden");
  });
});

describe("status flow", () => {
  it("moves forward one step at a time", async () => {
    const { order } = await ordersRepo.create(baseOrder());
    await expectCode(ordersRepo.setStatus(order.id, "prepared"), "invalid_transition");
    await ordersRepo.setStatus(order.id, "workshop");
    await ordersRepo.setStatus(order.id, "prepared");
    await ordersRepo.setStatus(order.id, "in_store");
    expect(getDb().orders.find((o) => o.id === order.id)!.status).toBe("in_store");
  });

  it("requires reste = 0 before delivered", async () => {
    const { order } = await ordersRepo.create(baseOrder());
    for (const s of ["workshop", "prepared", "in_store"] as const) await ordersRepo.setStatus(order.id, s);
    await expectCode(ordersRepo.setStatus(order.id, "delivered"), "reste_not_zero");
    await expectCode(ordersRepo.collectAndDeliver(order.id, { amount: 1000, methodId: "pm_especes" }), "reste_not_zero");
    await ordersRepo.collectAndDeliver(order.id, { amount: 1400, methodId: "pm_especes" });
    const db = getDb();
    expect(db.orders.find((o) => o.id === order.id)!.status).toBe("delivered");
    expect(orderReste({ total: 2400, status: "delivered" }, paymentsByOrder(db.payments).get(order.id)!)).toBe(0);
  });

  it("undo restores the previous status", async () => {
    const { order } = await ordersRepo.create(baseOrder());
    const { undo } = await ordersRepo.setStatus(order.id, "workshop");
    expect(undo()).toBe(true);
    expect(getDb().orders.find((o) => o.id === order.id)!.status).toBe("confirmed");
  });
});

describe("cancellation", () => {
  it("returns the stock, refunds the deposits and is forbidden to a secrétaire", async () => {
    const input = baseOrder();
    const before = level(input.frameProductId, "loc_centre");
    const { order } = await ordersRepo.create(input);
    await expectCode(ordersRepo.cancel(order.id), "forbidden");

    signIn(DEMO_ADMIN_ID);
    const { refunded } = await ordersRepo.cancel(order.id);
    const db = getDb();
    expect(refunded).toBe(1000);
    expect(level(input.frameProductId, "loc_centre")).toBe(before);
    const pays = paymentsByOrder(db.payments).get(order.id)!;
    expect(pays.reduce((s, p) => s + p.amount, 0)).toBe(0);
    expect(db.orders.find((o) => o.id === order.id)!.status).toBe("cancelled");
    await expectCode(ordersRepo.setStatus(order.id, "workshop"), "invalid_transition");
  });

  it("returns the lens stock taken by the costs panel too", async () => {
    const { order } = await ordersRepo.create(baseOrder());
    signIn(DEMO_ADMIN_ID);
    const lensItem = getDb().orderItems.find((i) => i.orderId === order.id && i.sourceLocationId === undefined)!;
    const before = level(lensItem.productId, "loc_labo");
    await ordersRepo.saveCosts(order.id, { lines: [{ label: "Verres", amount: 600 }], lensSources: { [lensItem.id]: "loc_labo" } });
    expect(level(lensItem.productId, "loc_labo")).toBe(before - 2);
    await ordersRepo.cancel(order.id);
    expect(level(lensItem.productId, "loc_labo")).toBe(before);
  });
});

describe("costs (admin only)", () => {
  it("are refused to a secrétaire", async () => {
    const { order } = await ordersRepo.create(baseOrder());
    await expectCode(ordersRepo.saveCosts(order.id, { lines: [{ label: "x", amount: 1 }], lensSources: {} }), "forbidden");
  });

  it("deduct lens stock from the chosen source, not from a supplier, and mark costs completed", async () => {
    const { order } = await ordersRepo.create(baseOrder());
    signIn(DEMO_ADMIN_ID);
    const lensItem = getDb().orderItems.find((i) => i.orderId === order.id && i.sourceLocationId === undefined)!;
    const labBefore = level(lensItem.productId, "loc_labo");
    await ordersRepo.saveCosts(order.id, { lines: [{ label: "Verres", amount: 600 }], lensSources: { [lensItem.id]: SUPPLIER_SOURCE } });
    expect(level(lensItem.productId, "loc_labo")).toBe(labBefore);
    // Changing the source to the lab later takes the stock from there.
    const costs = getDb().orderCosts.filter((c) => c.orderId === order.id);
    await ordersRepo.saveCosts(order.id, { lines: costs, lensSources: { [lensItem.id]: "loc_labo" } });
    expect(level(lensItem.productId, "loc_labo")).toBe(labBefore - 2);
    const db = getDb();
    expect(db.orders.find((o) => o.id === order.id)!.costsCompleted).toBe(true);
    expect(db.orderCosts.filter((c) => c.orderId === order.id)).toHaveLength(1);
    expect(db.notifications.some((n) => n.refId === order.id && n.type === "order_costs_needed" && !n.read)).toBe(false);
  });
});

describe("transfers", () => {
  beforeEach(() => signIn(DEMO_ADMIN_ID));

  it("moves stock from one location to another in one action", async () => {
    const lens = getDb().products.find((p) => p.kind === "lens" && level(p.id, "loc_labo") >= 5)!;
    const labBefore = level(lens.id, "loc_labo");
    const nordBefore = level(lens.id, "loc_nord");
    await stockRepo.transfer({ fromLocationId: "loc_labo", toLocationId: "loc_nord", items: [{ productId: lens.id, qty: 5 }] });
    expect(level(lens.id, "loc_labo")).toBe(labBefore - 5);
    expect(level(lens.id, "loc_nord")).toBe(nordBefore + 5);
  });

  it("is atomic: one short line blocks the whole transfer", async () => {
    const db = getDb();
    const ok = db.products.find((p) => p.kind === "lens" && level(p.id, "loc_labo") >= 5)!;
    const short = db.products.find((p) => p.kind === "frame")!;
    const before = db.stockMovements.length;
    await expectCode(
      stockRepo.transfer({
        fromLocationId: "loc_labo",
        toLocationId: "loc_nord",
        items: [
          { productId: ok.id, qty: 5 },
          { productId: short.id, qty: 999 },
        ],
      }),
      "insufficient_stock",
    );
    expect(getDb().stockMovements.length).toBe(before);
    expect(getDb().transfers.length).toBe(seed.transfers.length);
  });

  it("is refused to a secrétaire", async () => {
    signIn(DEMO_SECRETARY_ID);
    const lens = getDb().products.find((p) => p.kind === "lens")!;
    await expectCode(stockRepo.transfer({ fromLocationId: "loc_labo", toLocationId: "loc_centre", items: [{ productId: lens.id, qty: 1 }] }), "forbidden");
  });
});

describe("purchases & options", () => {
  beforeEach(() => signIn(DEMO_ADMIN_ID));

  it("receiving a purchase order adds stock at its location", async () => {
    const po = getDb().purchaseOrders.find((p) => p.status === "ordered")!;
    const it0 = po.items[0];
    const before = level(it0.productId, po.locationId);
    await purchasesRepo.markReceived(po.id);
    expect(level(it0.productId, po.locationId)).toBe(before + it0.qty);
  });

  it("archives instead of deleting a used option, and renames everywhere", async () => {
    const brand = getDb().options.find((o) => o.listKey === "brand" && o.labelFr === "Rayban")!;
    await expectCode(optionsRepo.remove(brand.id), "option_in_use");
    await optionsRepo.rename(brand.id, { labelFr: "Ray-Ban", labelEn: "Ray-Ban" });
    expect(getDb().options.find((o) => o.id === brand.id)!.labelFr).toBe("Ray-Ban");
    const unused = await optionsRepo.create("brand", { labelFr: "Nouvelle marque", labelEn: "" });
    await optionsRepo.remove(unused.option.id);
    expect(getDb().options.some((o) => o.id === unused.option.id)).toBe(false);
  });
});
