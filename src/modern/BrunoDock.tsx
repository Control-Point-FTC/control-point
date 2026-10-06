// The ⌘J Bruno side panel. Legacy keeps BrunoPanel; Modern gets this dock,
// built on the kit over the shared useBrunoPanelChat (same chats API, Analyze
// mode, page-aware starters, queued prompts, output length, Stop). The
// conversation lives in the draft store, so switching modes keeps it.
import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, Check, ExternalLink, Gauge, Maximize2, Plus, RefreshCw, Sparkles, X } from 'lucide-react';
import { Badge, Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui-kit';
import BrunoPanel from '../components/BrunoPanel';
import { BRUNO_TITLE } from '../components/brunoStarters';
import { useBrunoPanelChat, BRUNO_RESOURCES, OUTPUT_LEVELS } from '../components/bruno/useBrunoPanelChat';
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

function IconAction({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="text-muted-foreground max-sm:size-11" aria-label={label} onClick={onClick} disabled={disabled}>{children}</Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function BrunoDock({ open, onClose, onExpand, currentUser, botName, onActiveChatId, onUserSaved }: PanelProps) {
  const c = useBrunoPanelChat({ open, onClose, currentUser, botName, onActiveChatId, onUserSaved });
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [c.messages, open]);
  const last = c.messages.length - 1;
  const levelLabel = OUTPUT_LEVELS.find((l) => l.value === c.outputLevel)?.label ?? 'Medium';

  // Rendered at the app root (outside the shell), so it brings its own provider.
  return (
    <TooltipProvider>
    <AnimatePresence>
      {open && (
        <>
          {/* Phones: the dock is an overlay; tap outside to close. */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={onClose} aria-hidden="true" />
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 400, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 40 }}
            className="flex flex-col overflow-hidden border-border bg-background max-md:fixed max-md:right-0 max-md:top-0 max-md:z-50 max-md:h-full max-md:w-[400px] max-md:max-w-[94vw] max-md:border-l max-md:shadow-2xl md:relative md:z-30 md:h-full md:shrink-0 md:border-l"
            role="complementary"
            aria-label={`${c.name} quick chat`}
          >
            {/* Fixed-width inner so the docking animation clips instead of squashing. */}
            <div className="flex h-full min-h-0 w-[400px] max-w-[94vw] flex-col">
              <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
                <BrunoAvatar className="size-8" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.scoutCtx ? <Badge variant="soft" className="h-4 px-1 text-[10px]">Analyze mode</Badge> : BRUNO_TITLE}</p>
                </div>
                <IconAction label="New chat" onClick={c.newChat} disabled={c.busy}><Plus /></IconAction>
                <IconAction label={`Open full ${c.name}`} onClick={onExpand}><Maximize2 /></IconAction>
                <IconAction label="Close" onClick={onClose}><X /></IconAction>
              </header>
              <div className="flex items-center gap-1 border-b border-border px-3 py-1.5">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-muted-foreground max-sm:h-11" aria-label="Bruno output length"><Gauge /> {levelLabel} answers</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-52">
                    <DropdownMenuLabel>Answer length</DropdownMenuLabel>
                    {OUTPUT_LEVELS.map((l) => (
                      <DropdownMenuItem key={l.value} onSelect={() => void c.changeOutputLevel(l.value)}>
                        <span className="flex-1"><span className="block">{l.label}</span><span className="block text-xs text-muted-foreground">{l.desc}</span></span>
                        {c.outputLevel === l.value && <Check className="text-accent" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground max-sm:h-11"><BookOpen /> Resources</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {BRUNO_RESOURCES.map((r) => (
                      <DropdownMenuItem key={r.label} asChild>
                        <a href={r.url} target="_blank" rel="noreferrer">{r.label}<ExternalLink className="ml-auto" /></a>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div ref={scrollRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
                {c.messages.length === 0 ? (
                  <div className="space-y-3">
                    <p className="flex gap-2 rounded-xl border border-border bg-card p-3 text-sm leading-relaxed">
                      <Sparkles className="mt-0.5 size-4 shrink-0 text-accent" />
                      <span data-testid={c.scoutCtx && c.greeting ? 'bruno-analyze-greeting' : undefined}>{c.scoutCtx && c.greeting ? c.greeting : c.starterPool.greeting}</span>
                    </p>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground">Try one</p>
                      <Button variant="ghost" size="icon-sm" aria-label="Show more starter ideas" onClick={c.refreshStarters} disabled={c.busy}><RefreshCw /></Button>
                    </div>
                    <div className="space-y-1.5">
                      {c.starterBatch.map((s) => (
                        <button key={s} type="button" disabled={c.busy} onClick={() => void c.send(s)} className="block min-h-11 w-full rounded-lg border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-muted disabled:opacity-50">
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : c.messages.map((m, i) => {
                  if (m.role === 'user') return <UserTurn key={i} text={m.text} images={(m as any).images?.length} pdfs={(m as any).pdfs?.length} />;
                  const think = c.thinkMeta[i] ?? null;
                  if (c.busy && i === last) return <LiveReply key={i} text={m.text} liveThink={think} />;
                  return (
                    <BrunoReply
                      key={i} text={m.text} index={i} isLastModel={false} busy={c.busy} think={think}
                      proposal={c.proposalState[i]} switchDismissed
                      onConfirmProposals={c.confirmProposals} onDismissProposal={c.dismissProposal}
                      onSwitchToBruno={() => {}} onDismissSwitch={() => {}}
                    />
                  );
                })}
              </div>

              <div className="px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1">
                <BrunoComposer
                  compact value={c.input} onChange={c.setInput} onSend={() => void c.send()} onStop={c.stop} busy={c.busy}
                  attached={c.attached} setAttached={c.setAttached} attachedPdfs={c.attachedPdfs} setAttachedPdfs={c.setAttachedPdfs}
                  placeholder={c.scoutCtx ? 'Ask about this scouting view…' : `Ask ${c.name}…`} autoFocus
                />
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
    </TooltipProvider>
  );
}
