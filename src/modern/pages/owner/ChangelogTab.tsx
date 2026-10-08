// Owner console → What's new: write, edit and delete releases yourself
// (V3.5). Everyone sees them in What's new (Settings, account menu, ⌘K) and
// gets the new-version dot when the top release changes. One change per
// line. Optional: post a release to the Discord changelog channel.
import { useEffect, useState } from 'react';
import { Loader2, Pencil, Plus, Send, Sparkles, Trash2 } from 'lucide-react';
import {
  Badge, Button, Input, Label, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Skeleton, Textarea,
} from '../../../components/ui-kit';
import { useIsNarrow } from '../../../components/scout/ScoutUi';
import { apiFetch } from '../../../services/api';
import { notify, confirmDialog } from '../../../components/dialog';
import { changelogEntryFrom, type ChangelogEntry } from '../../../utils/changelog';
import { setChangelog } from '../../../utils/changelogStore';
import { EmptyState } from '../../ui/page';

interface Row extends ChangelogEntry { id: number; updated_at?: string; posted_at?: string | null }
interface Draft { id: number | null; version: string; date: string; title: string; added: string; improved: string; fixed: string }

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** 3.5.0 → 3.6.0: a sensible next version to start from. */
const nextVersion = (v?: string) => {
  if (!v) return '1.0.0';
  const [a, b] = v.split('.').map((n) => parseInt(n, 10) || 0);
  return `${a}.${b + 1}.0`;
};
const toDraft = (e: Row): Draft => ({ id: e.id, version: e.version, date: e.date, title: e.title, added: e.added.join('\n'), improved: e.improved.join('\n'), fixed: e.fixed.join('\n') });

export function ChangelogTab() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [discord, setDiscord] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const publish = (list: Row[]) => { setRows(list); setChangelog(list); };
  const load = async () => {
    try {
      const res = await apiFetch('/api/owner/changelog');
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || '');
      publish(body.entries || []);
      setDiscord(!!body.discord);
    } catch (e: any) {
      setRows([]);
      notify(e?.message || 'Could not load releases.', 'error');
    }
  };
  useEffect(() => { void load(); }, []);

  const save = async () => {
    if (!draft) return;
    const check = changelogEntryFrom(draft);
    if ('error' in check) { notify(check.error, 'error'); return; }
    setBusy('save');
    try {
      const res = await apiFetch(draft.id ? `/api/owner/changelog/${draft.id}` : '/api/owner/changelog', {
        method: draft.id ? 'PUT' : 'POST', body: JSON.stringify(check.entry),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || '');
      const saved: Row = body.entry;
      publish([...(rows || []).filter((r) => r.id !== saved.id), saved]);
      notify(draft.id ? `Saved v${saved.version}.` : `Published v${saved.version}. Everyone sees it in What’s new.`, 'success');
      setDraft(null);
    } catch (e: any) {
      notify(e?.message || 'Could not save — try again.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (r: Row) => {
    if (!(await confirmDialog({ title: 'Delete release', message: `Delete v${r.version} “${r.title}” from What’s new?`, confirmLabel: 'Delete', danger: true }))) return;
    setBusy(`del-${r.id}`);
    try {
      const res = await apiFetch(`/api/owner/changelog/${r.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || '');
      publish((rows || []).filter((x) => x.id !== r.id));
      if (draft?.id === r.id) setDraft(null);
    } catch (e: any) {
      notify(e?.message || 'Could not delete — try again.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const postToDiscord = async (r: Row) => {
    if (r.posted_at && !(await confirmDialog({ title: 'Post again?', message: `v${r.version} was already posted to Discord. Post it again?`, confirmLabel: 'Post again' }))) return;
    setBusy(`discord-${r.id}`);
    try {
      const res = await apiFetch(`/api/owner/changelog/${r.id}/discord`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || '');
      setRows((rs) => (rs || []).map((x) => (x.id === r.id ? body.entry : x)));
      notify(`Posted v${r.version} to Discord.`, 'success');
    } catch (e: any) {
      notify(e?.message || 'Could not post to Discord.', 'error');
    } finally {
      setBusy(null);
    }
  };

  if (!rows) return <div className="space-y-3" aria-busy="true">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted-foreground">
          Releases show in What’s new for everyone (Settings, the account menu and ⌘K). A new top version gives every user the new-updates dot.
          {!discord && ' To post releases to Discord, set DISCORD_CHANGELOG_WEBHOOK on the server.'}
        </p>
        <Button onClick={() => setDraft({ id: null, version: nextVersion(rows[0]?.version), date: today(), title: '', added: '', improved: '', fixed: '' })}>
          <Plus /> New release
        </Button>
      </div>
      {rows.length === 0 ? <EmptyState icon={Sparkles} title="No releases yet" description="Write the first one with New release." /> : (
        <ul className="space-y-3">
          {rows.map((r, i) => (
            <li key={r.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-border bg-card p-4">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge variant="outline">v{r.version}</Badge>
                  {i === 0 && <Badge>Latest</Badge>}
                  {r.posted_at && <Badge variant="soft">Posted to Discord</Badge>}
                  <span className="text-xs text-muted-foreground">{r.date}</span>
                </div>
                <p className="font-medium">{r.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{r.added.length} new · {r.improved.length} improved · {r.fixed.length} fixed</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {discord && (
                  <Button variant="outline" size="sm" className="max-sm:h-11" disabled={!!busy} onClick={() => void postToDiscord(r)}>
                    {busy === `discord-${r.id}` ? <Loader2 className="animate-spin" /> : <Send />} Discord
                  </Button>
                )}
                <Button variant="outline" size="sm" className="max-sm:h-11" onClick={() => setDraft(toDraft(r))}><Pencil /> Edit</Button>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive max-sm:h-11" disabled={!!busy} onClick={() => void remove(r)} aria-label={`Delete v${r.version}`}>
                  {busy === `del-${r.id}` ? <Loader2 className="animate-spin" /> : <Trash2 />}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ReleaseEditor draft={draft} setDraft={setDraft} onSave={() => void save()} saving={busy === 'save'} />
    </div>
  );
}

function ReleaseEditor({ draft, setDraft, onSave, saving }: { draft: Draft | null; setDraft: (d: Draft | null) => void; onSave: () => void; saving: boolean }) {
  const narrow = useIsNarrow();
  const set = (patch: Partial<Draft>) => draft && setDraft({ ...draft, ...patch });
  const lines = (s: string) => s.split('\n').filter((l) => l.trim()).length;
  return (
    <Sheet open={!!draft} onOpenChange={(o) => { if (!o) setDraft(null); }}>
      <SheetContent side={narrow ? 'bottom' : 'right'} className="gap-0 p-0 sm:max-w-xl">
        {draft && (
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => { e.preventDefault(); onSave(); }}>
            <SheetHeader className="border-b border-border px-6 py-5 pr-12">
              <SheetTitle>{draft.id ? `Edit v${draft.version}` : 'New release'}</SheetTitle>
              <SheetDescription>One change per line. Write it the way a team member would say it.</SheetDescription>
            </SheetHeader>
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="cl-version">Version</Label>
                  <Input id="cl-version" required value={draft.version} onChange={(e) => set({ version: e.target.value })} placeholder="3.6.0" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="cl-date">Date</Label>
                  <Input id="cl-date" type="date" required value={draft.date} onChange={(e) => set({ date: e.target.value })} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cl-title">Title</Label>
                <Input id="cl-title" required maxLength={120} value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="What’s the headline?" />
              </div>
              {([['added', 'New', 'Repeating calendar events'], ['improved', 'Improved', 'Faster task board'], ['fixed', 'Fixed', 'Calendar showed the wrong day on phones']] as const).map(([key, label, ph]) => (
                <div key={key} className="grid gap-2">
                  <Label htmlFor={`cl-${key}`} className="flex items-center justify-between">
                    <span>{label}</span>
                    <span className="text-xs font-normal text-muted-foreground">{lines(draft[key])} {lines(draft[key]) === 1 ? 'item' : 'items'}</span>
                  </Label>
                  <Textarea id={`cl-${key}`} value={draft[key]} onChange={(e) => set({ [key]: e.target.value } as Partial<Draft>)} placeholder={ph} className="min-h-28" />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <Button type="button" variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
              <Button type="submit" disabled={saving || !draft.title.trim() || !draft.version.trim()}>
                {saving && <Loader2 className="animate-spin" />} {draft.id ? 'Save changes' : 'Publish'}
              </Button>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
