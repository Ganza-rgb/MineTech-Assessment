import { HfInference } from '@huggingface/inference';
import { config } from '../config/config.js';

class CloudAI {
  constructor() {
    this.mode = 'cloud';
    this.model = config.llm.cloudModel;
    this.client = new HfInference(config.llm.cloudApiKey, {
      fetch: (url, opts = {}) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 60000);
        return fetch(url, { ...opts, signal: controller.signal })
          .finally(() => clearTimeout(timer));
      }
    });
  }

  async generate({ system, prompt, temperature, maxTokens }) {
    try {
      const response = await this.client.chatCompletion({
        model: this.model,
        messages: [
          { role: 'system', content: system || '' },
          { role: 'user', content: prompt },
        ],
        temperature: Math.max(0.1, temperature ?? config.llm.temperature),
        max_tokens: maxTokens ?? config.llm.maxTokens,
      });

      return response.choices?.[0]?.message?.content || '';
    } catch (err) {
      console.error('[ai] Cloud error:', err.message);
      throw err;
    }
  }

  async embed(text) {
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await this.client.featureExtraction({
          model: 'sentence-transformers/all-MiniLM-L6-v2',
          inputs: text,
        });
        if (!Array.isArray(response)) return null;
        const vec = Array.isArray(response[0]) ? response[0] : response;
        return Array.isArray(vec) ? vec : null;
      } catch (err) {
        if (attempt === 3) {
          console.warn('[ai] Embed error:', err.message);
          return null;
        }
        await delay(500 * attempt);
      }
    }
  }

  async health() {
    return { ready: !!config.llm.cloudApiKey, mode: this.mode, model: this.model };
  }
}

/* ------------------------------------------------------------------ */
/* MAIN getAI() - Cloud First with Fallback                            */
/* ------------------------------------------------------------------ */

let _ai = null;
let _currentMode = null;
let _loading = false;

export async function getAI() {
  if (_ai && _currentMode === 'cloud') return _ai;
  if (_loading) return _ai;
  _loading = true;
  _currentMode = 'cloud';
  _ai = new CloudAI();
  console.log('[ai] Using cloud model (SDK)');
  _loading = false;
  return _ai;
}

export function getMode() {
  return _currentMode || config.llm.mode;
}

export function preloadAI() {
  void getAI();
}


/* ------------------------------------------------------------------ */
/* MockAI fallback                                                    */
/* ------------------------------------------------------------------ */

class MockAI {
  async generate({ prompt }) {
    const lc = prompt.toLowerCase();
    if (lc.includes('password') || lc.includes('login')) {
      return "We can help! Try: 1) Check caps lock, 2) Use Forgot Password.";
    }
    if (lc.includes('hello')) {
      return "Hello! We're here to help. What can we assist with?";
    }
    return "We're here to help!";
  }
  async embed(text) {
    return null;
  }
  async health() {
    return { ready: true, mode: 'mock' };
  }
}