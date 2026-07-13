const BASE = '/api';

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
  health: () => req(`${BASE}/health`),
  ragStats: () => req(`${BASE}/rag/stats`),
  ingest: () => req(`${BASE}/rag/ingest`, { method: 'POST' }),

  triage: (text, source = 'web') =>
    req(`${BASE}/triage`, { method: 'POST', body: JSON.stringify({ text, source }) }),

  listTickets: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v)
    ).toString();
    return req(`${BASE}/tickets${qs ? `?${qs}` : ''}`);
  },

  updateTicket: (id, status) =>
    req(`${BASE}/tickets/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  ask: (question) =>
    req(`${BASE}/rag/ask`, { method: 'POST', body: JSON.stringify({ question }) }),
};
