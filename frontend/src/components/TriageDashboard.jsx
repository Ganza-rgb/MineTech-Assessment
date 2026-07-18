import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { TicketSkeleton } from './Skeletons.jsx';

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
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  const loadTickets = async () => {
    try {
      setTicketsLoading(true);
      setTickets(await api.listTickets(filters));
    } catch (e) {
      setError(e.message);
    } finally {
      setTicketsLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, [filters.category, filters.priority, filters.status, filters.q]);

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
      <section className="space-y-4">
        <div className="rounded-2xl border border-[#EAE6DF] bg-white p-5">
          <label className="mb-2 block text-sm font-medium text-[#252320] tracking-tight">
            Paste an inbound message (ticket / feedback)
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            className="w-full rounded-xl border border-[#EAE6DF] bg-[#F7F4EF] p-3 text-sm text-[#252320] placeholder:text-[#6E6A63] focus:border-[#5C2E0B] focus:outline-none focus:ring-1 focus:ring-[#5C2E0B] transition-colors"
            placeholder="e.g. URGENT: the dashboard is down and we are locked out…"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {SAMPLES.map((s, i) => (
              <button
                key={i}
                onClick={() => setText(s)}
                className="rounded-full border border-[#EAE6DF] bg-white px-3 py-1.5 text-xs text-[#6E6A63] hover:border-[#5C2E0B] hover:text-[#5C2E0B] transition-colors"
              >
                Sample {i + 1}
              </button>
            ))}
          </div>
          <button
            onClick={runTriage}
            disabled={loading || !text.trim()}
            className="mt-4 rounded-xl bg-[#5C2E0B] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#4A2408] transition-colors disabled:opacity-40"
          >
            {loading ? 'Triaging…' : 'Run triage'}
          </button>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>

        {latest && (
          <ResultCard result={latest} />
        )}
      </section>

      <section className="rounded-2xl border border-[#EAE6DF] bg-white p-5">
        <div className="mb-3 flex flex-wrap gap-2">
          <select
            value={filters.category}
            onChange={(e) => setFilters({ ...filters, category: e.target.value })}
            className="rounded-lg border border-[#EAE6DF] bg-[#F7F4EF] px-3 py-1.5 text-sm text-[#252320] focus:border-[#5C2E0B] focus:outline-none focus:ring-1 focus:ring-[#5C2E0B] transition-colors"
          >
            <option value="">All categories</option>
            {Object.keys(CATEGORY_COLORS).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={filters.priority}
            onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
            className="rounded-lg border border-[#EAE6DF] bg-[#F7F4EF] px-3 py-1.5 text-sm text-[#252320] focus:border-[#5C2E0B] focus:outline-none focus:ring-1 focus:ring-[#5C2E0B] transition-colors"
          >
            <option value="">All priorities</option>
            {Object.keys(PRIORITY_COLORS).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="rounded-lg border border-[#EAE6DF] bg-[#F7F4EF] px-3 py-1.5 text-sm text-[#252320] focus:border-[#5C2E0B] focus:outline-none focus:ring-1 focus:ring-[#5C2E0B] transition-colors"
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
            className="flex-1 rounded-lg border border-[#EAE6DF] bg-[#F7F4EF] px-3 py-1.5 text-sm text-[#252320] placeholder:text-[#6E6A63] focus:border-[#5C2E0B] focus:outline-none focus:ring-1 focus:ring-[#5C2E0B] transition-colors"
          />
          <button
            onClick={loadTickets}
            className="rounded-lg border border-[#EAE6DF] bg-white px-4 py-1.5 text-sm font-medium text-[#252320] hover:border-[#5C2E0B] hover:text-[#5C2E0B] transition-colors"
          >
            Refresh
          </button>
        </div>

        <div className="overflow-y-auto overflow-x-auto max-h-[32rem]">
          <table className="w-full table-fixed text-left text-sm">
            <colgroup>
              <col className="w-12" />
              <col className="w-28" />
              <col className="w-16" />
              <col className="w-auto" />
              <col className="w-14" />
              <col className="w-32" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-white text-xs uppercase text-[#6E6A63] tracking-wide">
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
              {ticketsLoading ? (
                Array.from({ length: 5 }).map((_, i) => <TicketSkeleton key={i} />)
              ) : tickets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-[#6E6A63]">
                    No tickets yet — run a triage.
                  </td>
                </tr>
              ) : (
                tickets.map((t) => (
                  <TicketRow
                    key={t.id}
                    t={t}
                    open={expanded === t.id}
                    onToggle={() => setExpanded(expanded === t.id ? null : t.id)}
                    onStatus={(s) =>
                      api.updateTicket(t.id, s).then(loadTickets)
                    }
                  />
                ))
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
    <div className="rounded-2xl border border-[#EAE6DF] bg-white p-5">
      <div className="mb-3 flex items-center gap-2">
        <Badge className={CATEGORY_COLORS[result.category] || CATEGORY_COLORS.other}>
          {result.category}
        </Badge>
        <Badge className={PRIORITY_COLORS[result.priority] || PRIORITY_COLORS.low}>
          {result.priority}
        </Badge>
        <span className="text-xs text-[#6E6A63]">
          {result.sentiment} · conf {result.confidence}
        </span>
        {result.meta?.repaired && (
          <span className="rounded-full bg-[#F7F4EF] px-2 py-0.5 text-xs text-[#5C2E0B] border border-[#EAE6DF]">
            repaired output
          </span>
        )}
      </div>
      <p className="text-sm font-medium text-[#252320]">{result.summary}</p>
      <p className="mt-1 text-xs text-[#6E6A63] leading-relaxed tracking-wide">{result.priority_reason}</p>
      <div className="mt-3 rounded-xl bg-[#F7F4EF] p-3 text-sm whitespace-pre-wrap text-[#252320]">
        {result.suggested_reply}
      </div>
      <pre className="mt-3 overflow-auto rounded-xl bg-[#252320] p-3 text-xs text-[#e6e5aa]">
        {JSON.stringify(result, null, 2)}
      </pre>
    </div>
  );
}

function TicketRow({ t, open, onToggle, onStatus }) {
  let entities = null;
  if (typeof t.key_entities === 'string') {
    try {
      entities = JSON.parse(t.key_entities);
    } catch {
      entities = null;
    }
  } else {
    entities = t.key_entities;
  }
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-t border-[#EAE6DF] hover:bg-[#F7F4EF] transition-colors"
      >
        <td className="py-2 pr-2 text-[#6E6A63]">{t.id}</td>
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
        <td className="py-2 pr-2 text-[#252320] truncate">{t.summary}</td>
        <td className="py-2 pr-2 text-[#6E6A63]">{t.confidence}</td>
        <td className="py-2 pr-2">
          <select
            defaultValue={t.status}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onStatus(e.target.value)}
            className="rounded-lg border border-[#EAE6DF] bg-white px-2 py-0.5 text-xs text-[#252320] focus:border-[#5C2E0B] focus:outline-none focus:ring-1 focus:ring-[#5C2E0B] transition-colors"
          >
            <option value="new">new</option>
            <option value="in-progress">in-progress</option>
            <option value="resolved">resolved</option>
          </select>
        </td>
      </tr>
      {open && (
        <tr className="border-t border-[#EAE6DF] bg-[#F7F4EF]">
          <td colSpan={6} className="p-3 text-sm">
            <p className="mb-2 text-[#252320]">
              <span className="font-semibold">Original:</span> {t.raw_text}
            </p>
            <p className="mb-2 whitespace-pre-wrap text-[#252320]">
              <span className="font-semibold">Suggested reply:</span> {t.suggested_reply}
            </p>
            <p className="text-xs text-[#6E6A63] tracking-wide">
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
