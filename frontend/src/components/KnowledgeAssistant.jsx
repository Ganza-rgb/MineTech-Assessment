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
      const res = await api.ask(question);
      setMessages((m) => [...m, { role: 'assistant', ...res }]);
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
        <button
          onClick={() => api.ingest().then(() => window.location.reload())}
          className="rounded bg-slate-100 px-3 py-1 text-xs hover:bg-slate-200"
        >
          Re-ingest KB
        </button>
      </div>

      <div className="h-[28rem] space-y-4 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 scroll-smooth">
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

      <div className="mt-3 flex gap-2">
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
      <div className="max-w-[85%] rounded-2xl bg-slate-100 px-4 py-2 text-sm text-slate-800">
        {m.error ? (
          <span className="text-red-600">{m.content}</span>
        ) : (
          <>
            <p className="whitespace-pre-wrap">{m.content}</p>
            {m.citations?.length > 0 && (
              <div className="mt-2 border-t border-slate-200 pt-2">
                <p className="mb-1 text-xs font-semibold text-slate-500">Sources</p>
                <ul className="space-y-1">
                  {m.citations.map((c) => (
                    <li key={c.chunk_id} className="text-xs text-slate-500">
                      <span className="font-mono text-indigo-600">[{c.index}]</span>{' '}
                      {c.document}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
