import { useEffect, useRef, useState } from 'react';
import { BrunoMarkdown } from './BrunoMarkdown';
import {
  Plus, Trash2, Globe, Lock, Pencil, Check, X, Sparkles, ChevronLeft, ImagePlus, FileText, RefreshCw, Square,
} from 'lucide-react';
import ChatInput from './ChatInput';
import { BrunoThinking, StreamingCaret } from './bruno/BrunoThinking';
import { useBrunoConversation } from './bruno/useBrunoConversation';
import { useInterfaceMode } from '../modern/interfaceMode';
import { stripEventBlocks } from '../services/aiService';
import { AttachedImageStrip, AttachedPdfStrip, filesToAttachedImages, filesToAttachedPdfs, imagesFromPaste, MAX_BRUNO_IMAGES, MAX_BRUNO_PDFS, type AttachedImage, type AttachedPdf } from './BrunoImageAttach';
import { BrunoMessageRow } from './BrunoMessageRow';
import BrunoIcon from './BrunoIcon';
import { nextStarters } from './brunoStarters';

/** Starter categories for the full-page empty state — rotating batches. */
const STARTER_CATEGORIES: { label: string; prompts: string[] }[] = [
  { label: 'Do in the app', prompts: [
    'Add a task for build session this Saturday',
    'Schedule our next team meeting',
    'Log the email I just sent to our sponsor',
    'Log a follow-up message to the parents about practice',
    'Create a task to order REV parts',
    'Schedule build session this Saturday 10am to 4pm',
    'Add our qualifier date to the calendar',
    'Log the reply I got from the venue',
  ] },
  { label: 'Code', prompts: [
    'Help me write a TeleOp OpMode in Java',
    'How do I use encoders in autonomous?',
    'How do I tune PID for our lift?',
    'Write a simple autonomous that drives forward and parks',
    'How do I read the color sensor in code?',
    'How do I use the IMU for field-centric drive?',
  ] },
  { label: 'Build', prompts: [
    'How should we design an intake for BIOBUZZ pollen?',
    'Mecanum vs tank drive — which should we pick?',
    'What should our BIOBUZZ match strategy be?',
    'How do we prepare for the judges?',
    'My robot drifts in autonomous — where do I start?',
    'Explain the BIOBUZZ scoring to me',
  ] },
];

function timeAgo(iso?: string) {
  if (!iso) return '';
  const t = new Date(iso.replace(' ', 'T') + 'Z').getTime();
  const s = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function BrunoView({ currentUser, hasScope, botName }: any) {
  const name = botName || 'Bruno';
  // Conversation state + handlers are shared with the Modern Bruno page.
  const {
    chats, myChats, teamChats, chatsHasMore, loading, fetchChats,
    activeId, setActiveId, activeChat, isOwner, isAdmin, newChat,
    messages, lastModelIdx, input, setInput, busy, liveThink, stream, send, stop,
    attached, setAttached, attachedPdfs, setAttachedPdfs, addAttached,
    dismissedSwitch, proposalState, confirmProposals, dismissProposal, dismissSwitch, switchToBruno,
    renameChat, togglePublic, removeChat,
  } = useBrunoConversation({ currentUser, hasScope, botName });
  // Modern experience bits (thinking steps, caret, Stop) — kept for parity.
  const modern = useInterfaceMode().mode === 'modern';
  // Rotating starter batches per category — never repeat until exhausted.
  const [starterBatches, setStarterBatches] = useState<Record<string, { batch: string[]; seen: number[] }>>(() => {
    const init: Record<string, { batch: string[]; seen: number[] }> = {};
    for (const g of STARTER_CATEGORIES) init[g.label] = nextStarters({ greeting: '', prompts: g.prompts }, [], 2);
    return init;
  });
  const refreshStarters = () => {
    setStarterBatches((prev) => {
      const next = { ...prev };
      for (const g of STARTER_CATEGORIES) {
        next[g.label] = nextStarters({ greeting: '', prompts: g.prompts }, prev[g.label]?.seen ?? [], 2);
      }
      return next;
    });
  };
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const saveTitle = () => { setEditingTitle(false); void renameChat(titleDraft); };
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, activeId, stream.text, stream.active]);

  const renderRow = (chat: any) => {
    const mine = currentUser && chat.member_id === currentUser.id;
    const canDelete = mine || isAdmin;
    return (
      <div
        key={chat.id}
        onClick={() => setActiveId(chat.id)}
        role="button"
        tabIndex={0}
        aria-current={chat.id === activeId ? 'true' : undefined}
        aria-label={`Open chat: ${chat.title || 'Untitled chat'}`}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveId(chat.id); } }}
        className={`group w-full text-left rounded-xl border px-3 py-2.5 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
          chat.id === activeId
            ? 'bg-accent/10 border-accent/40'
            : 'bg-text-base/[0.03] border-text-base/[0.07] hover:border-text-base/20'
        }`}
      >
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-text-base truncate">{chat.title || 'Untitled chat'}</p>
            <div className="flex items-center gap-1.5 mt-1">
              {chat.is_public ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300"><Globe className="w-3 h-3" />Team</span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-text-muted"><Lock className="w-3 h-3" />Private</span>
              )}
              {!mine && chat.owner_name && (
                <span className="text-[10px] text-text-muted truncate">· {chat.owner_name}</span>
              )}
              <span className="text-[10px] text-text-muted/70">{timeAgo(chat.updated_at)}</span>
            </div>
          </div>
          {canDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); removeChat(chat); }}
              aria-label={`Delete chat: ${chat.title || 'Untitled chat'}`}
              title="Delete chat"
              // Hover-only reveal doesn't exist on touch screens — always show there.
              className="opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 p-1.5 text-text-muted hover:text-rose-400 transition-all shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex gap-4 md:gap-6 h-full min-h-0 flex-1 p-4 md:p-6">
      {/* Chat list */}
      <div className={`${activeId ? 'hidden md:flex' : 'flex'} w-full md:w-80 shrink-0 flex-col gap-3 overflow-y-auto custom-scrollbar pr-1`} style={{ minHeight: 0 }}>
        <button
          onClick={newChat}
          className="flex items-center justify-center gap-2 w-full rounded-xl bg-accent text-accent-ink font-bold text-sm px-4 py-2.5 hover:brightness-110 active:scale-[0.98] transition shadow-[0_4px_16px_rgba(255,199,0,0.25)]"
        >
          <Plus className="w-4 h-4" /> New chat
        </button>
        {loading ? (
          <p className="text-sm text-text-muted px-1">Loading chats…</p>
        ) : (
          <>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70 px-1 mb-1.5">My chats</p>
              <div className="space-y-1.5">
                {myChats.length === 0 && <p className="text-xs text-text-muted/70 px-1">Nothing yet — start one above.</p>}
                {myChats.map(renderRow)}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70 px-1 mb-1.5">Team chats</p>
              <div className="space-y-1.5">
                {teamChats.length === 0 && <p className="text-xs text-text-muted/70 px-1">No shared chats yet.</p>}
                {teamChats.map(renderRow)}
              </div>
            </div>
            {chatsHasMore && (
              <button
                onClick={() => fetchChats(undefined, true)}
                className="w-full mt-2 text-xs font-semibold text-text-muted hover:text-text-base border border-text-base/10 hover:border-text-base/25 rounded-lg py-2 transition-colors"
              >
                Show older chats
              </button>
            )}
          </>
        )}
      </div>

      {/* Active chat — immersive: fills the whole right side */}
      <div className={`${activeId || messages.length ? 'flex' : 'hidden'} md:flex flex-1 min-w-0 min-h-0 flex-col card-surface overflow-hidden`}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-text-base/10 bg-text-base/[0.03] flex items-center gap-3">
          <button onClick={() => setActiveId(null)} aria-label="Back to chats" className="md:hidden text-text-muted hover:text-text-base">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#FFD84D] to-[#E0A800] border border-accent/40 flex items-center justify-center shrink-0">
            <BrunoIcon className="w-5 h-5 text-accent-ink" />
          </div>
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <div className="flex items-center gap-1.5">
                <input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
                  autoFocus
                  className="flex-1 min-w-0 bg-primary border border-accent/40 rounded-lg px-2 py-1 text-sm text-text-base focus:outline-none"
                />
                <button onClick={saveTitle} aria-label="Save title" className="text-accent hover:brightness-110"><Check className="w-4 h-4" /></button>
                <button onClick={() => setEditingTitle(false)} aria-label="Cancel" className="text-text-muted hover:text-text-base"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 min-w-0">
                <p className="text-text-base font-bold text-sm truncate">{activeChat?.title || 'New chat'}</p>
                {isOwner && (
                  <button
                    onClick={() => { setTitleDraft(activeChat?.title || ''); setEditingTitle(true); }}
                    aria-label="Rename chat"
                    className="text-text-muted hover:text-accent shrink-0"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
            <p className="text-[11px] text-text-muted">
              {activeChat?.is_public
                ? `Shared with the team${activeChat?.owner_name && !isOwner ? ` · by ${activeChat.owner_name}` : ''}`
                : 'Private to you'}
            </p>
          </div>
          {isOwner && (
            <button
              onClick={togglePublic}
              title={activeChat?.is_public ? 'Make private' : 'Share with team'}
              className={`flex items-center gap-1.5 text-xs font-bold rounded-full px-3 py-1.5 border transition-colors ${
                activeChat?.is_public
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
                  : 'bg-text-base/[0.04] text-text-muted border-text-base/10 hover:text-text-base hover:border-text-base/25'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              {activeChat?.is_public ? 'Shared' : 'Share with team'}
            </button>
          )}
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-3">
          {messages.length === 0 && (
            <div className="space-y-4 max-w-lg mx-auto pt-6">
              <div className="rounded-2xl bg-text-base/[0.04] border border-text-base/[0.07] p-4 text-center">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-br from-[#FFD84D] to-[#E0A800] flex items-center justify-center mb-3">
                  <BrunoIcon className="w-6 h-6 text-accent-ink" />
                </div>
                <p className="text-sm text-text-base/85 leading-relaxed">
                  Hey, I'm <span className="font-bold text-accent">{name}</span> — your FTC coach for the BIOBUZZ season.
                  I can answer build questions, write code, and take action in the app.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70">Try one</p>
                <button
                  onClick={refreshStarters}
                  disabled={busy}
                  title="Show more ideas"
                  aria-label="Show more starter ideas"
                  className="p-1 rounded-md text-text-muted hover:text-accent transition-colors disabled:opacity-40"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid sm:grid-cols-2 gap-x-3 gap-y-4">
                {STARTER_CATEGORIES.map((g) => (
                  <div key={g.label}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-accent/80 mb-1.5">{g.label}</p>
                    <div className="grid gap-1.5">
                      {(starterBatches[g.label]?.batch ?? []).map((s) => (
                        <button
                          key={s}
                          onClick={() => send(s)}
                          disabled={busy}
                          className="text-left text-[13px] text-text-base/75 hover:text-accent bg-text-base/[0.03] hover:bg-accent/10 border border-text-base/[0.07] hover:border-accent/30 rounded-xl px-3.5 py-2.5 transition-colors disabled:opacity-50"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent text-accent-ink text-sm font-medium px-4 py-2.5 leading-relaxed">
                  {m.images?.length ? (
                    <div className="flex gap-1.5 mb-2">
                      {m.images.map((img, j) => (
                        <img
                          key={j}
                          src={`data:${img.mimeType};base64,${img.data}`}
                          alt={`Screenshot ${j + 1}`}
                          className="w-20 h-20 rounded-lg object-cover border border-black/10"
                        />
                      ))}
                    </div>
                  ) : null}
                  {m.text}
                </div>
              </div>
            ) : (
              <BrunoMessageRow
                key={i}
                text={m.text}
                index={i}
                isLastModel={i === lastModelIdx}
                busy={busy}
                proposal={proposalState[i]}
                switchDismissed={dismissedSwitch.includes(i)}
                onConfirmProposals={confirmProposals}
                onDismissProposal={dismissProposal}
                onSwitchToBruno={switchToBruno}
                onDismissSwitch={dismissSwitch}
              />
            )
          )}
          {/* In-flight reply: rendered separately and updated at most every
              40ms, so streaming never re-renders the memoized rows above. */}
          {stream.active && (
            <div className="flex justify-start">
              <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-text-base/[0.05] border border-text-base/[0.07] px-4 py-2.5 text-sm text-text-base/85 leading-relaxed">
                {modern && liveThink && (
                  <BrunoThinking
                    steps={liveThink.steps}
                    startedAt={liveThink.startedAt}
                    thoughtMs={liveThink.thoughtMs}
                    phase={stream.text ? 'generating' : 'thinking'}
                  />
                )}
                {stream.text ? (
                  <>
                    <BrunoMarkdown>{stripEventBlocks(stream.text)}</BrunoMarkdown>
                    {modern && <StreamingCaret />}
                  </>
                ) : modern && liveThink ? null : (
                  <span className="flex gap-1 items-center text-text-muted py-1">
                    {[0, 1, 2].map((d) => (
                      <span key={d} className="w-1.5 h-1.5 rounded-full bg-accent/70 animate-bounce" style={{ animationDelay: `${d * 0.15}s` }} />
                    ))}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          onPaste={(e) => {
            imagesFromPaste(e).then((imgs) => {
              if (imgs.length) { e.preventDefault(); addAttached(imgs); }
            });
          }}
          className="p-3 border-t border-text-base/10 bg-text-base/[0.02]"
        >
          <AttachedImageStrip images={attached} onRemove={(idx) => setAttached((p) => p.filter((_, j) => j !== idx))} />
          <AttachedPdfStrip pdfs={attachedPdfs} onRemove={(idx) => setAttachedPdfs((p) => p.filter((_, j) => j !== idx))} />
          <div className="flex gap-2 items-end">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                filesToAttachedImages(e.target.files || []).then(addAttached);
                e.target.value = '';
              }}
            />
            <input
              ref={pdfRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                filesToAttachedPdfs(e.target.files || []).then((pdfs) => {
                  setAttachedPdfs((p) => [...p, ...pdfs].slice(0, MAX_BRUNO_PDFS));
                });
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy || attached.length >= MAX_BRUNO_IMAGES}
              aria-label="Attach a screenshot"
              title="Attach a screenshot"
              className="w-10 h-10 shrink-0 rounded-xl border border-text-base/10 text-text-muted hover:text-accent hover:border-accent/40 flex items-center justify-center transition disabled:opacity-40"
            >
              <ImagePlus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => pdfRef.current?.click()}
              disabled={busy || attachedPdfs.length >= MAX_BRUNO_PDFS}
              aria-label="Attach a PDF"
              title={attachedPdfs.length >= MAX_BRUNO_PDFS ? `Maximum ${MAX_BRUNO_PDFS} PDFs` : 'Attach a PDF'}
              className="w-10 h-10 shrink-0 rounded-xl border border-text-base/10 text-text-muted hover:text-accent hover:border-accent/40 flex items-center justify-center transition disabled:opacity-40"
            >
              <FileText className="w-4 h-4" />
            </button>
            <div className="flex-1 min-w-0">
              <ChatInput
                value={input}
                onChange={setInput}
                onSend={() => send()}
                disabled={busy}
                canSend={attached.length > 0 || attachedPdfs.length > 0}
                placeholder="Ask about mechanisms, code, strategy…"
              />
            </div>
            {modern && busy && liveThink && (
              <button
                type="button"
                onClick={stop}
                aria-label="Stop generating"
                title="Stop generating"
                className="w-10 h-10 shrink-0 rounded-xl bg-text-base text-primary flex items-center justify-center hover:opacity-90 transition"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            )}
          </div>
          <p className="text-[10px] text-text-muted/60 mt-1.5 px-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            Grounded in GM0, FTC docs &amp; supplier resources. Screenshots are read once and never saved.
            <span className="ml-auto hidden sm:inline">Shift+Enter for a new line</span>
          </p>
        </form>
      </div>
    </div>
  );
}
