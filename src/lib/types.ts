/**
 * Domain model. Every type maps 1:1 to a future Supabase table
 * (see README → "Supabase migration notes").
 */

import type { PermissionKey } from "./permissions";

export type ID = string;
/** ISO 8601 timestamp. */
export type ISODate = string;

// ─── Locations ────────────────────────────────────────────────────────────────

export type LocationType = "store" | "lab";

export interface Location {
  id: ID;
  name: string;
  type: LocationType;
  address: string;
  whatsappNumber: string;
  isActive: boolean;
  createdAt: ISODate;
}

// ─── Configurable lists ───────────────────────────────────────────────────────

export type OptionListKey =
  | "brand"
  | "product_category"
  | "lens_type"
  | "lens_treatment"
  | "frame_material"
  | "payment_method"
  | "supplier_category";

/** Every dropdown reads from Option. Other entities store optionId, never the label text. */
export interface Option {
  id: ID;
  listKey: OptionListKey;
  labelFr: string;
  labelEn: string;
  sortOrder: number;
  isActive: boolean;
}

export type CustomFieldType = "text" | "number" | "date" | "select";

export interface CustomField {
  id: ID;
  labelFr: string;
  labelEn: string;
  type: CustomFieldType;
  optionsFr?: string[];
  optionsEn?: string[];
  isActive: boolean;
  sortOrder: number;
}

// ─── Catalogue & stock ────────────────────────────────────────────────────────

export type ProductKind = "frame" | "lens" | "accessory";

export interface Product {
  id: ID;
  /** Model name without the brand (the brand label is resolved from brandId). */
  name: string;
  categoryId: ID;
  brandId: ID;
  kind: ProductKind;
  /** Lens products only. */
  lensTypeId?: ID;
  /** Frame products only. */
  materialId?: ID;
  salePrice?: number;
  purchasePrice: number;
  isActive: boolean;
}

export type MovementReason =
  | "purchase"
  | "order"
  | "order_cancel"
  | "transfer_out"
  | "transfer_in"
  | "adjustment";

export interface StockMovement {
  id: ID;
  productId: ID;
  locationId: ID;
  /** Signed quantity: + in, − out. */
  qty: number;
  reason: MovementReason;
  /** Order, transfer or purchase order id, depending on the reason. */
  refId?: ID;
  userId: ID;
  createdAt: ISODate;
  note?: string;
}

/** Stock level = SUM(movements.qty) per product/location. Never stored. */
export interface StockThreshold {
  productId: ID;
  locationId: ID;
  minQty: number;
}

// ─── Clients & orders ─────────────────────────────────────────────────────────

export interface Client {
  id: ID;
  fullName: string;
  phone: string;
  isWhatsapp: boolean;
  locationId: ID;
  createdAt: ISODate;
}

export const ORDER_STATUSES = [
  "confirmed",
  "workshop",
  "prepared",
  "in_store",
  "delivered",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** The forward flow, without `cancelled`. */
export const STATUS_FLOW = [
  "confirmed",
  "workshop",
  "prepared",
  "in_store",
  "delivered",
] as const satisfies readonly OrderStatus[];
export type FlowStatus = (typeof STATUS_FLOW)[number];

export interface EyePrescription {
  sph: number | null;
  cyl: number | null;
  axis: number | null;
  add: number | null;
}

export interface Order {
  id: ID;
  locationId: ID;
  /** Sequential per location: 1, 2, 3… */
  invoiceNumber: number;
  clientId: ID;
  status: OrderStatus;
  /** Typed by the secrétaire. */
  total: number;
  od: EyePrescription;
  og: EyePrescription;
  lensTypeId?: ID;
  lensTreatmentIds: ID[];
  lensDescription?: string;
  frameDescription?: string;
  customValues: Record<ID, unknown>;
  createdBy: ID;
  createdAt: ISODate;
  costsCompleted: boolean;
}

/** Lens items that come from a supplier directly (no stock movement). */
export const SUPPLIER_SOURCE = "supplier";

export interface OrderItem {
  id: ID;
  orderId: ID;
  productId: ID;
  qty: number;
  /** Frames: the order's location. Lenses: chosen by the admin (a location id or SUPPLIER_SOURCE). */
  sourceLocationId?: ID;
}

export type PaymentKind = "deposit" | "balance" | "refund";

export interface Payment {
  id: ID;
  orderId: ID;
  /** Negative = refund. */
  amount: number;
  methodId: ID;
  kind: PaymentKind;
  userId: ID;
  createdAt: ISODate;
}

export interface OrderStatusEvent {
  id: ID;
  orderId: ID;
  from?: OrderStatus;
  to: OrderStatus;
  userId: ID;
  createdAt: ISODate;
}

/** Variable charges attached to an order. Admin only. */
export interface OrderCost {
  id: ID;
  orderId: ID;
  label: string;
  amount: number;
  createdAt: ISODate;
}

export const FIXED_CHARGE_TYPES = [
  "rent",
  "salaries",
  "electricity",
  "internet",
  "water",
  "other",
] as const;
export type FixedChargeType = (typeof FIXED_CHARGE_TYPES)[number];

/** Admin only. */
export interface FixedCharge {
  id: ID;
  locationId: ID;
  type: FixedChargeType;
  /** YYYY-MM */
  month: string;
  amount: number;
  note?: string;
}

// ─── Purchasing ───────────────────────────────────────────────────────────────

export interface Supplier {
  id: ID;
  name: string;
  phone: string;
  categoryId?: ID;
}

export type PurchaseOrderStatus = "draft" | "ordered" | "received";

export interface PurchaseOrderItem {
  productId: ID;
  qty: number;
  unitCost: number;
}

export interface PurchaseOrder {
  id: ID;
  /** Human reference, e.g. BC-2026-014. */
  reference: string;
  supplierId: ID;
  locationId: ID;
  status: PurchaseOrderStatus;
  items: PurchaseOrderItem[];
  createdAt: ISODate;
  orderedAt?: ISODate;
  receivedAt?: ISODate;
}

export interface Transfer {
  id: ID;
  fromLocationId: ID;
  toLocationId: ID;
  items: { productId: ID; qty: number }[];
  userId: ID;
  createdAt: ISODate;
  note?: string;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export type NotificationType = "order_costs_needed" | "low_stock" | "order_in_store";

export interface Notification {
  id: ID;
  userId: ID;
  type: NotificationType;
  /** Order id, or product id for low_stock. */
  refId: ID;
  /** Location of the low stock / order. */
  locationId?: ID;
  read: boolean;
  createdAt: ISODate;
}

// ─── Settings, users & roles ──────────────────────────────────────────────────

export interface LoyaltySettings {
  regularMinOrders: number;
  loyalMinOrders: number;
}

export interface AppSettings {
  appName: string;
}

export interface Role {
  id: ID;
  labelFr: string;
  labelEn: string;
  permissions: PermissionKey[];
  /** Seeded roles cannot be deleted (their permissions can still be edited, except super admin). */
  isSystem: boolean;
  createdAt: ISODate;
}

export interface User {
  id: ID;
  fullName: string;
  email: string;
  roleId: ID;
  /** null = not tied to a location (e.g. the opticien). */
  locationId: ID | null;
  isActive: boolean;
  /** Invited users have not accepted yet (demo: they can still be impersonated). */
  invitedAt?: ISODate;
  createdAt: ISODate;
}

/** The whole mock database. Each key is a future table. */
export interface DB {
  meta: { seedVersion: number; anchor: ISODate };
  locations: Location[];
  options: Option[];
  customFields: CustomField[];
  products: Product[];
  stockMovements: StockMovement[];
  stockThresholds: StockThreshold[];
  clients: Client[];
  orders: Order[];
  orderItems: OrderItem[];
  payments: Payment[];
  orderStatusEvents: OrderStatusEvent[];
  orderCosts: OrderCost[];
  fixedCharges: FixedCharge[];
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  transfers: Transfer[];
  notifications: Notification[];
  roles: Role[];
  users: User[];
  loyalty: LoyaltySettings;
  settings: AppSettings;
}

export type CollectionKey = {
  [K in keyof DB]: DB[K] extends unknown[] ? K : never;
}[keyof DB];

export type ClientSegment = "new" | "regular" | "loyal";
