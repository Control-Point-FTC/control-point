// Camera QR scanning for attendance check-in (shared by the Legacy scanner
// modal and the Modern check-in dialog). Starts the rear camera in the element
// with id `regionId` and calls onToken once with the session token it reads.
import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

/** Pull a check-in token out of a scanned QR (URL …/checkin/<token> or a bare token). */
export function tokenFromScan(text: string): string | null {
  const m = text.match(/\/checkin\/([A-Za-z0-9]+)/i) || text.trim().match(/^([a-f0-9]{24,})$/i);
  return m ? m[1] : null;
}

export function useQrScanner(regionId: string, onToken: (token: string) => void) {
  const [error, setError] = useState('');
  const handledRef = useRef(false);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  useEffect(() => {
    let scanner: Html5Qrcode | null = null;
    let cancelled = false;
    (async () => {
      try {
        scanner = new Html5Qrcode(regionId);
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText: string) => {
            if (handledRef.current) return;
            const token = tokenFromScan(decodedText);
            if (token) {
              handledRef.current = true;
              onTokenRef.current(token);
            }
          },
          () => { /* per-frame miss — ignore */ },
        );
      } catch {
        if (!cancelled) setError("Couldn't access the camera. Type the day's code instead.");
      }
    })();
    return () => {
      cancelled = true;
      try {
        const stopP = scanner?.stop() as unknown as Promise<void> | undefined;
        if (stopP && typeof stopP.then === 'function') {
          stopP.then(() => { try { scanner?.clear(); } catch { /* noop */ } }).catch(() => {});
        } else {
          try { scanner?.clear(); } catch { /* noop */ }
        }
      } catch { /* noop */ }
    };
  }, [regionId]);
  return error;
}
