/**
 * Deterministic mock database generator (faker.seed(42)).
 * Same anchor date → same data, so the persisted state only needs to store the changes
 * made during the demo (see persistence.ts).
 */

import { Faker, base } from "@faker-js/faker";
import { addHours, addMinutes, addMonths, endOfMonth, format, startOfDay, startOfMonth, subDays, subMonths, subYears } from "date-fns";
import { PERMISSIONS, SECRETARY_PERMISSIONS } from "@/lib/permissions";
import {
  SUPPLIER_SOURCE,
  type Client,
  type CustomField,
  type DB,
  type EyePrescription,
  type FixedCharge,
  type FixedChargeType,
  type Location,
  type MovementReason,
  type Notification,
  type Option,
  type OptionListKey,
  type Order,
  type OrderCost,
  type OrderItem,
  type OrderStatus,
  type OrderStatusEvent,
  type Payment,
  type Product,
  type PurchaseOrder,
  type Role,
  type StockMovement,
  type StockThreshold,
  type Supplier,
  type Transfer,
  type User,
} from "@/lib/types";

import { DEMO_ADMIN_ID, SEED_VERSION } from "./constants";

const TARGET_ORDERS = 1800;
const TARGET_CLIENTS = 800;

// Approximate Ramadan periods: activity is slower.
const RAMADAN: [string, string][] = [
  ["2023-03-23", "2023-04-21"],
  ["2024-03-11", "2024-04-09"],
  ["2025-03-01", "2025-03-30"],
  ["2026-02-18", "2026-03-19"],
  ["2027-02-08", "2027-03-09"],
  ["2028-01-28", "2028-02-26"],
];

const MALE = ["Youssef", "Mohamed", "Ahmed", "Mehdi", "Omar", "Hamza", "Ayoub", "Anas", "Karim", "Rachid", "Hassan", "Saïd", "Abdelilah", "Othmane", "Amine", "Yassine", "Ismail", "Adil", "Khalid", "Mustapha", "Nabil", "Hicham", "Driss", "Tarik", "Zakaria", "Ilyas", "Soufiane", "Reda", "Bilal", "Abdellah", "Brahim", "Jamal", "Aziz", "Badr", "Walid"];
const FEMALE = ["Fatima Zahra", "Salma", "Khadija", "Meryem", "Aïcha", "Hajar", "Nadia", "Samira", "Imane", "Sanaa", "Laila", "Zineb", "Hind", "Asmae", "Ghita", "Kawtar", "Yasmine", "Houda", "Nora", "Rim", "Soukaina", "Chaimae", "Oumaima", "Btissam", "Latifa", "Malika", "Naïma", "Rajae", "Souad", "Wafae", "Siham", "Loubna", "Ikram", "Nisrine", "Hanane"];
const LAST = ["El Amrani", "Bennani", "Alaoui", "Idrissi", "Tazi", "Berrada", "El Fassi", "Benjelloun", "Chraibi", "Lahlou", "Squalli", "Benkirane", "El Ouazzani", "Kettani", "Sefrioui", "Bensouda", "El Mansouri", "Cherkaoui", "Naciri", "El Khatib", "Ziani", "Bouzidi", "Amrani", "El Hachimi", "Benali", "Aït Taleb", "Ouali", "Belhaj", "Rami", "Filali", "Guessous", "Lamrani", "Skalli", "Tahiri", "El Idrissi", "Mernissi", "Bekkali", "Hajji", "Boukhari", "Saadi", "Moussaoui", "Ennaji", "El Alami", "Zerouali", "Rhazali", "Sbai", "Tounsi", "Jabri", "Kabbaj", "Ghazi"];

type Tier = "house" | "mid" | "premium" | "luxury";

const FRAMES: { brand: string; tier: Tier; models: string[]; sun: string[] }[] = [
  { brand: "Rayban", tier: "premium", models: ["RB5154 Clubmaster", "RB2140 Wayfarer", "RB5228", "RB7047", "RB6335"], sun: ["RB3025 Aviator", "RB4171 Erika"] },
  { brand: "Oakley", tier: "premium", models: ["OX8046 Airdrop", "OX8156 Holbrook RX", "OX3217 Crosslink", "OX8081 Pitchman"], sun: ["OO9102 Holbrook"] },
  { brand: "Vogue", tier: "mid", models: ["VO5239", "VO5286", "VO4082", "VO5163", "VO5357"], sun: ["VO2787"] },
  { brand: "Carrera", tier: "premium", models: ["CA 8834", "CA 1123", "Carrera 8872", "CA 2021T", "CA 8850"], sun: ["Carrera 5001"] },
  { brand: "Police", tier: "mid", models: ["SPL A45", "VPL 684", "VPLD 91", "VPL 897", "VPLE 37"], sun: ["SPLF 61"] },
  { brand: "Guess", tier: "mid", models: ["GU 2785", "GU 2849", "GU 1976", "GU 2700", "GU 2880"], sun: ["GU 7645"] },
  { brand: "Tom Ford", tier: "luxury", models: ["FT5401", "FT5634-B", "FT5294", "FT5178"], sun: ["FT0237 Snowdon"] },
  { brand: "Persol", tier: "luxury", models: ["PO3007V", "PO3092V", "PO3246V", "PO2447V"], sun: ["PO0714"] },
  { brand: "Prada", tier: "luxury", models: ["PR 17WV", "PR 08WV", "PR 16MV"], sun: ["PR 17WS"] },
  { brand: "Lacoste", tier: "mid", models: ["L2233", "L2851", "L2805"], sun: ["L6003S"] },
  { brand: "Anass Vision", tier: "house", models: ["AV Classic 01", "AV Classic 02", "AV Kids 01", "AV Slim 03", "AV Round 04"], sun: ["AV Sun 05"] },
];

const TIER_PRICES: Record<Tier, [number, number]> = {
  house: [120, 200],
  mid: [280, 450],
  premium: [480, 780],
  luxury: [900, 1250],
};

type LensKind = "sv" | "prog" | "bifocal" | "office";
const LENSES: { brand: string; name: string; kind: LensKind; price: [number, number] }[] = [
  { brand: "Essilor", name: "Eyezen Start 1.5", kind: "sv", price: [90, 140] },
  { brand: "Essilor", name: "Eyezen Start 1.6", kind: "sv", price: [150, 220] },
  { brand: "Essilor", name: "Eyezen Start 1.67", kind: "sv", price: [240, 330] },
  { brand: "Essilor", name: "Crizal Rock 1.5", kind: "sv", price: [120, 180] },
  { brand: "Essilor", name: "Transitions Gen S 1.5", kind: "sv", price: [260, 350] },
  { brand: "Essilor", name: "Varilux Comfort Max 1.5", kind: "prog", price: [520, 700] },
  { brand: "Essilor", name: "Varilux Comfort Max 1.6", kind: "prog", price: [650, 850] },
  { brand: "Essilor", name: "Varilux Physio 1.6", kind: "prog", price: [760, 980] },
  { brand: "Essilor", name: "Varilux XR 1.67", kind: "prog", price: [1000, 1200] },
  { brand: "Zeiss", name: "ClearView SV 1.5", kind: "sv", price: [100, 150] },
  { brand: "Zeiss", name: "ClearView SV 1.6", kind: "sv", price: [160, 230] },
  { brand: "Zeiss", name: "SmartLife SV 1.6", kind: "sv", price: [220, 300] },
  { brand: "Zeiss", name: "DriveSafe SV 1.5", kind: "sv", price: [200, 260] },
  { brand: "Zeiss", name: "SmartLife Progressive 1.5", kind: "prog", price: [600, 780] },
  { brand: "Zeiss", name: "SmartLife Progressive 1.6", kind: "prog", price: [720, 920] },
  { brand: "Zeiss", name: "Precision Pure 1.6", kind: "prog", price: [560, 720] },
  { brand: "Zeiss", name: "Office Lens 1.5", kind: "office", price: [380, 480] },
  { brand: "Hoya", name: "Nulux 1.5", kind: "sv", price: [80, 120] },
  { brand: "Hoya", name: "Nulux 1.6", kind: "sv", price: [130, 190] },
  { brand: "Hoya", name: "Hilux 1.5", kind: "sv", price: [85, 130] },
  { brand: "Hoya", name: "MiYOSMART 1.5", kind: "sv", price: [280, 350] },
  { brand: "Hoya", name: "Hoyalux iD MyStyle 1.6", kind: "prog", price: [800, 1000] },
  { brand: "Hoya", name: "Hoyalux Balansis 1.5", kind: "prog", price: [480, 620] },
  { brand: "Hoya", name: "Hoyalux Summit 1.6", kind: "prog", price: [420, 560] },
  { brand: "Rodenstock", name: "Perfalit 1.5", kind: "sv", price: [95, 140] },
  { brand: "Rodenstock", name: "Perfalit 1.6", kind: "sv", price: [150, 210] },
  { brand: "Rodenstock", name: "Road 2 1.5", kind: "sv", price: [210, 280] },
  { brand: "Rodenstock", name: "Impression FreeSign 1.6", kind: "prog", price: [900, 1150] },
  { brand: "Rodenstock", name: "Multigressiv Mono 1.5", kind: "prog", price: [460, 600] },
  { brand: "Rodenstock", name: "Ergo 1.5", kind: "bifocal", price: [300, 400] },
];

const ACCESSORIES: { brand: string; name: string; category: "acc" | "cl"; price: [number, number]; sale: number }[] = [
  { brand: "Anass Vision", name: "Étui rigide", category: "acc", price: [15, 25], sale: 60 },
  { brand: "Anass Vision", name: "Chiffon microfibre", category: "acc", price: [4, 8], sale: 20 },
  { brand: "Anass Vision", name: "Spray nettoyant 30 ml", category: "acc", price: [10, 16], sale: 40 },
  { brand: "Anass Vision", name: "Cordon lunettes", category: "acc", price: [8, 14], sale: 35 },
  { brand: "Acuvue", name: "Oasys (boîte de 6)", category: "cl", price: [130, 160], sale: 290 },
  { brand: "CooperVision", name: "Biofinity (boîte de 3)", category: "cl", price: [110, 140], sale: 250 },
  { brand: "Alcon", name: "Dailies Total1 (boîte de 30)", category: "cl", price: [190, 230], sale: 420 },
  { brand: "Alcon", name: "Opti-Free 300 ml", category: "cl", price: [45, 60], sale: 110 },
];

function slug(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const LIST_PREFIX: Record<OptionListKey, string> = {
  brand: "br",
  product_category: "cat",
  lens_type: "lt",
  lens_treatment: "tr",
  frame_material: "mat",
  payment_method: "pm",
  supplier_category: "sc",
};

export function generateSeed(anchor: Date = new Date()): DB {
  const faker = new Faker({ locale: [base] });
  faker.seed(42);

  const now = anchor;
  const nowMs = now.getTime();
  const start = startOfDay(subMonths(now, 24));
  const iso = (d: Date | number) => new Date(d).toISOString();

  // ─── Random helpers ────────────────────────────────────────────────────────
  const rnd = () => faker.number.float();
  const int = (min: number, max: number) => faker.number.int({ min, max });
  const between = (min: number, max: number) => min + rnd() * (max - min);
  const chance = (p: number) => rnd() < p;
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
  const weighted = <T>(items: readonly (readonly [T, number])[]): T => {
    let total = 0;
    for (const [, w] of items) total += w;
    let u = rnd() * total;
    for (const [v, w] of items) {
      u -= w;
      if (u <= 0) return v;
    }
    return items[items.length - 1][0];
  };
  const gauss = () => {
    const u = Math.max(rnd(), 1e-9);
    const v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const q25 = (x: number) => Math.round(x * 4) / 4;
  const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
  const round10 = (x: number) => Math.round(x / 10) * 10;
  const counters: Record<string, number> = {};
  const id = (prefix: string) => {
    counters[prefix] = (counters[prefix] ?? 0) + 1;
    return `${prefix}_${counters[prefix].toString(36)}`;
  };

  // ─── Locations ─────────────────────────────────────────────────────────────
  const founded = iso(subYears(start, 3));
  const locations: Location[] = [
    { id: "loc_centre", name: "Succursale Centre", type: "store", address: "112, boulevard Mohammed V, Centre-ville, Casablanca", whatsappNumber: "0661234501", isActive: true, createdAt: founded },
    { id: "loc_nord", name: "Succursale Nord", type: "store", address: "48, avenue Ibn Tachfine, Aïn Sebaâ, Casablanca", whatsappNumber: "0661234502", isActive: true, createdAt: founded },
    { id: "loc_sud", name: "Succursale Sud", type: "store", address: "7, boulevard Oqba Ibn Nafii, Hay Hassani, Casablanca", whatsappNumber: "0661234503", isActive: true, createdAt: founded },
    { id: "loc_labo", name: "Labo principal", type: "lab", address: "Zone industrielle Sidi Maârouf, lot 23, Casablanca", whatsappNumber: "0661234500", isActive: true, createdAt: founded },
  ];
  const STORES = ["loc_centre", "loc_nord", "loc_sud"] as const;
  type StoreId = (typeof STORES)[number];

  // ─── Options ───────────────────────────────────────────────────────────────
  const options: Option[] = [];
  const addList = (listKey: OptionListKey, labels: [string, string][]) => {
    const ids: Record<string, string> = {};
    labels.forEach(([fr, en], i) => {
      const optionId = `${LIST_PREFIX[listKey]}_${slug(fr)}`;
      options.push({ id: optionId, listKey, labelFr: fr, labelEn: en, sortOrder: i, isActive: true });
      ids[fr] = optionId;
    });
    return ids;
  };
  const brandNames = [...FRAMES.map((f) => f.brand), "Essilor", "Zeiss", "Hoya", "Rodenstock", "Acuvue", "CooperVision", "Alcon"];
  const brandIds = addList("brand", brandNames.map((b) => [b, b] as [string, string]));
  const cat = addList("product_category", [
    ["Montures optiques", "Optical frames"],
    ["Solaires", "Sunglasses"],
    ["Verres unifocaux", "Single-vision lenses"],
    ["Verres progressifs", "Progressive lenses"],
    ["Lentilles", "Contact lenses"],
    ["Accessoires", "Accessories"],
  ]);
  const lensType = addList("lens_type", [
    ["Unifocal", "Single vision"],
    ["Progressif", "Progressive"],
    ["Bifocal", "Bifocal"],
    ["Mi-distance", "Office (mid-distance)"],
  ]);
  const treatment = addList("lens_treatment", [
    ["Antireflet", "Anti-reflective"],
    ["Anti-lumière bleue", "Blue-light filter"],
    ["Photochromique", "Photochromic"],
    ["Durci", "Hard coat"],
    ["Polarisé", "Polarised"],
  ]);
  const material = addList("frame_material", [
    ["Acétate", "Acetate"],
    ["Métal", "Metal"],
    ["Titane", "Titanium"],
    ["TR90", "TR90"],
  ]);
  const pay = addList("payment_method", [
    ["Espèces", "Cash"],
    ["Carte bancaire", "Card"],
    ["Chèque", "Cheque"],
    ["Virement", "Bank transfer"],
  ]);
  const supCat = addList("supplier_category", [
    ["Montures", "Frames"],
    ["Verres", "Lenses"],
    ["Lentilles de contact", "Contact lenses"],
    ["Accessoires", "Accessories"],
  ]);
  const payWeights = [
    [pay["Espèces"], 55],
    [pay["Carte bancaire"], 30],
    [pay["Chèque"], 10],
    [pay["Virement"], 5],
  ] as const;

  // ─── Custom fields ─────────────────────────────────────────────────────────
  const customFields: CustomField[] = [
    { id: "cf_fitting_height", labelFr: "Hauteur de montage (mm)", labelEn: "Fitting height (mm)", type: "number", isActive: true, sortOrder: 0 },
  ];

  // ─── Roles & users ─────────────────────────────────────────────────────────
  const longAgo = iso(subYears(start, 1));
  const roles: Role[] = [
    { id: "role_admin", labelFr: "Super admin", labelEn: "Super admin", permissions: [...PERMISSIONS], isSystem: true, createdAt: longAgo },
    { id: "role_secretary", labelFr: "Secrétaire", labelEn: "Secretary", permissions: [...SECRETARY_PERMISSIONS], isSystem: true, createdAt: longAgo },
  ];
  const mkUser = (userId: string, fullName: string, roleId: string, locationId: string | null, isActive = true): User => ({
    id: userId,
    fullName,
    email: `${slug(fullName).replace(/-/g, ".")}@anassvision.ma`,
    roleId,
    locationId,
    isActive,
    createdAt: longAgo,
  });
  const users: User[] = [
    mkUser(DEMO_ADMIN_ID, "Anass Berrada", "role_admin", null),
    mkUser("u_ctr_1", "Khadija Amrani", "role_secretary", "loc_centre"),
    mkUser("u_ctr_2", "Nadia Squalli", "role_secretary", "loc_centre"),
    mkUser("u_nrd_1", "Imane Tazi", "role_secretary", "loc_nord"),
    mkUser("u_nrd_2", "Siham Lahlou", "role_secretary", "loc_nord"),
    mkUser("u_sud_1", "Houda Chraibi", "role_secretary", "loc_sud"),
    mkUser("u_sud_2", "Loubna Fassi", "role_secretary", "loc_sud", false),
  ];
  const deactivatedAt = subMonths(now, 5).getTime();
  const secretariesAt = (loc: StoreId, t: number): string[] => {
    const all = users.filter((u) => u.locationId === loc);
    const available = all.filter((u) => u.isActive || t < deactivatedAt);
    return available.map((u) => u.id);
  };
  const activeSecretaries = (loc: string) => users.filter((u) => u.locationId === loc && u.isActive).map((u) => u.id);

  // ─── Products ──────────────────────────────────────────────────────────────
  const products: Product[] = [];
  const frameIds: string[] = [];
  const sunIds: string[] = [];
  for (const f of FRAMES) {
    const [lo, hi] = TIER_PRICES[f.tier];
    const add = (name: string, sun: boolean) => {
      const purchase = round10(between(lo, hi));
      const sale = clamp(round10(purchase * between(2.0, 2.4)), 300, 2500);
      const productId = id("pf");
      products.push({
        id: productId,
        name,
        categoryId: sun ? cat["Solaires"] : cat["Montures optiques"],
        brandId: brandIds[f.brand],
        kind: "frame",
        materialId: pick(Object.values(material)),
        purchasePrice: purchase,
        salePrice: sale,
        isActive: true,
      });
      (sun ? sunIds : frameIds).push(productId);
    };
    f.models.forEach((m) => add(m, false));
    f.sun.forEach((m) => add(m, true));
  }
  const lensByKind: Record<LensKind, string[]> = { sv: [], prog: [], bifocal: [], office: [] };
  const lensTypeOf: Record<LensKind, string> = {
    sv: lensType["Unifocal"],
    prog: lensType["Progressif"],
    bifocal: lensType["Bifocal"],
    office: lensType["Mi-distance"],
  };
  for (const l of LENSES) {
    const purchase = round10(between(l.price[0], l.price[1]));
    const productId = id("pl");
    products.push({
      id: productId,
      name: l.name,
      categoryId: l.kind === "sv" ? cat["Verres unifocaux"] : cat["Verres progressifs"],
      brandId: brandIds[l.brand],
      kind: "lens",
      lensTypeId: lensTypeOf[l.kind],
      purchasePrice: purchase,
      salePrice: clamp(round10(purchase * between(2.2, 2.6)), 200, 3000),
      isActive: true,
    });
    lensByKind[l.kind].push(productId);
  }
  const accessoryIds: string[] = [];
  for (const a of ACCESSORIES) {
    const productId = id("pa");
    products.push({
      id: productId,
      name: a.name,
      categoryId: a.category === "acc" ? cat["Accessoires"] : cat["Lentilles"],
      brandId: brandIds[a.brand],
      kind: "accessory",
      purchasePrice: Math.round(between(a.price[0], a.price[1])),
      salePrice: a.sale,
      isActive: true,
    });
    accessoryIds.push(productId);
  }
  const productById = new Map(products.map((p) => [p.id, p]));
  const allFrames = [...frameIds, ...sunIds];
  const allLenses = [...lensByKind.sv, ...lensByKind.prog, ...lensByKind.bifocal, ...lensByKind.office];
  const storeLenses = lensByKind.sv.slice(0, 6);

  // ─── Suppliers ─────────────────────────────────────────────────────────────
  const suppliers: Supplier[] = [
    { id: "sup_essilor", name: "Essilor Maroc", phone: "0522456780", categoryId: supCat["Verres"] },
    { id: "sup_zeiss", name: "Zeiss Vision Care Maroc", phone: "0522367421", categoryId: supCat["Verres"] },
    { id: "sup_hoya", name: "Hoya Lens Maroc", phone: "0522981134", categoryId: supCat["Verres"] },
    { id: "sup_luxottica", name: "Luxottica Maroc", phone: "0522778810", categoryId: supCat["Montures"] },
    { id: "sup_safilo", name: "Safilo Distribution", phone: "0522604455", categoryId: supCat["Montures"] },
    { id: "sup_access", name: "Optic Accessoires Casablanca", phone: "0661907788", categoryId: supCat["Accessoires"] },
  ];
  const supplierBrands: Record<string, string[]> = {
    sup_essilor: ["Essilor"],
    sup_zeiss: ["Zeiss"],
    sup_hoya: ["Hoya", "Rodenstock"],
    sup_luxottica: ["Rayban", "Oakley", "Vogue", "Persol", "Prada"],
    sup_safilo: ["Carrera", "Police", "Guess", "Tom Ford", "Lacoste"],
    sup_access: ["Anass Vision", "Acuvue", "CooperVision", "Alcon"],
  };

  // ─── Stock thresholds & initial stock ──────────────────────────────────────
  const stockThresholds: StockThreshold[] = [];
  const stockMovements: StockMovement[] = [];
  const level = new Map<string, number>();
  const lastMove = new Map<string, number>();
  const key = (p: string, l: string) => `${p}|${l}`;
  const pushMovement = (
    productId: string,
    locationId: string,
    qty: number,
    reason: MovementReason,
    t: number,
    userId: string,
    refId?: string,
    note?: string,
  ) => {
    stockMovements.push({ id: id("mv"), productId, locationId, qty, reason, refId, userId, createdAt: iso(t), note });
    const k = key(productId, locationId);
    level.set(k, (level.get(k) ?? 0) + qty);
    lastMove.set(k, Math.max(lastMove.get(k) ?? 0, t));
  };
  const initialAt = subDays(start, 3).getTime();
  const threshold = new Map<string, number>();
  const setThreshold = (productId: string, locationId: string, minQty: number) => {
    stockThresholds.push({ productId, locationId, minQty });
    threshold.set(key(productId, locationId), minQty);
  };
  const frameStock: Record<StoreId, [number, number]> = { loc_centre: [4, 8], loc_nord: [3, 6], loc_sud: [2, 5] };
  for (const loc of STORES) {
    for (const f of allFrames) {
      setThreshold(f, loc, loc === "loc_centre" ? 3 : 2);
      pushMovement(f, loc, int(...frameStock[loc]), "purchase", initialAt, DEMO_ADMIN_ID, undefined, "Stock initial");
    }
    for (const l of storeLenses) {
      setThreshold(l, loc, 2);
      pushMovement(l, loc, int(4, 8), "purchase", initialAt, DEMO_ADMIN_ID, undefined, "Stock initial");
    }
    for (const a of accessoryIds) {
      setThreshold(a, loc, 5);
      pushMovement(a, loc, int(10, 30), "purchase", initialAt, DEMO_ADMIN_ID, undefined, "Stock initial");
    }
  }
  for (const l of allLenses) {
    setThreshold(l, "loc_labo", 10);
    pushMovement(l, "loc_labo", int(24, 60), "purchase", initialAt, DEMO_ADMIN_ID, undefined, "Stock initial");
  }

  /** Stock demands are replayed chronologically so levels never go negative. */
  interface Demand {
    t: number;
    productId: string;
    locationId: string;
    qty: number;
    reason: MovementReason;
    refId?: string;
    userId: string;
    note?: string;
    seq: number;
  }
  const demands: Demand[] = [];
  let seq = 0;
  const demand = (d: Omit<Demand, "seq">) => demands.push({ ...d, seq: seq++ });

  // ─── Order timestamps ──────────────────────────────────────────────────────
  const DOW = [0.25, 1.4, 0.95, 1.0, 0.95, 0.8, 1.65]; // Sun..Sat
  const MONTH = [0.9, 0.9, 1.0, 1.0, 1.0, 1.05, 1.12, 1.02, 1.25, 1.08, 0.95, 1.0];
  const HOURS: [number, number][] = [
    [9, 0.5], [10, 1.45], [11, 1.55], [12, 0.9], [13, 0.35], [14, 0.55],
    [15, 0.75], [16, 0.9], [17, 1.35], [18, 1.45], [19, 1.0], [20, 0.35],
  ];
  const ramadan = RAMADAN.map(([a, b]) => [new Date(a).getTime(), new Date(b).getTime() + 86_400_000] as const);
  const totalDays = Math.round((startOfDay(now).getTime() - start.getTime()) / 86_400_000) + 1;
  const dayWeights: number[] = [];
  for (let i = 0; i < totalDays; i++) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const progress = i / totalDays;
    let w = DOW[day.getDay()] * MONTH[day.getMonth()] * (0.85 + 0.3 * progress);
    if (ramadan.some(([a, b]) => day.getTime() >= a && day.getTime() < b)) w *= 0.6;
    w *= 0.85 + rnd() * 0.3;
    if (i === totalDays - 1) w *= clamp((now.getHours() - 9) / 11, 0, 1);
    dayWeights.push(w);
  }
  const cumulative: number[] = [];
  dayWeights.reduce((acc, w, i) => (cumulative[i] = acc + w), 0);
  const totalWeight = cumulative[cumulative.length - 1];
  const sampleDay = () => {
    const u = rnd() * totalWeight;
    let lo = 0;
    let hi = cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] < u) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  // Stratified allocation: each day gets its expected share of orders (randomised rounding),
  // so month-to-month comparisons follow the seasonality instead of sampling noise.
  const counts = dayWeights.map((w) => {
    const expected = (w / totalWeight) * TARGET_ORDERS;
    return Math.floor(expected) + (rnd() < expected - Math.floor(expected) ? 1 : 0);
  });
  let diff = TARGET_ORDERS - counts.reduce((s, c) => s + c, 0);
  while (diff !== 0) {
    const i = sampleDay();
    if (diff > 0) {
      counts[i]++;
      diff--;
    } else if (counts[i] > 0) {
      counts[i]--;
      diff++;
    }
  }
  const times: number[] = [];
  counts.forEach((count, dayIndex) => {
    for (let c = 0; c < count; c++) {
      let t = 0;
      for (let attempt = 0; attempt < 30; attempt++) {
        const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + dayIndex - (attempt >= 20 ? 1 : 0));
        t = addMinutes(addHours(day, weighted(HOURS)), int(0, 59)).getTime();
        if (t < nowMs - 5 * 60_000) break;
      }
      times.push(t);
    }
  });
  times.sort((a, b) => a - b);

  // Location per order: Centre ≈ 45 %, Nord ≈ 33 % (growing), Sud ≈ 22 %.
  const orderLocations: StoreId[] = times.map((t) => {
    const progress = (t - start.getTime()) / (nowMs - start.getTime());
    return weighted([
      ["loc_centre", 0.45],
      ["loc_nord", 0.33 * (0.85 + 0.3 * progress)],
      ["loc_sud", 0.22 * (1.08 - 0.16 * progress)],
    ] as const);
  });

  // ─── Clients ───────────────────────────────────────────────────────────────
  interface ClientProfile {
    client: Client;
    myope: boolean;
    presbyope: boolean;
    od: EyePrescription;
    og: EyePrescription;
    tickets: number;
  }
  const phones = new Set<string>();
  const newPhone = () => {
    let p: string;
    do p = `0${pick(["6", "6", "7"])}${faker.string.numeric(8)}`;
    while (phones.has(p));
    phones.add(p);
    return p;
  };
  const profiles: ClientProfile[] = [];
  const perLocation: Record<StoreId, ClientProfile[]> = { loc_centre: [], loc_nord: [], loc_sud: [] };
  for (let i = 0; i < TARGET_CLIENTS; i++) {
    const female = chance(0.52);
    const fullName = `${pick(female ? FEMALE : MALE)} ${pick(LAST)}`;
    const home = weighted([
      ["loc_centre", 45],
      ["loc_nord", 33],
      ["loc_sud", 22],
    ] as const);
    const myope = chance(0.7);
    const presbyope = chance(0.35);
    const baseSph = myope ? clamp(q25(-0.5 + gauss() * 1.8 - 1.2), -8, -0.25) : chance(0.75) ? clamp(q25(0.5 + rnd() * 3.5), 0.25, 6) : q25(between(-0.25, 0.25));
    const hasCyl = chance(0.6);
    const eye = (): EyePrescription => ({
      sph: clamp(q25(baseSph + (chance(0.5) ? 0 : pick([-0.5, -0.25, 0.25, 0.5]))), -8, 6),
      cyl: hasCyl ? clamp(q25(-0.25 - Math.abs(gauss()) * 0.9), -4, -0.25) : 0,
      axis: hasCyl ? int(0, 36) * 5 : null,
      add: presbyope ? q25(between(0.75, 3.5)) : null,
    });
    const od = eye();
    const og = { ...eye(), add: od.add };
    const tickets = weighted([
      [1, 45],
      [int(2, 3), 30],
      [int(4, 7), 25],
    ] as const);
    const profile: ClientProfile = {
      client: { id: `c_${(i + 1).toString(36)}`, fullName, phone: newPhone(), isWhatsapp: chance(0.7), locationId: home, createdAt: "" },
      myope,
      presbyope,
      od,
      og,
      tickets,
    };
    profiles.push(profile);
    perLocation[home].push(profile);
  }

  // Tickets per location, matched to the order slots of that location.
  const slotsByLocation: Record<StoreId, number[]> = { loc_centre: [], loc_nord: [], loc_sud: [] };
  orderLocations.forEach((loc, i) => slotsByLocation[loc].push(i));
  const orderClient: ClientProfile[] = new Array(TARGET_ORDERS);
  for (const loc of STORES) {
    const slots = slotsByLocation[loc];
    // One guaranteed ticket per client, then extra visits; trim or top up to match the order slots.
    const extras: ClientProfile[] = [];
    for (const p of perLocation[loc]) for (let k = 1; k < p.tickets; k++) extras.push(p);
    faker.helpers.shuffle(extras, { inplace: true });
    const tickets = perLocation[loc].concat(extras.slice(0, Math.max(0, slots.length - perLocation[loc].length)));
    tickets.length = Math.min(tickets.length, slots.length);
    while (tickets.length < slots.length) {
      const heavy = perLocation[loc].filter((p) => p.tickets >= 3);
      tickets.push(pick(heavy.length ? heavy : perLocation[loc]));
    }
    faker.helpers.shuffle(tickets, { inplace: true });
    slots.forEach((slot, i) => (orderClient[slot] = tickets[i]));
  }

  // ─── Orders ────────────────────────────────────────────────────────────────
  const orders: Order[] = [];
  const orderItems: OrderItem[] = [];
  const payments: Payment[] = [];
  const events: OrderStatusEvent[] = [];
  const orderCosts: OrderCost[] = [];
  const notifications: Notification[] = [];
  const invoiceCounter: Record<string, number> = {};
  const visits = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  const H = 3_600_000;
  const lensPreference = [
    ["loc_labo", 80],
    ["store", 10],
    [SUPPLIER_SOURCE, 10],
  ] as const;

  for (let i = 0; i < TARGET_ORDERS; i++) {
    const t0 = times[i];
    const loc = orderLocations[i];
    const profile = orderClient[i];
    const client = profile.client;
    const visit = (visits.get(client.id) ?? 0) + 1;
    visits.set(client.id, visit);
    if (!firstSeen.has(client.id)) firstSeen.set(client.id, t0);
    const orderId = `o_${(i + 1).toString(36)}`;
    invoiceCounter[loc] = (invoiceCounter[loc] ?? 0) + 1;
    const staff = secretariesAt(loc, t0);
    const createdBy = pick(staff.length ? staff : activeSecretaries(loc));

    // Prescription drifts a little between visits.
    const years = (t0 - start.getTime()) / (365 * 86_400_000);
    const drift = profile.myope ? -q25(years * 0.25 * rnd()) : 0;
    const eye = (e: EyePrescription): EyePrescription => ({
      sph: e.sph === null ? null : clamp(q25(e.sph + drift), -8, 6),
      cyl: e.cyl,
      axis: e.axis,
      add: e.add === null ? null : clamp(q25(e.add + (years > 1 && chance(0.3) ? 0.25 : 0)), 0.75, 3.5),
    });
    const od = eye(profile.od);
    const og = eye(profile.og);

    // Products
    const progressive = profile.presbyope && chance(0.85);
    const lensKind: LensKind = progressive ? (chance(0.9) ? "prog" : "office") : profile.presbyope && chance(0.3) ? "bifocal" : "sv";
    const lensId = pick(lensByKind[lensKind].length ? lensByKind[lensKind] : lensByKind.sv);
    const ownFrame = chance(0.12);
    const sun = !ownFrame && chance(0.15);
    const frameId = ownFrame ? undefined : pick(sun ? sunIds : frameIds);
    const treatments = new Set<string>();
    if (chance(0.85)) treatments.add(treatment["Antireflet"]);
    if (chance(0.35)) treatments.add(treatment["Anti-lumière bleue"]);
    if (chance(0.45)) treatments.add(treatment["Durci"]);
    if (chance(0.12)) treatments.add(treatment["Photochromique"]);
    if (sun && chance(0.5)) treatments.add(treatment["Polarisé"]);
    if (treatments.size === 0) treatments.add(treatment["Durci"]);

    // Money: median ≈ 1 400 DH, 400–6 000 DH.
    let total = Math.exp(Math.log(1250) + gauss() * 0.55) * (progressive ? 1.5 : 1);
    total = clamp(total, 400, 6000);
    total = total < 2000 ? round10(total) : Math.round(total / 50) * 50;
    const deposit = clamp(Math.round((total * between(0.3, 0.6)) / 50) * 50, 100, total - 50);

    // Status timeline
    const age = nowMs - t0;
    const slow = chance(0.08) ? 2.6 : 1;
    const tWorkshop = t0 + between(4, 60) * H;
    const tPrepared = tWorkshop + between(22, 90) * H * slow;
    const tInStore = tPrepared + between(10, 44) * H;
    const tDelivered = tInStore + (chance(0.45) ? between(4, 72) : between(72, 20 * 24)) * H;
    const cancelled = chance(age > 21 * 24 * H ? 0.06 : 0.04);
    const tCancel = t0 + between(3, 70) * H;
    const timeline: [OrderStatus, number][] = [
      ["confirmed", t0],
      ["workshop", tWorkshop],
      ["prepared", tPrepared],
      ["in_store", tInStore],
      ["delivered", tDelivered],
    ];
    let reached = timeline.filter(([, t]) => t <= nowMs - 60_000);
    if (cancelled && tCancel <= nowMs - 60_000) {
      reached = reached.filter(([, t]) => t < tCancel);
      reached.push(["cancelled", tCancel]);
    }
    const status = reached[reached.length - 1][0];
    reached.forEach(([to, t], k) => {
      const actor =
        to === "confirmed" ? createdBy : to === "delivered" ? pick(secretariesAt(loc, t)) : DEMO_ADMIN_ID;
      events.push({ id: id("ev"), orderId, from: k === 0 ? undefined : reached[k - 1][0], to, userId: actor, createdAt: iso(t) });
    });

    // Items + frame stock
    if (frameId) {
      orderItems.push({ id: id("oi"), orderId, productId: frameId, qty: 1, sourceLocationId: loc });
      demand({ t: t0, productId: frameId, locationId: loc, qty: -1, reason: "order", refId: orderId, userId: createdBy });
      if (status === "cancelled") {
        demand({ t: tCancel, productId: frameId, locationId: loc, qty: 1, reason: "order_cancel", refId: orderId, userId: DEMO_ADMIN_ID });
      }
    }
    const lensItem: OrderItem = { id: id("oi"), orderId, productId: lensId, qty: 2 };
    orderItems.push(lensItem);

    // Payments
    payments.push({ id: id("pay"), orderId, amount: deposit, methodId: weighted(payWeights), kind: "deposit", userId: createdBy, createdAt: iso(t0 + 60_000) });
    if (status === "delivered") {
      payments.push({ id: id("pay"), orderId, amount: total - deposit, methodId: weighted(payWeights), kind: "balance", userId: createdBy, createdAt: iso(tDelivered) });
    }
    if (status === "cancelled") {
      payments.push({ id: id("pay"), orderId, amount: -deposit, methodId: weighted(payWeights), kind: "refund", userId: DEMO_ADMIN_ID, createdAt: iso(tCancel + 60_000) });
    }

    // Costs (admin): ~90 % of orders older than 2 weeks.
    let costsCompleted = false;
    const tCosts = t0 + between(18, 70) * H;
    // ~90 % of orders older than 2 weeks have their costs; most 3–14-day-old ones; none of the newest.
    const costsLikely = age > 14 * 24 * H ? 0.9 : age > 3 * 24 * H ? 0.75 : 0;
    if (status !== "cancelled" && chance(costsLikely) && tCosts < nowMs) {
      costsCompleted = true;
      const target = total * between(0.35, 0.55);
      const labour = round10(between(60, 120));
      const frameShare = frameId ? between(0.3, 0.45) : 0;
      const frameCost = round10((target - labour) * frameShare);
      const lensCost = Math.max(40, round10(target - labour - frameCost));
      const lensProduct = productById.get(lensId)!;
      if (frameId) orderCosts.push({ id: id("oc"), orderId, label: "Monture (prix d'achat)", amount: frameCost, createdAt: iso(tCosts) });
      orderCosts.push({ id: id("oc"), orderId, label: `Verres ${lensProduct.name}`, amount: lensCost, createdAt: iso(tCosts) });
      orderCosts.push({ id: id("oc"), orderId, label: "Montage atelier", amount: labour, createdAt: iso(tCosts) });
      let source: string = weighted(lensPreference);
      if (source === "store") source = storeLenses.includes(lensId) ? loc : "loc_labo";
      lensItem.sourceLocationId = source;
      if (source !== SUPPLIER_SOURCE) {
        demand({ t: tCosts, productId: lensId, locationId: source, qty: -2, reason: "order", refId: orderId, userId: DEMO_ADMIN_ID });
      }
    }
    if (status !== "cancelled" && !costsCompleted) {
      notifications.push({ id: id("n"), userId: DEMO_ADMIN_ID, type: "order_costs_needed", refId: orderId, locationId: loc, read: age > 3 * 24 * H, createdAt: iso(t0 + 60_000) });
    }
    if (status === "in_store") {
      for (const u of activeSecretaries(loc)) {
        notifications.push({ id: id("n"), userId: u, type: "order_in_store", refId: orderId, locationId: loc, read: nowMs - tInStore > 2 * 24 * H, createdAt: iso(tInStore) });
      }
    }

    const customValues: Record<string, unknown> = {};
    if (lensKind === "prog" || lensKind === "office") customValues["cf_fitting_height"] = int(17, 24);

    orders.push({
      id: orderId,
      locationId: loc,
      invoiceNumber: invoiceCounter[loc],
      clientId: client.id,
      status,
      total,
      od,
      og,
      lensTypeId: lensTypeOf[lensKind],
      lensTreatmentIds: [...treatments],
      lensDescription: chance(0.35) ? pick(["Amincis", "Teinte grise 15 %", "Grand diamètre", "Verres extra-fins", "Teinte marron dégradée"]) : undefined,
      frameDescription: ownFrame ? "Monture du client" : chance(0.5) ? pick(["Noir mat", "Écaille havane", "Doré", "Argent brossé", "Bleu nuit", "Transparent"]) : undefined,
      customValues,
      createdBy,
      createdAt: iso(t0),
      costsCompleted,
    });
  }

  // Clients: created at their first visit.
  const clients: Client[] = profiles.map((p) => ({
    ...p.client,
    createdAt: iso((firstSeen.get(p.client.id) ?? subDays(now, int(5, 700)).getTime()) - int(1, 30) * 60_000),
  }));

  // ─── Transfers ─────────────────────────────────────────────────────────────
  const transfers: Transfer[] = [];
  for (let i = 0; i < 10; i++) {
    const t = subDays(now, int(6, 360)).getTime() + int(9, 17) * H;
    const labToStore = i < 6;
    const from = labToStore ? "loc_labo" : pick(STORES);
    const to = labToStore ? pick(STORES) : pick(STORES.filter((s) => s !== from));
    const items = labToStore
      ? faker.helpers.arrayElements(storeLenses, int(1, 2)).map((productId) => ({ productId, qty: int(4, 10) }))
      : faker.helpers.arrayElements(allFrames, int(1, 3)).map((productId) => ({ productId, qty: int(1, 2) }));
    const transferId = id("tr");
    transfers.push({ id: transferId, fromLocationId: from, toLocationId: to, items, userId: DEMO_ADMIN_ID, createdAt: iso(t) });
    for (const it of items) {
      demand({ t, productId: it.productId, locationId: from, qty: -it.qty, reason: "transfer_out", refId: transferId, userId: DEMO_ADMIN_ID });
      demand({ t: t + 1, productId: it.productId, locationId: to, qty: it.qty, reason: "transfer_in", refId: transferId, userId: DEMO_ADMIN_ID });
    }
  }
  transfers.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // ─── Purchase orders ───────────────────────────────────────────────────────
  const purchaseOrders: PurchaseOrder[] = [];
  const poStatuses = [...Array(9).fill("received"), "ordered", "ordered", "ordered", "draft", "draft", "draft"] as PurchaseOrder["status"][];
  poStatuses.forEach((status, i) => {
    const supplier = suppliers[i % suppliers.length];
    const brandsOfSupplier = supplierBrands[supplier.id].map((b) => brandIds[b]);
    const candidates = products.filter((p) => brandsOfSupplier.includes(p.brandId));
    const isLens = candidates[0]?.kind === "lens";
    const locationId = isLens ? "loc_labo" : pick(STORES);
    const created =
      status === "received" ? subDays(now, int(20, 700)) : status === "ordered" ? subDays(now, int(3, 14)) : subDays(now, int(0, 6));
    const createdAt = created.getTime() + int(9, 12) * H;
    const items = faker.helpers.arrayElements(candidates, int(2, 5)).map((p) => ({
      productId: p.id,
      qty: isLens ? int(10, 30) : int(3, 8),
      unitCost: p.purchasePrice,
    }));
    const orderedAt = status === "draft" ? undefined : createdAt + int(1, 20) * H;
    const receivedAt = status === "received" ? orderedAt! + int(48, 200) * H : undefined;
    const poId = `po_${(i + 1).toString(36)}`;
    purchaseOrders.push({
      id: poId,
      reference: "",
      supplierId: supplier.id,
      locationId,
      status,
      items,
      createdAt: iso(createdAt),
      orderedAt: orderedAt ? iso(orderedAt) : undefined,
      receivedAt: receivedAt ? iso(Math.min(receivedAt, nowMs - H)) : undefined,
    });
    if (status === "received") {
      for (const it of items) {
        demand({ t: Math.min(receivedAt!, nowMs - H), productId: it.productId, locationId, qty: it.qty, reason: "purchase", refId: poId, userId: DEMO_ADMIN_ID });
      }
    }
  });
  purchaseOrders.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const poCountByYear: Record<string, number> = {};
  for (const po of purchaseOrders) {
    const y = po.createdAt.slice(0, 4);
    poCountByYear[y] = (poCountByYear[y] ?? 0) + 1;
    po.reference = `BC-${y}-${String(poCountByYear[y]).padStart(3, "0")}`;
  }

  // ─── Replay stock demands chronologically ──────────────────────────────────
  demands.sort((a, b) => a.t - b.t || a.seq - b.seq);
  for (const d of demands) {
    if (d.qty < 0) {
      const current = level.get(key(d.productId, d.locationId)) ?? 0;
      if (current + d.qty < 0) {
        const product = productById.get(d.productId)!;
        const refill =
          -d.qty - current + (product.kind === "lens" ? (d.locationId === "loc_labo" ? int(20, 40) : int(4, 8)) : int(3, 6));
        pushMovement(d.productId, d.locationId, refill, "purchase", d.t - 2 * H, DEMO_ADMIN_ID, undefined, "Réassort");
      }
    }
    pushMovement(d.productId, d.locationId, d.qty, d.reason, d.t, d.userId, d.refId, d.note);
  }

  // A few products end below their threshold (to show alerts); everything else is topped up.
  const lowPairs = new Set<string>([
    key(frameIds[0], "loc_nord"),
    key(frameIds[7], "loc_centre"),
    key(frameIds[12], "loc_sud"),
    key(sunIds[2], "loc_centre"),
    key(frameIds[20], "loc_nord"),
    key(lensByKind.prog[0], "loc_labo"),
    key(lensByKind.sv[1], "loc_labo"),
    key(accessoryIds[1], "loc_sud"),
  ]);
  for (const th of stockThresholds) {
    const k = key(th.productId, th.locationId);
    const current = level.get(k) ?? 0;
    const at = Math.min(nowMs - 10 * 60_000, Math.max((lastMove.get(k) ?? 0) + H, nowMs - int(12, 96) * H));
    if (lowPairs.has(k)) {
      const targetQty = th.minQty > 2 ? th.minQty - 2 : pick([0, th.minQty - 1]);
      if (current !== targetQty) {
        pushMovement(th.productId, th.locationId, targetQty - current, "adjustment", at, DEMO_ADMIN_ID, undefined, current > targetQty ? "Inventaire : écart constaté" : "Correction d'inventaire");
      }
      notifications.push({ id: id("n"), userId: DEMO_ADMIN_ID, type: "low_stock", refId: th.productId, locationId: th.locationId, read: false, createdAt: iso(at) });
    } else if (current < th.minQty) {
      const product = productById.get(th.productId)!;
      const add = th.minQty - current + (product.kind === "lens" ? int(15, 35) : int(1, 4));
      pushMovement(th.productId, th.locationId, add, "purchase", at, DEMO_ADMIN_ID, undefined, "Réassort");
    }
  }
  stockMovements.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // ─── Fixed charges ─────────────────────────────────────────────────────────
  const fixedCharges: FixedCharge[] = [];
  const chargeBase: Record<string, Partial<Record<FixedChargeType, number>>> = {
    loc_centre: { rent: 7500, salaries: 7000, electricity: 1000, internet: 349, water: 180 },
    loc_nord: { rent: 5800, salaries: 6000, electricity: 800, internet: 299, water: 140 },
    loc_sud: { rent: 4200, salaries: 5200, electricity: 650, internet: 299, water: 120 },
    loc_labo: { rent: 3800, salaries: 9000, electricity: 1700, internet: 349, water: 240 },
  };
  for (let m = startOfMonth(start); m <= endOfMonth(now); m = addMonths(m, 1)) {
    const month = format(m, "yyyy-MM");
    const yearsIn = (m.getTime() - start.getTime()) / (365 * 86_400_000);
    const summer = [5, 6, 7].includes(m.getMonth());
    for (const loc of locations) {
      const b = chargeBase[loc.id];
      for (const type of ["rent", "salaries", "electricity", "internet", "water"] as const) {
        let amount = b[type] ?? 0;
        if (type === "rent" || type === "salaries") amount = round10(amount * (yearsIn >= 1 ? 1.05 : 1));
        if (type === "electricity") amount = round10(amount * (summer ? 1.35 : 1) * between(0.9, 1.1));
        if (type === "water") amount = round10(amount * between(0.85, 1.15));
        fixedCharges.push({ id: id("fc"), locationId: loc.id, type, month, amount });
      }
    }
  }

  return {
    meta: { seedVersion: SEED_VERSION, anchor: iso(anchor) },
    locations,
    options,
    customFields,
    products,
    stockMovements,
    stockThresholds,
    clients,
    orders,
    orderItems,
    payments,
    orderStatusEvents: events,
    orderCosts,
    fixedCharges,
    suppliers,
    purchaseOrders,
    transfers,
    notifications,
    roles,
    users,
    loyalty: { regularMinOrders: 2, loyalMinOrders: 4 },
    settings: { appName: "ANASS VISION" },
  };
}
