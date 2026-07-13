import { useEffect, useState } from 'react';
import { api } from '../api.js';

const SAMPLES = [
  'URGENT: our production dashboard is completely down and the whole team is locked out. This is a critical outage, please fix ASAP!',
  'I was charged twice for my annual plan last week (order INV-99213). I need a refund for the duplicate charge.',
  "I'd love a feature where I could export the analytics to CSV. That would be really useful for our weekly reports.",
  'Just wanted to say the new mobile app is awesome, onboarding was super smooth. Great work!',
  'I forgot my password and the reset email never arrived. Now my account seems locked. Can you help?',
];

const CATEGORY_COLORS = {
  billing: 'bg-violet-100 text-violet-700',
  technical: 'bg-rose-100 text-rose-700',
  account: 'bg-sky-100 text-sky-700',
  feature_request: 'bg-emerald-100 text-emerald-700',
  feedback: 'bg-amber-100 text-amber-700',
  other: 'bg-slate-100 text-slate-700',
};
const PRIORITY_COLORS = {
  urgent: 'bg-red-600 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-400 text-yellow-900',
  low: 'bg-slate-300 text-slate-700',
};

export default function TriageDashboard() {
  const [text, setText] = useState('');
  const [latest, setLatest] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [filters, setFilters] = useState({ category: '', priority: '', status: '', q: '' });
  const [tickets, setTickets] = useState([]);
  const [expanded, setExpanded] = useState(null);

  const loadTickets = async () => {
    try {
      setTickets(await api.listTickets(filters));
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    loadTickets();
  }, []);

  const runTriage = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.triage(text);
      setLatest(res);
      setText('');
      await loadTickets();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Input + result */}
      <section className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Paste an inbound message (ticket / feedback)
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="e.g. URGENT: the dashboard is down and we are locked out…"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {SAMPLES.map((s, i) => (
              <button
                key={i}
                onClick={() => setText(s)}
                className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600 hover:bg-slate-200"
              >
                Sample {i + 1}
              </button>
            ))}
          </div>
          <button
            onClick={runTriage}
            disabled={loading || !text.trim()}
            className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'Triaging…' : 'Run triage'}
          </button>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>

        {latest && (
          <ResultCard result={latest} />
        )}
      </section>

      {/* Filterable table */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          <select
            value={filters.category}
            onChange={(e) => setFilters({ ...filters, category: e.target.value })}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">All categories</option>
            {Object.keys(CATEGORY_COLORS).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={filters.priority}
            onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">All priorities</option>
            {Object.keys(PRIORITY_COLORS).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">All statuses</option>
            <option value="new">new</option>
            <option value="in-progress">in-progress</option>
            <option value="resolved">resolved</option>
          </select>
          <input
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            placeholder="search…"
            className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <button
            onClick={loadTickets}
            className="rounded bg-slate-100 px-3 py-1 text-sm hover:bg-slate-200"
          >
            Refresh
          </button>
        </div>

        <div className="max-h-[32rem] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-white text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2 pr-2">#</th>
                <th className="py-2 pr-2">Category</th>
                <th className="py-2 pr-2">Pri</th>
                <th className="py-2 pr-2">Summary</th>
                <th className="py-2 pr-2">Conf</th>
                <th className="py-2 pr-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <TicketRow
                  key={t.id}
                  t={t}
                  open={expanded === t.id}
                  onToggle={() => setExpanded(expanded === t.id ? null : t.id)}
                  onStatus={(s) =>
                    api.updateTicket(t.id, s).then(loadTickets)
                  }
                />
              ))}
              {tickets.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    No tickets yet — run a triage.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ResultCard({ result }) {
  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Badge className={CATEGORY_COLORS[result.category] || CATEGORY_COLORS.other}>
          {result.category}
        </Badge>
        <Badge className={PRIORITY_COLORS[result.priority] || PRIORITY_COLORS.low}>
          {result.priority}
        </Badge>
        <span className="text-xs text-slate-500">
          {result.sentiment} · conf {result.confidence}
        </span>
        {result.meta?.repaired && (
          <span className="rounded bg-amber-200 px-2 py-0.5 text-xs text-amber-800">
            repaired output
          </span>
        )}
      </div>
      <p className="text-sm font-medium text-slate-800">{result.summary}</p>
      <p className="mt-1 text-xs text-slate-500">{result.priority_reason}</p>
      <div className="mt-3 rounded-lg bg-white p-3 text-sm whitespace-pre-wrap text-slate-700">
        {result.suggested_reply}
      </div>
      <pre className="mt-3 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-100">
        {JSON.stringify(result, null, 2)}
      </pre>
    </div>
  );
}

function TicketRow({ t, open, onToggle, onStatus }) {
  const entities = typeof t.key_entities === 'string' ? JSON.parse(t.key_entities) : t.key_entities;
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
      >
        <td className="py-2 pr-2 text-slate-400">{t.id}</td>
        <td className="py-2 pr-2">
          <Badge className={CATEGORY_COLORS[t.category] || CATEGORY_COLORS.other}>
            {t.category}
          </Badge>
        </td>
        <td className="py-2 pr-2">
          <Badge className={PRIORITY_COLORS[t.priority] || PRIORITY_COLORS.low}>
            {t.priority}
          </Badge>
        </td>
        <td className="py-2 pr-2 text-slate-600">{t.summary}</td>
        <td className="py-2 pr-2 text-slate-400">{t.confidence}</td>
        <td className="py-2 pr-2">
          <select
            defaultValue={t.status}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onStatus(e.target.value)}
            className="rounded border border-slate-300 bg-white px-1 py-0.5 text-xs"
          >
            <option value="new">new</option>
            <option value="in-progress">in-progress</option>
            <option value="resolved">resolved</option>
          </select>
        </td>
      </tr>
      {open && (
        <tr className="border-t border-slate-100 bg-slate-50">
          <td colSpan={6} className="p-3 text-sm">
            <p className="mb-2 text-slate-700">
              <span className="font-semibold">Original:</span> {t.raw_text}
            </p>
            <p className="mb-2 whitespace-pre-wrap text-slate-700">
              <span className="font-semibold">Suggested reply:</span> {t.suggested_reply}
            </p>
            <p className="text-xs text-slate-500">
              Entities: {Object.entries(entities || {}).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(', ') || '—'}
            </p>
          </td>
        </tr>
      )}
    </>
  );
}

function Badge({ children, className = '' }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}
