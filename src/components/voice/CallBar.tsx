// CallBar — compact persistent call bar. Render it once at the app root
// (fixed bottom); it survives workspace navigation because it lives outside
// the routed views. Hidden when idle.

import React, { useState } from 'react';
import { Expand, Mic, MicOff, MonitorUp, PhoneOff, Settings, Video, VideoOff, VolumeX, Headphones } from 'lucide-react';
import { cn } from '../ui';
import { useVoice } from '../../voice';
import { DeviceSettingsModal } from './DeviceSettingsModal';
import { CallStatusPill, VoiceAvatar, VoiceIconButton } from './shared';

export function CallBar() {
  const {
    status,
    session,
    participants,
    self,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    toggleScreenShare,
    setExpanded,
    leave,
  } = useVoice();
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (!session || status === 'idle' || status === 'ended') return null;

  const others = participants.filter((p) => !p.isSelf).slice(0, 5);
  const extra = Math.max(0, participants.length - 1 - others.length);

  return (
    <div
      role="region"
      aria-label={`Active call: ${session.name}`}
      className="fixed bottom-0 inset-x-0 z-40 pointer-events-none"
    >
      <div className="mx-auto max-w-3xl px-3 pb-3">
        <div
          className={cn(
            'pointer-events-auto flex items-center gap-2 sm:gap-3 rounded-2xl border border-text-base/10 bg-elevated/95 backdrop-blur px-3 py-2 shadow-[0_8px_30px_rgba(0,0,0,0.45)]',
            status === 'reconnecting' && 'border-amber-400/40',
            status === 'failed' && 'border-rose-500/40',
          )}
        >
          {/* name + status */}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-text-base truncate leading-tight">{session.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <CallStatusPill status={status} />
              <span className="text-[11px] text-text-muted" aria-label={`${participants.length} participants`}>
                {participants.length} {participants.length === 1 ? 'person' : 'people'}
              </span>
            </div>
          </div>

          {/* overlapping avatars with speaking rings */}
          <div className="hidden sm:flex items-center -space-x-2" aria-hidden="true">
            {others.map((p) => (
              <VoiceAvatar
                key={p.memberId}
                name={p.name}
                avatarUrl={p.avatarUrl}
                size={26}
                speaking={p.speaking}
                className="ring-2 ring-elevated"
              />
            ))}
            {extra > 0 && (
              <span className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-full bg-secondary text-[10px] font-bold text-text-muted ring-2 ring-elevated">
                +{extra}
              </span>
            )}
          </div>

          {/* controls */}
          <div className="flex items-center gap-0.5 sm:gap-1" role="toolbar" aria-label="Call controls">
            <VoiceIconButton
              label={self.muted ? 'Unmute' : 'Mute'}
              active={self.muted}
              onClick={toggleMute}
              className={cn('p-2', self.muted && '!text-rose-400')}
            >
              {self.muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </VoiceIconButton>
            <VoiceIconButton
              label={self.deafened ? 'Undeafen' : 'Deafen'}
              active={self.deafened}
              onClick={toggleDeafen}
              className={cn('p-2', self.deafened && '!text-rose-400')}
            >
              {self.deafened ? <VolumeX className="w-4 h-4" /> : <Headphones className="w-4 h-4" />}
            </VoiceIconButton>
            <VoiceIconButton
              label={self.cameraOn ? 'Turn camera off' : 'Turn camera on'}
              active={self.cameraOn}
              onClick={() => void toggleCamera()}
              className="p-2 hidden sm:inline-flex"
            >
              {self.cameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
            </VoiceIconButton>
            <VoiceIconButton
              label={self.sharingScreen ? 'Stop sharing screen' : 'Share screen'}
              active={self.sharingScreen}
              onClick={() => void toggleScreenShare()}
              className={cn('p-2 hidden sm:inline-flex', self.sharingScreen && '!text-emerald-400')}
            >
              <MonitorUp className="w-4 h-4" />
            </VoiceIconButton>
            <VoiceIconButton label="Call settings" onClick={() => setSettingsOpen(true)} className="p-2 hidden sm:inline-flex">
              <Settings className="w-4 h-4" />
            </VoiceIconButton>
            <VoiceIconButton label="Expand call view" onClick={() => setExpanded(true)} className="p-2">
              <Expand className="w-4 h-4" />
            </VoiceIconButton>
            <VoiceIconButton label="Leave call" danger onClick={() => void leave()} className="p-2">
              <PhoneOff className="w-4 h-4" />
            </VoiceIconButton>
          </div>
        </div>
      </div>
      {settingsOpen && <DeviceSettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

export default CallBar;
