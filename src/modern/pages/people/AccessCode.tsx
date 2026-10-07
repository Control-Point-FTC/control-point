// A workspace's access code, masked by default (audit M-2). People who manage
// the workspace reveal it with a click; the server logs every reveal (and
// every regeneration), and Settings shows that history.
import { useEffect, useState } from 'react';
import { Check, Copy, Eye, EyeOff, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '../../../components/ui-kit';
import { apiFetch } from '../../../services/api';
import { notify } from '../../../components/dialog';

/** Reveal (logged) and copy a workspace's access code. Every Reveal and
 *  Copy fetches the current code, so each is logged and never returns a code
 *  someone has since replaced. `fresh` is a code the viewer just generated:
 *  it starts revealed, with no extra reveal logged. */
export function AccessCode({ teamId, fresh, compact, onRevealed }: { teamId: number; fresh?: string | null; compact?: boolean; onRevealed?: () => void }) {
  const [code, setCode] = useState<string | null>(fresh ?? null);
  const [shown, setShown] = useState(!!fresh);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (fresh) { setCode(fresh); setShown(true); } }, [fresh]);
  // A different workspace starts masked again.
  useEffect(() => { if (!fresh) { setCode(null); setShown(false); } }, [teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  const reveal = async (): Promise<string | null> => {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/teams/${teamId}/access-code/reveal`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.access_code) throw new Error(data.error || 'Could not show the code.');
      setCode(data.access_code);
      onRevealed?.();
      return data.access_code as string;
    } catch (e: any) {
      notify(e?.message || 'Could not show the code.', 'error');
      return null;
    } finally {
      setBusy(false);
    }
  };
  const toggle = async () => {
    if (shown) { setShown(false); return; }
    if (await reveal()) setShown(true);
  };
  const copy = async () => {
    const c = await reveal();
    if (!c) return;
    try {
      await navigator.clipboard.writeText(c);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      notify('Could not copy — try again.', 'error');
    }
  };

  return (
    <span className="flex items-center gap-2">
      <code className={compact ? 'font-mono text-sm font-semibold tracking-widest' : 'rounded-md bg-muted px-2.5 py-1.5 font-mono text-sm tracking-widest'} aria-label={shown && code ? `Access code ${code}` : 'Access code hidden'}>
        {shown && code ? code : '••••••••'}
      </code>
      <Button variant="ghost" size="icon-sm" onClick={() => void toggle()} disabled={busy} aria-label={shown ? 'Hide access code' : 'Reveal access code'} className="max-sm:size-11">
        {busy ? <Loader2 className="animate-spin" /> : shown ? <EyeOff /> : <Eye />}
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={() => void copy()} disabled={busy} aria-label="Copy access code" className="max-sm:size-11">
        {copied ? <Check /> : <Copy />}
      </Button>
    </span>
  );
}

interface CodeEvent { action: 'view' | 'regenerate'; created_at: string; member_name: string | null }

/** Who revealed or replaced the code recently. `version` reloads it. */
export function AccessCodeHistory({ teamId, version = 0 }: { teamId: number; version?: number }) {
  const [rows, setRows] = useState<CodeEvent[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setFailed(false);
    void (async () => {
      try {
        const res = await apiFetch(`/api/teams/${teamId}/access-code/events`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (live) setRows(Array.isArray(data) ? data : []);
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => { live = false; };
  }, [teamId, version]);
  // Only a successful, empty answer means "nobody yet".
  if (failed && !rows) return <p className="text-sm text-muted-foreground">The code history couldn’t load. Check your connection and reopen Settings.</p>;
  if (!rows) return <p className="text-sm text-muted-foreground">Loading history…</p>;
  if (!rows.length) return <p className="text-sm text-muted-foreground">Nobody has revealed or replaced the code yet.</p>;
  return (
    <ul className="space-y-1 text-sm text-muted-foreground">
      {rows.slice(0, 5).map((r, i) => (
        <li key={i}>
          <span className="font-medium text-foreground">{r.member_name || 'Someone'}</span>{' '}
          {r.action === 'regenerate' ? 'replaced the code' : 'revealed the code'}{' '}
          · {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
        </li>
      ))}
    </ul>
  );
}
