import { z } from 'zod';
import { getAI } from './aiService.js';

/**
 * Use Case 1 — Smart Intake Triage (structured generation).
 *
 * Accepts free-text inbound messages (support tickets / feedback), asks the
 * self-hosted model to emit a single validated JSON object (category,
 * priority, extracted fields, drafted reply), and defends against malformed
 * model output via a parse -> extract -> repair -> heuristic fallback chain.
 */

export const CATEGORIES = [
  'billing',
  'technical',
  'account',
  'feature_request',
  'feedback',
  'other',
];
export const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

const SYSTEM_PROMPT = `You are an inbound support-intake classifier for a B2B SaaS company.
Given the customer message, output ONLY a single JSON object (no markdown, no commentary)
matching this exact schema:

{
  "category": one of ${JSON.stringify(CATEGORIES)},
  "priority": one of ${JSON.stringify(PRIORITIES)},
  "priority_reason": "short justification for the priority",
  "sentiment": "positive" | "neutral" | "negative",
  "language": "BCP-47 language code, e.g. en",
  "key_entities": {
    "product": string or null,
    "email": string or null,
    "order_id": string or null,
    "customer_name": string or null
  },
  "summary": "one sentence, <= 120 chars",
  "suggested_reply": "a short, empathetic draft reply the agent can edit",
  "confidence": number between 0 and 1
}

Priority guidance:
- urgent: explicit urgency, outage, security, or locked-out / cannot access.
- high: broken/failing capability, data or financial loss.
- medium: actionable but not time-critical (e.g. billing questions).
- low: general feedback, thanks, minor asks.
Extract key_entities only when clearly present. The suggested_reply must be professional,
always use "We" or "Our team" (NOT "I"), reference the customer by email username if available, and never invent facts.`;

const REPAIR_PROMPT = `Your previous output was not valid JSON. Re-emit the same analysis as a single,
strictly valid JSON object and nothing else.`;

/* ---- validation / coercion -------------------------------------- */

const TriageSchema = z.object({
  category: z.string().transform((v) => (CATEGORIES.includes(v) ? v : 'other')),
  priority: z.string().transform((v) => (PRIORITIES.includes(v) ? v : 'low')),
  priority_reason: z.string().default(''),
  sentiment: z.string().transform((v) =>
    ['positive', 'neutral', 'negative'].includes(v) ? v : 'neutral'
  ),
  language: z.string().default('en'),
  key_entities: z
    .object({
      product: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
      order_id: z.string().nullable().optional(),
      customer_name: z.string().nullable().optional(),
    })
    .default({}),
  summary: z.string().default(''),
  suggested_reply: z.string().default(''),
  confidence: z.number().min(0).max(1).default(0.5),
});

function validate(obj) {
  const parsed = TriageSchema.safeParse(obj);
  if (parsed.success) return { value: parsed.data, repaired: false };
  // Coerce the most common failures rather than discard the whole object.
  const cleaned = { ...obj };
  if (typeof cleaned.key_entities !== 'object' || cleaned.key_entities === null) {
    cleaned.key_entities = {};
  }
  if (typeof cleaned.confidence !== 'number' || Number.isNaN(cleaned.confidence)) {
    cleaned.confidence = 0.5;
  }
  const second = TriageSchema.safeParse(cleaned);
  if (second.success) return { value: second.data, repaired: true };
  return { value: null, repaired: true };
}

/* ---- malformed-output handling ---------------------------------- */

function extractJson(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  try {
    return JSON.parse(candidate);
  } catch {
    const first = candidate.indexOf('{');
    const last = candidate.lastIndexOf('}');
    if (first !== -1 && last > first) {
      try {
        return JSON.parse(candidate.slice(first, last + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Heuristic fallback used only when the model never produces parseable JSON.
 * Keeps the pipeline resilient so a single bad generation can't break intake.
 */
function heuristic(text) {
  const lc = (text || '').toLowerCase();
  const cat = CATEGORIES.find((c) =>
    c === 'billing'
      ? ['invoice', 'payment', 'refund', 'charge', 'bill', 'subscription'].some((k) => lc.includes(k))
      : c === 'technical'
        ? ['error', 'bug', 'crash', 'broken', 'not working', 'fail'].some((k) => lc.includes(k))
        : c === 'account'
          ? ['password', 'login', 'account', 'sign in', '2fa'].some((k) => lc.includes(k))
          : c === 'feature_request'
            ? ['feature', 'suggest', 'add', 'idea'].some((k) => lc.includes(k))
            : c === 'feedback'
              ? ['love', 'great', 'thanks', 'terrible', 'hate'].some((k) => lc.includes(k))
              : false
  ) || 'other';
  const priority = /urgent|asap|critical|outage|locked out|security/.test(lc)
    ? 'urgent'
    : /broken|error|failing|lost|missing/.test(lc)
      ? 'high'
      : cat === 'billing'
        ? 'medium'
        : 'low';
  return {
    category: cat,
    priority,
    priority_reason: 'Fallback heuristic (model output was unparseable).',
    sentiment: 'neutral',
    language: 'en',
    key_entities: {
      product: null,
      email: (lc.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i) || [])[0] || null,
      order_id: null,
      customer_name: null,
    },
    summary: (text || '').trim().slice(0, 120),
    suggested_reply: 'Thanks for reaching out — we will review your request and follow up shortly.',
    confidence: 0.3,
  };
}

/* ---- public API -------------------------------------------------- */

export async function triage(rawText, { source = 'api' } = {}) {
  const ai = await getAI();
  let raw = await ai.generate({
    system: SYSTEM_PROMPT,
    prompt: rawText,
    responseFormat: { type: 'json' },
    temperature: 0.2,
  });

  let obj = extractJson(raw);
  let repaired = false;

  if (!obj) {
    // One repair attempt: ask the model to reformat.
    const reparsed = await ai.generate({
      system: SYSTEM_PROMPT,
      prompt: `${REPAIR_PROMPT}\n\nOriginal message:\n${rawText}`,
      temperature: 0.1,
    });
    obj = extractJson(reparsed);
    repaired = true;
  }

  let result;
  if (!obj) {
    result = { value: heuristic(rawText), repaired: true, fatal: true };
  } else {
    const v = validate(obj);
    result = v;
    if (!v.value) result = { value: heuristic(rawText), repaired: true, fatal: true };
  }

  return {
    ...result.value,
    meta: {
      repaired,
      fatal_fallback: !!result.fatal,
      provider: ai.mode,
      source,
    },
  };
}
