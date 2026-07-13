import { useEffect, useState } from 'react';
import { api } from './api.js';
import TriageDashboard from './components/TriageDashboard.jsx';
import KnowledgeAssistant from './components/KnowledgeAssistant.jsx';

const TABS = [
  { id: 'triage', label: 'Smart Intake Triage' },
  { id: 'rag', label: 'Knowledge Assistant' },
];

export default function App() {
  const [tab, setTab] = useState('triage');
  const [health, setHealth] = useState(null);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null));
  }, []);

  return (
    <div className="min-h-full bg-slate-50 text-slate-800">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              MineTech | Operations Command
            </h1>
            <p className="text-xs text-slate-500">
              Open-source LLM (Hugging Face) · no commercial APIs
            </p>
          </div>
          <HealthPill health={health} />
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 px-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`border-b-2 px-3 py-2 text-sm font-medium transition ${
                tab === t.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {tab === 'triage' ? <TriageDashboard /> : <KnowledgeAssistant />}
      </main>

      <footer className="mx-auto max-w-6xl px-4 py-8 text-center text-xs text-slate-400">
        Model served locally via Transformers.js · Data stored in MySQL
      </footer>
    </div>
  );
}

function HealthPill({ health }) {
  if (!health) {
    return (
      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
        backend offline
      </span>
    );
  }
  const mode = health.ai?.mode;
  const isHf = mode === 'hf';
  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className={`rounded-full px-3 py-1 font-medium ${
          isHf ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
        }`}
      >
        {isHf ? 'LLM: self-hosted' : 'LLM: offline mock'}
      </span>
      <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600">
        KB: {health.knowledge?.documents ?? 0} docs · {health.knowledge?.chunks ?? 0} chunks
      </span>
    </div>
  );
}
