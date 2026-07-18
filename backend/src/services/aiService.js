import { config } from '../config/config.js';

class OllamaAI {
  constructor() {
    this.mode = 'ollama';
    this.model = config.llm.ollamaModel;
    this.embedModel = config.llm.ollamaEmbedModel;
    this.endpoint = config.llm.ollamaEndpoint.replace(/\/$/, '');
  }

  async request(path, body) {
    const res = await fetch(`${this.endpoint}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Ollama error ${res.status}: ${text || res.statusText}`);
    }
    return res.json();
  }

  async generate({ system, prompt, temperature, maxTokens }) {
    const data = await this.request('/api/chat', {
      model: this.model,
      messages: [
        { role: 'system', content: system || '' },
        { role: 'user', content: prompt },
      ],
      stream: false,
      options: {
        temperature: Math.max(0.1, temperature ?? config.llm.temperature),
        num_predict: maxTokens ?? config.llm.maxTokens,
      },
    });
    return data.message?.content || '';
  }

  async embed(text) {
    try {
      const data = await this.request('/api/embeddings', {
        model: this.embedModel,
        prompt: text,
      });
      if (Array.isArray(data.embedding)) return data.embedding;
      return null;
    } catch {
      return null;
    }
  }

  async health() {
    try {
      const res = await fetch(`${this.endpoint}/api/tags`);
      if (!res.ok) throw new Error('Ollama not reachable');
      const data = await res.json();
      const models = (data.models || []).map((m) => m.name);
      return {
        ready: true,
        mode: this.mode,
        model: this.model,
        models,
      };
    } catch {
      return { ready: false, mode: this.mode, model: this.model };
    }
  }
}

let _ai = null;
let _currentMode = null;
let _loading = false;

export async function getAI() {
  if (_ai && _currentMode === 'ollama') return _ai;
  if (_loading) return _ai;
  _loading = true;
  _currentMode = 'ollama';
  _ai = new OllamaAI();
  console.log('[ai] Using Ollama model:', _ai.model);
  _loading = false;
  return _ai;
}

export function getMode() {
  return _currentMode || config.llm.mode;
}

export function preloadAI() {
  void getAI();
}

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
  async embed() {
    return null;
  }
  async health() {
    return { ready: true, mode: 'mock' };
  }
}