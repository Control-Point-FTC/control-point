// Modern Bruno building blocks: the composer (attachments, Stop), a model
// message (markdown, proposal card, NavGPT handoff), the proposal card and
// the live reply (thinking steps → streaming text with a caret).
import { memo, useEffect, useMemo, useRef } from 'react';
import { motion } from 'motion/react';
import { ArrowUp, Check, FileText, ImagePlus, Loader2, Square, X } from 'lucide-react';
import { cn } from '../../../components/cn';
import { Button } from '../../../components/ui-kit';
import { BrunoMarkdown } from '../../../components/BrunoMarkdown';
import BrunoIcon from '../../../components/BrunoIcon';
import { extractActionProposals, stripEventBlocks, stripSwitchBlock, type ActionProposal } from '../../../services/aiService';
import { KIND_META, itemSummary, type ProposalStatus } from '../../../components/ActionProposalCard';
import { useProposalContext } from '../../../services/proposalContext';
import { extractNotebookOps } from '../../../services/notebookProposals';
import { NotebookProposalCard } from '../../../components/bruno/NotebookProposalCard';
import {
  AttachedImageStrip, AttachedPdfStrip, filesToAttachedImages, filesToAttachedPdfs, imagesFromPaste,
  MAX_BRUNO_IMAGES, MAX_BRUNO_PDFS, type AttachedImage, type AttachedPdf,
} from '../../../components/BrunoImageAttach';
import { BrunoThinking, StreamingCaret } from '../../../components/bruno/BrunoThinking';
import { inEpoch } from '../../drafts';
import type { LiveThink } from '../../../components/bruno/useBrunoConversation';

export function BrunoAvatar({ className }: { className?: string }) {
  return (
    <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent', className)}>
      <BrunoIcon className="size-4" />
    </span>
  );
}

export function BrunoComposer({ value, onChange, onSend, onStop, busy, attached, setAttached, attachedPdfs, setAttachedPdfs, placeholder, autoFocus, compact, tools }: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
  attached: AttachedImage[];
  setAttached: (fn: (p: AttachedImage[]) => AttachedImage[]) => void;
  attachedPdfs: AttachedPdf[];
  setAttachedPdfs: (fn: (p: AttachedPdf[]) => AttachedPdf[]) => void;
  placeholder?: string;
  autoFocus?: boolean;
  compact?: boolean;
  /** Extra controls beside the attach buttons (the side panel's answer length). */
  tools?: React.ReactNode;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, compact ? 140 : 220)}px`;
  }, [value, compact]);
  const canSend = !busy && (!!value.trim() || attached.length > 0 || attachedPdfs.length > 0);
  const addImages = (imgs: AttachedImage[]) => { if (imgs.length) setAttached((p) => [...p, ...imgs].slice(0, MAX_BRUNO_IMAGES)); };
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (canSend) onSend(); }}
      className="rounded-2xl border border-border bg-card shadow-sm transition-colors focus-within:border-ring/60"
    >
      {(attached.length > 0 || attachedPdfs.length > 0) && (
        <div className="px-3 pt-3">
          <AttachedImageStrip images={attached} onRemove={(idx) => setAttached((p) => p.filter((_, j) => j !== idx))} />
          <AttachedPdfStrip pdfs={attachedPdfs} onRemove={(idx) => setAttachedPdfs((p) => p.filter((_, j) => j !== idx))} />
        </div>
      )}
      <textarea
        ref={ref}
        rows={1}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onPaste={(e) => { void imagesFromPaste(e).then(inEpoch(addImages)); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (canSend) onSend();
          }
        }}
        placeholder={placeholder || 'Ask Bruno anything…'}
        aria-label="Message Bruno"
        className="block w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
      />
      <div className="flex items-center gap-1 px-2 pb-2">
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void filesToAttachedImages(e.target.files || []).then(inEpoch(addImages)); e.target.value = ''; }} />
        <input ref={pdfRef} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={(e) => { void filesToAttachedPdfs(e.target.files || []).then(inEpoch((pdfs: AttachedPdf[]) => setAttachedPdfs((p) => [...p, ...pdfs].slice(0, MAX_BRUNO_PDFS)))); e.target.value = ''; }} />
        <Button type="button" variant="ghost" size="icon" className="text-muted-foreground" aria-label="Attach screenshots" title={attached.length >= MAX_BRUNO_IMAGES ? `Maximum ${MAX_BRUNO_IMAGES} screenshots` : 'Attach screenshots'} disabled={busy || attached.length >= MAX_BRUNO_IMAGES} onClick={() => fileRef.current?.click()}><ImagePlus /></Button>
        <Button type="button" variant="ghost" size="icon" className="text-muted-foreground" aria-label="Attach a PDF" title={attachedPdfs.length >= MAX_BRUNO_PDFS ? `Maximum ${MAX_BRUNO_PDFS} PDFs` : 'Attach a PDF'} disabled={busy || attachedPdfs.length >= MAX_BRUNO_PDFS} onClick={() => pdfRef.current?.click()}><FileText /></Button>
        {tools}
        {/* A spacer keeps Send at the right edge whether or not the hint shows;
            the side panel shows its own tip line, so compact hides the hint. */}
        <span className="flex-1" aria-hidden="true" />
        <span className={cn('hidden px-2 text-xs text-muted-foreground', !compact && 'sm:inline')}>{busy ? 'Bruno is replying…' : 'Shift+Enter for a new line'}</span>
        {busy ? (
          <Button type="button" size="icon" variant="secondary" className="rounded-full" onClick={onStop} aria-label="Stop generating" title="Stop generating"><Square className="fill-current" /></Button>
        ) : (
          <Button type="submit" size="icon" className="rounded-full" disabled={!canSend} aria-label="Send"><ArrowUp /></Button>
        )}
      </div>
    </form>
  );
}

export function ProposalCard({ proposals, status, error, onConfirm, onDismiss }: {
  proposals: ActionProposal[]; status: ProposalStatus; error?: string; onConfirm: () => void; onDismiss: () => void;
}) {
  useProposalContext(); // re-render once the team's roster and today load
  const total = proposals.reduce((n, p) => n + p.items.length, 0);
  const destructive = proposals.some((p) => KIND_META[p.kind]?.destructive);
  if (status === 'done') {
    return (
      <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-3 flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
        <Check className="size-4" /> {destructive ? `Deleted ${total} ${total === 1 ? 'item' : 'items'}` : `Added ${total} ${total === 1 ? 'item' : 'items'}`}
      </motion.p>
    );
  }
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn('mt-3 overflow-hidden rounded-xl border bg-card', destructive ? 'border-destructive/40' : 'border-border')}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <p className="text-sm font-medium">{destructive ? `Delete ${total} ${total === 1 ? 'item' : 'items'}?` : `Add ${total} ${total === 1 ? 'item' : 'items'}?`}</p>
        <Button variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={onDismiss}><X /></Button>
      </div>
      <div className="max-h-60 space-y-3 overflow-y-auto px-4 py-3">
        {proposals.map((p) => {
          const meta = KIND_META[p.kind];
          const Icon = meta.icon;
          return (
            <div key={p.kind}>
              <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Icon className="size-3.5" /> {meta.label} · {p.items.length}</p>
              <ul className="space-y-1">{p.items.map((it, i) => <li key={i} className="text-sm leading-snug">{itemSummary(p.kind, it)}</li>)}</ul>
            </div>
          );
        })}
      </div>
      {status === 'error' && error && <p className="px-4 pb-2 text-sm text-destructive" role="alert">{error}</p>}
      <div className="flex justify-end gap-2 border-t border-border px-4 py-2.5">
        <Button variant="ghost" size="sm" onClick={onDismiss}>Not now</Button>
        <Button size="sm" variant={destructive ? 'destructive' : 'default'} onClick={onConfirm} disabled={status === 'confirming'}>
          {status === 'confirming' && <Loader2 className="animate-spin" />}
          {destructive ? `Delete all ${total}` : `Add all ${total}`}
        </Button>
      </div>
    </motion.div>
  );
}

/** One complete Bruno reply. Memoized: parsing runs once per distinct text. */
export const BrunoReply = memo(function BrunoReply({ text, index, isLastModel, busy, proposal, switchDismissed, onConfirmProposals, onDismissProposal, onSwitchToBruno, onDismissSwitch, think }: {
  text: string; index: number; isLastModel: boolean; busy: boolean;
  /** Finished reply's thinking record — shown collapsed as "Thought for Ns". */
  think?: LiveThink | null;
  proposal: { status: ProposalStatus; error?: string } | undefined; switchDismissed: boolean;
  onConfirmProposals: (index: number, proposals: ActionProposal[]) => void; onDismissProposal: (index: number) => void;
  onSwitchToBruno: () => void; onDismissSwitch: (index: number) => void;
}) {
  const proposals = useMemo(() => (text ? extractActionProposals(text) : []), [text]);
  const switchTo = useMemo(() => (text ? stripSwitchBlock(text).switchTo : null), [text]);
  const notebookOps = useMemo(() => (text ? extractNotebookOps(text) : []), [text]);
  const status = proposal?.status || 'pending';
  return (
    <div className="flex gap-3">
      <BrunoAvatar className="mt-0.5" />
      <div className="min-w-0 flex-1 text-sm leading-relaxed">
        {think && <BrunoThinking steps={think.steps} startedAt={think.startedAt} thoughtMs={think.thoughtMs} phase="done" />}
        <div><BrunoMarkdown>{stripEventBlocks(text)}</BrunoMarkdown></div>
        {proposals.length > 0 && status !== 'dismissed' && (
          <ProposalCard proposals={proposals} status={status} error={proposal?.error} onConfirm={() => onConfirmProposals(index, proposals)} onDismiss={() => onDismissProposal(index)} />
        )}
        {notebookOps.length > 0 && <NotebookProposalCard ops={notebookOps} />}
        {isLastModel && switchTo === 'bruno' && !switchDismissed && !busy && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={onSwitchToBruno}>Yes, switch to Bruno</Button>
            <Button size="sm" variant="ghost" onClick={() => onDismissSwitch(index)}>Nah, stay here</Button>
          </div>
        )}
      </div>
    </div>
  );
});

export function UserTurn({ text, images, pdfs }: { text: string; images?: number; pdfs?: number }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-muted px-4 py-2.5 text-sm leading-relaxed">
        <p className="whitespace-pre-wrap break-words">{text}</p>
        {(images || pdfs) ? <p className="mt-1 text-xs text-muted-foreground">{[images ? `${images} screenshot${images === 1 ? '' : 's'}` : '', pdfs ? `${pdfs} PDF${pdfs === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}</p> : null}
      </div>
    </div>
  );
}

/** The reply being generated: thinking steps, then streamed text + caret. */
export function LiveReply({ text, liveThink }: { text: string; liveThink: LiveThink | null }) {
  return (
    <div className="flex gap-3" aria-live="polite">
      <BrunoAvatar className="mt-0.5" />
      <div className="min-w-0 flex-1 text-sm leading-relaxed">
        {liveThink && <BrunoThinking steps={liveThink.steps} startedAt={liveThink.startedAt} thoughtMs={liveThink.thoughtMs} phase={text ? 'generating' : 'thinking'} />}
        {text && <div><BrunoMarkdown>{stripEventBlocks(text)}</BrunoMarkdown><StreamingCaret /></div>}
      </div>
    </div>
  );
}
