// Shared per-participant call actions (Classic ParticipantMenu and the Modern
// participant popover): local pin / spotlight / volume, and the moderator
// actions (mute, deafen, disable video, stop share, move, global spotlight,
// remove with confirmation). Each action closes the menu when it's done.
import { useState } from 'react';
import { confirmDialog } from '../dialog';
import { useVoice, type VoiceParticipant } from '../../voice';
import { getPeerVolume, setPeerVolume } from './shared';

export function useParticipantActions(participant: VoiceParticipant, onClose: () => void) {
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

  const isPinned = personalPin === participant.memberId;
  const isSpotlit = personalSpotlight === participant.memberId;
  const isGlobalSpotlight = session?.globalSpotlightMemberId === participant.memberId;

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

  const otherChannels = channels.filter((c) => c.id !== session?.channelId);
  return {
    canModerate, isPinned, isSpotlit, isGlobalSpotlight, volume, handleVolume, moveOpen, setMoveOpen, otherChannels,
    setPersonalPin, setPersonalSpotlight, mod, handleRemove, handleMove, handleGlobalSpotlight,
  };
}
