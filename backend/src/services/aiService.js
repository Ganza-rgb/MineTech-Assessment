import { config } from '../config/config.js';

/**
 * aiService — the single LLM boundary for the app.
 *
 * Two implementations behind one interface:
 *   - HuggingFaceAI : self-hosted open-source model via @huggingface/transformers
 *                     (ONNX runtime, runs locally on CPU/GPU, no commercial API).
 *   - MockAI        : deterministic offline provider (no download) so the whole
 *                     app runs and is demonstrable without pulling a model.
 *
 * getAI() returns a singleton; if the HF model fails to load it transparently
 * falls back to MockAI so the server always boots.
 *
 * Interface:
 *   generate({ system, prompt, responseFormat, temperature }) -> string
 *   embed(text) -> number[]   (L2-normalized)
 *   health() -> { ready, mode, model }
 */

/* ------------------------------------------------------------------ */
/* Offline deterministic provider                                     */
/* ------------------------------------------------------------------ */

const CATEGORIES = {
  billing: ['invoice', 'payment', 'charge', 'refund', 'bill', 'subscription', 'upgrade', 'plan', 'price', 'overcharged', 'receipt'],
  technical: ['error', 'bug', 'crash', 'broken', 'not working', "doesn't work", 'fail', 'failing', 'freeze', 'slow', 'loading', 'glitch'],
  account: ['password', 'account', 'login', 'log in', 'signin', 'sign in', 'signup', 'sign up', 'locked', '2fa', 'verification', 'delete my account'],
  feature_request: ['feature', 'suggest', 'wish', 'please add', 'idea', 'would be nice', 'ability to', 'option to', 'can you add'],
  feedback: ['love', 'great', 'thanks', 'thank you', 'awesome', 'happy', 'impressed', 'disappointed', 'frustrated', 'terrible', 'worst', 'hate'],
};
const URGENT = ['urgent', 'asap', 'immediately', 'critical', 'down', 'outage', 'cannot access', 'can not access', 'locked out', 'security'];
const HIGH = ['broken', 'error', 'failing', 'lost', 'missing', 'charged twice', 'data loss'];
const NEG = ['angry', 'frustrated', 'terrible', 'worst', 'hate', 'disappointed', 'unacceptable', 'useless', 'ripoff', 'scam'];
const POS = ['love', 'great', 'thanks', 'thank you', 'awesome', 'happy', 'impressed', 'excellent', 'wonderful'];
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const ORDER_RE = /(?:order|ord|invoice|ticket|#)[\s:-]*([a-z0-9-]{4,})/i;
const PRODUCTS = ['pro', 'enterprise', 'mobile app', 'dashboard', 'api', 'web', 'desktop', 'plugin', 'extension', 'beta'];

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}
function firstSentence(text, max = 120) {
  const s = (text || '').trim().split(/(?<=[.!?])\s/)[0] || (text || '').trim();
  return s.length > max ? s.slice(0, max - 1).trim() + '…' : s;
}

class MockAI {
  constructor() {
    this.mode = 'mock';
    this.model = 'mock-deterministic-v1';
    this.dim = 256;
  }

  async generate({ system, prompt, responseFormat }) {
    if (responseFormat && responseFormat.type === 'json') return JSON.stringify(this._triage(prompt));
    return this._ragAnswer(system, prompt);
  }

  async embed(text) {
    const vec = new Array(this.dim).fill(0);
    for (const t of tokenize(text)) {
      let h = 2166136261;
      for (let i = 0; i < t.length; i++) {
        h ^= t.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      vec[Math.abs(h) % this.dim] += 1;
    }
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map((v) => v / norm);
  }

  async health() {
    return { ready: true, mode: this.mode, model: this.model };
  }

  _triage(text) {
    const lc = (text || '').toLowerCase();
    const scores = {};
    for (const [cat, kws] of Object.entries(CATEGORIES)) {
      scores[cat] = kws.reduce((n, kw) => (lc.includes(kw) ? n + 1 : n), 0);
    }
    let category = 'other';
    let best = 0;
    for (const [cat, n] of Object.entries(scores)) {
      if (n > best) {
        best = n;
        category = cat;
      }
    }
    if (category === 'feedback' && (scores.billing || scores.technical || scores.account)) {
      category = scores.billing ? 'billing' : scores.technical ? 'technical' : 'account';
    }

    const urgent = URGENT.some((k) => lc.includes(k));
    const high = HIGH.some((k) => lc.includes(k));
    let priority = 'low';
    let priorityReason = 'No time-sensitive or impact signals detected.';
    if (urgent) {
      priority = 'urgent';
      priorityReason = 'Contains explicit urgency or access/security impact language.';
    } else if (high) {
      priority = 'high';
      priorityReason = 'Reports a broken/failing capability or potential data/financial loss.';
    } else if (category === 'billing') {
      priority = 'medium';
      priorityReason = 'Billing related; typically needs a timely human touch.';
    } else if (best > 0) {
      priority = 'medium';
      priorityReason = 'Clear actionable category identified.';
    }

    const sentiment = POS.some((k) => lc.includes(k))
      ? 'positive'
      : NEG.some((k) => lc.includes(k))
        ? 'negative'
        : 'neutral';

    const email = lc.match(EMAIL_RE)?.[0] || null;
    const order = lc.match(ORDER_RE)?.[1] || null;
    const product = PRODUCTS.find((p) => lc.includes(p)) || null;

    return {
      category,
      priority,
      priority_reason: priorityReason,
      sentiment,
      language: 'en',
      key_entities: { product, email, order_id: order, customer_name: null },
      summary: firstSentence(text, 120),
      suggested_reply: this._draft({ category, priority, sentiment, email, order, product }),
      confidence: Number(Math.min(0.9, 0.55 + best * 0.1 + (urgent ? 0.1 : 0)).toFixed(2)),
    };
  }

  _draft({ category, priority, sentiment, email, order, product }) {
    const who = email ? `Hi ${email.split('@')[0]},` : 'Hi there,';
    const base = {
      billing: `Thanks for reaching out about your billing. I've logged this as a ${priority}-priority item and our payments team will review ${order ? `order ${order} ` : 'your account '}shortly.`,
      technical: `Sorry you hit a snag${product ? ` with ${product}` : ''}. I've flagged this as ${priority} priority and routed it to engineering. We'll follow up with next steps soon.`,
      account: `Thanks for the account request. For security we'll verify your identity first, then action this. Expect a secure link shortly.`,
      feature_request: `Thanks for the idea — I've added it to our product feedback board as ${priority} priority. We review these regularly for roadmap planning.`,
      feedback: `Thank you for the feedback! It's been shared with the team. We genuinely appreciate you taking the time.`,
      other: `Thanks for writing in. I've captured your message and routed it to the right team for a closer look.`,
    };
    const head = sentiment === 'negative' ? `We're sorry to hear this. ` : '';
    return `${who} ${head}${base[category] || base.other}\n\n– Support`;
  }

  _ragAnswer(system, question) {
    const blocks = [...(system || '').matchAll(/\[(\d+)\]\s*([\s\S]*?)(?=\[\d+\]|$)/g)];
    const qTokens = new Set(tokenize(question));
    const scored = blocks
      .map((m) => {
        const content = m[2].trim();
        const overlap = tokenize(content).filter((t) => qTokens.has(t)).length;
        return { idx: m[1], content, overlap };
      })
      .filter((b) => b.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap);

    if (scored.length === 0) {
      const lc = (question || '').toLowerCase();
      const isTechnical = CATEGORIES.technical.some((k) => lc.includes(k)) ||
        ['error', 'bug', 'crash', 'broken', 'not working', 'fail', 'failing', 'freeze', 'slow', 'loading', 'glitch', 'issue', 'problem', 'fix', 'repair', 'troubleshoot', 'diagnose', 'solve', 'help', 'stuck', 'won\'t', 'cannot', 'can not', 'unable', 'connect', 'connection', 'network', 'internet', 'wifi', 'password', 'login', 'access', 'install', 'update', 'download', 'upload', 'file', 'folder', 'data', 'database', 'server', 'api', 'code', 'program', 'application', 'software', 'hardware', 'device', 'screen', 'display', 'sound', 'audio', 'video', 'camera', 'microphone', 'printer', 'email', 'message', 'notification', 'alert', 'warning', 'error', 'exception', 'crash', 'freeze', 'hang', 'lag', 'delay', 'timeout', 'refused', 'denied', 'unauthorized', 'forbidden', 'not found', 'missing', 'corrupt', 'damage', 'broken', 'malfunction', 'defect', 'fault', 'issue', 'problem', 'trouble', 'difficulty', 'complication', 'obstacle', 'barrier', 'challenge', 'snag', 'hitch', 'hiccup', 'setback', 'issue'].some((k) => lc.includes(k));
      
      if (isTechnical) {
        return "I don't have specific information about that in the knowledge base, but here's some general guidance: try restarting the affected service or device, check for recent updates, verify your network connection, and review any error messages for clues. If the issue persists, please contact our support team with details about what you've already tried.";
      }
      return "I don't have information about that in the knowledge base. Please ask about technical support, troubleshooting, or IT issues covered in the available documentation.";
    }
    const top = scored[0];
    const cites = scored.slice(0, 2).map((b) => `[${b.idx}]`).join(' ');
    return `Based on the knowledge base ${cites}: ${firstSentence(top.content, 240)}\n\nIf this doesn't fully answer your question, let me know and I can point you to the relevant documentation section.`;
  }
}

/* ------------------------------------------------------------------ */
/* Self-hosted Hugging Face provider (Transformers.js / ONNX)         */
/* ------------------------------------------------------------------ */

class HuggingFaceAI {
  constructor() {
    this.mode = 'hf';
    this.model = config.llm.hfModelId;
    this._generator = null;
    this._embedder = null;
  }

  static async create() {
    const ai = new HuggingFaceAI();
    const { pipeline, env } = await import('@huggingface/transformers');
    // Pull weights from the Hub on first use, then cache locally (~/.cache).
    env.allowLocalModels = false;
    ai._generator = await pipeline('text-generation', config.llm.hfModelId, {
      dtype: config.llm.dtype,
      device: config.llm.device,
    });
    ai._embedder = await pipeline('feature-extraction', config.llm.hfEmbedModelId, {
      dtype: config.llm.dtype,
      device: config.llm.device,
    });
    console.log(`[ai] chat model ready: ${config.llm.hfModelId}`);
    console.log(`[ai] embed model ready: ${config.llm.hfEmbedModelId}`);
    return ai;
  }

  async generate({ system, prompt, temperature, maxTokens }) {
    const messages = [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: prompt },
    ];
    const temp = temperature ?? config.llm.temperature;
    const out = await this._generator(messages, {
      max_new_tokens: maxTokens ?? config.llm.maxTokens,
      do_sample: temp > 0,
      temperature: temp,
      top_p: 0.9,
    });
    const gen = Array.isArray(out) ? out[0]?.generated_text : out?.generated_text;
    if (Array.isArray(gen)) return gen.at(-1)?.content ?? '';
    return typeof gen === 'string' ? gen : '';
  }

  async embed(text) {
    const out = await this._embedder(text, { pooling: 'mean', normalize: true });
    return Array.from(out.data);
  }

  async health() {
    return {
      ready: !!(this._generator && this._embedder),
      mode: this.mode,
      model: this.model,
      embedModel: config.llm.hfEmbedModelId,
    };
  }
}

/* ------------------------------------------------------------------ */
/* Singleton resolver with graceful fallback                          */
/* ------------------------------------------------------------------ */

let _ai = null;
let _loading = false;

export async function getAI() {
  if (_ai) return _ai;

  if (config.llm.mode === 'hf' && !_loading) {
    _loading = true;
    try {
      _ai = await HuggingFaceAI.create();
      console.log('[ai] using HuggingFaceAI (self-hosted)');
      return _ai;
    } catch (err) {
      console.warn(
        `[ai] HuggingFaceAI init failed (${err.message}). Falling back to MockAI. ` +
          `Set LLM_MODE=mock to suppress this warning.`
      );
      _loading = false;
    }
  }

  if (!_ai) {
    _ai = new MockAI();
    console.log('[ai] using MockAI (offline, deterministic)');
  }
  return _ai;
}

export function preloadAI() {
  if (config.llm.mode === 'hf' && !_loading && !_ai) {
    _loading = true;
    HuggingFaceAI.create()
      .then((ai) => {
        _ai = ai;
        console.log('[ai] using HuggingFaceAI (self-hosted)');
      })
      .catch((err) => {
        console.warn(`[ai] background load failed: ${err.message}`);
        _loading = false;
      });
  }
}
