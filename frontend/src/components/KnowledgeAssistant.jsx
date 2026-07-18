import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { ChatSkeleton } from './Skeletons.jsx';

const SUGGESTIONS = [
  'What is MineTech Rwanda?',
  'What sensors are used for hazard prediction?',
  'What is Minetech Trace?',
  'What should I do if ERR-902 is triggered?',
];

export default function KnowledgeAssistant() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const abortRef = useRef(null);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  useEffect(() => {
    api.ragStats().then(() => setInitialLoading(false)).catch(() => setInitialLoading(false));
  }, []);

  const adjustTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  };

  useEffect(() => {
    adjustTextarea();
  }, [input]);

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
      setMessages((m) => [...m, { role: 'assistant', answer: e.message, error: true }]);
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const stop = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setLoading(false);
  };

  const copyToClipboard = async (text, id) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="flex h-[85vh] min-h-[32rem] max-h-[52rem] flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m12.728 0l-.707.707M12 21a9 9 0 100-18 9 9 0 000 18z" />
          </svg>
        </div>
        <div>
          <h1 className="text-sm font-semibold text-slate-900">Knowledge Assistant</h1>
          <p className="text-xs text-slate-500">Ask questions about MineTech operations, safety, or equipment.</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 scroll-smooth">
        {initialLoading ? (
          <div className="flex h-full items-center justify-center">
            <ChatSkeleton />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
              <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
              </svg>
            </div>
            <p className="mb-6 text-sm text-slate-500">Ask a question about the knowledge base.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6">
            {messages.map((m, i) => (
              <ChatBubble
                key={i}
                m={m}
                onCopy={() => copyToClipboard(m.role === 'user' ? m.content : m.answer, i)}
                copied={copiedId === i}
              />
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-500">
                  <TypingDots />
                  <span>Thinking...</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-slate-100 bg-white px-4 py-3">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-100 transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                adjustTextarea();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Ask a question..."
              rows={1}
              className="flex-1 resize-none bg-transparent py-1 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
              style={{ maxHeight: '200px' }}
            />
            {loading ? (
              <button
                onClick={stop}
                className="mb-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                title="Stop generating"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            ) : (
              <button
                onClick={() => send()}
                disabled={!input.trim()}
                className="mb-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-30 transition-colors"
                title="Send"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14m-7-7l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
          <p className="mt-2 text-center text-[10px] text-slate-400">
            Answers are generated from the MineTech Rwanda knowledge base.
          </p>
        </div>
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="flex gap-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:0ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
    </span>
  );
}

function ChatBubble({ m, onCopy, copied }) {
  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="group relative max-w-[85%] rounded-2xl rounded-br-sm bg-indigo-600 px-5 py-3 text-sm text-white shadow-sm">
          <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
          <button
            onClick={onCopy}
            className="absolute -bottom-8 right-1 rounded-md bg-white p-1.5 text-slate-400 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:text-slate-600"
            title="Copy"
          >
            {copied ? (
              <svg className="h-3.5 w-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    );
  }

  const isFallback = m.answer === "I don't have info about that.";

  return (
    <div className="flex justify-start">
      <div className={`group relative max-w-[85%] rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm ${
        isFallback
          ? 'bg-slate-50 text-slate-500 border border-slate-200'
          : m.error
            ? 'bg-red-50 text-red-700 border border-red-100'
            : 'bg-white text-slate-800 border border-slate-200'
      }`}>
        {m.error ? (
          <p className="text-sm leading-relaxed">{m.answer}</p>
        ) : (
          <>
            <p className="text-sm leading-relaxed">{m.answer}</p>

            {!isFallback && m.citations?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {m.citations.map((c, i) => (
                  <span
                    key={i}
                    className="group relative inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 border border-indigo-100 cursor-default"
                  >
                    <span>📄</span>
                    <span>{c.document}</span>
                    <span className="absolute top-full left-0 mt-2 z-20 hidden w-64 rounded-lg bg-white p-3 text-xs text-slate-700 shadow-lg border border-slate-200 group-hover:block">
                      <span className="font-semibold text-slate-900">{c.document}</span>
                      <p className="mt-1 line-clamp-3 text-slate-600">{c.snippet}</p>
                    </span>
                  </span>
                ))}
              </div>
            )}
          </>
        )}

        <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={onCopy}
            className="rounded p-1 text-slate-400 hover:text-slate-600"
            title="Copy"
          >
            {copied ? (
              <svg className="h-3.5 w-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
