import { initSchema, pool } from './config/db.js';

/**
 * Seed a few realistic tickets so the Triage dashboard is populated on first
 * run (no model call needed). Re-runnable: clears existing rows first.
 */
const SAMPLES = [
  {
    raw_text:
      'URGENT: our production dashboard is completely down and the whole team is locked out. Critical outage, fix ASAP!',
    category: 'technical',
    priority: 'urgent',
    priority_reason: 'Explicit urgency + outage / locked-out language.',
    sentiment: 'negative',
    language: 'en',
    key_entities: { product: 'dashboard', email: null, order_id: null, customer_name: null },
    summary: 'Production dashboard down, team locked out — urgent outage.',
    suggested_reply:
      'Hi there, we’re sorry to hear this. I’ve flagged this as urgent priority and routed it to engineering. We’ll follow up with next steps soon.',
    confidence: 0.88,
  },
  {
    raw_text: 'I was charged twice for my annual plan (order INV-99213). Please refund the duplicate.',
    category: 'billing',
    priority: 'medium',
    priority_reason: 'Billing related; needs a timely human touch.',
    sentiment: 'neutral',
    language: 'en',
    key_entities: { product: null, email: 'jane@acme.com', order_id: 'INV-99213', customer_name: null },
    summary: 'Duplicate charge on annual plan, requests refund.',
    suggested_reply:
      'Hi jane, thanks for reaching out about your billing. I’ve logged this as a medium-priority item and our payments team will review order INV-99213 shortly.',
    confidence: 0.85,
  },
  {
    raw_text: 'It would be great if we could export analytics to CSV for weekly reports.',
    category: 'feature_request',
    priority: 'low',
    priority_reason: 'Clear actionable category, not time-critical.',
    sentiment: 'positive',
    language: 'en',
    key_entities: { product: 'api', email: null, order_id: null, customer_name: null },
    summary: 'Feature request: CSV export of analytics.',
    suggested_reply:
      'Hi there, thanks for the idea — I’ve added it to our product feedback board as low priority. We review these regularly for roadmap planning.',
    confidence: 0.72,
  },
  {
    raw_text: 'Love the new mobile app, onboarding was super smooth. Great work!',
    category: 'feedback',
    priority: 'low',
    priority_reason: 'Positive feedback, no action required.',
    sentiment: 'positive',
    language: 'en',
    key_entities: { product: 'mobile app', email: null, order_id: null, customer_name: null },
    summary: 'Positive feedback on mobile app onboarding.',
    suggested_reply:
      'Hi there, thank you for the feedback! It’s been shared with the team. We genuinely appreciate you taking the time.',
    confidence: 0.8,
  },
  {
    raw_text: 'I forgot my password and the reset email never arrived. My account seems locked now.',
    category: 'account',
    priority: 'high',
    priority_reason: 'Reports a broken/failing capability (locked account).',
    sentiment: 'negative',
    language: 'en',
    key_entities: { product: null, email: 'sam@beta.io', order_id: null, customer_name: null },
    summary: 'Password reset not received, account locked.',
    suggested_reply:
      'Hi sam, thanks for the account request. For security we’ll verify your identity first, then action this. Expect a secure link shortly.',
    confidence: 0.83,
  },
];

await initSchema();
await pool.query('DELETE FROM tickets');
for (const s of SAMPLES) {
  await pool.query(
    `INSERT INTO tickets
      (raw_text, category, priority, priority_reason, sentiment, language,
       key_entities, summary, suggested_reply, confidence, status, source, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', 'seed', ?)`,
    [
      s.raw_text,
      s.category,
      s.priority,
      s.priority_reason,
      s.sentiment,
      s.language,
      JSON.stringify(s.key_entities),
      s.summary,
      s.suggested_reply,
      s.confidence,
      JSON.stringify({ source: 'seed' }),
    ]
  );
}
console.log(`Seeded ${SAMPLES.length} tickets.`);
process.exit(0);
