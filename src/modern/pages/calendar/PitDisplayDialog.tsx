// The pit display link (admins): one secret no-login URL for a spare screen
// in the pit or the shop. It shows this week's agenda, the latest
// announcements, the next match at a live event and the check-in QR while a
// session runs. Making a new link retires the old one; turning it off ends it.
import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Loader2, MonitorPlay, RefreshCw, Trash2 } from 'lucide-react';
import {
  Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input, Label,
} from '../../../components/ui-kit';
import { apiFetch } from '../../../services/api';
import { notify, confirmDialog } from '../../../components/dialog';
import { copyText } from '../../../components/copyText';

export function PitDisplayDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) { setCopied(false); return; }
    let live = true;
    apiFetch('/api/pit-display').then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!live) return;
      setUrl(d?.url ?? null);
      setLoaded(true);
    }).catch(() => { if (live) setLoaded(true); });
    return () => { live = false; };
  }, [open]);

  const make = async (reset: boolean) => {
    setBusy(true);
    try {
      const res = await apiFetch('/api/pit-display', { method: 'POST', body: JSON.stringify(reset ? { reset: true } : {}) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.url) throw new Error(body?.error || '');
      setUrl(body.url);
      if (reset) notify('New link made. Screens using the old one stop updating.', 'success');
    } catch (e: any) {
      notify(e?.message || 'Could not make the display link — try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!(await confirmDialog({
      title: 'Make a new display link?',
      message: 'Screens showing the old link stop updating. Open the new link on them.',
      confirmLabel: 'Make new link', danger: true,
    }))) return;
    await make(true);
  };

  const turnOff = async () => {
    if (!(await confirmDialog({
      title: 'Turn off the pit display?',
      message: 'The link stops working on every screen. You can make a new one any time.',
      confirmLabel: 'Turn off', danger: true,
    }))) return;
    const res = await apiFetch('/api/pit-display', { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) { notify('Could not turn it off — try again.', 'error'); return; }
    setUrl(null);
    notify('Pit display turned off.', 'success');
  };

  const copy = async () => {
    if (!url) return;
    if (await copyText(url)) { setCopied(true); window.setTimeout(() => setCopied(false), 2000); }
    else notify('Could not copy — select the link and copy it.', 'error');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><MonitorPlay className="size-5 text-accent" /> Pit display</DialogTitle>
          <DialogDescription>
            A full-screen page for a spare screen in the pit or the shop: this week's events, the latest
            #announcements, your next match at a live event, and the check-in QR while a session is running.
            It needs no sign-in and refreshes itself, so anyone with the link can see it.
          </DialogDescription>
        </DialogHeader>
        {!loaded ? (
          <div className="flex justify-center py-6"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : url ? (
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="pit-url">Display link</Label>
              <div className="flex gap-2">
                <Input id="pit-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
                <Button type="button" variant="outline" onClick={() => void copy()} aria-label="Copy link">
                  {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild><a href={url} target="_blank" rel="noreferrer"><ExternalLink /> Open display</a></Button>
              <Button variant="outline" disabled={busy} onClick={() => void reset()}><RefreshCw /> New link</Button>
              <Button variant="ghost" className="ml-auto text-destructive hover:text-destructive" onClick={() => void turnOff()}><Trash2 /> Turn off</Button>
            </div>
          </div>
        ) : (
          <Button disabled={busy} onClick={() => void make(false)}>{busy ? <Loader2 className="animate-spin" /> : <MonitorPlay />} Make a display link</Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
