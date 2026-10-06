// Modern voice channels for the Messages sidebar (phase 10b), over the shared
// useVoiceChannels: the same join rules (asks about video per your camera
// default), join-with-video, auto-expanding live channels and admin rename.
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, EyeOff, Headphones, Loader2, Lock, MicOff, MonitorUp, Pencil, Video, VideoOff, Volume2, X } from 'lucide-react';
import { cn } from '../../../components/cn';
import { Badge, Button, Input } from '../../../components/ui-kit';
import { VoiceAvatar } from '../../../components/voice/shared';
import { useVoiceChannels } from '../../../components/voice/useVoiceChannels';

export function VoiceChannels() {
  const v = useVoiceChannels();
  return (
    <section aria-label="Voice channels">
      <div className="flex min-h-8 items-center justify-between px-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Voice</p>
        {v.channels.length > 0 && <span className="text-xs tabular-nums text-muted-foreground" aria-label={`${v.channels.length} voice channels`}>{v.channels.length}</span>}
      </div>
      {v.channels.length === 0 ? (
        <p className="px-2 pb-2 text-sm text-muted-foreground">No voice channels yet.</p>
      ) : (
        <ul className="space-y-0.5">
          {v.channels.map((c) => {
            const active = v.session?.kind === 'voice_channel' && v.session.channelId === c.id;
            const expanded = v.expandedIds.has(c.id) || active;
            const joining = v.joiningId === c.id;
            const live = c.participantCount;
            return (
              <li key={c.id} className="group/vc">
                <div className={cn('flex items-center rounded-md', active && 'bg-accent/10')}>
                  <button
                    type="button"
                    onClick={() => void v.handleJoin(c)}
                    disabled={joining}
                    aria-label={active ? `In voice channel ${c.name}` : `Join voice channel ${c.name}`}
                    className={cn(
                      'flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors max-sm:min-h-11',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                      active ? 'font-medium text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <span className="relative flex size-4 shrink-0 items-center justify-center">
                      <Volume2 className={cn('size-4', active ? 'text-accent' : '')} />
                      {live > 0 && <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-success" aria-hidden="true" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    {c.isTemporary && <Badge variant="outline" className="border-accent/40 text-accent">Live call</Badge>}
                    {c.locked && <Lock className="size-3.5 shrink-0 text-amber-500" aria-label="Locked" />}
                    {c.isPrivate && !c.locked && <EyeOff className="size-3.5 shrink-0" aria-label="Private" />}
                    {live > 0 && <span className="shrink-0 text-xs tabular-nums" aria-label={`${live} ${live === 1 ? 'person' : 'people'} in channel`}>{live}</span>}
                    {joining && <Loader2 className="size-3.5 shrink-0 animate-spin" aria-label="Joining" />}
                  </button>
                  {!active && (
                    <Button variant="ghost" size="icon-sm" onClick={() => void v.joinWithVideo(c.id)} disabled={joining} aria-label={`Join ${c.name} with video on`} className="opacity-100 md:opacity-0 md:group-hover/vc:opacity-100 md:focus-visible:opacity-100 max-sm:size-11"><Video /></Button>
                  )}
                  {v.canManageVoice && !c.isTemporary && (
                    <Button variant="ghost" size="icon-sm" onClick={() => v.startRename(c)} aria-label={`Rename voice channel ${c.name}`} className="opacity-100 md:opacity-0 md:group-hover/vc:opacity-100 md:focus-visible:opacity-100 max-sm:size-11"><Pencil /></Button>
                  )}
                  {live > 0 && (
                    <Button variant="ghost" size="icon-sm" onClick={() => v.toggleExpanded(c.id)} aria-expanded={expanded} aria-label={expanded ? `Hide participants in ${c.name}` : `Show participants in ${c.name}`} className="max-sm:size-11">
                      <ChevronDown className={cn('transition-transform', !expanded && '-rotate-90')} />
                    </Button>
                  )}
                </div>
                <AnimatePresence initial={false}>
                  {expanded && c.participants.length > 0 && (
                    <motion.ul
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="ml-4 overflow-hidden border-l border-border pl-2"
                      aria-label={`Participants in ${c.name}`}
                    >
                      {c.participants.map((p) => (
                        <li key={p.memberId} className="flex min-h-8 items-center gap-2 px-1.5 text-sm" title={p.name}>
                          <VoiceAvatar name={p.name} avatarUrl={p.avatarUrl} size={20} speaking={false} />
                          <span className={cn('min-w-0 flex-1 truncate', p.memberId === v.selfId ? 'font-medium text-foreground' : 'text-muted-foreground')}>{p.name}{p.memberId === v.selfId && ' (you)'}</span>
                          <span className="flex shrink-0 items-center gap-1 text-muted-foreground" aria-hidden="true">
                            {p.sharingScreen && <MonitorUp className="size-3.5 text-success" />}
                            {!p.cameraOn && <VideoOff className="size-3.5 opacity-50" />}
                            {p.isDeafened ? <Headphones className="size-3.5 text-destructive" /> : p.isMuted ? <MicOff className="size-3.5 text-destructive" /> : null}
                          </span>
                          <span className="sr-only">{p.isDeafened ? 'deafened' : p.isMuted ? 'muted' : 'unmuted'}{p.sharingScreen ? ', sharing screen' : ''}</span>
                        </li>
                      ))}
                    </motion.ul>
                  )}
                </AnimatePresence>
                {v.renamingId === c.id && v.canManageVoice && (
                  <form className="mx-1 mt-1 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); void v.handleRenameSubmit(); }}>
                    <Input autoFocus value={v.renameName} onChange={(e) => v.setRenameName(e.target.value)} maxLength={40} disabled={v.renameBusy} aria-label="Voice channel name" className="h-9" onKeyDown={(e) => { if (e.key === 'Escape') v.setRenamingId(null); }} />
                    <Button type="submit" size="icon-sm" disabled={!v.renameName.trim() || v.renameBusy} aria-label="Save voice channel name" className="size-9"><Check /></Button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {v.error && (
        <p role="alert" className="mt-2 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
          <span className="flex-1">{v.error}</span>
          <button type="button" onClick={v.clearError} aria-label="Dismiss error" className="shrink-0"><X className="size-3.5" /></button>
        </p>
      )}
    </section>
  );
}
