import { z } from 'zod';
import { getAI } from './aiService.js';

export const CATEGORIES = [
  'Occupational Safety',
  'Fleet Equipment',
  'Regulatory Compliance',
  'Geology & Lab',
];
export const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

const SYSTEM_PROMPT = `You are an inbound operational intake classifier for MineTech Rwanda, a mining technology company.
Given the field message, output ONLY a single JSON object (no markdown, no commentary)
matching this exact schema:

{
  "category": one of ${JSON.stringify(CATEGORIES)},
  "priority": one of ${JSON.stringify(PRIORITIES)},
  "extracted_fields": {
    "site_location": "string — mine site or shaft name, e.g. Rutongo, Rwamagana",
    "equipment_id": "string — asset tag or unit ID, e.g. EXV-402, SN-902",
    "rssb_clearance_required": "boolean — true if RSSB worker clearance is needed",
    "sensor_error_codes": ["array of sensor/telemetry error codes if mentioned, else empty array"]
  },
  "suggested_reply": "a short, professional draft reply the ops team can edit"
}

Priority guidance:
- Critical: immediate safety risk, active emergency, life-threatening, gas alert, structural failure.
- High: equipment failure blocking operations, regulatory violation imminent, evacuation required.
- Medium: maintenance needed, compliance documentation missing, non-urgent safety concern.
- Low: general inquiry, minor issue, non-urgent request.
The suggested_reply must be professional, concise, and grounded in MineTech operational context.`;

const REPAIR_PROMPT = `Your previous output was not valid JSON. Re-emit the same analysis as a single,
strictly valid JSON object and nothing else.`;

const TriageSchema = z.object({
  category: z.string().transform((v) => (CATEGORIES.includes(v) ? v : 'Other')),
  priority: z.string().transform((v) => (PRIORITIES.includes(v) ? v : 'Medium')),
  extracted_fields: z.object({
    site_location: z.string().default('Unknown'),
    equipment_id: z.string().default('N/A'),
    rssb_clearance_required: z.boolean().default(false),
    sensor_error_codes: z.array(z.string()).default([]),
  }).default({
    site_location: 'Unknown',
    equipment_id: 'N/A',
    rssb_clearance_required: false,
    sensor_error_codes: [],
  }),
  suggested_reply: z.string().default(''),
});

function validate(obj) {
  const parsed = TriageSchema.safeParse(obj);
  if (parsed.success) return { value: parsed.data, repaired: false };
  const cleaned = { ...obj };
  if (typeof cleaned.extracted_fields !== 'object' || cleaned.extracted_fields === null) {
    cleaned.extracted_fields = {};
  }
  const second = TriageSchema.safeParse(cleaned);
  if (second.success) return { value: second.data, repaired: true };
  return { value: null, repaired: true };
}

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

function heuristic(text) {
  const lc = (text || '').toLowerCase();
  const cat = CATEGORIES.find((c) =>
    c === 'Occupational Safety'
      ? ['gas', 'ventilation', 'shaft', 'evacuat', 'injury', 'safety', 'sensor', 'alert', 'emergency'].some((k) => lc.includes(k))
      : c === 'Fleet Equipment'
        ? ['excavator', 'hydraulic', 'truck', 'haul', 'equipment', 'unit', ' immobilized', 'blocked'].some((k) => lc.includes(k))
        : c === 'Regulatory Compliance'
          ? ['rssb', 'compliance', 'clearance', 'regulatory', 'permit', 'audit'].some((k) => lc.includes(k))
          : c === 'Geology & Lab'
            ? ['sample', 'assay', 'core', 'geolog', 'lab', 'drill'].some((k) => lc.includes(k))
            : false
  ) || 'Other';
  const priority = /gas|evacuat|emergency|critical|outage|structural|fracture/.test(lc)
    ? 'Critical'
    : /broken|immobilized|blocked|failure|violation/.test(lc)
      ? 'High'
      : cat === 'Regulatory Compliance'
        ? 'Medium'
        : 'Low';
  return {
    category: cat,
    priority,
    extracted_fields: {
      site_location: (lc.match(/rutongo|rwamagana|zone [a-z]|shaft \d+/i) || [])[0] || 'Unknown',
      equipment_id: (lc.match(/exv-\d+|sn-\d+|unit [a-z0-9-]+/i) || [])[0] || 'N/A',
      rssb_clearance_required: /rssb|clearance/.test(lc),
      sensor_error_codes: (lc.match(/err-\d+/g) || []),
    },
    suggested_reply: 'Ops team has been notified. Please stand by for coordinated response.',
  };
}

export async function triage(rawText, { source = 'api' } = {}) {
  const ai = await getAI();
  let raw = await ai.generate({
    system: SYSTEM_PROMPT,
    prompt: rawText,
    temperature: 0.2,
  });

  let obj = extractJson(raw);
  let repaired = false;

  if (!obj) {
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
