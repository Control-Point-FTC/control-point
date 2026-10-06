// Shared incoming-call logic (Classic modal and the Modern dialog): ringing,
// accept / decline / dismiss, and the explicit leave-and-join switch.
import { useEffect, useState } from 'react';
import { useVoice } from '../../voice';
import { startRingtone, stopRingtone } from '../../utils/sounds';

export function useIncomingCall() {
  const { incomingCall, session, status, acceptCall, declineCall, dismissIncomingCall, leave } = useVoice();
  const [busy, setBusy] = useState<'accept' | 'switch' | null>(null);

  useEffect(() => {
    setBusy(null);
  }, [incomingCall?.inviteId]);

  // Ring while the incoming-call modal is showing; stop on any resolution.
  useEffect(() => {
    if (!incomingCall) return;
    startRingtone();
    return () => stopRingtone();
  }, [incomingCall?.inviteId]); // eslint-disable-line react-hooks/exhaustive-deps


  const inAnotherCall = session != null && status !== 'idle' && status !== 'ended';
  const isVideo = incomingCall?.media === 'video';

  const handleAccept = async () => {
    stopRingtone();
    setBusy('accept');
    try {
      await acceptCall();
    } finally {
      setBusy(null);
    }
  };

  const handleDecline = async () => {
    stopRingtone();
    await declineCall();
  };

  const handleDismiss = () => {
    stopRingtone();
    dismissIncomingCall();
  };

  /** Explicit leave-and-join: never implicit. */
  const handleSwitch = async () => {
    stopRingtone();
    setBusy('switch');
    try {
      await leave();
      await acceptCall();
    } finally {
      setBusy(null);
    }
  };

  return { incomingCall, session, inAnotherCall, isVideo, busy, handleAccept, handleDecline, handleDismiss, handleSwitch };
}
