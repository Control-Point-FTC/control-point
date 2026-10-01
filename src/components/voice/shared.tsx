// Shared voice-UI primitives: avatars, status pills, level meters, an
// icon-button with tooltip + focus ring, a <video>/<audio> element that binds
// a MediaStream, and the per-participant volume store.
//
// Volume: remote audio is rendered by <audio> elements in the UI (the engine
// does not route audio to speakers), so per-participant volume is a real UI
// concern: the menu writes it here, the tile applies it to its <audio>.

import React, { useEffect, useRef } from 'react';
import { Signal, SignalHigh, SignalLow, SignalMedium } from 'lucide-react';
import { cn } from '../ui';
import type { ConnectionQuality, ConnectionStatus, VoiceParticipant } from '../../voice';
import { assetUrl } from '../../services/api';

// ------------------------------------------------------------------ avatars

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function VoiceAvatar({
  name,
  avatarUrl,
  size = 32,
  speaking = false,
  muted = false,
  className,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  speaking?: boolean;
  muted?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'relative inline-flex flex-shrink-0 items-center justify-center rounded-full bg-secondary overflow-hidden select-none',
        speaking && 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-primary',
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {avatarUrl ? (
        <img src={assetUrl(avatarUrl)} alt="" className="w-full h-full object-cover" draggable={false} />
      ) : (
        <span
          className="font-bold text-text-base"
          style={{ fontSize: Math.max(10, size * 0.38) }}
        >
          {initials(name)}
        </span>
      )}
      {muted && (
        <span className="absolute inset-0 bg-black/45 flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-1/2 h-1/2 text-text-base" fill="none" stroke="currentColor" strokeWidth={2}>
            <line x1="2" y1="2" x2="22" y2="22" />
            <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12h-1.92M5 5h11a2 2 0 0 1 2 2v2a2 2 0 0 1-.11.65" />
            <path d="M15 9.34V6a3 3 0 0 0-5.94-.6" />
            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
            <line x1="12" y1="18" x2="12" y2="22" />
          </svg>
        </span>
      )}
    </span>
  );
}

// ------------------------------------------------------------- status pill

const STATUS_META: Record<ConnectionStatus, { label: string; dot: string; text: string }> = {
  idle: { label: 'Not in a call', dot: 'bg-zinc-500', text: 'text-text-muted' },
  joining: { label: 'Connecting', dot: 'bg-amber-400 animate-pulse', text: 'text-amber-300' },
  connected: { label: 'Connected', dot: 'bg-emerald-400', text: 'text-emerald-300' },
  reconnecting: { label: 'Reconnecting', dot: 'bg-amber-400 animate-pulse', text: 'text-amber-300' },
  failed: { label: 'Connection failed', dot: 'bg-rose-500', text: 'text-rose-300' },
  ended: { label: 'Call ended', dot: 'bg-zinc-500', text: 'text-text-muted' },
};

export function CallStatusPill({ status, className }: { status: ConnectionStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={`Call status: ${meta.label}`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-text-base/[0.06] border border-text-base/10 px-2.5 py-1 text-[11px] font-bold',
        meta.text,
        className,
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

// ----------------------------------------------------------- quality badge

const QUALITY_META: Record<ConnectionQuality, { label: string; icon: any; cls: string }> = {
  good: { label: 'Good connection', icon: SignalHigh, cls: 'text-emerald-400' },
  fair: { label: 'Fair connection', icon: SignalMedium, cls: 'text-amber-400' },
  poor: { label: 'Poor connection', icon: SignalLow, cls: 'text-rose-400' },
  unknown: { label: 'Connection unknown', icon: Signal, cls: 'text-text-muted/60' },
};

export function QualityBadge({ quality }: { quality: ConnectionQuality }) {
  const meta = QUALITY_META[quality];
  const Icon = meta.icon;
  return (
    <span title={meta.label} aria-label={meta.label} className={cn('inline-flex items-center', meta.cls)}>
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
    </span>
  );
}

// -------------------------------------------------------------- level meter

export function MicLevelMeter({ level, className }: { level: number; className?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, level)) * 100);
  return (
    <div
      className={cn('h-1.5 rounded-full bg-text-base/10 overflow-hidden', className)}
      role="meter"
      aria-label="Microphone input level"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-100', pct > 80 ? 'bg-rose-400' : 'bg-emerald-400')}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// --------------------------------------------------------------- icon button

export function VoiceIconButton({
  label,
  active = false,
  danger = false,
  onClick,
  className,
  children,
  disabled,
  ...rest
}: {
  label: string;
  active?: boolean;
  danger?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  children: React.ReactNode;
  disabled?: boolean;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children' | 'className' | 'disabled'>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center rounded-xl transition-all active:scale-95',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-primary',
        'disabled:opacity-40 disabled:pointer-events-none',
        danger
          ? 'bg-rose-500 text-white hover:bg-rose-600'
          : active
            ? 'bg-text-base/[0.12] text-text-base'
            : 'text-text-muted hover:text-text-base hover:bg-text-base/[0.08]',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// ------------------------------------------------------ media element helper

/** <video> that binds a MediaStream via srcObject (muted for local preview). */
export function StreamVideo({
  stream,
  muted = false,
  className,
  label,
}: {
  stream: MediaStream | null | undefined;
  muted?: boolean;
  className?: string;
  label: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream ?? null;
    if (stream) el.play().catch(() => {});
  }, [stream]);
  return <video ref={ref} muted={muted} playsInline autoPlay aria-label={label} className={cn('object-cover', className)} />;
}

/** <audio> that binds a remote participant's MediaStream and applies their saved volume. */
export function ParticipantAudio({ participant }: { participant: VoiceParticipant }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = participant.stream ?? null;
    if (participant.stream) el.play().catch(() => {});
  }, [participant.stream]);
  useEffect(() => {
    const el = ref.current;
    if (el) el.volume = getPeerVolume(participant.memberId);
  }, [participant.memberId]);
  useEffect(() => {
    const onChange = (e: Event) => {
      const id = (e as CustomEvent<number>).detail;
      if (id === participant.memberId && ref.current) {
        ref.current.volume = getPeerVolume(id);
      }
    };
    window.addEventListener('cp-voice-volume', onChange);
    return () => window.removeEventListener('cp-voice-volume', onChange);
  }, [participant.memberId]);
  if (!participant.stream) return null;
  return <audio ref={ref} autoPlay aria-label={`${participant.name}'s audio`} className="hidden" />;
}

// ------------------------------------------------------ per-participant volume

const VOLUME_KEY = 'cp-voice-volumes';

function readVolumes(): Record<string, number> {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** 0..1, default 1. Persisted per member id in localStorage. */
export function getPeerVolume(memberId: number): number {
  const v = Number(readVolumes()[String(memberId)]);
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
}

export function setPeerVolume(memberId: number, volume: number): void {
  const vols = readVolumes();
  vols[String(memberId)] = Math.min(1, Math.max(0, volume));
  try {
    localStorage.setItem(VOLUME_KEY, JSON.stringify(vols));
  } catch {
    /* storage unavailable — volume just won't persist */
  }
  window.dispatchEvent(new CustomEvent('cp-voice-volume', { detail: memberId }));
}

// ------------------------------------------------------------------- misc

/** Friendly "N people" label for counts (screen-reader friendly too). */
export function countLabel(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}
