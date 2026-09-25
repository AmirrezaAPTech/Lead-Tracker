import type {
  LeadStatus,
  LeadTier,
  RejectReason,
  ContactMethod,
  DemoStatus,
  ProposalStatus,
  ResponseClass,
  StrategyStatus,
} from "./types";

/** Pipeline order shown in the UI. REJECTED is intentionally outside the pipeline. */
export const PIPELINE: LeadStatus[] = [
  "NEW",
  "REVIEW",
  "QUALIFIED",
  "CONTACTED",
  "RESPONDED",
  "CALL",
  "DEMO",
  "PROPOSAL",
  "WON",
  "LOST",
];

export const ALL_STATUSES: LeadStatus[] = [...PIPELINE, "REJECTED"];

export const STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: "New",
  REVIEW: "Review",
  QUALIFIED: "Qualified",
  CONTACTED: "Contacted",
  RESPONDED: "Responded",
  CALL: "Call",
  DEMO: "Demo",
  PROPOSAL: "Proposal",
  WON: "Won",
  LOST: "Lost",
  REJECTED: "Rejected",
};

/** Tailwind classes per status - kept flat so the pipeline stays scannable. */
export const STATUS_CLASS: Record<LeadStatus, string> = {
  NEW: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  REVIEW: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  QUALIFIED: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  CONTACTED: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  RESPONDED: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  CALL: "bg-teal-500/15 text-teal-300 border-teal-500/30",
  DEMO: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  PROPOSAL: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  WON: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  LOST: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  REJECTED: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

export const TIER_LABEL: Record<LeadTier, string> = {
  HOT: "HOT",
  GOOD: "GOOD",
  MAYBE: "MAYBE",
  LOW: "LOW",
};

export const TIER_CLASS: Record<LeadTier, string> = {
  HOT: "bg-red-500/15 text-red-300 border-red-500/30",
  GOOD: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  MAYBE: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  LOW: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

export const REJECT_REASONS: { value: RejectReason; label: string }[] = [
  { value: "EXCELLENT_WEBSITE", label: "Excellent website" },
  { value: "TOO_SMALL", label: "Too small" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "POOR_REVIEWS", label: "Poor reviews" },
  { value: "CHAIN", label: "Chain" },
  { value: "WRONG_NICHE", label: "Wrong niche" },
  { value: "DUPLICATE", label: "Duplicate" },
  { value: "NO_OPPORTUNITY", label: "No clear opportunity" },
  { value: "OTHER", label: "Other" },
];

export const REJECT_REASON_LABEL: Record<RejectReason, string> = Object.fromEntries(
  REJECT_REASONS.map((r) => [r.value, r.label]),
) as Record<RejectReason, string>;

export const CONTACT_METHODS: { value: ContactMethod; label: string }[] = [
  { value: "INSTAGRAM", label: "Instagram DM" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "PHONE", label: "Phone call" },
  { value: "EMAIL", label: "Email" },
  { value: "WALK_IN", label: "Walk-in" },
  { value: "OTHER", label: "Other" },
];

export const DEMO_STATUSES: { value: DemoStatus; label: string }[] = [
  { value: "NONE", label: "None" },
  { value: "PLANNED", label: "Planned" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "SHOWN", label: "Shown" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CONVERTED", label: "Converted" },
];

export const PROPOSAL_STATUSES: { value: ProposalStatus; label: string }[] = [
  { value: "NONE", label: "None" },
  { value: "DRAFTED", label: "Drafted" },
  { value: "SENT", label: "Sent" },
  { value: "NEGOTIATING", label: "Negotiating" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "DECLINED", label: "Declined" },
];

/**
 * Channels a strategy can lead with. Reuses contact_method so the channel a
 * strategy declares and the method a contact was logged under are the same
 * vocabulary; WALK_IN is simply labelled "In-person" here.
 */
export const STRATEGY_CHANNELS: { value: ContactMethod; label: string }[] = [
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "PHONE", label: "Phone" },
  { value: "EMAIL", label: "Email" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "WALK_IN", label: "In-person" },
  { value: "OTHER", label: "Other" },
];

export const STRATEGY_CHANNEL_LABEL: Record<ContactMethod, string> = Object.fromEntries(
  STRATEGY_CHANNELS.map((c) => [c.value, c.label]),
) as Record<ContactMethod, string>;

export const STRATEGY_STATUS_LABEL: Record<StrategyStatus, string> = {
  ACTIVE: "Active",
  ARCHIVED: "Archived",
};

export const STRATEGY_STATUS_CLASS: Record<StrategyStatus, string> = {
  ACTIVE: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  ARCHIVED: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

export const RESPONSE_CLASSES: { value: ResponseClass; label: string }[] = [
  { value: "NO_RESPONSE", label: "No response" },
  { value: "POSITIVE", label: "Positive" },
  { value: "NEUTRAL", label: "Neutral" },
  { value: "NEGATIVE", label: "Negative" },
  { value: "PRICE_OBJECTION", label: "Price objection" },
  { value: "INTERESTED", label: "Interested" },
  { value: "CALL_BOOKED", label: "Call booked" },
  { value: "DEMO_REQUESTED", label: "Demo requested" },
  { value: "PROPOSAL", label: "Proposal" },
  { value: "WON", label: "Won" },
  { value: "LOST", label: "Lost" },
];

export const RESPONSE_CLASS_LABEL: Record<ResponseClass, string> = Object.fromEntries(
  RESPONSE_CLASSES.map((r) => [r.value, r.label]),
) as Record<ResponseClass, string>;

/**
 * Replies that mean the conversation moved forward. Kept in one place because
 * the same list decides the "positive" column in the metrics SQL function.
 */
export const POSITIVE_RESPONSE_CLASSES: ResponseClass[] = [
  "POSITIVE",
  "INTERESTED",
  "CALL_BOOKED",
  "DEMO_REQUESTED",
  "PROPOSAL",
  "WON",
];

export const RESPONSE_CLASS_CLASS: Record<ResponseClass, string> = {
  NO_RESPONSE: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  POSITIVE: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  NEUTRAL: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  NEGATIVE: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  PRICE_OBJECTION: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  INTERESTED: "bg-teal-500/15 text-teal-300 border-teal-500/30",
  CALL_BOOKED: "bg-teal-500/15 text-teal-300 border-teal-500/30",
  DEMO_REQUESTED: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  PROPOSAL: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  WON: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  LOST: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

/**
 * Practical UI guidance on how much weight a comparison deserves. These are
 * NOT statistical thresholds and the app never claims significance - they only
 * stop seven contacted leads from reading like a proven result.
 */
export const SAMPLE_BANDS: { min: number; label: string; className: string }[] = [
  { min: 100, label: "Strong sample", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  { min: 50, label: "Useful comparison", className: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  { min: 20, label: "Initial signal", className: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  { min: 0, label: "Early data", className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
];

/** Istanbul neighbourhoods/districts that usually mean higher budget. Editable in Settings. */
export const DEFAULT_PREMIUM_NEIGHBORHOODS = [
  "Nisantasi",
  "Tesvikiye",
  "Sisli",
  "Etiler",
  "Bebek",
  "Levent",
  "Ulus",
  "Akatlar",
  "Arnavutkoy",
  "Kurucesme",
  "Ortakoy",
  "Yenikoy",
  "Emirgan",
  "Tarabya",
  "Zekeriyakoy",
  "Bagdat Caddesi",
  "Suadiye",
  "Caddebostan",
  "Erenkoy",
  "Kalamis",
  "Fenerbahce",
  "Moda",
  "Atasehir",
  "Bomonti",
  "Galata",
  "Karakoy",
  "Cihangir",
  "Nidakule",
  "Zorlu",
  "Kanyon",
];

/** Google place types that mean the business runs on appointments. */
export const DEFAULT_APPOINTMENT_TYPES = [
  "hair_salon",
  "hair_care",
  "beauty_salon",
  "nail_salon",
  "barber_shop",
  "spa",
  "skin_care_clinic",
  "massage",
  "makeup_artist",
  "tanning_studio",
  "wellness_center",
];

/** Ready-made queries for the target niche (TR + EN). */
export const SUGGESTED_QUERIES = [
  "kuafor",
  "hair salon",
  "guzellik salonu",
  "beauty salon",
  "nail salon",
  "nail studio",
  "tirnak studyosu",
  "berber",
  "erkek kuaforu",
  "sac tasarim",
  "cilt bakim merkezi",
];
