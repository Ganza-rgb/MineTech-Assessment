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
    <div className="min-h-full bg-[#F7F4EF] text-[#252320] font-['Inter']">
      {/* Header */}
      <header className="bg-[#442e24]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <img
              src="/minetech-logo-CAn3P09c.webp"
              alt="MineTech"
              className="h-8 w-auto brightness-0 invert"
            />
            <span className="text-sm font-medium text-[#e6e5aa] hidden sm:inline tracking-wide">
              | Operations Command
            </span>
          </div>

          {/* Desktop tabs */}
          <nav className="hidden md:flex items-center gap-1">
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
          </nav>
        </div>
      </header>

      {/* Mobile tabs */}
      <nav className="md:hidden bg-white border-b border-[#EAE6DF]">
        <div className="mx-auto flex max-w-7xl items-center justify-center gap-1 px-4 py-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                tab === t.id
                  ? 'bg-[#F7F4EF] text-[#252320]'
                  : 'text-[#6E6A63] hover:bg-[#F7F4EF]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Main Layout */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        <ErrorBoundary>
          {tab === 'triage' ? <TriageDashboard /> : <KnowledgeAssistant />}
        </ErrorBoundary>
      </main>
    </div>
  );
}
