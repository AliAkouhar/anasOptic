import { describe, expect, it } from "vitest";
import {
  activityHeatmap,
  buildStockIndex,
  busiestSlot,
  canTransition,
  clientSegment,
  computeKpis,
  computeLeadTimes,
  computeMargins,
  computeReste,
  fixedChargesForRange,
  nextInvoiceNumber,
  nextStatus,
  orderReste,
  percentDelta,
  shiftRange,
  stockLevel,
  stockState,
} from "./calculations";
import { parseDecimal, parseMoney } from "./format";
import type { FixedCharge, Order, OrderCost, OrderStatusEvent, Payment, StockMovement } from "./types";

const eye = { sph: null, cyl: null, axis: null, add: null };
function order(partial: Partial<Order> & Pick<Order, "id">): Order {
  return {
    locationId: "loc_a",
    invoiceNumber: 1,
    clientId: "c1",
    status: "confirmed",
    total: 1000,
    od: eye,
    og: eye,
    lensTreatmentIds: [],
    customValues: {},
    createdBy: "u1",
    createdAt: "2026-09-10T10:00:00.000Z",
    costsCompleted: false,
    ...partial,
  };
}
const pay = (orderId: string, amount: number): Payment => ({
  id: `p${Math.random()}`,
  orderId,
  amount,
  methodId: "cash",
  kind: amount < 0 ? "refund" : "deposit",
  userId: "u1",
  createdAt: "2026-09-10T10:00:00.000Z",
});

describe("reste", () => {
  it("is total minus the sum of payments", () => {
    expect(computeReste(2400, [{ amount: 1000 }])).toBe(1400);
    expect(computeReste(2400, [{ amount: 1000 }, { amount: 1400 }])).toBe(0);
    expect(computeReste(1250.5, [{ amount: 0.25 }, { amount: 0.25 }])).toBe(1250);
  });
  it("treats refunds as negative payments", () => {
    expect(computeReste(1000, [{ amount: 400 }, { amount: -400 }])).toBe(1000);
  });
  it("is zero for a cancelled order", () => {
    expect(orderReste({ total: 1000, status: "cancelled" }, [{ amount: 400 }, { amount: -400 }])).toBe(0);
  });
});

describe("invoice numbering", () => {
  it("is sequential per location", () => {
    const orders = [
      { locationId: "centre", invoiceNumber: 1 },
      { locationId: "centre", invoiceNumber: 2 },
      { locationId: "nord", invoiceNumber: 7 },
    ];
    expect(nextInvoiceNumber(orders, "centre")).toBe(3);
    expect(nextInvoiceNumber(orders, "nord")).toBe(8);
  });
  it("starts at 1 for a new location", () => {
    expect(nextInvoiceNumber([{ locationId: "centre", invoiceNumber: 42 }], "est")).toBe(1);
  });
  it("uses the max, not the count (gaps after deletion are never reused)", () => {
    expect(nextInvoiceNumber([{ locationId: "a", invoiceNumber: 1 }, { locationId: "a", invoiceNumber: 5 }], "a")).toBe(6);
  });
});

describe("stock level", () => {
  const mv = (productId: string, locationId: string, qty: number): StockMovement => ({
    id: `m${Math.random()}`,
    productId,
    locationId,
    qty,
    reason: "purchase",
    userId: "u1",
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const movements = [mv("p1", "lab", 20), mv("p1", "lab", -5), mv("p1", "nord", 2), mv("p1", "nord", 5), mv("p2", "lab", 3)];

  it("is the sum of movements per product and location", () => {
    expect(stockLevel(movements, "p1", "lab")).toBe(15);
    expect(stockLevel(movements, "p1", "nord")).toBe(7);
    expect(stockLevel(movements, "p3", "lab")).toBe(0);
  });
  it("matches the index", () => {
    const index = buildStockIndex(movements);
    expect(index.get("p1|lab")).toBe(15);
    expect(index.get("p2|lab")).toBe(3);
  });
  it("classifies levels against the threshold", () => {
    expect(stockState(0, 2)).toBe("out");
    expect(stockState(1, 2)).toBe("low");
    expect(stockState(2, 2)).toBe("near");
    expect(stockState(3, 2)).toBe("near");
    expect(stockState(4, 2)).toBe("ok");
  });
});

describe("client segment", () => {
  const loyalty = { regularMinOrders: 2, loyalMinOrders: 4 };
  it("uses the loyalty thresholds", () => {
    expect(clientSegment(0, loyalty)).toBe("new");
    expect(clientSegment(1, loyalty)).toBe("new");
    expect(clientSegment(2, loyalty)).toBe("regular");
    expect(clientSegment(3, loyalty)).toBe("regular");
    expect(clientSegment(4, loyalty)).toBe("loyal");
    expect(clientSegment(9, loyalty)).toBe("loyal");
  });
  it("follows edited thresholds", () => {
    expect(clientSegment(4, { regularMinOrders: 3, loyalMinOrders: 6 })).toBe("regular");
  });
});

describe("status flow", () => {
  it("only moves forward by one step", () => {
    expect(nextStatus("confirmed")).toBe("workshop");
    expect(nextStatus("in_store")).toBe("delivered");
    expect(nextStatus("delivered")).toBeNull();
    expect(canTransition("confirmed", "workshop")).toBe(true);
    expect(canTransition("confirmed", "prepared")).toBe(false);
    expect(canTransition("prepared", "workshop")).toBe(false);
  });
  it("allows cancelling any status before delivered", () => {
    expect(canTransition("confirmed", "cancelled")).toBe(true);
    expect(canTransition("in_store", "cancelled")).toBe(true);
    expect(canTransition("delivered", "cancelled")).toBe(false);
    expect(canTransition("cancelled", "cancelled")).toBe(false);
  });
});

describe("M-1 / A-1 comparisons", () => {
  it("computes relative deltas", () => {
    expect(percentDelta(120, 100)).toBeCloseTo(0.2);
    expect(percentDelta(80, 100)).toBeCloseTo(-0.2);
    expect(percentDelta(0, 0)).toBe(0);
    expect(percentDelta(50, 0)).toBeNull();
    expect(percentDelta(-50, -100)).toBeCloseTo(0.5);
  });
  it("shifts a full month to the full previous month", () => {
    const r = shiftRange({ from: new Date(2026, 8, 1), to: new Date(2026, 8, 30) }, "mom")!;
    expect(r.from.getMonth()).toBe(7);
    expect(r.from.getDate()).toBe(1);
    expect(r.to.getMonth()).toBe(7);
    expect(r.to.getDate()).toBe(31);
  });
  it("shifts a partial period by the same days", () => {
    const r = shiftRange({ from: new Date(2026, 8, 1), to: new Date(2026, 8, 27) }, "mom")!;
    expect(r.to.getMonth()).toBe(7);
    expect(r.to.getDate()).toBe(27);
  });
  it("shifts by one year for A-1", () => {
    const r = shiftRange({ from: new Date(2026, 0, 1), to: new Date(2026, 8, 27) }, "yoy")!;
    expect(r.from.getFullYear()).toBe(2025);
    expect(r.to.getFullYear()).toBe(2025);
    expect(r.to.getDate()).toBe(27);
  });
  it("returns null without comparison", () => {
    expect(shiftRange({ from: new Date(), to: new Date() }, "none")).toBeNull();
  });
});

describe("margins", () => {
  it("gross = revenue − order costs, net = gross − fixed charges", () => {
    const m = computeMargins(10_000, 4_500, 3_000);
    expect(m.grossMargin).toBe(5_500);
    expect(m.netMargin).toBe(2_500);
    expect(m.grossRate).toBeCloseTo(0.55);
    expect(m.netRate).toBeCloseTo(0.25);
  });
  it("prorates monthly fixed charges by day", () => {
    const charges: FixedCharge[] = [
      { id: "1", locationId: "a", type: "rent", month: "2026-09", amount: 3000 },
      { id: "2", locationId: "b", type: "rent", month: "2026-09", amount: 9000 },
    ];
    const month = { from: new Date(2026, 8, 1), to: new Date(2026, 8, 30) };
    expect(fixedChargesForRange(charges, month, null)).toBe(12_000);
    expect(fixedChargesForRange(charges, month, ["a"])).toBe(3000);
    const tenDays = { from: new Date(2026, 8, 1), to: new Date(2026, 8, 10) };
    expect(fixedChargesForRange(charges, tenDays, ["a"])).toBe(1000);
  });
  it("excludes cancelled orders from revenue KPIs and flags orders without costs", () => {
    const orders = [
      order({ id: "o1", total: 2000, costsCompleted: true }),
      order({ id: "o2", total: 1000, costsCompleted: false }),
      order({ id: "o3", total: 5000, status: "cancelled" }),
    ];
    const payments = new Map<string, Payment[]>([
      ["o1", [pay("o1", 800)]],
      ["o2", [pay("o2", 1000)]],
      ["o3", [pay("o3", 2000), pay("o3", -2000)]],
    ]);
    const costs = new Map<string, OrderCost[]>([["o1", [{ id: "c", orderId: "o1", label: "x", amount: 900, createdAt: "" }]]]);
    const k = computeKpis({
      orders,
      paymentsByOrder: payments,
      costsByOrder: costs,
      fixedCharges: [],
      range: { from: new Date("2026-09-01"), to: new Date("2026-09-30") },
      locationIds: null,
    });
    expect(k.revenue).toBe(3000);
    expect(k.orderCount).toBe(2);
    expect(k.cancelledCount).toBe(1);
    expect(k.cancellationRate).toBeCloseTo(1 / 3);
    expect(k.avgBasket).toBe(1500);
    expect(k.orderCosts).toBe(900);
    expect(k.grossMargin).toBe(2100);
    expect(k.outstanding).toBe(1200);
    expect(k.ordersWithoutCosts).toBe(1);
  });
});

describe("activity & lead times", () => {
  it("finds the busiest two-hour slot", () => {
    // 2026-09-26 is a Saturday.
    const orders = [
      { createdAt: new Date(2026, 8, 26, 10, 5).toISOString() },
      { createdAt: new Date(2026, 8, 26, 11, 30).toISOString() },
      { createdAt: new Date(2026, 8, 28, 17, 0).toISOString() },
    ];
    const grid = activityHeatmap(orders);
    expect(grid[5][1]).toBe(1); // Saturday 10h
    expect(busiestSlot(grid)).toEqual({ day: 5, hour: 10, count: 2 });
  });
  it("averages days per step", () => {
    const ev = (to: Order["status"], day: number): OrderStatusEvent => ({
      id: to,
      orderId: "o1",
      to,
      userId: "u",
      createdAt: new Date(2026, 8, day).toISOString(),
    });
    const events = new Map([["o1", [ev("confirmed", 1), ev("workshop", 2), ev("prepared", 5), ev("in_store", 6), ev("delivered", 8)]]]);
    const lt = computeLeadTimes(events, ["o1"]);
    expect(lt.perStep.map((d) => Math.round(d!))).toEqual([1, 3, 1, 2]);
    expect(Math.round(lt.toInStore!)).toBe(5);
    expect(Math.round(lt.toDelivered!)).toBe(7);
  });
});

describe("input parsing", () => {
  it("reads money in each locale", () => {
    expect(parseMoney("2 400", "fr")).toBe(2400);
    expect(parseMoney("2\u202f400,50", "fr")).toBe(2400.5);
    expect(parseMoney("2400.50", "fr")).toBe(2400.5);
    expect(parseMoney("2.400,50", "fr")).toBe(2400.5);
    expect(parseMoney("2,400.50", "en")).toBe(2400.5);
    expect(parseMoney("2,400", "en")).toBe(2400);
    expect(parseMoney("", "fr")).toBeNull();
    expect(parseDecimal("\u22121.25")).toBe(-1.25);
    expect(parseDecimal("+0,75")).toBe(0.75);
    expect(parseDecimal("-1.25-1")).toBeNull();
  });
});
