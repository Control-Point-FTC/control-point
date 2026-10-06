// Shared expanded-call logic (Classic CallView and the Modern call stage):
// status announcements, fullscreen, the participant menu and list, and which
// participant is featured (screen share > global spotlight > personal
// spotlight > pin).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useVoice, type VoiceParticipant } from '../../voice';

/** `listOpenAtStart`: Classic shows the participant list by default; Modern opens it on demand. */
export function useCallView(listOpenAtStart = true) {
  const {
    status,
    session,
    participants,
    self,
    expanded,
    setExpanded,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    toggleScreenShare,
    leave,
    personalPin,
    personalSpotlight,
  } = useVoice();

  const [menuFor, setMenuFor] = useState<{ p: VoiceParticipant; anchor: { x: number; y: number } } | null>(null);
  const [listOpen, setListOpen] = useState(listOpenAtStart);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const prevStatus = useRef(status);
  const [announcement, setAnnouncement] = useState('');

  // aria-live announcements for status changes (text, never color-only).
  useEffect(() => {
    if (prevStatus.current !== status) {
      const labels: Record<string, string> = {
        joining: 'Connecting to the call',
        connected: 'Connected to the call',
        reconnecting: 'Connection lost — reconnecting',
        failed: 'Connection failed',
        ended: 'Call ended',
      };
      setAnnouncement(labels[status] ?? '');
      prevStatus.current = status;
    }
  }, [status]);

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await rootRef.current?.requestFullscreen();
    } catch {
      /* fullscreen unsupported — no-op */
    }
  };

  const featuredId = useMemo(() => {
    if (participants.length === 0) return null;
    const sharer = participants.find((p) => p.sharingScreen);
    if (sharer) return sharer.memberId;
    if (session?.globalSpotlightMemberId != null) return session.globalSpotlightMemberId;
    if (personalSpotlight != null) return personalSpotlight;
    if (personalPin != null) return personalPin;
    return null;
  }, [participants, session?.globalSpotlightMemberId, personalSpotlight, personalPin]);

  const featured = featuredId != null ? participants.find((p) => p.memberId === featuredId) ?? null : null;
  const rest = featured ? participants.filter((p) => p.memberId !== featured.memberId) : participants;
  const featuredIsSharing = !!featured?.sharingScreen;

  const openMenu = (p: VoiceParticipant, anchor: { x: number; y: number }) => setMenuFor({ p, anchor });
  return {
    status, session, participants, self, expanded, setExpanded, toggleMute, toggleDeafen, toggleCamera, toggleScreenShare, leave,
    personalPin, personalSpotlight, menuFor, setMenuFor, openMenu, listOpen, setListOpen, isFullscreen, toggleFullscreen,
    rootRef, announcement, featured, rest, featuredIsSharing,
  };
}
