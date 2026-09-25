import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(d: Date | string | null | undefined) {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeDays(d: Date | string | null | undefined) {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  const ms = date.getTime() - Date.now();
  const days = Math.round(ms / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days < 0 ? `${-days}d ago` : `in ${days}d`;
}

export function money(n: number | null | undefined, currency = "TRY") {
  if (n === null || n === undefined) return "-";
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n);
}

/** Turkish-insensitive, accent-insensitive comparison helper. */
export function normalize(s: string) {
  return s
    .toLocaleLowerCase("tr")
    .replace(/i/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function telHref(phone?: string | null) {
  if (!phone) return null;
  return `tel:${phone.replace(/[^0-9+]/g, "")}`;
}

export function waHref(phone?: string | null) {
  if (!phone) return null;
  const digits = phone.replace(/[^0-9]/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}`;
}

export function ensureUrl(url?: string | null) {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}
