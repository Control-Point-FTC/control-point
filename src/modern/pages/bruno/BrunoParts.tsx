// Modern Bruno building blocks: the composer (attachments, Stop), a model
// message (markdown, proposal card, NavGPT handoff), the proposal card and
// the live reply (thinking steps → streaming text with a caret).
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, ArrowUp, Check, Loader2, Paperclip, Square, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ResultLink } from '../../../components/bruno/resultLinks';
import { cn } from '../../../components/cn';
import { Button } from '../../../components/ui-kit';
import { BrunoMarkdown } from '../../../components/BrunoMarkdown';
import BrunoIcon from '../../../components/BrunoIcon';
import { extractActionProposals, stripEventBlocks, stripSwitchBlock, type ActionProposal } from '../../../services/aiService';
import { KIND_META, itemSummary, proposalVerb, type ProposalStatus } from '../../../components/ActionProposalCard';
import { itemRemoves } from '../../../components/bruno/autoApply';
import { useProposalContext, useTaskIndex } from '../../../services/proposalContext';
import { extractNotebookOps, extractStickyOps } from '../../../services/notebookProposals';
import { NotebookProposalCard } from '../../../components/bruno/NotebookProposalCard';
import {
  AttachmentStrip, attachPicked, BRUNO_ACCEPT, dragHasFiles, filesFromPaste, SentAttachments,
  type AttachedFile, type AttachedImage, type SavedAttachment,
} from '../../../components/BrunoImageAttach';
import { splitBrunoMessage } from '../../../utils/brunoFiles';
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

export function BrunoComposer({ value, onChange, onSend, onStop, busy, attached, setAttached, attachedFiles, setAttachedFiles, placeholder, autoFocus, compact, tools }: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
  attached: AttachedImage[];
  setAttached: (fn: (p: AttachedImage[]) => AttachedImage[]) => void;
  /** PDFs and text / code files. */
  attachedFiles: AttachedFile[];
  setAttachedFiles: (fn: (p: AttachedFile[]) => AttachedFile[]) => void;
  placeholder?: string;
  autoFocus?: boolean;
  compact?: boolean;
  /** Extra controls beside the attach buttons (the side panel's answer length). */
  tools?: React.ReactNode;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  // The latest attachments, for files that finish reading after more were added.
  const latest = useRef({ images: attached, files: attachedFiles });
  latest.current = { images: attached, files: attachedFiles };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, compact ? 140 : 220)}px`;
  }, [value, compact]);
  const canSend = !busy && (!!value.trim() || attached.length > 0 || attachedFiles.length > 0);
  // Picked, dropped or pasted: several at once, all kinds together.
  const addFiles = (list: FileList | File[]) => attachPicked(list, () => latest.current, inEpoch((imgs: AttachedImage[], files: AttachedFile[]) => {
    if (imgs.length) setAttached((p) => [...p, ...imgs]);
    if (files.length) setAttachedFiles((p) => [...p, ...files]);
  }));
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (canSend) onSend(); }}
      onDragEnter={(e) => { if (dragHasFiles(e)) { e.preventDefault(); setDragging(true); } }}
      onDragOver={(e) => { if (dragHasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={(e) => {
        if (!dragHasFiles(e)) return;
        e.preventDefault();
        setDragging(false);
        void addFiles(e.dataTransfer.files);
      }}
      className={cn('relative rounded-2xl border border-border bg-card shadow-sm transition-colors focus-within:border-ring/60', dragging && 'border-accent ring-2 ring-accent/30')}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-card/90 text-sm font-medium text-accent">
          Drop files to attach them
        </div>
      )}
      {(attached.length > 0 || attachedFiles.length > 0) && (
        <div className="px-3 pt-3">
          <AttachmentStrip
            images={attached}
            files={attachedFiles}
            onRemoveImage={(idx) => setAttached((p) => p.filter((_, j) => j !== idx))}
            onRemoveFile={(idx) => setAttachedFiles((p) => p.filter((_, j) => j !== idx))}
          />
        </div>
      )}
      <textarea
        ref={ref}
        rows={1}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onPaste={(e) => {
          // Screenshots and copied files attach; pasted text goes in as typed.
          const files = filesFromPaste(e);
          if (files.length) { if (!e.clipboardData.getData('text/plain')) e.preventDefault(); void addFiles(files); }
        }}
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
        <input ref={fileRef} type="file" accept={BRUNO_ACCEPT} multiple className="hidden" aria-hidden="true" tabIndex={-1} onChange={(e) => { const list = Array.from(e.target.files || []); e.target.value = ''; void addFiles(list); }} />
        <Button type="button" variant="ghost" size="icon" className="text-muted-foreground" aria-label="Attach files" title="Attach files: images, PDFs, text and code (or drop or paste them here)" disabled={busy} onClick={() => fileRef.current?.click()}><Paperclip /></Button>
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

export function ProposalCard({ proposals, status, error, onConfirm, onDismiss, links = [] }: {
  proposals: ActionProposal[]; status: ProposalStatus; error?: string; onConfirm: () => void; onDismiss: () => void;
  /** After applying: where to see the changes ("View task"). */
  links?: ResultLink[];
}) {
  useProposalContext(); // re-render once the team's roster and today load
  const total = proposals.reduce((n, p) => n + p.items.length, 0);
  const destructive = proposals.some((p) => KIND_META[p.kind]?.destructive);
  useTaskIndex(status !== 'done' && status !== 'dismissed' && proposals.some((p) => p.kind === 'task-update'));
  const verb = proposalVerb(proposals);
  const items = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`;
  if (status === 'done') {
    return (
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-3 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
        <p className="flex items-center gap-2"><Check className="size-4" /> {verb.done} {items(total)}</p>
        {links.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {links.map((l) => <Link key={l.to} to={l.to} className="inline-flex items-center gap-1 rounded-md border border-success/40 px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-success/15">{l.label}<ArrowRight className="size-3.5" /></Link>)}
          </div>
        )}
      </motion.div>
    );
  }
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn('mt-3 overflow-hidden rounded-xl border bg-card', destructive ? 'border-destructive/40' : 'border-border')}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <p className="text-sm font-medium">{verb.ask} {items(total)}?</p>
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
          {verb.ask} all {total}
        </Button>
      </div>
    </motion.div>
  );
}

/** One complete Bruno reply. Memoized: parsing runs once per distinct text. */
export const BrunoReply = memo(function BrunoReply({ conversation, text, index, isLastModel, busy, proposal, switchDismissed, onConfirmProposals, onDismissProposal, onSwitchToBruno, onDismissSwitch, think, autoApply = false, onAsk }: {
  /** Auto-apply is on and this reply just finished here: apply its changes without the click (never deletions). */
  autoApply?: boolean;
  /** Send a message in this chat (used by a card's "Ask Bruno to redo it"). */
  onAsk?: (text: string) => void;
  /** Conversation identity for notebook proposal cards (see conversationScope). */
  conversation: string;
  text: string; index: number; isLastModel: boolean; busy: boolean;
  /** Finished reply's thinking record — shown collapsed as "Thought for Ns". */
  think?: LiveThink | null;
  proposal: { status: ProposalStatus; error?: string; links?: ResultLink[] } | undefined; switchDismissed: boolean;
  onConfirmProposals: (index: number, proposals: ActionProposal[]) => void; onDismissProposal: (index: number) => void;
  onSwitchToBruno: () => void; onDismissSwitch: (index: number) => void;
}) {
  const proposals = useMemo(() => (text ? extractActionProposals(text) : []), [text]);
  const switchTo = useMemo(() => (text ? stripSwitchBlock(text).switchTo : null), [text]);
  const notebookOps = useMemo(() => (text ? extractNotebookOps(text) : []), [text]);
  const stickyOps = useMemo(() => (text ? extractStickyOps(text) : []), [text]);
  const status = proposal?.status || 'pending';
  // Auto-apply: confirm once, and only cards that don't delete or remove anything.
  const removes = proposals.some((p) => KIND_META[p.kind]?.destructive || (p.items ?? []).some(itemRemoves));
  const autoDone = useRef(false);
  useEffect(() => {
    if (!autoApply || autoDone.current || busy || !proposals.length || removes || status !== 'pending') return;
    autoDone.current = true;
    onConfirmProposals(index, proposals);
  }, [autoApply, busy, proposals, removes, status, index, onConfirmProposals]);
  return (
    <div className="flex gap-3">
      <BrunoAvatar className="mt-0.5" />
      <div className="min-w-0 flex-1 text-sm leading-relaxed [overflow-wrap:anywhere]">
        {think && <BrunoThinking steps={think.steps} startedAt={think.startedAt} thoughtMs={think.thoughtMs} phase="done" />}
        <div><BrunoMarkdown>{stripEventBlocks(text)}</BrunoMarkdown></div>
        {proposals.length > 0 && status !== 'dismissed' && (
          <ProposalCard proposals={proposals} links={proposal?.links} status={status} error={proposal?.error} onConfirm={() => onConfirmProposals(index, proposals)} onDismiss={() => onDismissProposal(index)} />
        )}
        {notebookOps.length > 0 && <NotebookProposalCard ops={notebookOps} scope={`${conversation}:${index}:${text}`} auto={autoApply && !busy} onAsk={onAsk} askDisabled={busy} />}
        {stickyOps.length > 0 && <NotebookProposalCard ops={stickyOps} scope={`${conversation}:${index}:sticky:${text}`} auto={autoApply && !busy} onAsk={onAsk} askDisabled={busy} />}
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

export function UserTurn({ text, images, pdfs, saved }: { text: string; images?: AttachedImage[]; pdfs?: { name: string }[]; saved?: SavedAttachment[] }) {
  // Text files travel inside the message: show them as chips, not a wall of text.
  const parts = useMemo(() => splitBrunoMessage(text), [text]);
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-muted px-4 py-2.5 text-sm leading-relaxed [overflow-wrap:anywhere]">
        {parts.body && <p className="whitespace-pre-wrap break-words">{parts.body}</p>}
        <SentAttachments images={images} pdfs={pdfs} saved={saved} textFiles={parts.textFiles} names={parts.attachedNames} />
      </div>
    </div>
  );
}

/** The reply being generated: thinking steps, then streamed text + caret. */
export function LiveReply({ text, liveThink }: { text: string; liveThink: LiveThink | null }) {
  return (
    <div className="flex gap-3" aria-live="polite">
      <BrunoAvatar className="mt-0.5" />
      <div className="min-w-0 flex-1 text-sm leading-relaxed [overflow-wrap:anywhere]">
        {liveThink && <BrunoThinking steps={liveThink.steps} startedAt={liveThink.startedAt} thoughtMs={liveThink.thoughtMs} phase={text ? 'generating' : 'thinking'} />}
        {text && <div><BrunoMarkdown>{stripEventBlocks(text)}</BrunoMarkdown><StreamingCaret /></div>}
      </div>
    </div>
  );
}
