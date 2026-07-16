import { config } from '../config/config.js';

class OllamaAI {
  constructor() {
    this.mode = 'ollama';
    this.endpoint = config.llm.ollama.endpoint;
    this.model = config.llm.ollama.model;
  }

  async generate({ system, prompt, temperature, maxTokens }) {
    try {
      const messages = [];
      if (system) {
        messages.push({ role: 'system', content: system });
      }
      messages.push({ role: 'user', content: prompt });

      const response = await fetch(`${this.endpoint}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: messages,
          stream: false,
          options: {
            temperature: temperature ?? config.llm.temperature,
            num_predict: maxTokens ?? config.llm.maxTokens,
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = await response.json();
      return data.message?.content || '';
    } catch (err) {
      console.error('[ai] Ollama error:', err.message);
      throw err;
    }
  }

  async embed(text) {
    try {
      const response = await fetch(`${this.endpoint}/api/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          prompt: text,
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama embedding API error: ${response.status}`);
      }

      const data = await response.json();
      return data.embedding || null;
    } catch (err) {
      console.error('[ai] Ollama embedding error:', err.message);
      return null;
    }
  }

  async health() {
    try {
      const response = await fetch(`${this.endpoint}/api/tags`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        return { ready: false, mode: this.mode, model: this.model };
      }

      const data = await response.json();
      const modelExists = data.models.some(model => model.name === this.model);
      return { ready: modelExists, mode: this.mode, model: this.model };
    } catch (err) {
      console.error('[ai] Ollama health check error:', err.message);
      return { ready: false, mode: this.mode, model: this.model };
    }
  }
}

/* ------------------------------------------------------------------ */
/* MAIN getAI() - Ollama First with Fallback                           */
/* ------------------------------------------------------------------ */

let _ai = null;
let _currentMode = null;
let _loading = false;

export async function getAI() {
  if (_ai && _currentMode === 'ollama') return _ai;
  if (_loading) return _ai;
  _loading = true;
  _currentMode = 'ollama';
  _ai = new OllamaAI();
  console.log('[ai] Using Ollama model');
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
    return new Array(256).fill(0);
  }
  async health() {
    return { ready: true, mode: 'mock' };
  }
}