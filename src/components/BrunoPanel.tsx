import { useEffect, useRef, useState } from 'react';
import { BrunoMarkdown } from './BrunoMarkdown';
import { AnimatePresence, motion } from 'motion/react';
import { X, ExternalLink, Sparkles, Maximize2, Plus, ImagePlus, ChevronDown, FileText, RefreshCw, Square } from 'lucide-react';
import { streamBuildHelper, stripEventBlocks, extractActionProposals, applyActionProposals, notifyBrunoDataChanged, type BuildHelperMessage, type ActionProposal } from '../services/aiService';
import { apiFetch } from '../services/api';
import ChatInput from './ChatInput';
import BrunoIcon from './BrunoIcon';
import ActionProposalCard, { type ProposalStatus } from './ActionProposalCard';
import { AttachedImageStrip, AttachedPdfStrip, filesToAttachedImages, filesToAttachedPdfs, imagesFromPaste, MAX_BRUNO_IMAGES, MAX_BRUNO_PDFS, type AttachedImage, type AttachedPdf } from './BrunoImageAttach';
import { cn } from './ui';
import { getScoutingContext, subscribeScoutingContext, getScreenContext, BRUNO_OPEN_EVENT, type BrunoOpenDetail } from '../services/brunoContext';
import { BrunoThinking, StreamingCaret, thinkingSteps, type ThinkingStep } from './bruno/BrunoThinking';
import { useInterfaceMode } from '../modern/interfaceMode';
import type { ScoutingContextRequest } from '../types/ftcScout';
import { BRUNO_TITLE, starterPoolForPath, nextStarters } from './brunoStarters';

const RESOURCES = [
  { label: 'Game Manual 0', url: 'https://gm0.org' },
  { label: 'FTC Docs', url: 'https://ftc-docs.firstinspires.org' },
  { label: 'REV Docs', url: 'https://docs.revrobotics.com' },
  { label: 'Game & Season', url: 'https://www.firstinspires.org/resource-library/ftc/game-and-season-info' },
];

export default function BrunoPanel({ open, onClose, onExpand, currentUser, botName, onActiveChatId, onUserSaved }: {
  open: boolean;
  onClose: () => void;
  onExpand: () => void;
  currentUser: any;
  botName?: string;
  /** Reports the panel's current chat id upward so "expand" can land on the same conversation. */
  onActiveChatId?: (id: number | null) => void;
  /** Persisted user after a settings save — parent refreshes its own state. */
  onUserSaved?: (user: any) => void;
}) {
  const name = botName || 'Bruno';
  // Modern experience: live thinking steps, streaming caret and a Stop button.
  const modern = useInterfaceMode().mode === 'modern';
  const [thinkMeta, setThinkMeta] = useState<Record<number, { steps: ThinkingStep[]; startedAt: number; thoughtMs: number | null }>>({});
  const abortRef = useRef<AbortController | null>(null);
  const stop = () => abortRef.current?.abort();
  const [messages, setMessages] = useState<BuildHelperMessage[]>([]);
  // A cleared conversation (new chat) drops the per-reply thinking data.
  useEffect(() => { if (messages.length === 0) setThinkMeta({}); }, [messages.length]);
  // Data-action proposals: pending until the user taps the confirm card.
  const [proposalState, setProposalState] = useState<Record<number, { status: ProposalStatus; error?: string }>>({});

  const confirmProposals = async (idx: number, proposals: ActionProposal[]) => {
    setProposalState((s) => ({ ...s, [idx]: { status: 'confirming' } }));
    try {
      const applied = await applyActionProposals(proposals);
      const types = Object.keys(applied).map((k) => (k === 'event' || k === 'delete-event' ? 'calendar' : k));
      notifyBrunoDataChanged(types);
      setProposalState((s) => ({ ...s, [idx]: { status: 'done' } }));
    } catch (e: any) {
      setProposalState((s) => ({ ...s, [idx]: { status: 'error', error: e?.message || 'Something went wrong' } }));
    }
  };
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  // Analyze mode (Team Stats): the page publishes what it's looking at; the
  // panel forwards it with each message and swaps in scouting starters.
  const [scoutCtx, setScoutCtx] = useState(getScoutingContext);
  useEffect(() => subscribeScoutingContext(() => setScoutCtx(getScoutingContext())), []);
  // Context-aware rotating starters: the pool follows the current page
  // (Communication → email logging, Tasks → task creation, …), showing a
  // fresh batch each time without repeating until the pool is exhausted.
  const [starterPath, setStarterPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const update = () => setStarterPath(window.location.pathname);
    window.addEventListener('popstate', update);
    // React-router navigations don't fire popstate; poll cheaply while open.
    const t = setInterval(update, 1000);
    return () => { window.removeEventListener('popstate', update); clearInterval(t); };
  }, []);
  const starterPool = scoutCtx
    ? { greeting: 'Analyze mode — ask me about this scouting view.', prompts: [
        'Who is our best potential alliance partner here?',
        'Who should we scout next?',
        'What is our biggest weakness compared with the event average?',
        'What information is missing before we make a scouting decision?',
        'Which teams have the most consistent autonomous?',
        'Compare our cycle times to the top teams here',
      ] }
    : starterPoolForPath(starterPath);
  const [starterSeen, setStarterSeen] = useState<number[]>([]);
  const [starterBatch, setStarterBatch] = useState<string[]>(() => nextStarters(starterPoolForPath(window.location.pathname), []).batch);
  // Reset rotation when the page (context) changes.
  useEffect(() => {
    const { batch, seen } = nextStarters(starterPool, []);
    setStarterBatch(batch);
    setStarterSeen(seen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [starterPath, scoutCtx]);
  const refreshStarters = () => {
    const { batch, seen } = nextStarters(starterPool, starterSeen);
    setStarterBatch(batch);
    setStarterSeen(seen);
  };
  const [greeting, setGreeting] = useState<string | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<{ text: string; scouting?: ScoutingContextRequest } | null>(null);
  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<BrunoOpenDetail>).detail || {};
      if (d.greeting) setGreeting(d.greeting);
      if (d.prompt) setPendingPrompt({ text: d.prompt, scouting: d.scouting });
    };
    window.addEventListener(BRUNO_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(BRUNO_OPEN_EVENT, onOpen);
  }, []);
  useEffect(() => { if (!scoutCtx) setGreeting(null); }, [scoutCtx]);
  const [chatId, setChatId] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  // Screenshots attached to the next message. Cleared on send; the images
  // travel to the AI in-memory only and are never saved anywhere.
  const [attached, setAttached] = useState<AttachedImage[]>([]);
  const [attachedPdfs, setAttachedPdfs] = useState<AttachedPdf[]>([]);

  const addAttached = (imgs: AttachedImage[]) => {
    if (!imgs.length) return;
    setAttached((prev) => [...prev, ...imgs].slice(0, MAX_BRUNO_IMAGES));
  };

  // Output length — the same member preference as Settings → Bruno AI,
  // adjustable right here in the sidebar too.
  const [outputLevel, setOutputLevel] = useState('medium');
  const [outputMenuOpen, setOutputMenuOpen] = useState(false);
  const outputMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!outputMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (outputMenuRef.current && !outputMenuRef.current.contains(e.target as Node)) {
        setOutputMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [outputMenuOpen]);
  useEffect(() => {
    // 'max' was removed — anyone who had it falls back to 'high'
    const lvl = currentUser?.bruno_output_level;
    setOutputLevel(lvl === 'max' ? 'high' : (lvl || 'medium'));
  }, [currentUser?.bruno_output_level, open]);
  const changeOutputLevel = async (lvl: string) => {
    const prev = outputLevel;
    setOutputLevel(lvl);
    try {
      const res = await apiFetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: currentUser?.name || '', role: currentUser?.role || '', bruno_output_level: lvl }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.user) onUserSaved?.(data.user);
      else setOutputLevel(prev);
    } catch {
      setOutputLevel(prev);
    }
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  // Every panel open starts a FRESH chat — never resume the previous one.
  // Past chats keep their auto-titles and stay available in the full view.
  const newChat = () => {
    if (busy) return;
    setChatId(null);
    setMessages([]);
    setProposalState({});
    setInput('');
    setAttached([]);
  };

  // Let the parent know which conversation is active so expanding the panel
  // into the full view can preserve it instead of opening an unrelated chat.
  useEffect(() => {
    onActiveChatId?.(chatId);
  }, [chatId, onActiveChatId]);

  // Escape closes the panel
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const ensureChat = async (): Promise<number | null> => {
    if (chatId) return chatId;
    try {
      const res = await apiFetch('/api/bruno/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) return null;
      const created = await res.json();
      setChatId(created.id);
      return created.id;
    } catch {
      return null;
    }
  };

  const send = async (text?: string, scoutingOverride?: ScoutingContextRequest) => {
    const content = (text ?? input).trim();
    if ((!content && !attached.length && !attachedPdfs.length) || busy) return;
    setInput('');
    const outgoing = attached;
    const outgoingPdfs = attachedPdfs;
    setAttached([]);
    setAttachedPdfs([]);
    const id = await ensureChat();
    const userMsg: BuildHelperMessage = { role: 'user', text: content || (outgoingPdfs.length ? 'What do you see in these documents?' : 'What do you see in this screenshot?') };
    if (outgoing.length) userMsg.images = outgoing;
    if (outgoingPdfs.length) userMsg.pdfs = outgoingPdfs;
    const next: BuildHelperMessage[] = [...messages, userMsg];
    setMessages(next);
    setBusy(true);
    let agg = '';
    setMessages([...next, { role: 'model', text: '' }]);
    // What Bruno is actually given for this reply (shown as its thinking steps).
    const replyIndex = next.length;
    const startedAt = Date.now();
    let firstTokenAt: number | null = null;
    setThinkMeta((m) => ({
      ...m,
      [replyIndex]: {
        steps: thinkingSteps({
          page: getScreenContext()?.view ?? null,
          images: outgoing.length,
          pdfs: outgoingPdfs.length,
          scouting: !!(scoutingOverride ?? getScoutingContext()),
          history: next.length,
        }),
        startedAt,
        thoughtMs: null,
      },
    }));
    const ac = new AbortController();
    abortRef.current = ac;
    // Throttle streamed renders: each render re-parses the growing markdown
    // reply, so cap re-renders at ~11/sec. The accumulator keeps every char.
    let renderTimer: number | null = null;
    const pushRender = () => {
      renderTimer = null;
      setMessages([...next, { role: 'model', text: agg }]);
    };
    try {
      await streamBuildHelper(next, (chunk) => {
        agg += chunk;
        if (firstTokenAt === null && chunk.trim()) {
          firstTokenAt = Date.now();
          const ms = firstTokenAt - startedAt;
          setThinkMeta((m) => (m[replyIndex] ? { ...m, [replyIndex]: { ...m[replyIndex], thoughtMs: ms } } : m));
        }
        if (renderTimer === null) renderTimer = window.setTimeout(pushRender, 90);
      }, id || undefined, { scouting: scoutingOverride ?? getScoutingContext() ?? undefined, signal: ac.signal });
      if (renderTimer !== null) { clearTimeout(renderTimer); renderTimer = null; }
      setMessages([...next, { role: 'model', text: agg }]);
      if (!agg.trim()) {
        setMessages([...next, { role: 'model', text: `${name} hit a snag — please try again in a moment.` }]);
      }
      // Note: data-action proposal blocks are NOT auto-inserted anymore — the
      // confirm card calls applyActionProposals + notify on tap.
    } catch (e: any) {
      if (renderTimer !== null) { clearTimeout(renderTimer); renderTimer = null; }
      if (e?.name === 'AbortError') {
        // Stopped by the user: keep what was generated so far.
        setMessages([...next, { role: 'model', text: agg.trim() ? `${agg}\n\n_Stopped._` : '_Stopped._' }]);
        setThinkMeta((m) => (m[replyIndex] && m[replyIndex].thoughtMs == null ? { ...m, [replyIndex]: { ...m[replyIndex], thoughtMs: Date.now() - startedAt } } : m));
      } else {
        setThinkMeta((m) => { const { [replyIndex]: _drop, ...rest } = m; return rest; });
        const blockedMsg = e?.serverError;
        setMessages([...next, { role: 'model', text: blockedMsg || `${name} isn't reachable right now. Check your connection and try again.` }]);
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  };

  // "Scout with Bruno" buttons queue a prompt; send it once the panel is open.
  useEffect(() => {
    if (open && pendingPrompt && !busy) {
      const p = pendingPrompt;
      setPendingPrompt(null);
      void send(p.text, p.scouting);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pendingPrompt, busy]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Click-catcher only on mobile, where the panel is still an overlay.
              On desktop the panel docks into the layout and the page resizes. */}
          <div className="fixed inset-0 z-40 md:hidden" onClick={onClose} aria-hidden="true" />
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 400, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 40 }}
            className="flex flex-col overflow-hidden bg-secondary/98 backdrop-blur-xl border-text-base/10 shadow-2xl
              max-md:fixed max-md:right-0 max-md:top-0 max-md:z-50 max-md:h-full max-md:w-[400px] max-md:max-w-[94vw] max-md:border-l
              md:relative md:z-30 md:h-full md:shrink-0 md:border-l"
            role="complementary"
            aria-label={`${name} quick chat`}
          >
            {/* Fixed-width inner so the docked width animation clips instead of squashing content. */}
            <div className="w-[400px] max-w-[94vw] h-full flex flex-col min-h-0">
            {/* Header */}
            <div className="px-4 py-3 border-b border-text-base/10 bg-text-base/[0.03] flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#FFD84D] to-[#E0A800] border border-accent/40 flex items-center justify-center shadow-[0_2px_10px_rgba(255,199,0,0.25)]">
                  <BrunoIcon className="w-5 h-5 text-accent-ink" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-text-base font-bold text-sm leading-tight">{name}</p>
                  <p className="text-text-muted text-[11px] leading-tight">
                    {scoutCtx ? <span className="text-accent font-semibold">Scouting · Analyze mode</span> : BRUNO_TITLE}
                  </p>
                </div>
                <button
                  onClick={newChat}
                  aria-label="Start a new chat"
                  title="New chat"
                  disabled={busy}
                  className="p-1.5 rounded-lg text-text-muted hover:text-accent transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button
                  onClick={onExpand}
                  aria-label={`Open full ${name} view`}
                  title="Open full Bruno"
                  className="p-1.5 rounded-lg text-text-muted hover:text-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
                <button
                  onClick={onClose}
                  aria-label="Close Bruno panel"
                  title="Close"
                  className="p-1.5 rounded-lg text-text-muted hover:text-text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {RESOURCES.map((r) => (
                  <a
                    key={r.label}
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-text-muted hover:text-accent border border-text-base/10 hover:border-accent/40 rounded-full px-2 py-0.5 transition-colors"
                  >
                    {r.label}
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted/70">
                  Output
                </label>
                <div className="relative" ref={outputMenuRef}>
                  <button
                    onClick={() => setOutputMenuOpen(!outputMenuOpen)}
                    aria-label="Bruno output length"
                    aria-expanded={outputMenuOpen}
                    className="flex items-center gap-1.5 text-[11px] font-semibold bg-text-base/[0.04] border border-text-base/10 rounded-lg px-2 py-1 text-text-muted hover:text-text-base hover:border-accent/40 focus:outline-none focus:border-accent/50 transition-colors cursor-pointer"
                  >
                    {outputLevel === 'low' ? 'Low' : outputLevel === 'high' ? 'High' : 'Medium'}
                    <ChevronDown className={cn("w-3 h-3 transition-transform", outputMenuOpen && "rotate-180")} />
                  </button>
                  {outputMenuOpen && (
                    <div className="absolute z-50 mt-1 min-w-[120px] rounded-xl border border-text-base/10 bg-elevated shadow-xl shadow-black/30 overflow-hidden">
                      {[
                        { value: 'low', label: 'Low', desc: 'Brief replies' },
                        { value: 'medium', label: 'Medium', desc: 'Balanced detail' },
                        { value: 'high', label: 'High', desc: 'Full explanations' },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => { void changeOutputLevel(opt.value); setOutputMenuOpen(false); }}
                          className={cn(
                            "w-full text-left px-3 py-2 transition-colors",
                            outputLevel === opt.value
                              ? "bg-accent/15 text-accent"
                              : "text-text-base/80 hover:bg-text-base/[0.06] hover:text-text-base"
                          )}
                        >
                          <div className="text-[12px] font-bold">{opt.label}</div>
                          <div className="text-[10px] text-text-muted">{opt.desc}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3 space-y-3 min-h-0">
              {messages.length === 0 && (
                <div className="space-y-3">
                  <div className="rounded-xl bg-text-base/[0.04] border border-text-base/[0.07] p-3">
                    <p className="text-[13px] text-text-base/85 leading-relaxed flex gap-2">
                      <Sparkles className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                      {scoutCtx && greeting ? (
                        <span data-testid="bruno-analyze-greeting">{greeting}</span>
                      ) : (
                        <span>{starterPool.greeting}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
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
                  <div className="flex flex-col gap-1.5">
                    {starterBatch.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        disabled={busy}
                        className="text-left text-[12px] text-text-base/75 hover:text-accent bg-text-base/[0.03] hover:bg-accent/10 border border-text-base/[0.07] hover:border-accent/30 rounded-lg px-3 py-2 transition-colors disabled:opacity-50"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) =>
                m.role === 'user' ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent text-accent-ink text-[13px] font-medium px-3.5 py-2.5 leading-relaxed">
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
                  <div key={i} className="flex justify-start">
                    <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-text-base/[0.05] border border-text-base/[0.07] px-3.5 py-2.5 text-[13px] text-text-base/85 leading-relaxed prose-sm">
                      {modern && thinkMeta[i] && (
                        <BrunoThinking
                          steps={thinkMeta[i].steps}
                          startedAt={thinkMeta[i].startedAt}
                          thoughtMs={thinkMeta[i].thoughtMs}
                          phase={!m.text ? 'thinking' : busy && i === messages.length - 1 ? 'generating' : 'done'}
                        />
                      )}
                      {m.text ? (
                        <>
                          <BrunoMarkdown>{stripEventBlocks(m.text)}</BrunoMarkdown>
                          {modern && busy && i === messages.length - 1 && <StreamingCaret />}
                        </>
                      ) : modern && thinkMeta[i] ? null : (
                        <span className="flex gap-1 items-center text-text-muted">
                          {[0, 1, 2].map((d) => (
                            <span key={d} className="w-1.5 h-1.5 rounded-full bg-accent/70 animate-bounce" style={{ animationDelay: `${d * 0.15}s` }} />
                          ))}
                        </span>
                      )}
                      {(() => {
                        // Data-action proposals: confirm card once the reply is complete.
                        if (!m.text || (busy && i === messages.length - 1)) return null;
                        const proposals = extractActionProposals(m.text);
                        if (!proposals.length) return null;
                        const st = proposalState[i]?.status || 'pending';
                        if (st === 'dismissed') return null;
                        return (
                          <ActionProposalCard
                            proposals={proposals}
                            status={st}
                            error={proposalState[i]?.error}
                            onConfirm={() => confirmProposals(i, proposals)}
                            onDismiss={() => setProposalState((s) => ({ ...s, [i]: { status: 'dismissed' } }))}
                          />
                        );
                      })()}
                    </div>
                  </div>
                )
              )}
            </div>

            {/* Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              onPaste={(e) => {
                // Screenshots paste straight into the composer.
                imagesFromPaste(e).then((imgs) => {
                  if (imgs.length) { e.preventDefault(); addAttached(imgs); }
                });
              }}
              className="p-3 border-t border-text-base/10 bg-text-base/[0.02] flex-shrink-0"
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
                  title={attached.length >= MAX_BRUNO_IMAGES ? `Maximum ${MAX_BRUNO_IMAGES} images` : "Attach a screenshot"}
                  className="w-10 h-10 shrink-0 rounded-xl border border-text-base/10 text-text-muted hover:text-accent hover:border-accent/40 flex items-center justify-center transition disabled:opacity-40"
                >
                  <ImagePlus className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => pdfRef.current?.click()}
                  disabled={busy || attachedPdfs.length >= MAX_BRUNO_PDFS}
                  aria-label="Attach a PDF"
                  title={attachedPdfs.length >= MAX_BRUNO_PDFS ? `Maximum ${MAX_BRUNO_PDFS} PDFs` : "Attach a PDF"}
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
                {modern && busy && (
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
              <p className="text-[10px] text-text-muted/60 mt-1.5 px-1">
                Grounded in GM0, FTC docs &amp; REV resources. Screenshots are read once and never saved.
              </p>
            </form>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
