'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Loader2, Sparkles } from 'lucide-react';
import { getAIBriefFallbackMessage, type AIBriefPayload } from '@/lib/ai-brief';

/**
 * Shared AI analysis bubble — the button, the loading state, the error note,
 * and the chat-bubble that renders the model's Markdown reply (tables, lists,
 * headings) in official-document styling. Owns the fetch to /api/ai-brief so
 * every surface (priority chart, purok dialog, trigger dialog) behaves the
 * same. State resets whenever `resetKey` changes (e.g. another purok is
 * selected while the dialog stays open).
 */

/** Markdown renderers for the AI bubble — official-document styling, text in ink tokens. */
const MARKDOWN_COMPONENTS: Components = {
  h2: ({ children }) => (
    <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-800 first:mt-0">{children}</p>
  ),
  h3: ({ children }) => (
    <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{children}</p>
  ),
  p: ({ children }) => <p className="mt-2 text-sm leading-relaxed text-slate-700 first:mt-0">{children}</p>,
  ul: ({ children }) => <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-700">{children}</ul>,
  ol: ({ children }) => <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-slate-700">{children}</ol>,
  li: ({ children }) => <li className="text-sm leading-relaxed text-slate-700">{children}</li>,
  strong: ({ children }) => <strong className="font-bold text-slate-950">{children}</strong>,
  table: ({ children }) => (
    <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full border-collapse text-left text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-slate-50">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-slate-200 px-2.5 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border-b border-slate-100 px-2.5 py-2 align-top font-medium text-slate-700">{children}</td>
  ),
  hr: () => <hr className="mt-3 border-slate-200" />,
};

export default function AIAnalysisBubble({
  payload,
  resetKey,
  actionLabel,
  disabled = false,
  disabledNote,
  autoRun = false,
}: {
  payload: AIBriefPayload | null;
  resetKey: string;
  actionLabel: string;
  disabled?: boolean;
  disabledNote?: string;
  /**
   * Fire the analysis once automatically when a fresh `resetKey` arrives with
   * a usable payload — used by the trigger flow, where selecting an incident
   * on the map should surface the recommendation immediately instead of
   * waiting for another click.
   */
  autoRun?: boolean;
}) {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runRef = useRef<() => void>(() => {});
  const autoRunKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setAnalysis(null);
    setError(null);
    setLoading(false);
  }, [resetKey]);

  const run = async () => {
    if (!payload || loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/ai-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.brief) {
        throw new Error(data?.error ?? `Request failed (${response.status})`);
      }
      setAnalysis(data.brief as string);
    } catch (caught) {
      setAnalysis(null);
      setError(getAIBriefFallbackMessage(caught));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runRef.current = () => void run();
  });

  useEffect(() => {
    if (!autoRun || disabled || !payload) return;
    // Once per resetKey: selecting another trigger starts a new analysis, but
    // re-renders of the same trigger never refire the request.
    if (autoRunKeyRef.current === resetKey) return;
    autoRunKeyRef.current = resetKey;
    runRef.current();
  }, [autoRun, disabled, payload, resetKey]);

  return (
    <div className="mt-2">
      {disabled && disabledNote ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          {disabledNote}
        </p>
      ) : (
        <button
          type="button"
          onClick={() => void run()}
          disabled={loading || disabled}
          className="inline-flex items-center gap-1.5 rounded-full bg-cyan-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-cyan-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
          )}
          {loading ? 'Analyzing…' : analysis ? 'Regenerate analysis' : actionLabel}
        </button>
      )}

      {loading ? (
        <div className="mt-2 flex items-center gap-2 rounded-2xl rounded-tl-md border border-cyan-100 bg-cyan-50/70 px-4 py-3 text-sm text-cyan-900">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Analyzing priority data…
        </div>
      ) : null}

      {error ? (
        <p className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="alert">
          {error}
        </p>
      ) : null}

      {analysis ? (
        <div className="mt-2 flex items-start gap-2.5">
          <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-950 text-white" aria-hidden>
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-cyan-100 bg-cyan-50/70 px-4 py-3">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>{analysis}</ReactMarkdown>
          </div>
        </div>
      ) : null}

      <p className="mt-1 text-[10px] text-slate-400">
        Rankings and counts are engine-computed. The AI narrates engine data only — names and resident records never leave this device.
      </p>
    </div>
  );
}
