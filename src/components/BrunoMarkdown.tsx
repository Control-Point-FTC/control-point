import { useRef, useState, type ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';

/**
 * Shared Markdown renderer for all Bruno surfaces (sidebar panel, full-page
 * view, dashboard bar). Gives code blocks consistent spacing plus a working
 * copy button, renders blockquotes as amber warning callouts so safety
 * notes Bruno writes are easy to spot, and supports GFM (tables, task
 * lists, strikethrough) so spec comparisons don't render as raw pipes.
 */

function CodeBlock({ children }: { children?: ReactNode }) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const text = preRef.current?.innerText ?? '';
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API unavailable (permissions / insecure context) — fallback.
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* noop */ }
      ta.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="relative group/code my-3 rounded-xl overflow-hidden border border-text-base/10">
      <button
        onClick={copy}
        aria-label="Copy code"
        title="Copy code"
        className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-text-base/10 text-text-muted opacity-0 group-hover/code:opacity-100 focus-visible:opacity-100 hover:text-text-base hover:bg-text-base/20 transition-all"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
      <pre
        ref={preRef}
        className="bg-black/40 px-4 py-3 overflow-x-auto text-[12.5px] leading-relaxed custom-scrollbar"
      >
        {children}
      </pre>
    </div>
  );
}

function Callout({ children }: { children?: ReactNode }) {
  return (
    <blockquote className="border-l-2 border-amber-400/70 bg-amber-400/[0.07] rounded-r-xl px-3.5 py-2.5 my-3 text-text-base/85 [&>p]:my-1">
      {children}
    </blockquote>
  );
}

function GfmTable({ children }: { children?: ReactNode }) {
  return (
    <div className="my-3 overflow-x-auto rounded-xl border border-text-base/10 custom-scrollbar">
      <table className="w-full text-[13px] border-collapse">{children}</table>
    </div>
  );
}

export function BrunoMarkdown({ children, className }: { children: string; className?: string }) {
  return (
    // Trim first/last block margins so bubbles hug the text evenly, like
    // big-company chat UIs — rigid, equally-spaced vertical rhythm.
    <div className={`${className || ''} [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 text-[14px] leading-7`}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: CodeBlock as any,
          blockquote: Callout as any,
          table: GfmTable as any,
          th: ({ children }: any) => (
            <th className="bg-text-base/[0.06] text-text-base font-bold text-left px-3 py-2 border-b border-text-base/10 whitespace-nowrap">
              {children}
            </th>
          ),
          td: ({ children }: any) => (
            <td className="px-3 py-2 border-b border-text-base/[0.06] text-text-base/85 align-top">
              {children}
            </td>
          ),
          // Tighter rhythm for lists/paragraphs so long answers breathe.
          p: ({ children }: any) => <p className="my-2 leading-relaxed">{children}</p>,
          ul: ({ children }: any) => <ul className="my-2 ml-4 list-disc space-y-1">{children}</ul>,
          ol: ({ children }: any) => <ol className="my-2 ml-4 list-decimal space-y-1">{children}</ol>,
          li: ({ children }: any) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }: any) => <strong className="font-bold text-text-base">{children}</strong>,
          h1: ({ children }: any) => <h1 className="font-display text-lg font-bold text-text-base mt-4 mb-2">{children}</h1>,
          h2: ({ children }: any) => <h2 className="font-display text-base font-bold text-text-base mt-4 mb-2">{children}</h2>,
          h3: ({ children }: any) => <h3 className="text-sm font-bold text-text-base mt-3 mb-1.5">{children}</h3>,
          hr: () => <hr className="my-4 border-text-base/10" />,
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}
