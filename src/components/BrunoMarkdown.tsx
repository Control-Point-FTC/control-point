import { useRef, useState, type ReactNode } from 'react';
import Markdown from 'react-markdown';
import { Check, Copy } from 'lucide-react';

/**
 * Shared Markdown renderer for all Bruno surfaces (sidebar panel, full-page
 * view, dashboard bar). Gives code blocks consistent spacing plus a working
 * copy button, and renders blockquotes as amber warning callouts so safety
 * notes Bruno writes are easy to spot.
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

export function BrunoMarkdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={className}>
      <Markdown components={{ pre: CodeBlock as any, blockquote: Callout as any }}>
        {children}
      </Markdown>
    </div>
  );
}
