// "Invite people": create a join link (how long it works, how many people
// can use it, whether joins need approval), copy it, and turn old links off.
// Admins and anyone with the "Invite people" permission see this; the full
// link is shown once, when it is made.
import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Link2, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import {
  Badge, Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Label,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch,
} from '../../../components/ui-kit';
import { notify } from '../../../components/dialog';
import { apiFetch } from '../../../services/api';

const EXPIRY = [
  { v: '1', label: '1 hour' },
  { v: '24', label: '1 day' },
  { v: '168', label: '7 days' },
  { v: '720', label: '30 days' },
  { v: 'never', label: 'Never' },
];
const USES = [
  { v: 'any', label: 'No limit' },
  ...[1, 5, 10, 25, 50, 100].map((n) => ({ v: String(n), label: n === 1 ? '1 person' : `${n} people` })),
];

export interface InviteLink {
  id: number;
  label: string | null;
  hint: string;
  created_at: string;
  created_by_name: string | null;
  expires_at: string | null;
  max_uses: number | null;
  uses: number;
  requires_approval: boolean;
  revoked_at: string | null;
  state: 'active' | 'revoked' | 'expired' | 'used_up';
}

function expiresText(l: InviteLink) {
  if (!l.expires_at) return 'Never expires';
  const ms = Date.parse(l.expires_at) - Date.now();
  if (ms <= 0) return 'Expired';
  const h = Math.round(ms / 3600_000);
  return h < 1 ? 'Expires within the hour' : h < 48 ? `Expires in ${h} h` : `Expires in ${Math.round(h / 24)} days`;
}

export function InviteDialog({ open, onOpenChange, teamName }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamName?: string;
}) {
  const [expiry, setExpiry] = useState('168');
  const [uses, setUses] = useState('any');
  const [approval, setApproval] = useState(false);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [links, setLinks] = useState<InviteLink[] | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/invites');
      if (res.ok) { const d = await res.json(); setLinks(Array.isArray(d) ? d : []); }
    } catch { /* list is best effort */ }
  }, []);

  useEffect(() => {
    if (open) { setCreated(null); setCopied(false); void load(); }
  }, [open, load]);

  const create = async () => {
    setBusy(true);
    try {
      const res = await apiFetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expires_in_hours: expiry === 'never' ? null : Number(expiry),
          max_uses: uses === 'any' ? null : Number(uses),
          requires_approval: approval,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not create the link');
      // Same host the person is on (production, staging or local).
      setCreated(`${window.location.origin}/join/${data.token}`);
      setCopied(false);
      void load();
    } catch (e: any) {
      notify(e.message || 'Could not create the link', 'error');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!created) return;
    try { await navigator.clipboard.writeText(created); setCopied(true); notify('Invite link copied', 'success'); }
    catch { notify('Could not copy — select the link and copy it.', 'error'); }
  };

  const revoke = async (l: InviteLink) => {
    const res = await apiFetch(`/api/invites/${l.id}`, { method: 'DELETE' });
    if (res.ok) { notify('Link turned off', 'success'); void load(); }
    else notify('Could not turn that link off', 'error');
  };

  const active = (links || []).filter((l) => l.state === 'active');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite people{teamName ? ` to ${teamName}` : ''}</DialogTitle>
          <DialogDescription>Anyone with the link can join. Make a new one whenever you like and turn old ones off.</DialogDescription>
        </DialogHeader>

        <div className="grid min-w-0 grid-cols-1 gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="invite-expiry">Link works for</Label>
              <Select value={expiry} onValueChange={setExpiry}>
                <SelectTrigger id="invite-expiry" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{EXPIRY.map((o) => <SelectItem key={o.v} value={o.v}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="invite-uses">Who can use it</Label>
              <Select value={uses} onValueChange={setUses}>
                <SelectTrigger id="invite-uses" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{USES.map((o) => <SelectItem key={o.v} value={o.v}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
            <span>
              <span className="block text-sm font-medium">Approve each person</span>
              <span className="block text-xs text-muted-foreground">They ask to join and someone who can invite says yes.</span>
            </span>
            <Switch checked={approval} onCheckedChange={setApproval} aria-label="Approve each person" />
          </label>

          {created ? (
            <div className="grid min-w-0 grid-cols-1 gap-2 rounded-lg border border-accent/40 bg-accent/5 p-3">
              <p className="text-xs text-muted-foreground">Copy it now — for safety, the full link is only shown once.</p>
              <div className="flex min-w-0 items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-2 font-mono text-xs" title={created}>{created}</code>
                <Button onClick={() => void copy()} className="shrink-0">{copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy'}</Button>
              </div>
              <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => setCreated(null)}>Make another link</Button>
            </div>
          ) : (
            <Button onClick={() => void create()} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Link2 />} Create invite link
            </Button>
          )}

          <div className="grid min-w-0 grid-cols-1 gap-2">
            <p className="text-xs font-medium text-muted-foreground">Active links</p>
            {links === null ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : active.length === 0 ? (
              <p className="text-xs text-muted-foreground">No active links.</p>
            ) : (
              <ul className="grid max-h-56 gap-1.5 overflow-y-auto">
                {active.map((l) => (
                  <li key={l.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs">
                    <span className="font-mono text-muted-foreground">…{l.hint}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {l.uses}{l.max_uses != null ? `/${l.max_uses}` : ''} used · {expiresText(l)}
                      {l.created_by_name ? ` · by ${l.created_by_name}` : ''}
                    </span>
                    {l.requires_approval && <Badge variant="soft"><ShieldCheck className="size-3" /> Approval</Badge>}
                    <Button variant="ghost" size="icon-sm" aria-label={`Turn off link ending ${l.hint}`} onClick={() => void revoke(l)}>
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
