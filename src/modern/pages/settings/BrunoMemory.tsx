// Settings → Bruno → What Bruno remembers (V3.5 phase 4c): the facts Bruno
// saved from chats (or that you added), yours and the team's. Remove any of
// them; team facts are editable by people who manage the team.
import { useEffect, useState } from 'react';
import { Brain, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button, Input } from '../../../components/ui-kit';
import { apiFetch } from '../../../services/api';
import { notify } from '../../../components/dialog';
import { SettingsGroup } from './SettingsPage';

interface Memory { id: number; scope: 'user' | 'team'; content: string }

export function BrunoMemoryGroup() {
  const [data, setData] = useState<{ user: Memory[]; team: Memory[]; canEditTeam: boolean } | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await apiFetch('/api/bruno/memories');
        const body = await res.json();
        if (live) setData({ user: Array.isArray(body?.user) ? body.user : [], team: Array.isArray(body?.team) ? body.team : [], canEditTeam: !!body?.canEditTeam });
      } catch { if (live) setData({ user: [], team: [], canEditTeam: false }); }
    })();
    return () => { live = false; };
  }, []);

  const remove = async (m: Memory) => {
    setBusy(`del-${m.id}`);
    try {
      const res = await apiFetch(`/api/bruno/memories/${m.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || '');
      setData((d) => d && { ...d, [m.scope]: d[m.scope].filter((x) => x.id !== m.id) });
    } catch (e: any) {
      notify(e?.message || 'Could not remove that — try again.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const add = async () => {
    const content = draft.trim();
    if (!content) return;
    setBusy('add');
    try {
      const res = await apiFetch('/api/bruno/memories', { method: 'POST', body: JSON.stringify({ content, scope: 'user' }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || '');
      setData((d) => d && { ...d, user: [body.memory, ...d.user] });
      setDraft('');
    } catch (e: any) {
      notify(e?.message || 'Could not save that — try again.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const list = (items: Memory[], canEdit: boolean, empty: string) => items.length === 0
    ? <p className="px-4 py-3 text-sm text-muted-foreground">{empty}</p>
    : (
      <ul>
        {items.map((m) => (
          <li key={m.id} className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0">
            <span className="min-w-0 flex-1 text-sm">{m.content}</span>
            {canEdit && (
              <Button variant="ghost" size="icon-sm" aria-label={`Forget: ${m.content}`} disabled={!!busy} onClick={() => void remove(m)}>
                {busy === `del-${m.id}` ? <Loader2 className="animate-spin" /> : <Trash2 />}
              </Button>
            )}
          </li>
        ))}
      </ul>
    );

  return (
    <SettingsGroup title="What Bruno remembers" description="Facts Bruno saved from your chats and uses in every new one. Remove anything that's wrong or out of date.">
      {!data ? <p className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading…</p> : (
        <>
          <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"><Brain className="size-3.5" /> About you</div>
          {list(data.user, true, 'Nothing yet. Tell Bruno about yourself, or add a note below.')}
          <form className="flex gap-2 border-b border-border px-4 py-3" onSubmit={(e) => { e.preventDefault(); void add(); }}>
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={300} placeholder="e.g. I'm on the programming subteam and prefer Java" aria-label="Something for Bruno to remember" />
            <Button type="submit" variant="outline" disabled={!draft.trim() || busy === 'add'}>{busy === 'add' ? <Loader2 className="animate-spin" /> : <Plus />} Add</Button>
          </form>
          <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"><Brain className="size-3.5" /> About the team</div>
          {list(data.team, data.canEditTeam, 'Nothing yet. Team managers can tell Bruno things the whole team should share.')}
        </>
      )}
    </SettingsGroup>
  );
}
