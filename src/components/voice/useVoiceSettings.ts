// Shared calls-policy settings (Classic "Voice & Calls" card and the Modern
// group): GET / PUT /api/voice/settings with the same clamping as before.
// Saving is newest-wins: a slow save can't overwrite edits made after it.
import { useEffect, useRef, useState } from 'react';
import { voiceApi } from '../../voice';
import { notify } from '../dialog';

export const QUALITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export function useVoiceSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [s, setS] = useState<any>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    voiceApi
      .getSettings()
      .then((settings) => setS(settings))
      .catch(() => setS(null))
      .finally(() => setLoading(false));
  }, []);

  const saveSeq = useRef(0);
  const editsSince = useRef(0);
  const set = (patch: Record<string, any>) => {
    setS((prev: any) => ({ ...prev, ...patch }));
    setDirty(true);
    editsSince.current += 1;
  };

  const save = async () => {
    if (!s) return;
    setSaving(true);
    editsSince.current = 0;
    try {
      const body = {
        video_enabled: !!s.video_enabled,
        screenshare_enabled: !!s.screenshare_enabled,
        global_spotlight_enabled: !!s.global_spotlight_enabled,
        dm_calls_allowed: !!s.dm_calls_allowed,
        group_calls_allowed: !!s.group_calls_allowed,
        default_max_participants: Math.max(0, Math.min(100, parseInt(s.default_max_participants, 10) || 0)),
        default_video_quality: s.default_video_quality,
        default_audio_quality: s.default_audio_quality,
        call_timeout_minutes: Math.max(0, Math.min(480, parseInt(s.call_timeout_minutes, 10) || 0)),
        reconnect_attempts: Math.max(0, Math.min(20, parseInt(s.reconnect_attempts, 10) || 5)),
      };
      const seq = ++saveSeq.current;
      const updated = await voiceApi.putSettings(body);
      // Edits made while saving stay (and the form stays dirty).
      if (seq === saveSeq.current && editsSince.current === 0) {
        setS(updated);
        setDirty(false);
      }
      notify('Voice settings saved.', 'success');
    } catch (err: any) {
      notify(err?.message || 'Could not save voice settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return { loading, saving, s, dirty, set, save };
}
