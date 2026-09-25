import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client.
 *
 * Uses the service role key, so it must never be imported into a client
 * component. Every table has RLS on with no policies: the anon key can read
 * nothing, and access control is the app password plus middleware.
 */

const globalForDb = globalThis as unknown as { supabase?: SupabaseClient };

export function db(): SupabaseClient {
  if (globalForDb.supabase) return globalForDb.supabase;

  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.example)");
  }

  // The most common mix-up: pasting a Postgres connection string where the
  // HTTP API key belongs. This app never opens a database socket.
  const lowerKey = key.toLowerCase();
  if (lowerKey.startsWith("postgres://") || lowerKey.startsWith("postgresql://")) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY holds a Postgres connection string. This app uses the Supabase HTTP API, " +
        "so it needs an API key instead: Project Settings -> API Keys -> a Secret key ('sb_secret_...', " +
        "labelled service_role on older projects).",
    );
  }
  if (key.startsWith("sb_publishable_") || /"role":"anon"/.test(safeJwtPayload(key))) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY holds the publishable/anon key, which has no access to any table. " +
        "Use a Secret key ('sb_secret_...') from Project Settings -> API Keys.",
    );
  }
  if (!url.toLowerCase().startsWith("http://") && !url.toLowerCase().startsWith("https://")) {
    throw new Error(`SUPABASE_URL must be the project API URL (https://<project-ref>.supabase.co), got: ${url}`);
  }

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  globalForDb.supabase = client;
  return client;
}

/** Decodes a JWT payload for validation only; returns "" for anything unparseable. */
function safeJwtPayload(token: string) {
  try {
    const body = token.split(".")[1];
    if (!body) return "";
    return Buffer.from(body, "base64").toString("utf8");
  } catch {
    return "";
  }
}

/** jsonb columns are stored verbatim - never rewrite the keys inside them. */
const OPAQUE_KEYS = new Set(["googleRaw", "google_raw", "scoreReasons", "score_reasons", "meta"]);

export function snake(key: string) {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

export function camel(key: string) {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/** camelCase object -> snake_case row, ready for insert/update. */
export function toRow(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    out[snake(key)] = OPAQUE_KEYS.has(key) ? value : convertValue(value, snake);
  }
  return out;
}

/** snake_case row (including embedded relations) -> camelCase object. */
export function fromRow<T>(row: Record<string, unknown> | null): T | null {
  if (!row) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[camel(key)] = OPAQUE_KEYS.has(key) ? value : convertValue(value, camel);
  }
  return out as T;
}

export function fromRows<T>(rows: Record<string, unknown>[] | null): T[] {
  return (rows ?? []).map((r) => fromRow<T>(r)!);
}

function convertValue(value: unknown, keyFn: (k: string) => string): unknown {
  if (Array.isArray(value)) return value.map((v) => convertValue(v, keyFn));
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[keyFn(k)] = OPAQUE_KEYS.has(k) ? v : convertValue(v, keyFn);
    }
    return out;
  }
  return value;
}

type Result<T> = { data: T | null; error: { message: string; code?: string } | null };

/** Turns a PostgREST result into data or a thrown error. */
export function unwrap<T>(result: Result<T>, context: string): T {
  if (result.error) {
    throw new Error(`${context}: ${result.error.message}`);
  }
  return result.data as T;
}

export async function countRows(table: string, apply?: (q: never) => unknown): Promise<number> {
  let query = db().from(table).select("id", { count: "exact", head: true });
  if (apply) query = apply(query as never) as typeof query;
  const { count, error } = await query;
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return count ?? 0;
}

export const TABLES = {
  leads: "leads",
  campaigns: "campaigns",
  searchRuns: "search_runs",
  leadSources: "lead_sources",
  activities: "activities",
  notes: "notes",
  followUps: "follow_ups",
  aiOutputs: "ai_outputs",
  scoringConfig: "scoring_config",
  strategies: "strategies",
  strategyAssignments: "strategy_assignments",
} as const;
