// IncomingCallModal — Accept / Decline / Dismiss.
// Never auto-switches: when already in another call the modal shows an
// explicit warning and requires the "Leave & join" choice to switch.

import React, { useEffect, useState } from 'react';
import { Phone, PhoneCall, PhoneOff, TriangleAlert, Video, X } from 'lucide-react';
import { cn } from '../ui';
import { useVoice } from '../../voice';
import { VoiceAvatar, VoiceIconButton } from './shared';

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
      <div className="relative w-full max-w-sm bg-elevated border border-text-base/10 rounded-3xl shadow-2xl p-6 text-center space-y-4">
        <div className="flex justify-center">
          <span className="relative">
            <VoiceAvatar name={incomingCall.inviter.name} avatarUrl={null} size={72} />
            <span className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-accent flex items-center justify-center ring-4 ring-elevated">
              {isVideo ? (
                <Video className="w-4 h-4 text-accent-ink" aria-hidden="true" />
              ) : (
                <PhoneCall className="w-4 h-4 text-accent-ink" aria-hidden="true" />
              )}
            </span>
          </span>
        </div>

        <div>
          <h2 id="incoming-call-title" className="text-lg font-bold text-text-base">
            {incomingCall.inviter.name}
          </h2>
          <p id="incoming-call-desc" className="text-sm text-text-muted mt-0.5 flex items-center justify-center gap-1.5">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold',
                isVideo ? 'bg-sky-500/15 text-sky-300' : 'bg-emerald-500/15 text-emerald-300',
              )}
            >
              {isVideo ? <Video className="w-3 h-3" aria-hidden="true" /> : <Phone className="w-3 h-3" aria-hidden="true" />}
              {isVideo ? 'Video call' : 'Voice call'}
            </span>
            <span>{incomingCall.kind === 'group' ? '· group call' : '· incoming'}</span>
          </p>
        </div>

        {inAnotherCall && (
          <div
            role="alert"
            className="flex items-start gap-2 text-left rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2.5"
          >
            <TriangleAlert className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs text-amber-200">
              You're already in another call{session ? ` (${session.name})` : ''}. Accepting will not switch
              automatically — choose explicitly.
            </p>
          </div>
        )}

        {inAnotherCall ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleDecline}
              className="px-4 py-2.5 rounded-xl text-sm font-bold bg-text-base/[0.08] text-text-base hover:bg-text-base/[0.12] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Stay in this call
            </button>
            <button
              type="button"
              onClick={handleSwitch}
              disabled={busy != null}
              className="px-4 py-2.5 rounded-xl text-sm font-bold bg-accent text-accent-ink hover:brightness-105 transition-all disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {busy === 'switch' ? 'Switching…' : 'Leave & join'}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-3">
            <VoiceIconButton
              label="Decline call"
              danger
              onClick={handleDecline}
              className="p-4 !rounded-full"
            >
              <PhoneOff className="w-5 h-5" />
            </VoiceIconButton>
            <VoiceIconButton
              label="Accept call"
              onClick={handleAccept}
              disabled={busy != null}
              className="p-4 !rounded-full !bg-emerald-500 !text-white hover:!bg-emerald-600"
            >
              {isVideo ? <Video className="w-5 h-5" /> : <Phone className="w-5 h-5" />}
            </VoiceIconButton>
            <VoiceIconButton label="Dismiss (they won't be notified)" onClick={dismissIncomingCall} className="p-4 !rounded-full">
              <X className="w-5 h-5" />
            </VoiceIconButton>
          </div>
        )}
        {!inAnotherCall && (
          <p className="text-[11px] text-text-muted">
            {busy === 'accept' ? 'Joining…' : 'Dismiss hides this without notifying the caller.'}
          </p>
        )}
      </div>
    </div>
  );
}

export default IncomingCallModal;
