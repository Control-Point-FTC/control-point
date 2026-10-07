// Modern call UI (phase 9f) over the shared voice engine (useVoice) and the
// shared useIncomingCall / useCallView hooks: the same media, permissions,
// spotlight and pin rules as Classic.
//   CallDock      — a floating pill while you're in a call (minimized)
//   IncomingCall  — an alert dialog with a ringing avatar
//   CallStage     — the expanded call: tiles or a featured stage, a control
//                   dock at the bottom and a People sheet.
import { useEffect } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRightLeft, Check, ChevronDown, Expand, Headphones, Maximize, Mic, MicOff, Minimize, MonitorUp, Phone, PhoneOff, Pin, PinOff,
  Shrink, Star, Trash2, TriangleAlert, Users, Video, VideoOff, Volume2, VolumeX, X,
} from 'lucide-react';
import { cn } from '../../components/cn';
import {
  Button, Dialog, DialogContent, DialogDescription, DialogTitle, Popover, PopoverAnchor, PopoverContent, Separator, Sheet, SheetContent,
  SheetDescription, SheetHeader, SheetTitle, Slider,
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '../../components/ui-kit';
import CrosshairIcon from '../../components/CrosshairIcon';
import { useVoice, type VoiceParticipant } from '../../voice';
import { useIncomingCall } from '../../components/voice/useIncomingCall';
import { useCallView } from '../../components/voice/useCallView';
import { useParticipantActions } from '../../components/voice/useParticipantActions';
import { ParticipantAudio, QualityBadge, StreamVideo, VoiceAvatar } from '../../components/voice/shared';

const STATUS: Record<string, { label: string; dot: string }> = {
  joining: { label: 'Connecting', dot: 'bg-amber-400' },
  connected: { label: 'Connected', dot: 'bg-success' },
  reconnecting: { label: 'Reconnecting', dot: 'bg-amber-400 animate-pulse' },
  failed: { label: 'Connection failed', dot: 'bg-destructive' },
  ended: { label: 'Ended', dot: 'bg-muted-foreground' },
  idle: { label: 'Idle', dot: 'bg-muted-foreground' },
};

function Status({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.idle;
  return <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><span className={cn('size-2 rounded-full', s.dot)} aria-hidden="true" />{s.label}</span>;
}

/** Round dock button with a tooltip; `tone` colours the on/danger states. */
function DockButton({ label, onClick, tone, children, className }: {
  label: string; onClick: () => void; tone?: 'off' | 'on' | 'danger'; children: React.ReactNode; className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={tone === 'off' || tone === 'on' ? true : undefined}
          onClick={onClick}
          className={cn(
            'inline-flex size-11 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
            tone === 'danger' ? 'bg-destructive text-white hover:brightness-110'
              : tone === 'off' ? 'bg-destructive/15 text-destructive hover:bg-destructive/25'
                : tone === 'on' ? 'bg-accent text-accent-ink hover:brightness-105'
                  : 'bg-muted text-foreground hover:bg-foreground/10',
            className,
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** `compact` (the minimized dock on phones) hides camera and screen share; the expanded stage always offers the camera. */
function MediaButtons({ size = 'size-5', compact = false }: { size?: string; compact?: boolean }) {
  const { self, toggleMute, toggleDeafen, toggleCamera, toggleScreenShare } = useVoice();
  return (
    <>
      <DockButton label={self.muted ? 'Unmute' : 'Mute'} tone={self.muted ? 'off' : undefined} onClick={toggleMute}>
        {self.muted ? <MicOff className={size} /> : <Mic className={size} />}
      </DockButton>
      <DockButton label={self.deafened ? 'Undeafen' : 'Deafen'} tone={self.deafened ? 'off' : undefined} onClick={toggleDeafen}>
        {self.deafened ? <VolumeX className={size} /> : <Headphones className={size} />}
      </DockButton>
      <DockButton label={self.cameraOn ? 'Turn camera off' : 'Turn camera on'} tone={self.cameraOn ? 'on' : undefined} onClick={() => void toggleCamera()} className={compact ? 'max-sm:hidden' : undefined}>
        {self.cameraOn ? <Video className={size} /> : <VideoOff className={size} />}
      </DockButton>
      <DockButton label={self.sharingScreen ? 'Stop sharing screen' : 'Share screen'} tone={self.sharingScreen ? 'on' : undefined} onClick={() => void toggleScreenShare()} className="max-sm:hidden">
        <MonitorUp className={size} />
      </DockButton>
    </>
  );
}

// ---------------------------------------------------------------------------

export function CallDock({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { status, session, participants, setExpanded, leave } = useVoice();
  const shown = !!session && status !== 'idle' && status !== 'ended';
  // Reserve the dock's height at the bottom so the bug button and toasts sit above it.
  useEffect(() => {
    if (!shown) return;
    document.documentElement.style.setProperty('--cp-call-dock', '72px');
    return () => { document.documentElement.style.removeProperty('--cp-call-dock'); };
  }, [shown]);
  if (!shown || !session) return null;
  const others = participants.filter((p) => !p.isSelf).slice(0, 4);
  return (
    <TooltipProvider>
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      role="region"
      aria-label={`Active call: ${session.name}`}
      className="pointer-events-none fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-40 flex justify-center px-3 md:bottom-4"
    >
      <div className={cn(
        'pointer-events-auto flex w-full max-w-2xl items-center gap-2 rounded-full border bg-popover/95 py-1.5 pl-4 pr-1.5 text-popover-foreground shadow-2xl backdrop-blur',
        status === 'reconnecting' ? 'border-amber-400/50' : status === 'failed' ? 'border-destructive/50' : 'border-border',
      )}>
        <button type="button" onClick={() => setExpanded(true)} className="min-w-0 flex-1 text-left" aria-label="Expand call view">
          <span className="block truncate text-sm font-medium">{session.name}</span>
          <span className="flex items-center gap-2"><Status status={status} /><span className="text-xs text-muted-foreground">· {participants.length} {participants.length === 1 ? 'person' : 'people'}</span></span>
        </button>
        <div className="flex -space-x-2 max-sm:hidden" aria-hidden="true">
          {others.map((p) => <VoiceAvatar key={p.memberId} name={p.name} avatarUrl={p.avatarUrl} size={28} speaking={p.speaking} className="ring-2 ring-popover" />)}
        </div>
        <div className="flex items-center gap-1" role="toolbar" aria-label="Call controls">
          <MediaButtons size="size-4" compact />
          <DockButton label="Call settings" onClick={() => onOpenSettings?.()} className="max-md:hidden"><CrosshairIcon className="size-4" /></DockButton>
          <DockButton label="Expand call view" onClick={() => setExpanded(true)}><Expand className="size-4" /></DockButton>
          <DockButton label="Leave call" tone="danger" onClick={() => void leave()}><PhoneOff className="size-4" /></DockButton>
        </div>
      </div>
    </motion.div>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------

export function IncomingCall() {
  const c = useIncomingCall();
  if (!c.incomingCall) return null;
  const caller = c.incomingCall.inviter.name;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) c.handleDismiss(); }}>
      <DialogContent role="alertdialog" showClose={false} className="text-center sm:max-w-sm">
        <div className="mx-auto">
          <span className="relative inline-flex">
            <motion.span aria-hidden="true" className="absolute inset-0 rounded-full bg-accent/30" animate={{ scale: [1, 1.5], opacity: [0.6, 0] }} transition={{ duration: 1.4, repeat: Infinity }} />
            <VoiceAvatar name={caller} avatarUrl={null} size={80} />
            <span className="absolute -bottom-1 -right-1 flex size-9 items-center justify-center rounded-full bg-accent text-accent-ink ring-4 ring-popover">
              {c.isVideo ? <Video className="size-4" /> : <Phone className="size-4" />}
            </span>
          </span>
        </div>
        <DialogTitle className="mt-2 text-xl">{caller}</DialogTitle>
        <DialogDescription>
          Incoming {c.isVideo ? 'video' : 'voice'} call{c.incomingCall.channelName ? <> in <span className="font-medium text-foreground">#{c.incomingCall.channelName}</span> (anyone on the team can join)</> : null}
        </DialogDescription>
        {c.inAnotherCall ? (
          <>
            <p role="alert" className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-left text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
              You're already in {c.session ? `“${c.session.name}”` : 'another call'}. Joining won't switch automatically; choose below.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => void c.handleDecline()} className="h-11">Stay here</Button>
              <Button onClick={() => void c.handleSwitch()} disabled={c.busy != null} className="h-11">{c.busy === 'switch' ? 'Switching…' : 'Leave & join'}</Button>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="destructive" onClick={() => void c.handleDecline()} className="h-12 !bg-destructive !text-white"><PhoneOff /> Decline</Button>
              <Button onClick={() => void c.handleAccept()} disabled={c.busy != null} className="h-12 !bg-success !text-white">
                {c.isVideo ? <Video /> : <Phone />} {c.busy === 'accept' ? 'Joining…' : 'Accept'}
              </Button>
            </div>
            <button type="button" onClick={c.handleDismiss} className="mx-auto inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <X className="size-4" /> Dismiss silently
            </button>
            <p className="-mt-3 text-xs text-muted-foreground">The caller isn't told you dismissed it.</p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

function Tile({ p, large, onMenu }: { p: VoiceParticipant; large?: boolean; onMenu: (p: VoiceParticipant, anchor: { x: number; y: number }) => void }) {
  const { localStream, session } = useVoice();
  const stream = p.isSelf ? localStream : p.stream;
  const hasVideo = p.cameraOn && !!stream;
  const spotlit = session?.globalSpotlightMemberId === p.memberId;
  const open = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onMenu(p, { x: Math.min(r.right, window.innerWidth - 260), y: r.bottom + 4 });
  };
  return (
    <motion.div
      layout
      tabIndex={0}
      role="button"
      aria-label={`${p.name}${p.isSelf ? ' (you)' : ''}, ${p.isMuted ? 'muted' : 'unmuted'}${spotlit ? ', spotlighted' : ''}. Press Enter for options.`}
      onClick={open}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') open(e); }}
      onContextMenu={(e) => { e.preventDefault(); onMenu(p, { x: e.clientX, y: e.clientY }); }}
      className={cn(
        'relative cursor-pointer overflow-hidden rounded-2xl bg-muted outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-accent',
        p.speaking ? 'shadow-[0_0_0_2px_var(--color-success),0_0_24px_rgba(52,211,153,0.35)]' : 'shadow-[0_0_0_1px_var(--sh-border)]',
        large ? 'h-full min-h-[240px] w-full' : 'aspect-[3/4] min-h-[120px] sm:aspect-video',
      )}
    >
      {hasVideo
        ? <StreamVideo stream={stream} muted={p.isSelf} label={`${p.name}'s video`} className="absolute inset-0 h-full w-full" zoomable />
        : <div className="absolute inset-0 flex items-center justify-center"><VoiceAvatar name={p.name} avatarUrl={p.avatarUrl} size={large ? 104 : 60} speaking={p.speaking} muted={p.isMuted} /></div>}
      <div className="absolute inset-x-2 bottom-2 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs text-white backdrop-blur">
        <span className="min-w-0 flex-1 truncate font-medium">{p.name}{p.isSelf && <span className="text-white/60"> (you)</span>}</span>
        {spotlit && <Star className="size-3.5 text-accent" aria-label="Global spotlight" />}
        {p.sharingScreen && <MonitorUp className="size-3.5 text-emerald-300" aria-label="Sharing screen" />}
        {p.isDeafened ? <Headphones className="size-3.5 text-rose-300" aria-label="Deafened" /> : p.isMuted ? <MicOff className="size-3.5 text-rose-300" aria-label="Muted" /> : null}
        <QualityBadge quality={p.connectionQuality} />
      </div>
      {!p.isSelf && <ParticipantAudio participant={p} />}
    </motion.div>
  );
}

function ScreenStage({ participant }: { participant: VoiceParticipant }) {
  const { localScreenStream } = useVoice();
  const stream = participant.isSelf ? localScreenStream : participant.screenStream;
  return (
    <>
      {stream
        ? <StreamVideo stream={stream} muted={participant.isSelf} label={`${participant.name}'s screen share`} className="absolute inset-0 h-full w-full bg-black object-contain" />
        : <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Waiting for {participant.name}'s screen…</div>}
      {!participant.isSelf && <ParticipantAudio participant={participant} />}
    </>
  );
}

export function CallStage({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const v = useCallView(false);
  if (!v.session || !v.expanded) return null;
  const n = v.participants.length;
  // The People sheet renders in a portal outside the stage, so leave
  // fullscreen first or it would open out of sight.
  const openPeople = async () => {
    if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch { /* not in fullscreen */ } }
    v.setListOpen(true);
  };
  const grid = n <= 1 ? 'grid-cols-1' : n <= 4 ? 'grid-cols-1 sm:grid-cols-2' : n <= 9 ? 'grid-cols-2 lg:grid-cols-3' : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4';
  return (
    <TooltipProvider>
    <motion.div
      ref={v.rootRef}
      role="region"
      aria-label={`Call view: ${v.session.name}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex flex-col bg-background text-foreground"
    >
      <span className="sr-only" role="status" aria-live="polite">{v.announcement}</span>
      <header className="flex items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-lg font-semibold">{v.session.name}</h2>
          <p className="flex items-center gap-2"><Status status={v.status} /><span className="text-xs text-muted-foreground">· {n} {n === 1 ? 'person' : 'people'}</span></p>
        </div>
        <Button variant="ghost" onClick={() => void openPeople()} className="h-11"><Users /> <span className="max-sm:sr-only">People</span></Button>
        <Button variant="ghost" size="icon" onClick={() => void v.toggleFullscreen()} aria-label={v.isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} className="size-11 max-sm:hidden">{v.isFullscreen ? <Shrink /> : <Maximize />}</Button>
        <Button variant="ghost" size="icon" onClick={() => v.setExpanded(false)} aria-label="Minimize call view" className="size-11"><Minimize /></Button>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto p-3 pb-28 sm:p-6 sm:pb-28" aria-label="Participants">
        {v.featured ? (
          <div className="flex h-full flex-col gap-3">
            <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-muted">
              {v.featuredIsSharing ? <ScreenStage participant={v.featured} /> : <Tile p={v.featured} large onMenu={v.openMenu} />}
              <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
                {v.featuredIsSharing ? <><MonitorUp className="size-3.5 text-emerald-300" /> {v.featured.name}'s screen</>
                  : <>{v.personalPin === v.featured.memberId ? <Pin className="size-3.5 text-accent" /> : <Star className="size-3.5 text-accent" />} {v.featured.name}</>}
              </span>
            </div>
            {v.rest.length > 0 && (
              <div className="flex shrink-0 gap-2 overflow-x-auto pb-1" aria-label="Other participants">
                {v.rest.map((p) => <div key={p.memberId} className="w-36 shrink-0 sm:w-44"><Tile p={p} onMenu={v.openMenu} /></div>)}
              </div>
            )}
          </div>
        ) : (
          <div className={cn('grid auto-rows-fr gap-3', grid)}>
            {v.participants.map((p) => <Tile key={p.memberId} p={p} onMenu={v.openMenu} />)}
            {n === 0 && <p className="col-span-full py-16 text-center text-sm text-muted-foreground">{v.status === 'joining' ? 'Joining the call…' : 'No one else is here yet.'}</p>}
          </div>
        )}
      </main>
      {/* Control dock */}
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="pointer-events-none fixed inset-x-0 bottom-[calc(16px+env(safe-area-inset-bottom))] flex justify-center px-3">
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-border bg-popover/95 p-1.5 shadow-2xl backdrop-blur" role="toolbar" aria-label="Call controls">
          <MediaButtons />
          {/* Settings is a page: minimize the stage so it isn't hidden behind the call. */}
          <DockButton label="Call settings" onClick={() => { v.setExpanded(false); onOpenSettings?.(); }} className="max-md:hidden"><CrosshairIcon className="size-5" /></DockButton>
          <DockButton label="Leave call" tone="danger" onClick={() => void v.leave()}><PhoneOff className="size-5" /></DockButton>
        </div>
      </motion.div>
      <Sheet open={v.listOpen} onOpenChange={v.setListOpen}>
        <SheetContent side="right" className="w-80 sm:max-w-80">
          <SheetHeader>
            <SheetTitle>People · {n}</SheetTitle>
            <SheetDescription>Tap someone for options.</SheetDescription>
          </SheetHeader>
          <ul className="mt-2 grid gap-1 px-2">
            {v.participants.map((p) => (
              <li key={p.memberId}>
                <button
                  type="button"
                  onClick={(e) => {
                    // Close the sheet first: its overlay would sit over the menu.
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    v.setListOpen(false);
                    v.openMenu(p, { x: Math.max(8, Math.min(r.left, window.innerWidth - 260)), y: r.top });
                  }}
                  aria-label={`${p.name} options`}
                  className={cn('flex min-h-11 w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-muted', p.speaking && 'bg-success/10')}
                >
                  <VoiceAvatar name={p.name} avatarUrl={p.avatarUrl} size={32} speaking={p.speaking} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}{p.isSelf && <span className="font-normal text-muted-foreground"> (you)</span>}</span>
                    <span className="block text-xs text-muted-foreground">{p.speaking ? 'Speaking' : p.isDeafened ? 'Deafened' : p.isMuted ? 'Muted' : p.sharingScreen ? 'Sharing screen' : 'In call'}</span>
                  </span>
                  <QualityBadge quality={p.connectionQuality} />
                </button>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
      {v.menuFor && <ParticipantOptions key={v.menuFor.p.memberId} participant={v.menuFor.p} anchor={v.menuFor.anchor} container={v.rootRef.current} onClose={() => v.setMenuFor(null)} />}
    </motion.div>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------

function OptionRow({ icon: Icon, label, onClick, checked, disabled, danger }: {
  icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void; checked?: boolean; disabled?: boolean; danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:pointer-events-none disabled:opacity-40',
        danger ? 'text-destructive hover:bg-destructive/10' : 'hover:bg-muted',
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="flex-1">{label}</span>
      {checked && <Check className="size-4 text-accent" />}
    </button>
  );
}

/** Per-participant options, anchored where you tapped (same actions as Classic's menu). */
function ParticipantOptions({ participant: p, anchor, container, onClose }: {
  participant: VoiceParticipant; anchor: { x: number; y: number }; container: HTMLElement | null; onClose: () => void;
}) {
  const a = useParticipantActions(p, onClose);
  return (
    <Popover open onOpenChange={(o) => { if (!o) onClose(); }}>
      <PopoverAnchor asChild>
        <span aria-hidden="true" className="pointer-events-none fixed size-px" style={{ left: anchor.x, top: anchor.y }} />
      </PopoverAnchor>
      {/* Portalled into the stage, so it stays visible in fullscreen. */}
      <PopoverContent container={container} align="start" className="max-h-[70dvh] w-64 overflow-y-auto p-1.5" role="menu" aria-label={`Options for ${p.name}`}>
        <div className="flex items-center gap-2.5 px-2.5 py-2">
          <VoiceAvatar name={p.name} avatarUrl={p.avatarUrl} size={28} speaking={p.speaking} />
          <span className="min-w-0 truncate text-sm font-medium">{p.name}{p.isSelf && <span className="font-normal text-muted-foreground"> (you)</span>}</span>
        </div>
        <Separator className="my-1" />
        <OptionRow icon={a.isPinned ? PinOff : Pin} label={a.isPinned ? 'Unpin' : 'Pin for me'} checked={a.isPinned} onClick={() => { a.setPersonalPin(a.isPinned ? null : p.memberId); onClose(); }} />
        <OptionRow icon={Star} label={a.isSpotlit ? 'Remove my spotlight' : 'Spotlight for me'} checked={a.isSpotlit} onClick={() => { a.setPersonalSpotlight(a.isSpotlit ? null : p.memberId); onClose(); }} />
        {!p.isSelf && (
          <div className="px-2.5 pb-1 pt-2">
            <p className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Volume2 className="size-3.5" /> Their volume</span>
              <span className="tabular-nums">{Math.round(a.volume * 100)}%</span>
            </p>
            <Slider aria-label={`Volume for ${p.name}`} min={0} max={100} step={1} value={[Math.round(a.volume * 100)]} onValueChange={([n]) => a.handleVolume(n / 100)} />
          </div>
        )}
        {a.canModerate && !p.isSelf && (
          <>
            <Separator className="my-1" />
            <p className="px-2.5 pb-1 pt-1.5 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Moderate</p>
            <OptionRow icon={MicOff} label="Mute" disabled={p.isMuted} onClick={() => void a.mod('mute', 'mute')} />
            <OptionRow icon={p.isDeafened ? VolumeX : Headphones} label="Deafen" disabled={p.isDeafened} onClick={() => void a.mod('deafen', 'deafen')} />
            <OptionRow icon={VideoOff} label="Disable video" disabled={!p.cameraOn} onClick={() => void a.mod('disable_video', 'disable video')} />
            <OptionRow icon={MonitorUp} label="Stop screen share" disabled={!p.sharingScreen} onClick={() => void a.mod('stop_screen', 'stop screen share')} />
            <button
              type="button"
              role="menuitem"
              aria-expanded={a.moveOpen}
              onClick={() => a.setMoveOpen((o) => !o)}
              className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              <ArrowRightLeft className="size-4" /><span className="flex-1">Move to channel</span>
              <ChevronDown className={cn('size-4 transition-transform', a.moveOpen && 'rotate-180')} />
            </button>
            {a.moveOpen && (
              <div role="menu" aria-label="Target channel" className="ml-6 grid max-h-36 gap-0.5 overflow-y-auto border-l border-border pl-2">
                {a.otherChannels.map((c) => (
                  <button key={c.id} type="button" role="menuitem" onClick={() => void a.handleMove(c.id)} className="min-h-9 truncate rounded-md px-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground">{c.name}</button>
                ))}
                {a.otherChannels.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">No other channels.</p>}
              </div>
            )}
            <OptionRow icon={Star} label={a.isGlobalSpotlight ? 'Remove global spotlight' : 'Set global spotlight'} checked={a.isGlobalSpotlight} onClick={() => void a.handleGlobalSpotlight()} />
            <OptionRow icon={Trash2} label="Remove from call" danger onClick={() => void a.handleRemove()} />
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
