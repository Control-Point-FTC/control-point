// IncomingCallModal — Accept / Decline / Dismiss.
// Never auto-switches: when already in another call the modal shows an
// explicit warning and requires the "Leave & join" choice to switch.

import React, { useEffect, useState } from 'react';
import { Phone, PhoneCall, PhoneOff, TriangleAlert, Video, X } from 'lucide-react';
import { cn } from '../ui';
import { useVoice } from '../../voice';
import { VoiceAvatar } from './shared';

export function IncomingCallModal() {
  const { incomingCall, session, status, acceptCall, declineCall, dismissIncomingCall, leave } = useVoice();
  const [busy, setBusy] = useState<'accept' | 'switch' | null>(null);

  useEffect(() => {
    setBusy(null);
  }, [incomingCall?.inviteId]);

  if (!incomingCall) return null;

  const inAnotherCall = session != null && status !== 'idle' && status !== 'ended';
  const isVideo = incomingCall.media === 'video';

  const handleAccept = async () => {
    setBusy('accept');
    try {
      await acceptCall();
    } finally {
      setBusy(null);
    }
  };

  const handleDecline = async () => {
    await declineCall();
  };

  /** Explicit leave-and-join: never implicit. */
  const handleSwitch = async () => {
    setBusy('switch');
    try {
      await leave();
      await acceptCall();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="incoming-call-title"
      aria-describedby="incoming-call-desc"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden="true" />
      <div className="relative w-full max-w-xs bg-elevated border border-text-base/10 rounded-3xl shadow-2xl px-6 pt-8 pb-6 text-center">
        {/* Avatar with pulsing ring */}
        <div className="flex justify-center mb-4">
          <span className="relative">
            <span
              className="absolute inset-0 rounded-full bg-accent/30 animate-ping"
              aria-hidden="true"
            />
            <VoiceAvatar name={incomingCall.inviter.name} avatarUrl={null} size={80} />
            <span className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-accent flex items-center justify-center ring-4 ring-elevated">
              {isVideo ? (
                <Video className="w-4 h-4 text-accent-ink" aria-hidden="true" />
              ) : (
                <PhoneCall className="w-4 h-4 text-accent-ink" aria-hidden="true" />
              )}
            </span>
          </span>
        </div>

        {/* Caller info */}
        <h2 id="incoming-call-title" className="text-xl font-bold text-text-base">
          {incomingCall.inviter.name}
        </h2>
        <p id="incoming-call-desc" className="text-sm text-text-muted mt-1">
          Incoming {isVideo ? 'video' : 'voice'} call
        </p>

        {/* Channel context */}
        {incomingCall.channelName && (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-text-base/[0.06] px-3 py-1.5">
            <span className="text-xs text-text-muted">
              #<span className="font-semibold text-text-base">{incomingCall.channelName}</span>
            </span>
            <span className="text-[10px] text-text-muted">· anyone on the team can join</span>
          </div>
        )}

        {/* Already in a call warning */}
        {inAnotherCall && (
          <div
            role="alert"
            className="flex items-start gap-2 text-left rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2.5 mt-4"
          >
            <TriangleAlert className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs text-amber-200">
              You're already in {session ? `“${session.name}”` : 'another call'}. Accepting won't switch
              automatically — choose explicitly.
            </p>
          </div>
        )}

        {/* Actions */}
        {inAnotherCall ? (
          <div className="grid grid-cols-2 gap-2 mt-6">
            <button
              type="button"
              onClick={handleDecline}
              className="px-4 py-3 rounded-2xl text-sm font-bold bg-text-base/[0.08] text-text-base hover:bg-text-base/[0.12] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Stay here
            </button>
            <button
              type="button"
              onClick={handleSwitch}
              disabled={busy != null}
              className="px-4 py-3 rounded-2xl text-sm font-bold bg-accent text-accent-ink hover:brightness-105 transition-all disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {busy === 'switch' ? 'Switching…' : 'Leave & join'}
            </button>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleDecline}
                className={cn(
                  'flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl text-sm font-bold',
                  'bg-rose-500 text-white hover:bg-rose-600 active:scale-95',
                  'transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400'
                )}
              >
                <PhoneOff className="w-4 h-4" aria-hidden="true" />
                Decline
              </button>
              <button
                type="button"
                onClick={handleAccept}
                disabled={busy != null}
                className={cn(
                  'flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl text-sm font-bold',
                  'bg-emerald-500 text-white hover:bg-emerald-600 active:scale-95',
                  'transition-all disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400'
                )}
              >
                {isVideo ? (
                  <Video className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Phone className="w-4 h-4" aria-hidden="true" />
                )}
                {busy === 'accept' ? 'Joining…' : 'Accept'}
              </button>
            </div>
            <button
              type="button"
              onClick={dismissIncomingCall}
              className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-base transition-colors"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
              Dismiss silently
            </button>
            <p className="text-[10px] text-text-muted/70">
              Dismiss hides this without notifying the caller.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default IncomingCallModal;
