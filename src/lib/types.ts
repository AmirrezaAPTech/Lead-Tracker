/**
 * Domain types. These mirror the Supabase schema, but in camelCase:
 * every read goes through fromRow() and every write through toRow(),
 * so snake_case never leaks past the data layer.
 */

export const LEAD_STATUSES = [
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
  "REJECTED",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_TIERS = ["HOT", "GOOD", "MAYBE", "LOW"] as const;
export type LeadTier = (typeof LEAD_TIERS)[number];

export const REJECT_REASON_VALUES = [
  "EXCELLENT_WEBSITE",
  "TOO_SMALL",
  "INACTIVE",
  "POOR_REVIEWS",
  "CHAIN",
  "WRONG_NICHE",
  "DUPLICATE",
  "NO_OPPORTUNITY",
  "OTHER",
] as const;
export type RejectReason = (typeof REJECT_REASON_VALUES)[number];

export const CONTACT_METHOD_VALUES = ["INSTAGRAM", "WHATSAPP", "PHONE", "EMAIL", "WALK_IN", "OTHER"] as const;
export type ContactMethod = (typeof CONTACT_METHOD_VALUES)[number];

export const DEMO_STATUS_VALUES = ["NONE", "PLANNED", "IN_PROGRESS", "SHOWN", "REJECTED", "CONVERTED"] as const;
export type DemoStatus = (typeof DEMO_STATUS_VALUES)[number];

export const PROPOSAL_STATUS_VALUES = ["NONE", "DRAFTED", "SENT", "NEGOTIATING", "ACCEPTED", "DECLINED"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUS_VALUES)[number];

export const ACTIVITY_TYPE_VALUES = [
  "IMPORTED",
  "SCORED",
  "REVIEWED",
  "STATUS_CHANGE",
  "CONTACT",
  "RESPONSE",
  "CALL",
  "DEMO",
  "PROPOSAL",
  "FOLLOW_UP",
  "NOTE",
  "WEBSITE_ANALYSIS",
  "AI_ANALYSIS",
  "AI_MESSAGE",
  "ENRICHED",
  "OTHER",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPE_VALUES)[number];

export const AI_OUTPUT_KINDS = ["ANALYSIS", "INSTAGRAM_OPENER", "EMAIL", "CALL_OPENER", "FOLLOW_UP"] as const;
export type AiOutputKind = (typeof AI_OUTPUT_KINDS)[number];

export const STRATEGY_STATUS_VALUES = ["ACTIVE", "ARCHIVED"] as const;
export type StrategyStatus = (typeof STRATEGY_STATUS_VALUES)[number];

/** How a conversation went, not just whether someone replied. */
export const RESPONSE_CLASS_VALUES = [
  "NO_RESPONSE",
  "POSITIVE",
  "NEUTRAL",
  "NEGATIVE",
  "PRICE_OBJECTION",
  "INTERESTED",
  "CALL_BOOKED",
  "DEMO_REQUESTED",
  "PROPOSAL",
  "WON",
  "LOST",
] as const;
export type ResponseClass = (typeof RESPONSE_CLASS_VALUES)[number];

/** The milestones strategy performance is measured on. */
export const OUTREACH_EVENT_VALUES = [
  "CONTACT",
  "RESPONSE",
  "CALL",
  "DEMO",
  "PROPOSAL",
  "WON",
  "LOST",
] as const;
export type OutreachEvent = (typeof OUTREACH_EVENT_VALUES)[number];

export type ScoreReason = { label: string; points: number };

/** Timestamps arrive from PostgREST as ISO strings and stay strings end to end. */
export type Lead = {
  id: string;
  placeId: string;

  name: string;
  category: string | null;
  primaryType: string | null;
  types: string[];
  address: string | null;
  shortAddress: string | null;
  neighborhood: string | null;
  district: string | null;
  city: string;
  lat: number | null;
  lng: number | null;
  mapsUrl: string | null;
  phone: string | null;
  email: string | null;
  contactPerson: string | null;
  businessStatus: string | null;

  rating: number | null;
  reviewCount: number | null;
  priceLevel: string | null;
  googleFetchedAt: string | null;
  detailsFetchedAt: string | null;
  googleRaw: unknown | null;

  hasWebsite: boolean;
  website: string | null;
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
  websiteCheckedAt: string | null;

  instagramUrl: string | null;
  instagramUsername: string | null;
  instagramFollowers: number | null;
  instagramActive: boolean | null;
  instagramNotes: string | null;

  score: number;
  tier: LeadTier;
  scoreReasons: ScoreReason[] | null;
  scoredAt: string | null;

  status: LeadStatus;
  reviewedAt: string | null;
  rejectReason: RejectReason | null;
  rejectNote: string | null;

  contactMethod: ContactMethod | null;
  firstContactAt: string | null;
  lastContactAt: string | null;
  nextFollowUpAt: string | null;
  followUpCount: number;
  responded: boolean;
  respondedAt: string | null;
  responseNotes: string | null;
  responseClass: ResponseClass;
  priceQuoted: number | null;
  currency: string;
  dealValue: number | null;
  wonAt: string | null;
  lostAt: string | null;
  lostReason: string | null;

  demoCreated: boolean;
  demoUrl: string | null;
  demoAt: string | null;
  demoMinutes: number | null;
  demoStatus: DemoStatus;
  demoWorthIt: boolean | null;

  proposalStatus: ProposalStatus;
  proposalSentAt: string | null;

  /** Columns edited by hand; import and enrichment leave these alone. */
  manualFields: string[];

  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Campaign = {
  id: string;
  name: string;
  city: string;
  district: string | null;
  niche: string | null;
  queries: string[];
  notes: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SearchRun = {
  id: string;
  campaignId: string | null;
  query: string;
  city: string | null;
  neighborhood: string | null;
  minRating: number | null;
  minReviews: number | null;
  fieldTier: string;
  resultCount: number;
  newCount: number;
  dupeCount: number;
  skippedCount: number;
  apiCalls: number;
  error: string | null;
  createdAt: string;
};

export type LeadSource = {
  id: string;
  leadId: string;
  campaignId: string | null;
  searchRunId: string | null;
  query: string;
  createdAt: string;
  campaign?: Campaign | null;
};

export type Activity = {
  id: string;
  leadId: string;
  type: ActivityType;
  title: string;
  body: string | null;
  meta: unknown | null;
  /** Strategy active on the lead when this happened. Frozen at insert time. */
  strategyId: string | null;
  /** Set only on rows that count towards strategy performance. */
  outreachEvent: OutreachEvent | null;
  responseClass: ResponseClass | null;
  createdAt: string;
};

export type Note = {
  id: string;
  leadId: string;
  body: string;
  createdAt: string;
};

export type FollowUp = {
  id: string;
  leadId: string;
  number: number;
  dueAt: string;
  doneAt: string | null;
  channel: ContactMethod | null;
  action: string | null;
  message: string | null;
  skipped: boolean;
  createdAt: string;
};

export type AiOutput = {
  id: string;
  leadId: string;
  kind: AiOutputKind;
  content: string;
  model: string | null;
  createdAt: string;
};

/**
 * HOW I approach a lead, kept separate from the campaign (WHERE/WHO).
 * One campaign can be worked with several strategies at once.
 */
export type Strategy = {
  id: string;
  name: string;
  description: string | null;
  targetNiche: string | null;
  targetCriteria: string | null;
  channel: ContactMethod;
  openingMessage: string | null;
  followUpApproach: string | null;
  notes: string | null;
  status: StrategyStatus;
  createdAt: string;
  updatedAt: string;
};

/**
 * One period during which a lead ran one strategy. Never deleted: changing a
 * lead to a new strategy closes the old row rather than rewriting it, so past
 * results keep pointing at the strategy that actually produced them.
 */
export type StrategyAssignment = {
  id: string;
  leadId: string;
  strategyId: string;
  assignedAt: string;
  /** null means this is the assignment currently in force. */
  endedAt: string | null;
  note: string | null;
  createdAt: string;
  strategy?: Strategy | null;
};

export type ScoringConfig = {
  id: string;
  noWebsite: number;
  websiteProblems: number;
  instagramActive: number;
  instagramFollowers: number;
  manyReviews: number;
  highRating: number;
  premiumNeighborhood: number;
  appointmentBased: number;
  followerThreshold: number;
  reviewThreshold: number;
  ratingThreshold: number;
  hotMin: number;
  goodMin: number;
  maybeMin: number;
  premiumNeighborhoods: string[];
  appointmentTypes: string[];
  followUpDays: number[];
  updatedAt: string;
};

/** Insert/update payloads: any subset of a Lead, minus the generated columns. */
export type LeadWrite = Partial<Omit<Lead, "id" | "createdAt" | "updatedAt">>;
