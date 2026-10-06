// VOICE CHANNELS section for the sidebar. Mirrors the text-channel row
// styling (same padding, hover, active states) so it feels native.

import React from 'react';
import { ChevronDown, ChevronRight, EyeOff, Headphones, Lock, MicOff, MonitorUp, Pencil, Video, VideoOff, Volume2 } from 'lucide-react';
import { cn } from '../ui';
import { type VoiceChannelSummary } from '../../voice';
import { useVoiceChannels } from './useVoiceChannels';
import { VoiceAvatar } from './shared';

function JoinedRow({ p, isSelf }: { p: VoiceChannelSummary['participants'][number]; isSelf: boolean }) {
  return (
    <div className="flex items-center gap-2 pl-8 pr-2.5 py-1 rounded-lg group/user" title={p.name}>
      <VoiceAvatar name={p.name} avatarUrl={p.avatarUrl} size={20} speaking={false} />
      <span className={cn('flex-1 min-w-0 truncate text-[13px]', isSelf ? 'text-accent font-semibold' : 'text-text-muted')}>
        {p.name}
      </span>
      <span className="flex items-center gap-1 flex-shrink-0" aria-hidden="true">
        {p.sharingScreen && <MonitorUp className="w-3.5 h-3.5 text-emerald-400" />}
        {!p.cameraOn && <VideoOff className="w-3.5 h-3.5 text-text-muted/50" />}
        {p.isDeafened ? (
          <Headphones className="w-3.5 h-3.5 text-rose-400" />
        ) : p.isMuted ? (
          <MicOff className="w-3.5 h-3.5 text-rose-400" />
        ) : null}
      </span>
      <span className="sr-only">
        {p.isDeafened ? 'deafened' : p.isMuted ? 'muted' : 'unmuted'}
        {p.sharingScreen ? ', sharing screen' : ''}
      </span>
    </div>
  );
}

export function VoiceChannelList({ className }: { className?: string }) {
  const {
    channels, session, error, clearError, canManageVoice, selfId, expandedIds, toggleExpanded, joiningId, handleJoin, joinWithVideo,
    renamingId, setRenamingId, renameName, setRenameName, renameBusy, startRename, handleRenameSubmit,
  } = useVoiceChannels();

  return (
    <div className={className} aria-label="Voice channels">
      <div className="px-3 pt-3 pb-2 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted/70">Voice channels</p>
        {channels.length > 0 && (
          <span className="text-[10px] font-bold text-text-muted/50" aria-label={`${channels.length} voice channels`}>
            {channels.length}
          </span>
        )}
      </div>
      {channels.length === 0 ? (
        <p className="px-3 pb-3 text-xs text-text-muted/60">No voice channels yet.</p>
      ) : (
        <div className="px-2 pb-2 space-y-0.5">
          {channels.map((c) => {
            const isActive = session?.kind === 'voice_channel' && session.channelId === c.id;
            const isExpanded = expandedIds.has(c.id) || isActive;
            const joining = joiningId === c.id;
            const liveCount = c.participantCount;
            return (
              <div key={c.id} className="group/channel relative">
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => handleJoin(c)}
                    disabled={joining}
                    title={isActive ? `In ${c.name}` : `Join ${c.name}`}
                    aria-label={isActive ? `In voice channel ${c.name}` : `Join voice channel ${c.name}`}
                    className={cn(
                      'flex-1 min-w-0 flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-[15px] transition-all text-left',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                      isActive
                        ? 'bg-text-base/[0.08] text-text-base font-semibold'
                        : 'text-text-muted hover:bg-text-base/[0.04] hover:text-text-base',
                    )}
                  >
                    <Volume2 className={cn('w-[18px] h-[18px] flex-shrink-0', isActive ? 'text-accent' : 'text-text-muted/60')} aria-hidden="true" />
                    <span className="truncate flex-1">{c.name}</span>
                    {c.isTemporary && (
                      <span
                        className="flex-shrink-0 rounded-full bg-accent/15 text-accent px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                        title="Ad-hoc call — anyone can join while it's live"
                      >
                        Live call
                      </span>
                    )}
                    {c.locked && <Lock className="w-3.5 h-3.5 flex-shrink-0 text-amber-400/80" aria-label="Locked" />}
                    {c.isPrivate && !c.locked && <EyeOff className="w-3.5 h-3.5 flex-shrink-0 text-text-muted/50" aria-label="Private" />}
                    {/* private channels carry a distinct marker next to the lock */}
                    {liveCount > 0 && (
                      <span
                        className="flex-shrink-0 text-[11px] font-bold text-text-muted/70 tabular-nums"
                        aria-label={`${liveCount} ${liveCount === 1 ? 'person' : 'people'} in channel`}
                      >
                        {liveCount}
                      </span>
                    )}
                    {joining && <span className="text-[11px] text-text-muted flex-shrink-0">Joining…</span>}
                  </button>
                  {/* Join with video — requests camera permission from the tap gesture */}
                  {!isActive && (
                    <button
                      type="button"
                      onClick={() => void joinWithVideo(c.id)}
                      disabled={joining}
                      title={`Join ${c.name} with video`}
                      aria-label={`Join ${c.name} with video on`}
                      className={cn(
                        'flex-shrink-0 p-2 rounded-lg text-text-muted hover:text-text-base hover:bg-text-base/[0.06] transition-all',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                        'opacity-100 md:opacity-0 md:group-hover/channel:opacity-100'
                      )}
                    >
                      <Video className="w-[18px] h-[18px]" aria-hidden="true" />
                    </button>
                  )}
                  {/* Rename — voice admins only */}
                  {canManageVoice && !c.isTemporary && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); startRename(c); }}
                      title={`Rename ${c.name}`}
                      aria-label={`Rename voice channel ${c.name}`}
                      className={cn(
                        'flex-shrink-0 p-2 rounded-lg text-text-muted hover:text-text-base hover:bg-text-base/[0.06] transition-all',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                        'opacity-100 md:opacity-0 md:group-hover/channel:opacity-100'
                      )}
                    >
                      <Pencil className="w-[16px] h-[16px]" aria-hidden="true" />
                    </button>
                  )}
                  {liveCount > 0 && (
                    <button
                      type="button"
                      onClick={() => toggleExpanded(c.id)}
                      aria-expanded={isExpanded}
                      aria-label={isExpanded ? `Hide participants in ${c.name}` : `Show participants in ${c.name}`}
                      title={isExpanded ? 'Hide participants' : 'Show participants'}
                      className="p-1.5 rounded-lg text-text-muted/60 hover:text-text-base hover:bg-text-base/[0.06] flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                  )}
                </div>
                {isExpanded && c.participants.length > 0 && (
                  <div className="mt-0.5 space-y-0.5" role="list" aria-label={`Participants in ${c.name}`}>
                    {c.participants.map((p) => (
                      <JoinedRow key={p.memberId} p={p} isSelf={p.memberId === selfId} />
                    ))}
                  </div>
                )}
                {c.locked && (
                  <span className="sr-only">This channel is locked.</span>
                )}
                {renamingId === c.id && canManageVoice && (
                  <div className="mt-1 mx-1 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      value={renameName}
                      onChange={(e) => setRenameName(e.target.value)}
                      maxLength={40}
                      autoFocus
                      disabled={renameBusy}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSubmit(); if (e.key === 'Escape') setRenamingId(null); }}
                      className="flex-1 min-w-0 bg-secondary border border-text-base/10 rounded-lg px-2.5 py-1.5 text-sm text-text-base focus:outline-none focus:border-accent/60"
                      aria-label="Voice channel name"
                    />
                    <button
                      onClick={handleRenameSubmit}
                      disabled={!renameName.trim() || renameBusy}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-accent text-accent-ink disabled:opacity-40"
                    >
                      {renameBusy ? '…' : 'Save'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {error && (
        <div className="mx-2 mb-2 px-2.5 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-start gap-2">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={clearError} aria-label="Dismiss error" className="text-rose-300/70 hover:text-rose-200">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

export default VoiceChannelList;
