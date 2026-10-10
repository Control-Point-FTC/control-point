// The ⌘J Bruno side panel. Legacy keeps BrunoPanel; Modern gets this dock,
// built on the kit over the shared useBrunoPanelChat (same chats API, Analyze
// mode, page-aware starters, queued prompts, output length, Stop). The
// conversation lives in the draft store, so switching modes keeps it.
//
// Layout (audit UX-13, Arc's sidebar-AI standard): one quiet header, a
// welcome that keeps the capability statement, the rotating "Try one"
// prompts and a rotating tip, and a floating composer that holds the answer
// length. Same capabilities as before; nothing removed.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUpRight, BookOpen, Check, ChevronDown, ExternalLink, Lightbulb, Maximize2, Plus, RefreshCw, X } from 'lucide-react';
import { Badge, Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui-kit';
import BrunoPanel from '../components/BrunoPanel';
import { BRUNO_TITLE } from '../components/brunoStarters';
import { useBrunoPanelChat, BRUNO_RESOURCES, OUTPUT_LEVELS } from '../components/bruno/useBrunoPanelChat';
import { conversationScope, useReceiptKey } from '../services/notebookProposals';
import { useInterfaceMode } from './interfaceMode';
import { BrunoAvatar, BrunoComposer, BrunoReply, LiveReply, UserTurn } from './pages/bruno/BrunoParts';

type PanelProps = {
  open: boolean;
  onClose: () => void;
  onExpand: () => void;
  currentUser: any;
  botName?: string;
  onActiveChatId?: (id: number | null) => void;
  onUserSaved?: (user: any) => void;
};

/** Renders the panel that matches the current interface. */
export function BrunoPanelSwitch(props: PanelProps) {
  const { mode } = useInterfaceMode();
  return mode === 'modern' ? <BrunoDock {...props} /> : <BrunoPanel {...props} />;
}

function IconAction({ label, onClick, disabled, children }: { label: string; onClick?: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground max-sm:size-11" aria-label={label} onClick={onClick} disabled={disabled}>{children}</Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Rotating tips under the composer (the audit asked to keep tips). */
export const BRUNO_TIPS = [
  'Press ⌘J (Ctrl+J) on any page to open or close Bruno.',
  'Attach a robot photo or a game-manual PDF and ask about it.',
  'Bruno can draft tasks and events for you; nothing is added until you confirm.',
  'Shift+Enter starts a new line; Enter sends.',
  'Open the full Bruno page for your chat history.',
  'On Team Stats, “Scout with Bruno” hands Bruno the teams you’re looking at.',
];
const TIP_MS = 9000;

export function BrunoDock({ open, onClose, onExpand, currentUser, botName, onActiveChatId, onUserSaved }: PanelProps) {
  const c = useBrunoPanelChat({ open, onClose, currentUser, botName, onActiveChatId, onUserSaved });
  const draftConversation = useReceiptKey();
  const scrollRef = useRef<HTMLDivElement>(null);
  // Follow the conversation; the welcome stays scrolled to its top.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = c.messages.length ? el.scrollHeight : 0;
  }, [c.messages, open]);
  // While docked, the right edge is ours: corner UI (bug button, toasts,
  // banners) shifts left of the panel via --cp-side-dock (desktop only).
  useEffect(() => {
    if (!open) return;
    document.documentElement.style.setProperty('--cp-side-dock', '400px');
    return () => { document.documentElement.style.removeProperty('--cp-side-dock'); };
  }, [open]);
  // One tip at a time, rotating while the panel is open.
  const [tip, setTip] = useState(0);
  useEffect(() => {
    if (!open) return;
    const t = window.setInterval(() => setTip((i) => (i + 1) % BRUNO_TIPS.length), TIP_MS);
    return () => window.clearInterval(t);
  }, [open]);
  const last = c.messages.length - 1;
  const levelLabel = OUTPUT_LEVELS.find((l) => l.value === c.outputLevel)?.label ?? 'Medium';
  const firstName = String(currentUser?.name || '').trim().split(/\s+/)[0];
  const empty = c.messages.length === 0;

  const lengthPicker = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1 rounded-full px-2.5 text-muted-foreground max-sm:h-11" aria-label="Bruno output length">
          {levelLabel} <ChevronDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-52">
        <DropdownMenuLabel>Answer length</DropdownMenuLabel>
        {OUTPUT_LEVELS.map((l) => (
          <DropdownMenuItem key={l.value} disabled={c.levelSaving} onSelect={() => void c.changeOutputLevel(l.value)}>
            <span className="flex-1"><span className="block">{l.label}</span><span className="block text-xs text-muted-foreground">{l.desc}</span></span>
            {c.outputLevel === l.value && <Check className="text-accent" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // Rendered at the app root (outside the shell), so it brings its own provider.
  return (
    <TooltipProvider>
    <AnimatePresence>
      {open && (
        <>
          {/* Phones: the dock is an overlay; tap outside to close. */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={onClose} aria-hidden="true" data-print-hide />
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 400, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 40 }}
            className="flex flex-col overflow-hidden border-border bg-background max-md:fixed max-md:right-0 max-md:top-0 max-md:z-50 max-md:h-full max-md:w-[400px] max-md:max-w-[94vw] max-md:border-l max-md:shadow-2xl md:relative md:z-30 md:h-full md:shrink-0 md:border-l"
            role="complementary"
            data-print-hide
            aria-label={`${c.name} quick chat`}
          >
            {/* Fixed-width inner so the docking animation clips instead of squashing. */}
            <div className="relative flex h-full min-h-0 w-[400px] max-w-[94vw] flex-col">
              {/* A soft wash of the team colour behind the header and welcome. */}
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-accent/[0.07] to-transparent" />
              <header className="relative flex items-center gap-2 px-3 pb-1 pt-2.5">
                <BrunoAvatar className="size-7" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-tight">{c.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{c.scoutCtx ? <Badge variant="soft" className="h-4 px-1 text-[10px]">Analyze mode</Badge> : BRUNO_TITLE}</p>
                </div>
                <IconAction label="New chat" onClick={c.newChat} disabled={c.busy}><Plus /></IconAction>
                <DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" className="text-muted-foreground max-sm:size-11" aria-label="Resources"><BookOpen /></Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Resources</TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>FTC resources</DropdownMenuLabel>
                    {BRUNO_RESOURCES.map((r) => (
                      <DropdownMenuItem key={r.label} asChild>
                        <a href={r.url} target="_blank" rel="noreferrer">{r.label}<ExternalLink className="ml-auto" /></a>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <IconAction label={`Open full ${c.name}`} onClick={onExpand}><Maximize2 /></IconAction>
                <IconAction label="Close" onClick={onClose}><X /></IconAction>
              </header>

              <div ref={scrollRef} className="relative min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
                {empty ? (
                  <div className="flex min-h-full flex-col">
                    <div className="pt-6">
                      <BrunoAvatar className="size-11 shadow-[0_0_0_6px_color-mix(in_srgb,var(--color-accent)_10%,transparent)] [&>svg]:size-6" />
                      <h2 className="mt-4 text-xl font-semibold tracking-tight">{firstName ? `Hi ${firstName}.` : 'Hi there.'}</h2>
                      {/* The capability statement (kept, per the audit). */}
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground" data-testid={c.scoutCtx && c.greeting ? 'bruno-analyze-greeting' : undefined}>
                        {c.scoutCtx && c.greeting ? c.greeting : c.starterPool.greeting}
                      </p>
                    </div>
                    <div className="mt-6">
                      <div className="mb-1 flex items-center justify-between">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Try one</p>
                        <IconAction label="Show more starter ideas" onClick={c.refreshStarters} disabled={c.busy}><RefreshCw /></IconAction>
                      </div>
                      <motion.ul key={c.starterBatch.join('|')} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} className="-mx-2 space-y-0.5">
                        {c.starterBatch.map((s) => (
                          <li key={s}>
                            <button type="button" disabled={c.busy} onClick={() => void c.send(s)} className="group flex min-h-11 w-full items-start gap-2.5 rounded-xl px-2 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:opacity-50">
                              <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-accent" />
                              <span>{s}</span>
                            </button>
                          </li>
                        ))}
                      </motion.ul>
                    </div>
                  </div>
                ) : c.messages.map((m, i) => {
                  if (m.role === 'user') return <UserTurn key={i} text={m.text} images={(m as any).images?.length} pdfs={(m as any).pdfs?.length} />;
                  const think = c.thinkMeta[i] ?? null;
                  if (c.busy && i === last) return <LiveReply key={i} text={m.text} liveThink={think} />;
                  return (
                    <BrunoReply
                      key={i} conversation={conversationScope(c.chatId, draftConversation)} text={m.text} index={i} isLastModel={false} busy={c.busy} think={think}
                      proposal={c.proposalState[i]} switchDismissed
                      onConfirmProposals={c.confirmProposals} onDismissProposal={c.dismissProposal}
                      onSwitchToBruno={() => {}} onDismissSwitch={() => {}}
                    />
                  );
                })}
              </div>

              <div className="relative px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1">
                <div className="rounded-2xl shadow-lg shadow-black/5">
                  <BrunoComposer
                    compact value={c.input} onChange={c.setInput} onSend={() => void c.send()} onStop={c.stop} busy={c.busy}
                    attached={c.attached} setAttached={c.setAttached} attachedPdfs={c.attachedPdfs} setAttachedPdfs={c.setAttachedPdfs}
                    placeholder={c.scoutCtx ? 'Ask about this scouting view…' : `Ask ${c.name}…`} autoFocus
                    tools={lengthPicker}
                  />
                </div>
                <p className="mt-2 flex min-h-4 items-start gap-1.5 px-1 text-[11px] leading-snug text-muted-foreground">
                  <Lightbulb className="mt-px size-3 shrink-0" aria-hidden="true" />
                  {/* Keyed so each new tip fades in. */}
                  <motion.span key={c.busy ? 'busy' : tip} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
                    {c.busy ? `${c.name} is replying…` : BRUNO_TIPS[tip]}
                  </motion.span>
                </p>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
    </TooltipProvider>
  );
}
