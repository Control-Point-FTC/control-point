// People asking to join through an approval link. Shown on the Members tab
// to admins and anyone with "Invite people"; refreshes live when a request
// comes in or someone else handles one.
import { useCallback, useEffect, useState } from 'react';
import { Check, UserPlus, X } from 'lucide-react';
import { Button } from '../../../components/ui-kit';
import { notify } from '../../../components/dialog';
import { apiFetch } from '../../../services/api';

interface JoinRequest { id: number; email: string; name: string | null; source: string; created_at: string }

export const JOIN_REQUESTS_EVENT = 'join-requests-changed';

export function JoinRequestsCard({ onDecided }: { onDecided?: () => void }) {
  const [rows, setRows] = useState<JoinRequest[]>([]);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/join-requests');
      if (res.ok) { const d = await res.json(); setRows(Array.isArray(d) ? d : []); }
    } catch { /* best effort */ }
  }, []);

  useEffect(() => {
    void load();
    const on = () => void load();
    window.addEventListener(JOIN_REQUESTS_EVENT, on);
    return () => window.removeEventListener(JOIN_REQUESTS_EVENT, on);
  }, [load]);

  const decide = async (r: JoinRequest, decision: 'approve' | 'deny') => {
    setBusy(r.id);
    try {
      const res = await apiFetch(`/api/join-requests/${r.id}/${decision}`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not update that request');
      notify(decision === 'approve' ? `${r.name || r.email} can now join` : 'Request declined', 'success');
      if (decision === 'approve') onDecided?.();
    } catch (e: any) {
      notify(e.message, 'error');
    } finally {
      setBusy(null);
      void load();
    }
  };

  if (!rows.length) return null;
  return (
    <section aria-label="Join requests" className="mb-4 rounded-xl border border-accent/40 bg-accent/5 p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <UserPlus className="size-4" /> {rows.length === 1 ? '1 person wants to join' : `${rows.length} people want to join`}
      </p>
      <ul className="grid gap-2">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{r.name || r.email}</span>
              {r.name && <span className="block truncate text-xs text-muted-foreground">{r.email}</span>}
            </span>
            <Button size="sm" className="max-sm:h-11" disabled={busy === r.id} onClick={() => void decide(r, 'approve')}><Check /> Approve</Button>
            <Button size="sm" variant="ghost" className="max-sm:h-11" disabled={busy === r.id} onClick={() => void decide(r, 'deny')}><X /> Decline</Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
