import { format as dfFormat, formatDistanceToNowStrict, type Locale as DfLocale } from "date-fns";
import { enGB, fr } from "date-fns/locale";

export type Lang = "fr" | "en";

const MINUS = "−";
const NBSP = " ";

const numberFormats: Record<Lang, Intl.NumberFormat> = {
  fr: new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }),
  en: new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }),
};

/** Intl uses a narrow no-break space in French; it almost vanishes in Inter, so use a regular one. */
const wide = (s: string) => s.replace(/ /g, NBSP);

/** 1 250 DH (fr) · DH 1,250 (en). Negative amounts use a real minus sign. */
export function formatMoney(amount: number, lang: Lang): string {
  const abs = wide(numberFormats[lang].format(Math.abs(Math.round(amount * 100) / 100)));
  const sign = amount < 0 ? MINUS : "";
  return lang === "fr" ? `${sign}${abs}${NBSP}DH` : `${sign}DH${NBSP}${abs}`;
}

/** Compact money for chart axes: 12,5 k DH / DH 12.5k */
export function formatMoneyCompact(amount: number, lang: Lang): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? MINUS : "";
  let body: string;
  if (abs >= 1_000_000) body = `${trim(abs / 1_000_000, lang)}${lang === "fr" ? NBSP + "M" : "M"}`;
  else if (abs >= 1_000) body = `${trim(abs / 1_000, lang)}${lang === "fr" ? NBSP + "k" : "k"}`;
  else body = wide(numberFormats[lang].format(Math.round(abs)));
  return lang === "fr" ? `${sign}${body}${NBSP}DH` : `${sign}DH${NBSP}${body}`;
}

function trim(n: number, lang: Lang) {
  return wide(new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-GB", { maximumFractionDigits: 1 }).format(n));
}

export function formatNumber(n: number, lang: Lang, digits = 0): string {
  return wide(
    new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-GB", {
      maximumFractionDigits: digits,
      minimumFractionDigits: 0,
    }).format(n),
  );
}

export function formatPercent(ratio: number, lang: Lang, digits = 0): string {
  return wide(
    new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-GB", {
      style: "percent",
      maximumFractionDigits: digits,
    }).format(ratio),
  );
}

/** Signed percent delta: +12 % / −4 % */
export function formatDelta(ratio: number, lang: Lang, digits = 0): string {
  const body = formatPercent(Math.abs(ratio), lang, digits);
  if (Math.abs(ratio) < 0.0005) return body;
  return `${ratio > 0 ? "+" : MINUS}${body}`;
}

// ─── Prescription ────────────────────────────────────────────────────────────

/** +1.25 / −0.75 / 0.00 · null → — */
export function formatDiopter(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (value === 0) return "0.00";
  return `${value > 0 ? "+" : MINUS}${Math.abs(value).toFixed(2)}`;
}

export function formatAxis(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${Math.round(value)}°`;
}

/**
 * Parse a money amount typed in the user's locale: "2 400,50" (fr) · "2,400.50" (en).
 * In French a lone dot is read as the decimal point ("2400.50"), since thousands use spaces.
 */
export function parseMoney(raw: string, lang: Lang): number | null {
  let s = raw.replace(/\s/g, "").replace(/dh/i, "");
  if (lang === "en") s = s.replace(/,/g, "");
  else if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Parse what a user typed in a prescription cell ("-0,75", "+1.5", "−2"). */
export function parseDecimal(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".").replace(MINUS, "-");
  if (cleaned === "" || cleaned === "-" || cleaned === "+") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// ─── Phones ──────────────────────────────────────────────────────────────────

export function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("212")) digits = "0" + digits.slice(3);
  if (digits.length === 9 && /^[5-7]/.test(digits)) digits = "0" + digits;
  return digits;
}

/** 0612345678 → 06 12 34 56 78 */
export function formatPhone(raw: string): string {
  const d = normalizePhone(raw);
  if (d.length !== 10) return raw;
  return d.replace(/(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, "$1 $2 $3 $4 $5");
}

export function isValidMoroccanMobile(raw: string): boolean {
  return /^0[67]\d{8}$/.test(normalizePhone(raw));
}

/** 0612345678 → 212612345678 (wa.me format) */
export function toWhatsAppNumber(raw: string): string {
  const d = normalizePhone(raw);
  return d.startsWith("0") ? "212" + d.slice(1) : d;
}

export function whatsappLink(phone: string, text: string): string {
  return `https://wa.me/${toWhatsAppNumber(phone)}?text=${encodeURIComponent(text)}`;
}

// ─── Dates ───────────────────────────────────────────────────────────────────

export const dateLocales: Record<Lang, DfLocale> = { fr, en: enGB };

export function formatDate(date: string | Date, lang: Lang, pattern = "d MMM yyyy"): string {
  return dfFormat(typeof date === "string" ? new Date(date) : date, pattern, { locale: dateLocales[lang] });
}

export function formatDateTime(date: string | Date, lang: Lang): string {
  return formatDate(date, lang, lang === "fr" ? "d MMM yyyy 'à' HH:mm" : "d MMM yyyy, HH:mm");
}

export function formatRelative(date: string | Date, lang: Lang): string {
  return formatDistanceToNowStrict(typeof date === "string" ? new Date(date) : date, {
    addSuffix: true,
    locale: dateLocales[lang],
  });
}

/** "YYYY-MM" → "sept. 2026" */
export function formatMonth(month: string, lang: Lang, pattern = "MMM yyyy"): string {
  const [y, m] = month.split("-").map(Number);
  return formatDate(new Date(y, m - 1, 1), lang, pattern);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** "Succursale Centre" → "Centre" (for tight chart labels). */
export function shortLocationName(name: string): string {
  return name.replace(/^Succursale\s+/i, "").replace(/^Labo\s+/i, "Labo ");
}
