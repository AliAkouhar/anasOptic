import { z } from "zod";
import { getDb } from "@/data/store";
import { isValidMoroccanMobile, normalizePhone } from "@/lib/format";
import type { EyePrescription } from "@/lib/types";
import { validatePrescription } from "../prescription";

const eye = z.object({
  sph: z.number().nullable(),
  cyl: z.number().nullable(),
  axis: z.number().nullable(),
  add: z.number().nullable(),
});

type Translate = (key: string, values?: Record<string, string | number>) => string;

export function buildOrderSchema(t: Translate) {
  return z
    .object({
      locationId: z.string().min(1),
      clientMode: z.enum(["existing", "new"]),
      clientId: z.string().optional(),
      newClient: z.object({ fullName: z.string(), phone: z.string(), isWhatsapp: z.boolean() }),
      od: eye,
      og: eye,
      customValues: z.record(z.string(), z.string()),
      clientFrame: z.boolean(),
      frameProductId: z.string().optional(),
      frameDescription: z.string(),
      lensTypeId: z.string().optional(),
      lensProductId: z.string().optional(),
      lensTreatmentIds: z.array(z.string()),
      lensDescription: z.string(),
      total: z.number().optional(),
      deposit: z.number().optional(),
      paymentMethodId: z.string(),
    })
    .superRefine((v, ctx) => {
      const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
      // Step 1 — client
      if (v.clientMode === "existing" && !v.clientId) issue(["clientId"], t("wizard.chooseClient"));
      if (v.clientMode === "new") {
        if (!v.newClient.fullName.trim()) issue(["newClient", "fullName"], t("errors.name_required"));
        if (!isValidMoroccanMobile(v.newClient.phone)) issue(["newClient", "phone"], t("errors.invalid_phone"));
        else {
          const phone = normalizePhone(v.newClient.phone);
          const dup = getDb().clients.find((c) => normalizePhone(c.phone) === phone);
          if (dup) issue(["newClient", "phone"], t("errors.duplicate_phone", { name: dup.fullName }));
        }
      }
      // Step 2 — measures
      for (const side of ["od", "og"] as const) {
        const errors = validatePrescription(v[side]);
        for (const [field, code] of Object.entries(errors)) issue([side, field], t(`rx.errors.${code}`));
      }
      // Step 3 — products & payment
      if (!v.clientFrame && !v.frameProductId) issue(["frameProductId"], t("wizard.frameRequired"));
      if (v.total === undefined) issue(["total"], t("wizard.totalRequired"));
      else if (!(v.total > 0)) issue(["total"], t("wizard.totalPositive"));
      if (v.deposit !== undefined && v.deposit < 0) issue(["deposit"], t("wizard.depositNegative"));
      if (v.deposit !== undefined && v.total !== undefined && v.deposit > v.total) issue(["deposit"], t("wizard.depositTooHigh"));
    });
}

export type OrderFormValues = z.infer<ReturnType<typeof buildOrderSchema>>;

export const EMPTY_EYE: EyePrescription = { sph: null, cyl: null, axis: null, add: null };

export const STEP_FIELDS = [
  ["locationId", "clientId", "newClient.fullName", "newClient.phone"],
  ["od", "og"],
  ["frameProductId", "total", "deposit"],
] as const;

export function defaultValues(locationId: string, paymentMethodId: string, clientId?: string): OrderFormValues {
  return {
    locationId,
    clientMode: "existing",
    clientId,
    newClient: { fullName: "", phone: "", isWhatsapp: true },
    od: { ...EMPTY_EYE },
    og: { ...EMPTY_EYE },
    customValues: {},
    clientFrame: false,
    frameProductId: undefined,
    frameDescription: "",
    lensTypeId: undefined,
    lensProductId: undefined,
    lensTreatmentIds: [],
    lensDescription: "",
    total: undefined,
    deposit: undefined,
    paymentMethodId,
  };
}

/** 0612345678 → "06 12 34 56 78" while typing. */
export function formatPhoneTyping(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  return digits.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
}
