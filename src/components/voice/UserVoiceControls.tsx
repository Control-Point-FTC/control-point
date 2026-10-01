// UserVoiceControls — Discord-style bottom-left voice controls.
// Renders next to / above the existing user profile block: mic toggle with
// input-device dropdown + level meter, deafen toggle with output dropdown,
// and a settings gear that opens DeviceSettingsModal.
// Everything is no-op (with a hint) when not in a call.

import React, { useEffect, useRef, useState } from 'react';
import { ChevronUp, Headphones, Mic, MicOff, Settings, TriangleAlert, VolumeX } from 'lucide-react';
import { cn } from '../ui';
import { useVoice } from '../../voice';
import { DeviceSettingsModal } from './DeviceSettingsModal';
import { MicLevelMeter, VoiceIconButton } from './shared';

function Dropdown({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div
        role="menu"
        aria-label={label}
        className="absolute bottom-full left-0 mb-2 w-72 z-50 bg-elevated border border-text-base/10 rounded-2xl shadow-2xl overflow-hidden p-3 space-y-3"
      >
        {children}
      </div>
    </>
  );
}

export function UserVoiceControls({ className }: { className?: string }) {
  const {
    status,
    session,
    self,
    devices,
    selectedDevices,
    setDevice,
    toggleMute,
    toggleDeafen,
    micDenied,
  } = useVoice();
  const [micMenuOpen, setMicMenuOpen] = useState(false);
  const [deafenMenuOpen, setDeafenMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const inCall = session != null && (status === 'connected' || status === 'reconnecting' || status === 'joining');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMicMenuOpen(false);
        setDeafenMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const micLabel = !inCall
    ? 'Microphone (join a call first)'
    : self.muted
      ? 'Unmute microphone'
      : 'Mute microphone';
  const deafenLabel = !inCall
    ? 'Deafen (join a call first)'
    : self.deafened
      ? 'Undeafen'
      : 'Deafen (mute incoming audio)';

  return (
    <div ref={rootRef} className={cn('relative flex items-center gap-1', className)} aria-label="Voice controls">
      {/* --------------------------------------------- mic + input dropdown */}
      <div className="relative">
        <div className="flex rounded-xl overflow-hidden">
          <VoiceIconButton
            label={micLabel}
            active={inCall && self.muted}
            onClick={toggleMute}
            disabled={!inCall}
            className={cn('p-2 rounded-r-none', inCall && self.muted && '!text-rose-400')}
          >
            {self.muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </VoiceIconButton>
          <VoiceIconButton
            label="Microphone options"
            onClick={() => {
              setMicMenuOpen((v) => !v);
              setDeafenMenuOpen(false);
            }}
            aria-expanded={micMenuOpen}
            aria-haspopup="menu"
            className="p-1.5 rounded-l-none border-l border-text-base/10"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </VoiceIconButton>
        </div>
        <Dropdown open={micMenuOpen} onClose={() => setMicMenuOpen(false)} label="Microphone options">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted/70 mb-1.5">Input device</p>
            <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar" role="radiogroup" aria-label="Input devices">
              <button
                type="button"
                role="radio"
                aria-checked={!selectedDevices.micId}
                onClick={() => setDevice('mic', undefined)}
                className={cn(
                  'w-full text-left px-2.5 py-1.5 rounded-lg text-sm truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  !selectedDevices.micId ? 'bg-accent/15 text-accent font-semibold' : 'text-text-muted hover:text-text-base hover:bg-text-base/[0.06]',
                )}
              >
                Default microphone
              </button>
              {devices.audioinputs.map((d) => (
                <button
                  key={d.deviceId}
                  type="button"
                  role="radio"
                  aria-checked={selectedDevices.micId === d.deviceId}
                  onClick={() => setDevice('mic', d.deviceId)}
                  className={cn(
                    'w-full text-left px-2.5 py-1.5 rounded-lg text-sm truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    selectedDevices.micId === d.deviceId
                      ? 'bg-accent/15 text-accent font-semibold'
                      : 'text-text-muted hover:text-text-base hover:bg-text-base/[0.06]',
                  )}
                >
                  {d.label || `Microphone ${d.deviceId.slice(0, 6)}`}
                </button>
              ))}
              {devices.audioinputs.length === 0 && (
                <p className="text-xs text-text-muted px-2.5 py-1.5">No input devices detected.</p>
              )}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted/70 mb-1.5">Input level</p>
            <MicLevelMeter level={inCall ? self.micLevel : 0} />
          </div>
          <button
            type="button"
            onClick={() => {
              setMicMenuOpen(false);
              setSettingsOpen(true);
            }}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm font-semibold text-text-muted hover:text-text-base hover:bg-text-base/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Settings className="w-4 h-4" aria-hidden="true" /> Voice settings
          </button>
        </Dropdown>
      </div>

      {/* ------------------------------------------ deafen + output dropdown */}
      <div className="relative">
        <div className="flex rounded-xl overflow-hidden">
          <VoiceIconButton
            label={deafenLabel}
            active={inCall && self.deafened}
            onClick={toggleDeafen}
            disabled={!inCall}
            className={cn('p-2 rounded-r-none', inCall && self.deafened && '!text-rose-400')}
          >
            {self.deafened ? <VolumeX className="w-4 h-4" /> : <Headphones className="w-4 h-4" />}
          </VoiceIconButton>
          <VoiceIconButton
            label="Audio output options"
            onClick={() => {
              setDeafenMenuOpen((v) => !v);
              setMicMenuOpen(false);
            }}
            aria-expanded={deafenMenuOpen}
            aria-haspopup="menu"
            className="p-1.5 rounded-l-none border-l border-text-base/10"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </VoiceIconButton>
        </div>
        <Dropdown open={deafenMenuOpen} onClose={() => setDeafenMenuOpen(false)} label="Audio output options">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted/70 mb-1.5">Output device</p>
            {devices.audiooutputs.length === 0 ? (
              <p className="text-xs text-text-muted">Output selection is not supported in this browser.</p>
            ) : (
              <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar" role="radiogroup" aria-label="Output devices">
                <button
                  type="button"
                  role="radio"
                  aria-checked={!selectedDevices.speakerId}
                  onClick={() => setDevice('speaker', undefined)}
                  className={cn(
                    'w-full text-left px-2.5 py-1.5 rounded-lg text-sm truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    !selectedDevices.speakerId ? 'bg-accent/15 text-accent font-semibold' : 'text-text-muted hover:text-text-base hover:bg-text-base/[0.06]',
                  )}
                >
                  Default output
                </button>
                {devices.audiooutputs.map((d) => (
                  <button
                    key={d.deviceId}
                    type="button"
                    role="radio"
                    aria-checked={selectedDevices.speakerId === d.deviceId}
                    onClick={() => setDevice('speaker', d.deviceId)}
                    className={cn(
                      'w-full text-left px-2.5 py-1.5 rounded-lg text-sm truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                      selectedDevices.speakerId === d.deviceId
                        ? 'bg-accent/15 text-accent font-semibold'
                        : 'text-text-muted hover:text-text-base hover:bg-text-base/[0.06]',
                    )}
                  >
                    {d.label || `Output ${d.deviceId.slice(0, 6)}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Dropdown>
      </div>

      {/* ------------------------------------------------------- settings */}
      <VoiceIconButton label="Voice & video settings" onClick={() => setSettingsOpen(true)} className="p-2">
        <Settings className="w-4 h-4" />
      </VoiceIconButton>

      {/* ------------------------------------------- mic permission warning */}
      {micDenied && (
        <div
          role="alert"
          className="absolute bottom-full left-0 mb-2 w-72 z-50 bg-rose-500/10 border border-rose-500/30 rounded-2xl p-3 text-xs text-rose-200 flex items-start gap-2"
        >
          <TriangleAlert className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            Microphone access is blocked. Others can't hear you — allow the microphone in your browser's site
            settings, then rejoin.
          </span>
        </div>
      )}

      {settingsOpen && <DeviceSettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

export default UserVoiceControls;
