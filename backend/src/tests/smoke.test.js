import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';

const BASE = process.env.TEST_BASE || 'http://localhost:4000';

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

describe('API smoke tests', () => {
  it('health returns 200', async () => {
    const { status, body } = await req('/api/health');
    assert.strictEqual(status, 200);
    assert.strictEqual(body.status, 'ok');
    assert.ok(body.ai);
  });

  it('triage accepts valid input and returns structured JSON', async () => {
    const { status, body } = await req('/api/triage', {
      method: 'POST',
      body: JSON.stringify({ text: 'My account is locked, I cannot log in. Please help urgently!' }),
    });
    assert.strictEqual(status, 200);
    assert.ok(body.id);
    assert.ok(['billing', 'technical', 'account', 'feature_request', 'feedback', 'other'].includes(body.category));
    assert.ok(['low', 'medium', 'high', 'urgent'].includes(body.priority));
    assert.ok(typeof body.confidence === 'number');
  });

  it('triage rejects empty input with 400', async () => {
    const { status } = await req('/api/triage', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    assert.strictEqual(status, 400);
  });

  it('triage rejects overly long input with 400', async () => {
    const { status } = await req('/api/triage', {
      method: 'POST',
      body: JSON.stringify({ text: 'x'.repeat(100_001) }),
    });
    assert.strictEqual(status, 400);
  });

  it('rag ask accepts valid question', async () => {
    const { status, body } = await req('/api/rag/ask', {
      method: 'POST',
      body: JSON.stringify({ question: 'What should I do if a user is locked out?' }),
    });
    assert.strictEqual(status, 200);
    assert.ok(typeof body.content === 'string');
    assert.ok(Array.isArray(body.citations));
    assert.ok(typeof body.grounded === 'boolean');
    assert.ok(typeof body.confidence === 'number');
  });

  it('rag ask rejects empty question with 400', async () => {
    const { status } = await req('/api/rag/ask', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    assert.strictEqual(status, 400);
  });

  it('tickets list returns array', async () => {
    const { status, body } = await req('/api/tickets');
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(body));
  });

  it('tickets filter by category works', async () => {
    const { status, body } = await req('/api/tickets?category=account');
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(body));
    for (const t of body) {
      assert.strictEqual(t.category, 'account');
    }
  });

  it('rag stats returns counts', async () => {
    const { status, body } = await req('/api/rag/stats');
    assert.strictEqual(status, 200);
    assert.ok(typeof body.documents === 'number');
    assert.ok(typeof body.chunks === 'number');
  });

  it('ticket update requires valid status', async () => {
    const { status } = await req('/api/tickets/99999', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'invalid-status' }),
    });
    assert.strictEqual(status, 400);
  });
});
