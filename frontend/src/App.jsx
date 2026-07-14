import { useEffect, useState } from 'react';
import { api } from './api.js';
import TriageDashboard from './components/TriageDashboard.jsx';
import KnowledgeAssistant from './components/KnowledgeAssistant.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

const TABS = [
  { id: 'triage', label: 'Smart Intake Triage' },
  { id: 'rag', label: 'Knowledge Assistant' },
];

export default function App() {
  const [tab, setTab] = useState('triage');
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.health()
      .then(setHealth)
      .catch(() => setHealth(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-full bg-slate-50 text-slate-800">
      <header className="bg-[#442e24]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <img
              src="/minetech-logo-CAn3P09c.webp"
              alt="MineTech"
              className="h-9 w-auto brightness-0 invert"
            />
            <span className="text-sm font-medium text-[#e6e5aa] hidden sm:inline">
              Operations Command
            </span>
          </div>

          <nav className="flex items-center gap-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                  tab === t.id
                    ? 'bg-white/10 text-white'
                    : 'text-[#e6e5aa]/70 hover:bg-white/5 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
            <HealthPill health={health} loading={loading} />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <ErrorBoundary>
          {tab === 'triage' ? <TriageDashboard /> : <KnowledgeAssistant />}
        </ErrorBoundary>
      </main>

      <footer className="mx-auto max-w-6xl px-4 py-8 text-center text-xs text-slate-400">
        Model served via Hugging Face Inference API · Data stored in MySQL
      </footer>
    </div>
  );
}

function HealthPill({ health, loading }) {
  if (loading) {
    return (
      <span className="ml-3 hidden md:inline-flex rounded-full bg-white/5 px-3 py-1 text-xs font-medium text-[#e6e5aa]/50">
        connecting...
      </span>
    );
  }
  if (!health) {
    return (
      <span className="ml-3 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-200">
        backend offline
      </span>
    );
  }
  const mode = health.ai?.mode;
  const docs = health.knowledge?.documents ?? 0;
  const chunks = health.knowledge?.chunks ?? 0;

  return (
    <span className="ml-3 hidden md:inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-[#e6e5aa]">
      {mode === 'hf' ? 'LLM: self-hosted' : mode === 'cloud' ? 'LLM: cloud' : 'LLM: offline mock'} · {docs} docs · {chunks} chunks
    </span>
  );
}
