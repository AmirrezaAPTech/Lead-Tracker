import Anthropic from "@anthropic-ai/sdk";
import type { Lead, ScoreReason } from "./types";

export const AI_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

export function aiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function client() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey });
}

/** Everything the model is allowed to treat as fact. Unknowns are stated as unknown. */
export function leadFacts(lead: Lead) {
  const reasons: ScoreReason[] = lead.scoreReasons ?? [];
  const unknown = "unknown";
  const lines = [
    `Business name: ${lead.name}`,
    `Category: ${lead.category ?? lead.primaryType ?? unknown}`,
    `City: ${lead.city}`,
    `District: ${lead.district ?? unknown}`,
    `Neighbourhood: ${lead.neighborhood ?? unknown}`,
    `Address: ${lead.address ?? unknown}`,
    `Business status: ${lead.businessStatus ?? unknown}`,
    `Google rating: ${lead.rating ?? unknown}`,
    `Google review count: ${lead.reviewCount ?? unknown}`,
    `Phone on file: ${lead.phone ? "yes" : "no"}`,
    `Has website: ${lead.hasWebsite ? `yes (${lead.website})` : "no"}`,
  ];

  if (lead.hasWebsite && lead.websiteCheckedAt) {
    lines.push(
      `Website check date: ${lead.websiteCheckedAt.slice(0, 10)}`,
      `Website health score: ${lead.websiteScore ?? unknown}/100`,
      `Website page title: ${lead.pageTitle ?? unknown}`,
      `Website H1: ${lead.h1 ?? unknown}`,
      `Website meta description: ${lead.metaDescription ?? unknown}`,
      `Mobile-friendly viewport: ${lead.mobileFriendly === null ? unknown : lead.mobileFriendly ? "yes" : "no"}`,
      `WhatsApp CTA on site: ${lead.whatsappCta === null ? unknown : lead.whatsappCta ? "yes" : "no"}`,
      `Click-to-call on site: ${lead.phoneCta === null ? unknown : lead.phoneCta ? "yes" : "no"}`,
      `Online booking CTA on site: ${lead.bookingCta === null ? unknown : lead.bookingCta ? "yes" : "no"}`,
      `Detected website problems: ${lead.websiteIssues.length ? lead.websiteIssues.join("; ") : "none detected"}`,
    );
  } else if (lead.hasWebsite) {
    lines.push("Website has NOT been analysed yet.");
  }

  lines.push(
    `Instagram: ${lead.instagramUrl ?? unknown}`,
    `Instagram username: ${lead.instagramUsername ?? unknown}`,
    `Instagram followers: ${lead.instagramFollowers ?? unknown}`,
    `Instagram active: ${lead.instagramActive === null ? unknown : lead.instagramActive ? "yes" : "no"}`,
    `Instagram notes: ${lead.instagramNotes ?? "none"}`,
    `Internal priority score: ${lead.score}/100 (${lead.tier}) - prioritisation only, not a purchase prediction`,
    `Score reasons: ${reasons.length ? reasons.map((r) => `${r.label} (+${r.points})`).join("; ") : "none"}`,
    `Pipeline status: ${lead.status}`,
    `Contact method so far: ${lead.contactMethod ?? "none"}`,
    `First contact: ${lead.firstContactAt?.slice(0, 10) ?? "never"}`,
    `Last contact: ${lead.lastContactAt?.slice(0, 10) ?? "never"}`,
    `Follow-ups sent: ${lead.followUpCount}`,
    `Responded: ${lead.responded ? "yes" : "no"}`,
    `Response notes: ${lead.responseNotes ?? "none"}`,
    `Price quoted: ${lead.priceQuoted ?? "none"}`,
    `Demo: ${lead.demoCreated ? `created (${lead.demoStatus})` : "not created"}`,
  );

  return lines.join("\n");
}

const GROUND_RULES = `You are the research assistant for a one-person web design studio in Istanbul that sells websites to local businesses (hair, beauty and nail salons).

Hard rules:
- Use ONLY the facts in the LEAD RECORD block. Never invent details about the business, its owner, its customers, its revenue or its website.
- If something is marked unknown, say it is unknown or leave it out. Do not guess.
- Clearly separate OBSERVED facts from ASSUMPTIONS. Label assumptions as assumptions.
- The internal score is a prioritisation number, never a prediction that the business will buy.
- Be concise. No filler, no hype, no emoji spam.`;

function textOf(res: Anthropic.Message) {
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

export async function analyzeLead(lead: Lead): Promise<{ text: string; model: string }> {
  const prompt = `${GROUND_RULES}

LEAD RECORD
-----------
${leadFacts(lead)}
-----------

Write a short analysis using exactly these headings:

## Prospect verdict
Two or three sentences: is this a good or weak prospect for a website project, and why. Reference concrete numbers from the record.

## Main website opportunity
The single biggest concrete gap. If the business has no website, say what it is losing today. If it has one, name the specific detected problem.

## Main sales angle
One sentence I can lead with.

## Recommended channel
One of: Instagram DM, WhatsApp, phone call, email, walk-in. One line explaining why, based on what contact data exists in the record.

## Opening message (Turkish)
Two to four sentences of natural, professional Turkish. Short, specific, not salesy, no emoji, no pricing. Address the business politely (siz).

## Personalised demo worth it?
Yes or No plus one sentence of reasoning.

## Assumptions
Bullet list of anything you inferred rather than read from the record. Write "None" if there are none.`;

  const res = await client().messages.create({
    model: AI_MODEL,
    max_tokens: 1200,
    messages: [{ role: "user", content: prompt }],
  });

  return { text: textOf(res), model: AI_MODEL };
}

export type MessageKind = "INSTAGRAM_OPENER" | "EMAIL" | "CALL_OPENER" | "FOLLOW_UP";

const MESSAGE_BRIEF: Record<MessageKind, string> = {
  INSTAGRAM_OPENER: `Write an Instagram DM opener in Turkish.
- Maximum 3 short sentences.
- Reference one concrete detail from the record (rating, review count, neighbourhood, or the missing/broken website).
- End with one light question that is easy to answer.
- No pricing, no emoji, no links, no hard sell.`,
  EMAIL: `Write a cold email in Turkish.
- Put the subject line on the first line as "Konu: ...".
- Body maximum 100 words, at most 3 short paragraphs.
- Reference one concrete detail from the record.
- One clear, low-pressure call to action.
- Professional and plain, no marketing cliches, no emoji.`,
  CALL_OPENER: `Write a phone call opener in Turkish.
- 3 to 5 spoken lines that I can read out loud.
- Start by introducing myself and why I am calling, in one sentence.
- Include one qualifying question.
- Add a one-line answer to the objection "ilgilenmiyoruz" (not interested).
- Natural spoken Turkish, not written Turkish.`,
  FOLLOW_UP: `Write a follow-up message in Turkish.
- The follow-up number is (follow-ups sent so far + 1) from the record.
- Maximum 3 short sentences, shorter than a first message.
- Do not repeat the first pitch word for word: add one new small piece of value or a different angle.
- Polite, no guilt, no pressure. If this is the third or later follow-up, make it a graceful final message that leaves the door open.`,
};

export async function generateMessage(lead: Lead, kind: MessageKind): Promise<{ text: string; model: string }> {
  const prompt = `${GROUND_RULES}

LEAD RECORD
-----------
${leadFacts(lead)}
-----------

TASK
${MESSAGE_BRIEF[kind]}

Output only the message text, ready to copy and paste. No preamble, no explanation, no surrounding quotation marks.`;

  const res = await client().messages.create({
    model: AI_MODEL,
    max_tokens: 700,
    messages: [{ role: "user", content: prompt }],
  });

  return { text: textOf(res), model: AI_MODEL };
}
