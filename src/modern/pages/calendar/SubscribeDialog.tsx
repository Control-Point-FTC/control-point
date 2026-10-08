// Subscribe to the team calendar from Google, Apple or Outlook (V3.5). Each
// member gets a private ICS URL; the calendar app polls it, so new and
// changed events show up there on their own. No Google sign-in needed.
import { useEffect, useState } from 'react';
import { CalendarPlus, Check, Copy, Loader2, RefreshCw } from 'lucide-react';
import {
  Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input, Label,
} from '../../../components/ui-kit';
import { apiFetch } from '../../../services/api';
import { notify, confirmDialog } from '../../../components/dialog';
import { copyText } from '../../../components/copyText';

const webcal = (url: string) => url.replace(/^https?:\/\//, 'webcal://');

export function SubscribeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchUrl = async (reset = false) => {
    setBusy(true);
    try {
      const res = await apiFetch('/api/calendar/feed', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reset ? { reset: true } : {}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.url) throw new Error(body?.error || '');
      setUrl(body.url);
      if (reset) notify('New link made. The old one no longer works.', 'success');
    } catch (e: any) {
      notify(e?.message || 'Could not make your calendar link — try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (open && !url) void fetchUrl();
    if (!open) setCopied(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async () => {
    if (!url) return;
    if (await copyText(url)) { setCopied(true); window.setTimeout(() => setCopied(false), 2000); }
    else notify('Could not copy — select the link and copy it.', 'error');
  };

  const reset = async () => {
    if (!(await confirmDialog({
      title: 'Make a new link?',
      message: 'Calendars subscribed with the old link stop updating. You will need to subscribe again with the new one.',
      confirmLabel: 'Make new link', danger: true,
    }))) return;
    await fetchUrl(true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarPlus className="size-5 text-accent" /> Subscribe to the team calendar</DialogTitle>
          <DialogDescription>
            Add the team calendar to Google, Apple or Outlook. New and changed events show up there on their own
            (Google can take a few hours to refresh). The link is private to you, so don’t share it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="cal-feed-url">Your calendar link</Label>
            <div className="flex gap-2">
              <Input id="cal-feed-url" readOnly value={url || ''} placeholder={busy ? 'Making your link…' : ''} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
              <Button type="button" variant="outline" onClick={() => void copy()} disabled={!url} aria-label="Copy link">
                {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Button asChild variant="outline" disabled={!url}>
              <a href={url ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal(url))}` : undefined} target="_blank" rel="noreferrer">Google Calendar</a>
            </Button>
            <Button asChild variant="outline" disabled={!url}>
              <a href={url ? webcal(url) : undefined}>Apple Calendar</a>
            </Button>
            <Button asChild variant="outline" disabled={!url}>
              <a href={url ? `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(url)}&name=${encodeURIComponent('Team calendar')}` : undefined} target="_blank" rel="noreferrer">Outlook</a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Anything else: paste the link into your calendar app’s “subscribe” or “add from URL” option.
          </p>
          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">Shared it by mistake? Make a new link and the old one stops working.</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => void reset()} disabled={busy || !url}>
              {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} New link
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
