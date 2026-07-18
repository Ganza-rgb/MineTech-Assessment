import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { TicketSkeleton } from './Skeletons.jsx';

const SAMPLES = [
  'Gas alert flagged at Rutongo Shaft 3 by sensor telemetry node SN-902. Shifter noted ventilation issues. Ops team needs to know if worker RSSB logs are cleared for emergency shift changes.',
  'Excavator unit EXV-402 has blown its hydraulic lines again during active extraction in Zone A. No sensor errors tripped but the vehicle is completely immobilized blocking the haul path.',
];

const CATEGORY_COLORS = {
  'Occupational Safety': 'bg-red-100 text-red-700',
  'Fleet Equipment': 'bg-amber-100 text-amber-700',
  'Regulatory Compliance': 'bg-indigo-100 text-indigo-700',
  'Geology & Lab': 'bg-emerald-100 text-emerald-700',
};
const PRIORITY_COLORS = {
  Critical: 'bg-red-700 text-white',
  High: 'bg-orange-600 text-white',
  Medium: 'bg-yellow-500 text-yellow-900',
  Low: 'bg-slate-300 text-slate-700',
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

        <div className="overflow-y-auto overflow-x-auto max-h-[32rem]">
          <table className="w-full table-fixed text-left text-sm">
            <colgroup>
              <col className="w-12" />
              <col className="w-36" />
              <col className="w-16" />
              <col className="w-28" />
              <col className="w-auto" />
              <col className="w-28" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-white text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2 pr-2">#</th>
                <th className="py-2 pr-2">Category</th>
                <th className="py-2 pr-2">Priority</th>
                <th className="py-2 pr-2">Equipment</th>
                <th className="py-2 pr-2">Suggested Reply</th>
                <th className="py-2 pr-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {ticketsLoading ? (
                Array.from({ length: 5 }).map((_, i) => <TicketSkeleton key={i} />)
              ) : tickets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
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
  const fields = result.extracted_fields || {};
  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Badge className={CATEGORY_COLORS[result.category] || 'bg-slate-100 text-slate-700'}>
          {result.category}
        </Badge>
        <Badge className={PRIORITY_COLORS[result.priority] || 'bg-slate-300 text-slate-700'}>
          {result.priority}
        </Badge>
        {result.meta?.repaired && (
          <span className="rounded bg-amber-200 px-2 py-0.5 text-xs text-amber-800">
            repaired output
          </span>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div><span className="font-semibold text-slate-600">Site:</span> {fields.site_location || '—'}</div>
        <div><span className="font-semibold text-slate-600">Equipment:</span> {fields.equipment_id || '—'}</div>
        <div><span className="font-semibold text-slate-600">RSSB Clearance:</span> {fields.rssb_clearance_required ? 'Yes' : 'No'}</div>
        <div><span className="font-semibold text-slate-600">Sensor Codes:</span> {(fields.sensor_error_codes || []).join(', ') || '—'}</div>
      </div>
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
  const fields = typeof t.extracted_fields === 'string' ? JSON.parse(t.extracted_fields) : t.extracted_fields;
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
      >
        <td className="py-2 pr-2 text-slate-400">{t.id}</td>
        <td className="py-2 pr-2">
          <Badge className={CATEGORY_COLORS[t.category] || 'bg-slate-100 text-slate-700'}>
            {t.category}
          </Badge>
        </td>
        <td className="py-2 pr-2">
          <Badge className={PRIORITY_COLORS[t.priority] || 'bg-slate-300 text-slate-700'}>
            {t.priority}
          </Badge>
        </td>
        <td className="py-2 pr-2 text-slate-600 truncate">{fields?.equipment_id || '—'}</td>
        <td className="py-2 pr-2 text-slate-600 truncate">{t.suggested_reply || '—'}</td>
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
              Site: {fields?.site_location || '—'} · RSSB: {fields?.rssb_clearance_required ? 'Yes' : 'No'} · Sensors: {(fields?.sensor_error_codes || []).join(', ') || '—'}
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
