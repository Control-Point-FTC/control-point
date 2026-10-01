// CallView — the expanded call view (full-screen overlay).
// Layout priority: screen share (large) > global/personal spotlight or pin
// (speaker layout) > grid. Participant list sidebar with per-participant
// menus, fullscreen + minimize, keyboard accessible, aria-live status.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Headphones,
  Mic,
  MicOff,
  Minimize,
  Maximize,
  Shrink,
  MonitorUp,
  PhoneOff,
  Settings,
  Users,
  Video,
  VideoOff,
  VolumeX,
  Star,
  Pin,
} from 'lucide-react';
import { cn } from '../ui';
import { useVoice, type VoiceParticipant } from '../../voice';
import { DeviceSettingsModal } from './DeviceSettingsModal';
import { ParticipantMenu } from './ParticipantMenu';
import {
  CallStatusPill,
  ParticipantAudio,
  QualityBadge,
  StreamVideo,
  VoiceAvatar,
  VoiceIconButton,
} from './shared';

// ------------------------------------------------------------------ tile

function ParticipantTile({
  p,
  large = false,
  onMenu,
}: {
  p: VoiceParticipant;
  large?: boolean;
  onMenu: (p: VoiceParticipant, anchor: { x: number; y: number }) => void;
}) {
  const { localStream, localScreenStream, session } = useVoice();
  const stream = p.isSelf ? localStream : p.stream;
  const hasVideo = p.cameraOn && !!stream;
  const isSpotlit =
    session?.globalSpotlightMemberId === p.memberId;

  const openMenu = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onMenu(p, { x: Math.min(rect.right, window.innerWidth - 260), y: rect.bottom + 4 });
  };

  return (
    <div
      tabIndex={0}
      role="button"
      aria-label={`${p.name}${p.isSelf ? ' (you)' : ''}, ${p.isMuted ? 'muted' : 'unmuted'}${isSpotlit ? ', spotlighted' : ''}. Press Enter for options.`}
      onClick={(e) => openMenu(e)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') openMenu(e);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(p, { x: e.clientX, y: e.clientY });
      }}
      className={cn(
        'relative rounded-2xl overflow-hidden bg-secondary border transition-all cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        p.speaking ? 'border-emerald-400 ring-2 ring-emerald-400/60' : 'border-text-base/10',
        large ? 'w-full h-full min-h-[240px]' : 'aspect-video min-h-[120px]',
      )}
    >
      {hasVideo ? (
        <StreamVideo stream={stream} muted={p.isSelf} label={`${p.name}'s video`} className="absolute inset-0 w-full h-full" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <VoiceAvatar name={p.name} avatarUrl={p.avatarUrl} size={large ? 96 : 56} speaking={p.speaking} muted={p.isMuted} />
        </div>
      )}

      {/* name + badges */}
      <div className="absolute bottom-0 inset-x-0 p-2 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent">
        <span className="text-xs font-bold text-white truncate flex-1">
          {p.name}
          {p.isSelf && <span className="text-white/60 font-semibold"> (you)</span>}
        </span>
        {isSpotlit && (
          <span title="Global spotlight" aria-label="Global spotlight">
            <Star className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
          </span>
        )}
        {p.sharingScreen && (
          <span title="Sharing screen" aria-label="Sharing screen">
            <MonitorUp className="w-3.5 h-3.5 text-emerald-300" aria-hidden="true" />
          </span>
        )}
        {p.isDeafened ? (
          <span title="Deafened" aria-label="Deafened">
            <Headphones className="w-3.5 h-3.5 text-rose-300" aria-hidden="true" />
          </span>
        ) : p.isMuted ? (
          <span title="Muted" aria-label="Muted">
            <MicOff className="w-3.5 h-3.5 text-rose-300" aria-hidden="true" />
          </span>
        ) : null}
        <QualityBadge quality={p.connectionQuality} />
      </div>
      {!p.isSelf && <ParticipantAudio participant={p} />}
    </div>
  );
}

// ------------------------------------------------------------------ view

export function CallView() {
  const {
    status,
    session,
    participants,
    self,
    expanded,
    setExpanded,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    toggleScreenShare,
    leave,
    personalPin,
    personalSpotlight,
  } = useVoice();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<{ p: VoiceParticipant; anchor: { x: number; y: number } } | null>(null);
  const [listOpen, setListOpen] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const prevStatus = useRef(status);
  const [announcement, setAnnouncement] = useState('');

  // aria-live announcements for status changes (text, never color-only).
  useEffect(() => {
    if (prevStatus.current !== status) {
      const labels: Record<string, string> = {
        joining: 'Connecting to the call',
        connected: 'Connected to the call',
        reconnecting: 'Connection lost — reconnecting',
        failed: 'Connection failed',
        ended: 'Call ended',
      };
      setAnnouncement(labels[status] ?? '');
      prevStatus.current = status;
    }
  }, [status]);

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await rootRef.current?.requestFullscreen();
    } catch {
      /* fullscreen unsupported — no-op */
    }
  };

  const featuredId = useMemo(() => {
    if (participants.length === 0) return null;
    const sharer = participants.find((p) => p.sharingScreen);
    if (sharer) return sharer.memberId;
    if (session?.globalSpotlightMemberId != null) return session.globalSpotlightMemberId;
    if (personalSpotlight != null) return personalSpotlight;
    if (personalPin != null) return personalPin;
    return null;
  }, [participants, session?.globalSpotlightMemberId, personalSpotlight, personalPin]);

  const featured = featuredId != null ? participants.find((p) => p.memberId === featuredId) ?? null : null;
  const rest = featured ? participants.filter((p) => p.memberId !== featured.memberId) : participants;
  const featuredIsSharing = !!featured?.sharingScreen;

  if (!session || !expanded) return null;

  const openMenu = (p: VoiceParticipant, anchor: { x: number; y: number }) => setMenuFor({ p, anchor });

  // Grid columns adapt to count (and viewport via CSS).
  const gridCols =
    participants.length <= 1 ? 'grid-cols-1' :
    participants.length <= 4 ? 'grid-cols-1 sm:grid-cols-2' :
    participants.length <= 9 ? 'grid-cols-2 lg:grid-cols-3' :
    'grid-cols-2 md:grid-cols-3 xl:grid-cols-4';

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label={`Call view: ${session.name}`}
      className="fixed inset-0 z-50 bg-primary flex flex-col"
    >
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>

      {/* ---------------------------------------------------------- header */}
      <header className="flex-shrink-0 flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-3 border-b border-text-base/10">
        <div className="min-w-0 flex-1">
          <h2 className="text-base sm:text-lg font-bold text-text-base truncate">{session.name}</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <CallStatusPill status={status} />
            <span className="text-xs text-text-muted" aria-label={`${participants.length} participants`}>
              {participants.length} {participants.length === 1 ? 'person' : 'people'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1" role="toolbar" aria-label="Call controls">
          <VoiceIconButton label={self.muted ? 'Unmute' : 'Mute'} active={self.muted} onClick={toggleMute} className={cn('p-2.5', self.muted && '!text-rose-400')}>
            {self.muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </VoiceIconButton>
          <VoiceIconButton label={self.deafened ? 'Undeafen' : 'Deafen'} active={self.deafened} onClick={toggleDeafen} className={cn('p-2.5', self.deafened && '!text-rose-400')}>
            {self.deafened ? <VolumeX className="w-5 h-5" /> : <Headphones className="w-5 h-5" />}
          </VoiceIconButton>
          <VoiceIconButton label={self.cameraOn ? 'Turn camera off' : 'Turn camera on'} active={self.cameraOn} onClick={() => void toggleCamera()} className="p-2.5 hidden sm:inline-flex">
            {self.cameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </VoiceIconButton>
          <VoiceIconButton label={self.sharingScreen ? 'Stop sharing screen' : 'Share screen'} active={self.sharingScreen} onClick={() => void toggleScreenShare()} className={cn('p-2.5 hidden sm:inline-flex', self.sharingScreen && '!text-emerald-400')}>
            <MonitorUp className="w-5 h-5" />
          </VoiceIconButton>
          <VoiceIconButton label="Call settings" onClick={() => setSettingsOpen(true)} className="p-2.5 hidden md:inline-flex">
            <Settings className="w-5 h-5" />
          </VoiceIconButton>
          <VoiceIconButton label={listOpen ? 'Hide participant list' : 'Show participant list'} active={listOpen} onClick={() => setListOpen((v) => !v)} className="p-2.5">
            <Users className="w-5 h-5" />
          </VoiceIconButton>
          <VoiceIconButton label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={() => void toggleFullscreen()} className="p-2.5 hidden sm:inline-flex">
            {isFullscreen ? <Shrink className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </VoiceIconButton>
          <VoiceIconButton label="Minimize call view" onClick={() => setExpanded(false)} className="p-2.5">
            <Minimize className="w-5 h-5" />
          </VoiceIconButton>
          <VoiceIconButton label="Leave call" danger onClick={() => void leave()} className="p-2.5">
            <PhoneOff className="w-5 h-5" />
          </VoiceIconButton>
        </div>
      </header>

      {/* ------------------------------------------------------------ body */}
      <div className="flex-1 min-h-0 flex">
        <main className="flex-1 min-w-0 overflow-y-auto custom-scrollbar p-3 sm:p-5" aria-label="Participants">
          {featured ? (
            <div className="h-full flex flex-col gap-3">
              {/* featured stage: screen share gets visual priority */}
              <div className="flex-1 min-h-0 relative rounded-2xl overflow-hidden bg-secondary border border-text-base/10">
                {featuredIsSharing ? (
                  <ScreenStage participant={featured} />
                ) : (
                  <ParticipantTile p={featured} large onMenu={openMenu} />
                )}
                <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-bold text-white">
                  {featuredIsSharing ? (
                    <>
                      <MonitorUp className="w-3.5 h-3.5 text-emerald-300" aria-hidden="true" />
                      {featured.name}'s screen
                    </>
                  ) : (
                    <>
                      {personalPin === featured.memberId ? (
                        <Pin className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
                      ) : (
                        <Star className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
                      )}
                      {featured.name}
                    </>
                  )}
                </div>
              </div>
              {/* thumbnail strip */}
              {rest.length > 0 && (
                <div className="flex-shrink-0 flex gap-2 overflow-x-auto custom-scrollbar pb-1" aria-label="Other participants">
                  {rest.map((p) => (
                    <div key={p.memberId} className="w-36 sm:w-44 flex-shrink-0">
                      <ParticipantTile p={p} onMenu={openMenu} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className={cn('grid gap-3 auto-rows-fr', gridCols)}>
              {participants.map((p) => (
                <ParticipantTile key={p.memberId} p={p} onMenu={openMenu} />
              ))}
              {participants.length === 0 && (
                <p className="text-sm text-text-muted col-span-full text-center py-16">
                  {status === 'joining' ? 'Joining the call…' : 'No one else is here yet.'}
                </p>
              )}
            </div>
          )}
        </main>

        {/* ----------------------------------------------- participant list */}
        {listOpen && (
          <aside
            className="hidden md:flex w-64 flex-shrink-0 flex-col border-l border-text-base/10 bg-elevated/50"
            aria-label="Participant list"
          >
            <p className="px-4 pt-4 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted/70">
              People · {participants.length}
            </p>
            <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-4 space-y-0.5">
              {participants.map((p) => (
                <button
                  key={p.memberId}
                  type="button"
                  onClick={(e) => {
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    openMenu(p, { x: rect.left - 248, y: rect.top });
                  }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-colors',
                    'hover:bg-text-base/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    p.speaking && 'bg-emerald-500/[0.07]',
                  )}
                  aria-label={`${p.name} options`}
                >
                  <VoiceAvatar name={p.name} avatarUrl={p.avatarUrl} size={30} speaking={p.speaking} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-text-base truncate">
                      {p.name}
                      {p.isSelf && <span className="text-text-muted font-normal"> (you)</span>}
                    </span>
                    <span className="block text-[11px] text-text-muted">
                      {p.speaking ? 'Speaking' : p.isDeafened ? 'Deafened' : p.isMuted ? 'Muted' : p.sharingScreen ? 'Sharing screen' : 'In call'}
                    </span>
                  </span>
                  <QualityBadge quality={p.connectionQuality} />
                </button>
              ))}
            </div>
          </aside>
        )}
      </div>

      {settingsOpen && <DeviceSettingsModal onClose={() => setSettingsOpen(false)} />}
      {menuFor && (
        <ParticipantMenu participant={menuFor.p} anchor={menuFor.anchor} onClose={() => setMenuFor(null)} />
      )}
    </div>
  );
}

/** Large screen-share stage (featured participant's screen stream). */
function ScreenStage({ participant }: { participant: VoiceParticipant }) {
  const { localScreenStream } = useVoice();
  const stream = participant.isSelf ? localScreenStream : participant.screenStream;
  return (
    <>
      {stream ? (
        <StreamVideo stream={stream} muted={participant.isSelf} label={`${participant.name}'s screen share`} className="absolute inset-0 w-full h-full object-contain bg-black" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-text-muted">Waiting for {participant.name}'s screen…</p>
        </div>
      )}
      {!participant.isSelf && <ParticipantAudio participant={participant} />}
    </>
  );
}

export default CallView;
