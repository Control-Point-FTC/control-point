// Shared voice-channel list logic (the Classic sidebar section and the Modern
// one): auto-expanding channels that have people in them, joining (asking
// about video per your camera default), join-with-video, and admin rename.
import { useEffect, useState } from 'react';
import { useVoice, type VoiceChannelSummary } from '../../voice';
import { confirmDialog } from '../dialog';
import { getCameraDefault } from './cameraDefault';
import { voiceAdminApi } from '../../voice/api';

export function useVoiceChannels() {
  const { channels, session, joinChannel, participants, error, clearError, canManageVoice, refreshChannels } = useVoice();
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [joiningId, setJoiningId] = useState<number | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  const selfId = participants.find((p) => p.isSelf)?.memberId;

  // Auto-expand channels that have participants, so users can see who's
  // in the call without clicking (Discord-style).
  useEffect(() => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      for (const c of channels) {
        if (c.participants.length > 0) next.add(c.id);
      }
      return next;
    });
  }, [channels]);

  const toggleExpanded = (id: number) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleJoin = async (channel: VoiceChannelSummary) => {
    if (session?.kind === 'voice_channel' && session.channelId === channel.id) return;
    setJoiningId(channel.id);
    try {
      // Camera only turns on with explicit user consent — never automatically.
      const camDefault = getCameraDefault();
      let withVideo = false;
      if (camDefault === 'on') {
        withVideo = true;
      } else if (camDefault === 'ask') {
        withVideo = await confirmDialog({
          title: 'Join with video?',
          message: `Turn on your camera when joining ${channel.name}?`,
          confirmLabel: 'Join with video',
          cancelLabel: 'Audio only',
        });
      }
      // 'off' → withVideo stays false, joins audio-only.
      await joinChannel(channel.id, withVideo ? { video: true } : undefined);
    } finally {
      setJoiningId(null);
    }
  };

  const handleRenameSubmit = async () => {
    if (renamingId == null || renameBusy) return;
    const name = renameName.trim();
    if (!name) return;
    setRenameBusy(true);
    try {
      await voiceAdminApi.patchChannel(renamingId, { name } as any);
      await refreshChannels();
      setRenamingId(null);
      setRenameName('');
    } catch (e: any) {
      // Error surfaced via voice context error state
    } finally {
      setRenameBusy(false);
    }
  };

  const joinWithVideo = async (channelId: number) => {
    setJoiningId(channelId);
    try {
      await joinChannel(channelId, { video: true });
    } finally {
      setJoiningId(null);
    }
  };
  const startRename = (c: VoiceChannelSummary) => { setRenameName(c.name); setRenamingId(renamingId === c.id ? null : c.id); };
  return {
    channels, session, error, clearError, canManageVoice, selfId, expandedIds, toggleExpanded, joiningId, handleJoin, joinWithVideo,
    renamingId, setRenamingId, renameName, setRenameName, renameBusy, startRename, handleRenameSubmit,
  };
}
