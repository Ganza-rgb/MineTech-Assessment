import { HfInference } from '@huggingface/inference';
import { config } from '../config/config.js';

class CloudAI {
  constructor() {
    this.mode = 'cloud';
    this.model = config.llm.cloudModel;
    this.client = new HfInference(config.llm.cloudApiKey);
  }

  async generate({ system, prompt, temperature, maxTokens }) {
    try {
      const response = await this.client.chatCompletion({
        model: this.model,
        messages: [
          { role: 'system', content: system || '' },
          { role: 'user', content: prompt },
        ],
        parameters: {
          temperature: Math.max(0.1, temperature ?? config.llm.temperature),
          max_new_tokens: maxTokens ?? config.llm.maxTokens,
          do_sample: (temperature ?? config.llm.temperature) > 0,
        }
      });

      return response.choices?.[0]?.message?.content || '';
    } catch (err) {
      console.error('[ai] Cloud error:', err.message);
      throw err;
    }
  }

  async embed(text) {
    try {
      const response = await this.client.featureExtraction({
        model: 'sentence-transformers/all-MiniLM-L6-v2',
        inputs: text,
      });
      return Array.isArray(response) ? response : null;
    } catch (err) {
      console.warn('[ai] Embed error:', err.message);
      return null;
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

export async function getAI() {
  if (config.llm.mode === 'cloud') {
    if (!_ai || _currentMode !== 'cloud') {
      try {
        _currentMode = 'cloud';
        _ai = new CloudAI();
        await _ai.health();
        console.log('[ai] Using cloud model (SDK)');
      } catch (err) {
        console.warn(`[ai] Cloud failed: ${err.message}, using local`);
        _currentMode = 'local';
        _ai = null;
      }
    }
    if (_currentMode === 'cloud') return _ai;
  }

  // Fallback to local
  if (!_ai || _currentMode !== 'local') {
    _currentMode = 'local';
    try {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.allowLocalModels = false;

      const generator = await pipeline('text-generation', config.llm.hfModelId, {
        dtype: config.llm.dtype,
        device: config.llm.device,
      });

      const embedder = await pipeline('feature-extraction', config.llm.hfEmbedModelId, {
        dtype: config.llm.dtype,
        device: config.llm.device,
      });

      _ai = {
        mode: 'local',
        generate: async ({ prompt, temperature, maxTokens }) => {
          const out = await generator([{ role: 'user', content: prompt }], {
            max_new_tokens: maxTokens ?? config.llm.maxTokens,
            do_sample: (temperature ?? config.llm.temperature) > 0,
            temperature: temperature ?? config.llm.temperature,
          });
          return out[0]?.generated_text?.content || '';
        },
        embed: async (text) => {
          const out = await embedder(text, { pooling: 'mean', normalize: true });
          return Array.from(out.data);
        },
        health: async () => ({ ready: true, mode: 'local' })
      };
      console.log('[ai] Local model ready');
    } catch (err) {
      console.warn(`[ai] Local failed: ${err.message}`);
      _ai = new MockAI();
    }
  }
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
    return new Array(256).fill(0);
  }
  async health() {
    return { ready: true, mode: 'mock' };
  }
}