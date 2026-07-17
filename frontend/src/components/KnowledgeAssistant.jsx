import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { ChatSkeleton } from './Skeletons.jsx';

const SUGGESTIONS = [
  'What should I do if a user is locked out of their account?',
  'How do we handle a suspected data breach?',
  'What is the refund policy for annual plans?',
  'Who do I escalate a security incident to?',
  'Tell me about the safety procedures.',
];

export default function KnowledgeAssistant() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const bottomRef = useRef(null);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  useEffect(() => {
    api.ragStats().then(() => setInitialLoading(false)).catch(() => setInitialLoading(false));
  }, []);

  const send = async (q) => {
    const question = (q ?? input).trim();
    if (!question || loading) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: question }]);
    setLoading(true);
    try {
      const startTime = Date.now();
      const res = await api.ask(question);
      const latency = Date.now() - startTime;
      setMessages((m) => [...m, { role: 'assistant', ...res, latency }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: e.message, error: true }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Ask questions about operations, safety, or technical support.
        </p>
      </div>

      <div className="h-[50vh] min-h-[20rem] max-h-[40rem] space-y-4 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 scroll-smooth">
        {initialLoading ? (
          <ChatSkeleton />
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-slate-400">
            <p className="mb-4">Ask a question about the knowledge base.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((m, i) => (
              <ChatBubble key={i} m={m} />
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-slate-100 px-4 py-2 text-sm text-slate-500">
                  Thinking...
                </div>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="mt-3 flex flex-col sm:flex-row gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Ask a question..."
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button
          onClick={() => send()}
          disabled={loading}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}

function ChatBubble({ m }) {
  const [showContext, setShowContext] = useState(false);

  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl bg-indigo-600 px-4 py-2 text-sm text-white">
          {m.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-800">
        {m.error ? (
          <span className="text-red-600">{m.content}</span>
        ) : (
          <>
            {/* Layer 1: Answer Layer */}
            <div className="whitespace-pre-wrap">{m.content}</div>

            {/* Layer 2: Citation Labels Layer */}
            {m.citations?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {m.citations.map((c) => (
                  <button
                    key={c.chunk_id}
                    onClick={() => setShowContext(!showContext)}
                    className="flex items-center gap-1 rounded-full bg-white px-2 py-1 text-xs font-medium text-indigo-600 shadow-sm border border-indigo-100 hover:bg-indigo-50 transition-colors"
                  >
                    <span className="font-mono font-bold">[{c.index}]</span>
                    <span>{c.document}</span>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                ))}
              </div>
            )}

            {/* Layer 3: Context Preview Dropdown */}
            {showContext && m.citations?.length > 0 && (
              <div className="mt-3 rounded-lg bg-white border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 border-b border-slate-200">
                  📄 Retrieved Source Chunks
                </div>
                <div className="max-h-40 overflow-y-auto">
                  {m.citations.map((c, idx) => (
                    <div key={idx} className="px-3 py-2 text-xs border-b border-slate-100 last:border-0">
                      <span className="font-mono font-semibold text-indigo-600">[{c.index}]</span>
                      <p className="mt-1 text-slate-600">{c.snippet}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Layer 4: Trace Metadata Layer */}
            <div className="mt-3 flex items-center gap-4 text-xs text-slate-400 border-t border-slate-200 pt-2">
              {m.latency && (
                <span>⏱️ Latency: {m.latency}ms</span>
              )}
              {m.confidence !== undefined && m.confidence > 0 && (
                <span>📊 Confidence: {(m.confidence * 100).toFixed(0)}%</span>
              )}
              <span className={`flex items-center gap-1 ${m.grounded ? 'text-green-600' : 'text-yellow-600'}`}>
                {m.grounded ? '✓ Grounded' : '⚠ Ungrounded'}
              </span>
            </div>

            {/* Out of Scope Warning */}
            {m.grounded === false && (
              <div className="mt-3 rounded-lg bg-yellow-50 p-3 text-xs text-yellow-800 border border-yellow-200">
                <div className="flex items-start gap-2">
                  <span className="text-yellow-600">⚠️</span>
                  <div>
                    <p className="font-semibold">Not in Knowledge Base</p>
                    <p className="mt-1 text-yellow-700">
                      This answer is not grounded in the knowledge base. The system could not find relevant information to answer your question.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}