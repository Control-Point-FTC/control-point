// CallHeaderButtons — audio/video call buttons for DM and group message
// headers. Drop into a conversation header with the other participant ids:
//   <CallHeaderButtons memberIds={[peerId]} />
//   <CallHeaderButtons memberIds={[a, b, c]} groupName="Build crew" />
// Single id => DM call, several => group call. Requires an explicit click;
// the engine acquires mic/camera only from that gesture.
//
// NOTE: the app has no DM/group messaging UI yet, so this is not mounted
// anywhere — it is ready for the DM/group header when it lands.

import React, { useState } from 'react';
import { Phone, Video } from 'lucide-react';
import { cn } from '../ui';
import { useVoice } from '../../voice';
import { VoiceIconButton } from './shared';

export function CallHeaderButtons({
  memberIds,
  groupName,
  className,
}: {
  /** Other participant member ids (NOT including self). */
  memberIds: number[];
  groupName?: string;
  className?: string;
}) {
  const { startCall, status, session } = useVoice();
  const [starting, setStarting] = useState<'audio' | 'video' | null>(null);

  const busy = starting != null || status === 'joining';
  const inCall = session != null;
  const isGroup = memberIds.length > 1;

  const start = async (media: 'audio' | 'video') => {
    if (memberIds.length === 0 || inCall) return;
    setStarting(media);
    try {
      await startCall(memberIds, media);
    } finally {
      setStarting(null);
    }
  };

  const label = (media: 'audio' | 'video') => {
    if (inCall) return `Already in a call — leave it to start a new ${media} call`;
    const kind = isGroup ? `group ${media}` : media;
    return `Start ${kind} call${groupName ? ` with ${groupName}` : ''}`;
  };

  return (
    <div className={cn('flex items-center gap-1', className)} role="group" aria-label="Call options">
      <VoiceIconButton label={label('audio')} onClick={() => void start('audio')} disabled={busy || inCall || memberIds.length === 0} className="p-2">
        {starting === 'audio' ? (
          <span className="w-4 h-4 border-2 border-text-muted border-t-transparent rounded-full animate-spin" aria-hidden="true" />
        ) : (
          <Phone className="w-4 h-4" />
        )}
      </VoiceIconButton>
      <VoiceIconButton label={label('video')} onClick={() => void start('video')} disabled={busy || inCall || memberIds.length === 0} className="p-2">
        {starting === 'video' ? (
          <span className="w-4 h-4 border-2 border-text-muted border-t-transparent rounded-full animate-spin" aria-hidden="true" />
        ) : (
          <Video className="w-4 h-4" />
        )}
      </VoiceIconButton>
    </div>
  );
}

export default CallHeaderButtons;
