// ParticipantMenu — per-participant context menu.
// Personal actions (pin / spotlight / volume) are local-only.
// Moderator items render only when canModerate; destructive actions go
// through confirmDialog.

import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, MicOff, MonitorUp, Pin, PinOff, Star, Trash2, VideoOff, Volume2, VolumeX, Headphones } from 'lucide-react';
import { cn } from '../ui';
import { confirmDialog } from '../dialog';
import { useVoice, type VoiceParticipant } from '../../voice';
import { getPeerVolume, setPeerVolume, VoiceIconButton } from './shared';

function MenuItem({
  label,
  icon: Icon,
  onClick,
  danger = false,
  checked = false,
  disabled = false,
}: {
  label: string;
  icon: any;
  onClick?: () => void;
  danger?: boolean;
  checked?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors text-left',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        danger
          ? 'text-rose-300 hover:bg-rose-500/10'
          : 'text-text-base hover:bg-text-base/[0.06]',
        disabled && 'opacity-40 pointer-events-none',
      )}
    >
      <Icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
      <span className="flex-1">{label}</span>
      {checked && <Check className="w-4 h-4 text-accent flex-shrink-0" aria-hidden="true" />}
    </button>
  );
}

function MenuDivider() {
  return <div className="my-1 border-t border-text-base/10" role="separator" aria-hidden="true" />;
}

export function ParticipantMenu({
  participant,
  onClose,
  anchor,
}: {
  participant: VoiceParticipant;
  onClose: () => void;
  /** Viewport position {x, y} where the menu should appear. */
  anchor: { x: number; y: number };
}) {
  const {
    personalPin,
    personalSpotlight,
    setPersonalPin,
    setPersonalSpotlight,
    canModerate,
    moderate,
    channels,
    session,
  } = useVoice();
  const [volume, setVolume] = useState(() => getPeerVolume(participant.memberId));
  const [moveOpen, setMoveOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isPinned = personalPin === participant.memberId;
  const isSpotlit = personalSpotlight === participant.memberId;
  const isGlobalSpotlight = session?.globalSpotlightMemberId === participant.memberId;

  useEffect(() => {
    const el = menuRef.current;
    el?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Keep the menu inside the viewport.
  const pos = {
    left: Math.min(anchor.x, window.innerWidth - 260),
    top: Math.min(anchor.y, window.innerHeight - 420),
  };

  const handleVolume = (v: number) => {
    setVolume(v);
    setPeerVolume(participant.memberId, v);
  };

  const mod = async (action: 'mute' | 'deafen' | 'disable_video' | 'stop_screen', label: string) => {
    await moderate(action, participant.memberId);
    onClose();
  };

  const handleRemove = async () => {
    const ok = await confirmDialog({
      title: `Remove ${participant.name}?`,
      message: `${participant.name} will be kicked from this call. They can rejoin unless the channel is locked.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    await moderate('remove', participant.memberId);
    onClose();
  };

  const handleMove = async (channelId: number) => {
    await moderate('move', participant.memberId, { targetChannelId: channelId });
    onClose();
  };

  const handleGlobalSpotlight = async () => {
    await moderate(isGlobalSpotlight ? 'unspotlight' : 'spotlight', participant.memberId);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} aria-hidden="true" />
      <div
        ref={menuRef}
        role="menu"
        aria-label={`Options for ${participant.name}`}
        className="fixed z-[61] w-60 bg-elevated border border-text-base/10 rounded-2xl shadow-2xl p-1.5 max-h-[70vh] overflow-y-auto custom-scrollbar"
        style={{ left: Math.max(8, pos.left), top: Math.max(8, pos.top) }}
      >
        {/* ------------------------------------------- personal (local-only) */}
        <MenuItem
          label={isPinned ? 'Unpin' : 'Pin for me'}
          icon={isPinned ? PinOff : Pin}
          checked={isPinned}
          onClick={() => {
            setPersonalPin(isPinned ? null : participant.memberId);
            onClose();
          }}
        />
        <MenuItem
          label={isSpotlit ? 'Remove my spotlight' : 'Spotlight for me'}
          icon={Star}
          checked={isSpotlit}
          onClick={() => {
            setPersonalSpotlight(isSpotlit ? null : participant.memberId);
            onClose();
          }}
        />
        <div className="px-3 py-2">
          <label htmlFor={`vol-${participant.memberId}`} className="flex items-center gap-2 text-xs font-semibold text-text-muted mb-1.5">
            <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
            Their volume
          </label>
          <input
            id={`vol-${participant.memberId}`}
            type="range"
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            onChange={(e) => handleVolume(Number(e.target.value) / 100)}
            className="w-full accent-[#FFC700]"
            aria-valuetext={`${Math.round(volume * 100)} percent`}
          />
        </div>

        {/* --------------------------------------------------- moderator */}
        {canModerate && !participant.isSelf && (
          <>
            <MenuDivider />
            <p className="px-3 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted/70">
              Moderate
            </p>
            <MenuItem label="Mute" icon={MicOff} onClick={() => void mod('mute', 'mute')} disabled={participant.isMuted} />
            <MenuItem label="Deafen" icon={participant.isDeafened ? VolumeX : Headphones} onClick={() => void mod('deafen', 'deafen')} disabled={participant.isDeafened} />
            <MenuItem
              label="Disable video"
              icon={VideoOff}
              onClick={() => void mod('disable_video', 'disable video')}
              disabled={!participant.cameraOn}
            />
            <MenuItem
              label="Stop screen share"
              icon={MonitorUp}
              onClick={() => void mod('stop_screen', 'stop screen share')}
              disabled={!participant.sharingScreen}
            />
            <div className="relative">
              <MenuItem
                label="Move to channel"
                icon={ChevronRight}
                onClick={() => setMoveOpen((v) => !v)}
              />
              {moveOpen && (
                <div className="px-1.5 pb-1 max-h-36 overflow-y-auto custom-scrollbar" role="menu" aria-label="Target channel">
                  {channels
                    .filter((c) => c.id !== session?.channelId)
                    .map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        role="menuitem"
                        onClick={() => void handleMove(c.id)}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-sm text-text-muted hover:text-text-base hover:bg-text-base/[0.06] truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        {c.name}
                      </button>
                    ))}
                  {channels.filter((c) => c.id !== session?.channelId).length === 0 && (
                    <p className="text-xs text-text-muted px-2.5 py-1.5">No other channels.</p>
                  )}
                </div>
              )}
            </div>
            <MenuItem
              label={isGlobalSpotlight ? 'Remove global spotlight' : 'Set global spotlight'}
              icon={Star}
              checked={isGlobalSpotlight}
              onClick={() => void handleGlobalSpotlight()}
            />
            <MenuItem label="Remove from call" icon={Trash2} danger onClick={() => void handleRemove()} />
          </>
        )}
      </div>
    </>
  );
}

export default ParticipantMenu;
