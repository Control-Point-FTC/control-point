// Shared QR check-in logic (the page a member lands on after scanning the
// meeting QR code) for Legacy QrCheckinPage and the Modern check-in page:
// look up the session, then confirm. Same endpoints and rules as before.
import { useEffect, useState } from 'react';
import { apiFetch } from '../../services/api';

export function useQrCheckin(token: string | undefined, onRefresh?: () => void) {
  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    setInfo(null); setError(''); setDone(false);
    (async () => {
      try {
        const res = await apiFetch(`/api/attendance/qr-session/${token}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Session not found');
        if (!alive) return;
        setInfo(data);
        if (data.alreadyCheckedIn) {
          setDone(true);
          onRefresh?.();
        }
      } catch (e: any) {
        if (alive) setError(e.message || 'Could not load session');
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/attendance/checkin/${token}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Check-in failed');
      setDone(true);
      onRefresh?.();
    } catch (e: any) {
      setError(e.message || 'Check-in failed');
    } finally {
      setBusy(false);
    }
  };

  return { info, error, busy, done, confirm };
}
