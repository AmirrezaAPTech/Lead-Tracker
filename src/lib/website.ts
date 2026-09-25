/**
 * Deliberately small website check: only the signals that create a sales angle.
 * Not an SEO crawler - one request, homepage only.
 */

import { ensureUrl } from "./utils";

export type WebsiteAnalysis = {
  httpsOk: boolean | null;
  httpStatus: number | null;
  pageTitle: string | null;
  metaDescription: string | null;
  h1: string | null;
  mobileFriendly: boolean | null;
  whatsappCta: boolean | null;
  phoneCta: boolean | null;
  bookingCta: boolean | null;
  websiteScore: number | null;
  websiteIssues: string[];
  websiteError: string | null;
  websiteMs: number | null;
  instagramUrl?: string | null;
  resolvedUrl?: string | null;
};

/** Issues that can be re-derived from stored columns after a manual correction. */
export const SIGNAL_ISSUES = {
  httpsOk: "No HTTPS",
  mobileFriendly: "Not mobile-friendly",
  whatsappCta: "No WhatsApp button",
  phoneCta: "No click-to-call",
  bookingCta: "No booking CTA",
  metaDescription: "No meta description",
  h1: "No H1 heading",
} as const;

const TITLE_ISSUES = ["No page title", "Weak page title"];

/** Sales-relevant weights: how much each problem hurts the health score. */
export const ISSUE_WEIGHTS: Record<string, number> = {
  "Site did not load": 60,
  "Parked / placeholder page": 45,
  "No HTTPS": 15,
  "Not mobile-friendly": 20,
  "No booking CTA": 12,
  "No WhatsApp button": 10,
  "No click-to-call": 10,
  "No H1 heading": 6,
  "No page title": 8,
  "Weak page title": 4,
  "No meta description": 6,
  "Slow to load": 8,
  "Almost no content": 15,
};

export function scoreIssues(issues: string[]) {
  const penalty = issues.reduce(
    (sum, i) => sum + (ISSUE_WEIGHTS[i] ?? (i.startsWith("HTTP ") ? 40 : 5)),
    0,
  );
  return Math.max(0, Math.min(100, 100 - penalty));
}

type StoredSignals = {
  websiteIssues: string[];
  httpsOk: boolean | null;
  mobileFriendly: boolean | null;
  whatsappCta: boolean | null;
  phoneCta: boolean | null;
  bookingCta: boolean | null;
  metaDescription: string | null;
  h1: string | null;
  pageTitle: string | null;
};

/**
 * Recomputes issues and score from the columns as they now stand, after the
 * operator has corrected a signal by hand. Issues that can only come from
 * fetching the page (load failures, slowness, parked pages) are preserved.
 */
export function recomputeWebsiteHealth(lead: StoredSignals) {
  const derived = new Set<string>([...Object.values(SIGNAL_ISSUES), ...TITLE_ISSUES]);
  const issues = (lead.websiteIssues ?? []).filter((i) => !derived.has(i));

  for (const [field, label] of Object.entries(SIGNAL_ISSUES)) {
    const value = lead[field as keyof StoredSignals];
    const missing = typeof value === "boolean" ? !value : !value;
    if (missing) issues.push(label);
  }

  if (!lead.pageTitle) issues.push("No page title");
  else if (lead.pageTitle.length < 12) issues.push("Weak page title");

  return { websiteIssues: issues, websiteScore: scoreIssues(issues) };
}

const BOOKING_HINTS = [
  "randevu",
  "rezervasyon",
  "book now",
  "book online",
  "appointment",
  "booksy",
  "calendly",
  "setmore",
  "fresha",
  "salonrandevu",
  "simplybook",
  "planity",
];

const PARKED_HINTS = [
  "this domain is for sale",
  "alan adi satiliktir",
  "yapim asamasinda",
  "under construction",
  "coming soon",
  "cok yakinda",
  "default web page",
  "godaddy",
  "parked domain",
];

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function firstMatch(html: string, re: RegExp) {
  const m = html.match(re);
  return m?.[1] ? decodeEntities(m[1].replace(/\s+/g, " ")).slice(0, 300) : null;
}

export async function analyzeWebsite(rawUrl: string): Promise<WebsiteAnalysis> {
  const url = ensureUrl(rawUrl)!;
  const started = Date.now();
  const issues: string[] = [];

  const base: WebsiteAnalysis = {
    httpsOk: null,
    httpStatus: null,
    pageTitle: null,
    metaDescription: null,
    h1: null,
    mobileFriendly: null,
    whatsappCta: null,
    phoneCta: null,
    bookingCta: null,
    websiteScore: null,
    websiteIssues: [],
    websiteError: null,
    websiteMs: null,
  };

  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; LeadCockpit/1.0; internal research tool)",
        accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    });
  } catch (err) {
    return {
      ...base,
      websiteError: err instanceof Error ? err.message : "Request failed",
      websiteMs: Date.now() - started,
      websiteScore: 0,
      websiteIssues: ["Site did not load"],
      httpsOk: url.startsWith("https://"),
    };
  }

  const ms = Date.now() - started;
  const finalUrl = res.url || url;
  const httpsOk = finalUrl.startsWith("https://");
  if (!httpsOk) issues.push("No HTTPS");
  if (!res.ok) issues.push(`HTTP ${res.status}`);

  let html = "";
  try {
    html = (await res.text()).slice(0, 500_000);
  } catch {
    html = "";
  }
  const lower = html.toLowerCase();

  const pageTitle = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaDescription =
    firstMatch(html, /<meta[^>]+name=["']description["'][^>]*content=["']([\s\S]*?)["']/i) ??
    firstMatch(html, /<meta[^>]+content=["']([\s\S]*?)["'][^>]*name=["']description["']/i);
  const h1 = firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i)?.replace(/<[^>]+>/g, "").trim() ?? null;

  const mobileFriendly = /<meta[^>]+name=["']viewport["']/i.test(html);
  const whatsappCta = /wa\.me\/|api\.whatsapp\.com|whatsapp:\/\//i.test(html);
  const phoneCta = /href=["']tel:/i.test(html);
  const bookingCta = BOOKING_HINTS.some((h) => lower.includes(h));
  const parked = PARKED_HINTS.some((h) => lower.includes(h));
  const instagramUrl = html.match(/https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9._]+/i)?.[0] ?? null;

  if (!pageTitle) issues.push("No page title");
  else if (pageTitle.length < 12) issues.push("Weak page title");
  if (!metaDescription) issues.push("No meta description");
  if (!h1) issues.push("No H1 heading");
  if (!mobileFriendly) issues.push("Not mobile-friendly");
  if (!whatsappCta) issues.push("No WhatsApp button");
  if (!phoneCta) issues.push("No click-to-call");
  if (!bookingCta) issues.push("No booking CTA");
  if (ms > 3500) issues.push("Slow to load");
  if (parked) issues.push("Parked / placeholder page");
  if (html.length < 1200 && !parked) issues.push("Almost no content");

  const websiteScore = scoreIssues(issues);

  return {
    httpsOk,
    httpStatus: res.status,
    pageTitle,
    metaDescription,
    h1,
    mobileFriendly,
    whatsappCta,
    phoneCta,
    bookingCta,
    websiteScore,
    websiteIssues: issues,
    websiteError: null,
    websiteMs: ms,
    instagramUrl,
    resolvedUrl: finalUrl,
  };
}
