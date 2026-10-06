import { useEffect, useRef, useState } from 'react';
import { BrunoMarkdown } from './BrunoMarkdown';
import { AnimatePresence, motion } from 'motion/react';
import { X, ExternalLink, Sparkles, Maximize2, Plus, ImagePlus, ChevronDown, FileText, RefreshCw, Square } from 'lucide-react';
import { stripEventBlocks, extractActionProposals } from '../services/aiService';
import ChatInput from './ChatInput';
import BrunoIcon from './BrunoIcon';
import ActionProposalCard from './ActionProposalCard';
import { AttachedImageStrip, AttachedPdfStrip, filesToAttachedImages, filesToAttachedPdfs, imagesFromPaste, MAX_BRUNO_IMAGES, MAX_BRUNO_PDFS } from './BrunoImageAttach';
import { cn } from './ui';
import { BrunoThinking, StreamingCaret } from './bruno/BrunoThinking';
import { useBrunoPanelChat, BRUNO_RESOURCES as RESOURCES } from './bruno/useBrunoPanelChat';
import { useInterfaceMode } from '../modern/interfaceMode';
import { BRUNO_TITLE } from './brunoStarters';


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
  // Conversation, starters, output length and streaming are shared with the
  // Modern panel (and survive a mode switch via the draft store).
  const {
    name, messages, input, setInput, busy, thinkMeta, stop, send, newChat,
    proposalState, confirmProposals, dismissProposal,
    scoutCtx, greeting, starterPool, starterBatch, refreshStarters,
    attached, setAttached, attachedPdfs, setAttachedPdfs, addAttached,
    outputLevel, changeOutputLevel,
  } = useBrunoPanelChat({ open, onClose, currentUser, botName, onActiveChatId, onUserSaved });
  // Modern experience: live thinking steps, streaming caret and a Stop button.
  const modern = useInterfaceMode().mode === 'modern';
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const [outputMenuOpen, setOutputMenuOpen] = useState(false);
  const outputMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!outputMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (outputMenuRef.current && !outputMenuRef.current.contains(e.target as Node)) setOutputMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [outputMenuOpen]);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

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
                            onDismiss={() => dismissProposal(i)}
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
