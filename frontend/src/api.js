const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const BASE = `${API_BASE_URL}/api`;

async function req(url, options) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export const api = {
  health: () => req(`${API_BASE_URL}/api/health`),
  ragStats: () => req(`${API_BASE_URL}/api/rag/stats`),
  ingest: () => req(`${API_BASE_URL}/api/rag/ingest`, { method: 'POST' }),

  triage: (text, source = 'web') =>
    req(`${API_BASE_URL}/api/triage`, { method: 'POST', body: JSON.stringify({ text, source }) }),

  listTickets: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v)
    ).toString();
    return req(`${API_BASE_URL}/api/tickets${qs ? `?${qs}` : ''}`);
  },

  updateTicket: (id, status) =>
    req(`${API_BASE_URL}/api/tickets/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  ask: (question) =>
    req(`${API_BASE_URL}/api/rag/ask`, { method: 'POST', body: JSON.stringify({ question }) }),
};
