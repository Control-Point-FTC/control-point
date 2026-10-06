// Settings → Admin: team call policy (manage_voice), AI absence-evaluation
// criteria and AI limits (app owner), storage usage and message moderation.
// Same endpoints as Legacy /settings. The criteria and AI limits are drafted.
import { useEffect, useState } from 'react';
import { HardDrive, Loader2, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { Button, Input, Label, Skeleton, Textarea, ToggleGroup, ToggleGroupItem } from '../../../components/ui-kit';
import { apiFetch } from '../../../services/api';
import { confirmDialog, notify } from '../../../components/dialog';
import { VoiceSettingsSection } from '../../../components/voice/VoiceSettingsSection';
import { useDraft } from '../../drafts';
import { EmptyState } from '../../ui/page';
import { SettingsGroup, SettingsRow } from './SettingsPage';

const AI_KEYS = [
  { key: 'max_tokens_news', label: 'News', def: '1024' },
  { key: 'max_tokens_attendance', label: 'Attendance insights', def: '1024' },
  { key: 'max_tokens_excuse', label: 'Absence evaluation', def: '512' },
  { key: 'max_tokens_summary', label: 'Activity summary', def: '1024' },
  { key: 'max_tokens_chat', label: 'Chat replies', def: '1024' },
] as const;

export function formatBytes(bytes: number, decimals = 2) {
  if (!bytes) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(Math.max(0, decimals))) + ' ' + sizes[i];
}

async function saveSettings(pairs: { key: string; value: string }[]) {
  // One request per key, in order — same as Legacy.
  for (const p of pairs) {
    const res = await apiFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
    if (!res.ok) throw new Error('save failed');
  }
}

export function AdminSection({ settings = {}, isAdmin, isOwner, hasPerm, refresh }: any) {
  const canVoice = hasPerm ? hasPerm('manage_voice') : false;
  const [criteria, setCriteria] = useDraft<string | null>('settings:admin:criteria', null);
  const criteriaValue = criteria ?? (settings.excuse_criteria || '');
  const [ai, setAi] = useDraft<Record<string, string> | null>('settings:admin:ai', null);
  const aiValues: Record<string, string> = ai ?? {
    ...Object.fromEntries(AI_KEYS.map((k) => [k.key, String(settings[k.key] || k.def)])),
    chat_provider: settings.chat_provider || 'hybrid',
  };
  const [savingCriteria, setSavingCriteria] = useState(false);
  const [savingAi, setSavingAi] = useState(false);

  const saveCriteria = async () => {
    setSavingCriteria(true);
    try { await saveSettings([{ key: 'excuse_criteria', value: criteriaValue }]); setCriteria(null); refresh?.settings?.(); notify('Settings saved', 'success'); }
    catch { notify('Could not save settings', 'error'); }
    finally { setSavingCriteria(false); }
  };
  const saveAi = async () => {
    setSavingAi(true);
    try {
      await saveSettings([...AI_KEYS.map((k) => ({ key: k.key, value: aiValues[k.key] })), { key: 'chat_provider', value: aiValues.chat_provider }]);
      setAi(null); refresh?.settings?.(); notify('AI limits saved', 'success');
    } catch { notify('Could not save AI limits', 'error'); }
    finally { setSavingAi(false); }
  };

  return (
    <div>
      {canVoice && (
        <SettingsGroup title="Calls policy" description="What the team can do in voice and video calls.">
          {/* Shared with Legacy; rebuilt with Messages & calls in phase 6. */}
          <div className="p-4"><VoiceSettingsSection /></div>
        </SettingsGroup>
      )}

      {isAdmin && (
        <SettingsGroup title="AI absence evaluation" description="Bruno uses these rules when members report an absence.">
          <div className="grid gap-2 p-4">
            <Label htmlFor="excuse-criteria" className="sr-only">Absence criteria</Label>
            <Textarea id="excuse-criteria" value={criteriaValue} onChange={(e) => setCriteria(e.target.value)} className="min-h-28" placeholder="e.g. Excused: illness, family emergency, school event. Unexcused: …" />
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
            {criteria != null && <Button variant="ghost" onClick={() => setCriteria(null)}>Discard</Button>}
            <Button onClick={() => void saveCriteria()} disabled={criteria == null || savingCriteria}>{savingCriteria && <Loader2 className="animate-spin" />} Save</Button>
          </div>
        </SettingsGroup>
      )}

      {isOwner && (
        <SettingsGroup title="AI configuration" description="App owner only. Max tokens per feature and the chat provider.">
          <SettingsRow label="Chat provider">
            <ToggleGroup type="single" value={aiValues.chat_provider} onValueChange={(v) => { if (v) setAi({ ...aiValues, chat_provider: v }); }} aria-label="Chat provider">
              {['hybrid', 'fireworks', 'gemini'].map((p) => <ToggleGroupItem key={p} value={p} className="px-3 capitalize max-sm:h-10">{p}</ToggleGroupItem>)}
            </ToggleGroup>
          </SettingsRow>
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            {AI_KEYS.map((k) => (
              <div key={k.key} className="grid gap-2">
                <Label htmlFor={k.key}>{k.label}</Label>
                <Input id={k.key} type="number" min={1} value={aiValues[k.key]} onChange={(e) => setAi({ ...aiValues, [k.key]: e.target.value })} />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
            {ai != null && <Button variant="ghost" onClick={() => setAi(null)}>Discard</Button>}
            <Button onClick={() => void saveAi()} disabled={ai == null || savingAi}>{savingAi && <Loader2 className="animate-spin" />} Save AI limits</Button>
          </div>
        </SettingsGroup>
      )}

      {isAdmin && <StorageGroup />}
      {isAdmin && <MessagesGroup />}
    </div>
  );
}

function StorageGroup() {
  const [size, setSize] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try { const res = await apiFetch('/api/admin/storage-usage'); const data = await res.json(); setSize(data.totalSize ?? null); }
    catch { /* offline */ }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  return (
    <SettingsGroup title="Storage">
      <SettingsRow label="Files stored" description="Uploads, attachments and pictures for this workspace.">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-sm font-medium tabular-nums"><HardDrive className="size-4 text-muted-foreground" />{size == null ? '—' : formatBytes(size)}</span>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="max-sm:h-11">{loading ? <Loader2 className="animate-spin" /> : <RefreshCw />} Recalculate</Button>
        </span>
      </SettingsRow>
    </SettingsGroup>
  );
}

function MessagesGroup() {
  const [messages, setMessages] = useState<any[] | null>(null);
  const [editing, setEditing] = useState<{ id: number; content: string } | null>(null);
  const load = async () => {
    try { const res = await apiFetch('/api/messages'); const data = await res.json(); setMessages(Array.isArray(data) ? data : []); }
    catch { setMessages([]); }
  };
  useEffect(() => { void load(); }, []);

  const remove = async (id: number) => {
    if (!(await confirmDialog({ title: 'Delete message', message: 'Are you sure you want to permanently delete this message? This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;
    const removed = messages?.find((m) => m.id === id);
    setMessages((prev) => (prev || []).filter((m) => m.id !== id));
    try {
      const res = await apiFetch(`/api/messages/${id}?silent=true`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      notify('Message permanently deleted.', 'success');
    } catch {
      if (removed) setMessages((prev) => [...(prev || []), removed].sort((a, b) => (a.id || 0) - (b.id || 0)));
      notify('Failed to delete message.', 'error');
    }
  };
  const saveEdit = async () => {
    if (!editing) return;
    const { id, content } = editing;
    const prevContent = messages?.find((m) => m.id === id)?.content;
    setMessages((prev) => (prev || []).map((m) => (m.id === id ? { ...m, content } : m)));
    setEditing(null);
    try {
      const res = await apiFetch(`/api/messages/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
      if (!res.ok) throw new Error();
      notify('Message updated.', 'success');
    } catch {
      setMessages((prev) => (prev || []).map((m) => (m.id === id ? { ...m, content: prevContent } : m)));
      notify('Failed to update message.', 'error');
    }
  };

  return (
    <SettingsGroup title="Message moderation" description="Edit or silently remove any message in this workspace.">
      {messages == null ? <div className="space-y-2 p-4"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
        : messages.length === 0 ? <EmptyState title="No messages" className="m-4" />
        : (
          <ul className="max-h-[28rem] divide-y divide-border overflow-y-auto">
            {messages.map((m) => (
              <li key={m.id} className="px-4 py-3">
                <p className="text-xs text-muted-foreground">{m.sender_name} · {m.timestamp ? new Date(m.timestamp).toLocaleString() : ''}</p>
                {editing?.id === m.id ? (
                  <form className="mt-2 grid gap-2" onSubmit={(e) => { e.preventDefault(); void saveEdit(); }}>
                    <Textarea value={editing.content} onChange={(e) => setEditing({ id: m.id, content: e.target.value })} aria-label="Message text" autoFocus />
                    <span className="flex justify-end gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" size="sm">Save</Button></span>
                  </form>
                ) : (
                  <div className="mt-1 flex items-start gap-2">
                    <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm">{m.content}{m.file_path && <span className="block text-xs italic text-accent">{m.file_path}</span>}</p>
                    <Button variant="ghost" size="icon-sm" aria-label="Edit message" className="max-sm:size-11" onClick={() => setEditing({ id: m.id, content: m.content || '' })}><Pencil /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label="Delete message" className="text-destructive hover:text-destructive max-sm:size-11" onClick={() => void remove(m.id)}><Trash2 /></Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
    </SettingsGroup>
  );
}
