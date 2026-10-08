// Settings → Workspace: team name + FTC team (with verify), default
// interface, invite code, roles, and Google Calendar. Each card keeps the gate
// it had before (team edits: admins; calendar team sync: manage_calendar or
// President; personal calendar link: everyone).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, CalendarDays, Check, ExternalLink, Loader2, LogOut, RefreshCw, ShieldCheck, Trash2, Unlink, UserPlus } from 'lucide-react';
import { Badge, Button, Input, Label, Skeleton, Switch } from '../../../components/ui-kit';
import { apiFetch } from '../../../services/api';
import { ownFtcTeamChanged } from '../../../services/ftcScoutApi';
import { confirmDialog, notify } from '../../../components/dialog';
import { getDraft, useDraft } from '../../drafts';
import { SettingsGroup, SettingsRow } from './SettingsPage';
import { AccessCode, AccessCodeHistory } from '../people/AccessCode';

interface TeamDraft { name: string; ftc: string }

export function WorkspaceSection({ currentUser, teams = [], isAdmin, hasPerm, settings, refresh, onTeamSaved, onOpenSection, onLeaveTeam, onDeleteTeam }: any) {
  const navigate = useNavigate();
  const team = teams.find((t: any) => t.id === currentUser?.team_id);
  const savedFtc = team?.ftc_team_number ? String(team.ftc_team_number) : /^\d+$/.test(String(team?.number ?? '').trim()) ? String(team.number).trim() : '';
  const draftKey = `settings:team:${team?.id ?? 0}`;
  const [draft, setDraft] = useDraft<TeamDraft | null>(draftKey, null);
  const form: TeamDraft = draft ?? { name: team?.name || '', ftc: savedFtc };
  const set = (p: Partial<TeamDraft>) => setDraft({ ...form, ...p });
  const dirty = !!draft && (form.name !== (team?.name || '') || form.ftc !== savedFtc);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState<any>(null);
  const [verifyError, setVerifyError] = useState('');
  // A code this admin just generated shows revealed (no extra reveal logged).
  const [freshCode, setFreshCode] = useState<string | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const verify = async () => {
    const num = parseInt(form.ftc, 10);
    if (!num || num <= 0) { setVerifyError('Enter a valid team number'); return; }
    setVerifying(true); setVerifyError(''); setVerified(null);
    try {
      const res = await apiFetch(`/api/ftc/lookup?number=${num}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setVerifyError(body?.error || 'Lookup failed'); return; }
      setVerified(body);
    } catch {
      setVerifyError('Could not reach FTC Scout — try again in a moment');
    } finally {
      setVerifying(false);
    }
  };

  // Same body as the Legacy Settings modal: the FTC number also becomes the
  // workspace's display number, sent only when it changed (or wasn't linked).
  const save = async () => {
    if (!team?.id || !form.name.trim()) return;
    const submitted = draft;
    setSaving(true);
    try {
      const body: any = { name: form.name.trim() };
      const v = form.ftc.trim();
      if (v !== savedFtc || (v && !team.ftc_team_number)) {
        body.ftc_team_number = v === '' ? null : parseInt(v, 10);
        body.number = v;
      }
      const res = await apiFetch(`/api/teams/${team.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { notify(data.error || 'Could not save team settings.', 'error'); return; }
      onTeamSaved?.({ id: team.id, ...body });
      // Offline pages and Predict follow the new number, not the old one.
      if (body.ftc_team_number !== undefined) ownFtcTeamChanged(body.ftc_team_number);
      refresh?.settings?.();
      if (getDraft(draftKey, null) === submitted) { setDraft(null); setVerified(null); }
      notify('Team settings saved.', 'success');
    } catch {
      notify('Could not save team settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const regenerate = async () => {
    if (!confirmRegen) { setConfirmRegen(true); return; }
    setRegenerating(true);
    try {
      const res = await apiFetch('/api/teams/regenerate-code', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.access_code) {
        setFreshCode(data.access_code);
        setHistoryVersion((v) => v + 1);
        notify('New access code created. The old one no longer works.', 'success');
      }
      else notify(data.error || 'Could not create a new code.', 'error');
    } catch {
      notify('Could not create a new code.', 'error');
    } finally {
      setRegenerating(false);
      setConfirmRegen(false);
    }
  };

  if (!team) return <p className="text-sm text-muted-foreground">You’re not in a workspace yet.</p>;
  const canSyncCalendar = (hasPerm ? hasPerm('manage_calendar') : false) || currentUser?.role === 'President';

  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <SettingsGroup title="Team" description={isAdmin ? 'Your workspace name and FTC team.' : 'Only admins can change these.'}>
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="ws-name">Workspace name</Label>
              <Input id="ws-name" value={form.name} maxLength={80} disabled={!isAdmin} onChange={(e) => set({ name: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ws-ftc">FTC team number</Label>
              <div className="flex gap-2">
                <Input id="ws-ftc" inputMode="numeric" value={form.ftc} disabled={!isAdmin} placeholder="e.g. 33950" onChange={(e) => { set({ ftc: e.target.value.replace(/\D/g, '') }); setVerified(null); setVerifyError(''); }} />
                {isAdmin && <Button type="button" variant="outline" onClick={() => void verify()} disabled={verifying || !form.ftc}>{verifying ? <Loader2 className="animate-spin" /> : 'Verify'}</Button>}
              </div>
              {team.ftc_team_number && !dirty && <p className="flex items-center gap-1.5 text-xs text-success"><Check className="size-3.5" /> Connected to #{team.ftc_team_number}</p>}
            </div>
            {verifyError && <p className="text-sm text-destructive sm:col-span-2" role="alert">{verifyError}</p>}
            {verified && (
              <div className="rounded-lg border border-success/40 bg-success/5 p-3 text-sm sm:col-span-2" role="status">
                <p className="font-medium">#{verified.number} {verified.name}</p>
                <p className="text-muted-foreground">{[verified.schoolName, [verified.location?.city, verified.location?.state].filter(Boolean).join(', '), verified.rookieYear ? `rookie ${verified.rookieYear}` : null].filter(Boolean).join(' · ')}</p>
              </div>
            )}
          </div>
          {isAdmin && (
            <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
              {dirty && <span className="mr-auto text-sm text-muted-foreground">Unsaved changes</span>}
              {dirty && <Button type="button" variant="ghost" onClick={() => { setDraft(null); setVerified(null); }}>Discard</Button>}
              <Button type="submit" disabled={!dirty || saving || !form.name.trim()}>{saving && <Loader2 className="animate-spin" />} Save</Button>
            </div>
          )}
        </SettingsGroup>
      </form>

      {(isAdmin || hasPerm?.('invite_members')) && (
        <SettingsGroup title="Invites & access">
          <SettingsRow label="Invite links" description="Make a link people can join with. Links can expire, cap their uses and need approval.">
            <Button variant="outline" onClick={() => navigate('/settings?section=members&invite=1', { replace: true })}><UserPlus /> Invite people</Button>
          </SettingsRow>
          {isAdmin && (<>
          <SettingsRow label="Access code" description="Hidden until you reveal it; each reveal is logged. People can also join by typing it.">
            <AccessCode teamId={team.id} fresh={freshCode} onRevealed={() => setHistoryVersion((v) => v + 1)} />
          </SettingsRow>
          <SettingsRow label="Code history" description="Who revealed or replaced the code recently." stack>
            <AccessCodeHistory teamId={team.id} version={historyVersion} />
          </SettingsRow>
          <SettingsRow label="New access code" description={confirmRegen ? 'The current code will stop working immediately.' : 'Use this if the code leaked.'}>
            <span className="flex gap-2">
              {confirmRegen && <Button variant="ghost" onClick={() => setConfirmRegen(false)}>Cancel</Button>}
              <Button variant={confirmRegen ? 'destructive' : 'outline'} onClick={() => void regenerate()} disabled={regenerating}>
                {regenerating ? <Loader2 className="animate-spin" /> : <RefreshCw />} {confirmRegen ? 'Yes, replace it' : 'Generate new code'}
              </Button>
            </span>
          </SettingsRow>
          <SettingsRow label="Roles & permissions" description="Group permissions and hand them to members.">
            <Button variant="outline" onClick={() => (onOpenSection ? onOpenSection('roles') : navigate('/settings?section=roles', { replace: true }))}><ShieldCheck /> Open roles</Button>
          </SettingsRow>
          </>)}
        </SettingsGroup>
      )}

      <GoogleCalendarGroup settings={settings} canSync={canSyncCalendar} onRefresh={() => refresh?.settings?.()} />

      <SettingsGroup title="Leave or delete" description="Step away from this workspace, or remove it for everyone.">
        {onLeaveTeam && (
          <SettingsRow label="Leave this workspace" description="You lose access to its chat, tasks and files. Your other workspaces and your account stay. An admin can invite you back.">
            <Button variant="outline" className="text-warning hover:text-warning max-sm:h-11" onClick={() => onLeaveTeam(team)}><LogOut /> Leave {team.name}</Button>
          </SettingsRow>
        )}
        {onDeleteTeam && team.can_manage && (
          <SettingsRow label="Delete this workspace" description="Permanently deletes every member, task, event, message, file, budget entry and CAD record in it, for everyone. You type its name to confirm. This can't be undone.">
            <Button variant="destructive" className="max-sm:h-11" onClick={() => onDeleteTeam(team)}><Trash2 /> Delete {team.name}</Button>
          </SettingsRow>
        )}
        <SettingsRow label="All your workspaces" description={`You're in ${teams.length} ${teams.length === 1 ? 'workspace' : 'workspaces'}. Switch, leave or delete any of them.`}>
          <Button variant="outline" className="max-sm:h-11" onClick={() => navigate('/teams?tab=workspaces')}><Building2 /> Manage workspaces</Button>
        </SettingsRow>
      </SettingsGroup>
    </div>
  );
}

function GoogleCalendarGroup({ settings, canSync, onRefresh }: { settings: any; canSync: boolean; onRefresh: () => void }) {
  const [link, setLink] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncOn, setSyncOn] = useState(settings?.google_calendar_sync === '1');
  const [saving, setSaving] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/calendar/link');
      const data = await res.json().catch(() => ({}));
      if (res.ok) setLink(data);
    } catch { /* offline */ }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => { setSyncOn(settings?.google_calendar_sync === '1'); }, [settings?.google_calendar_sync]);
  // OAuth return flags (the Google redirect comes back to /settings).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('cal_linked') && !params.has('cal_error')) return;
    if (params.get('cal_linked') === '1') { notify('Google Calendar linked!', 'success'); void load(); }
    else notify('Could not link Google Calendar — try again.', 'error');
    params.delete('cal_linked'); params.delete('cal_error');
    const q = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (q ? `?${q}` : ''));
  }, []);

  const unlink = async () => {
    if (!(await confirmDialog({ title: 'Unlink Google Calendar?', message: 'Team events will no longer sync to your personal calendar.', confirmLabel: 'Unlink' }))) return;
    const res = await apiFetch('/api/calendar/link', { method: 'DELETE' });
    if (res.ok) { notify('Google Calendar unlinked', 'success'); void load(); }
    else notify('Could not unlink — try again.', 'error');
  };
  const toggleSync = async () => {
    setSaving(true);
    try {
      const res = await apiFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'google_calendar_sync', value: syncOn ? '0' : '1' }) });
      if (res.ok) {
        setSyncOn(!syncOn);
        notify(syncOn ? 'Team calendar sync turned off' : 'Team calendar sync turned on — new events will push to linked calendars', 'success');
        onRefresh();
      } else notify('Could not save setting', 'error');
    } catch {
      notify('Could not save setting', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsGroup title="Google Calendar">
      {loading ? <div className="p-4"><Skeleton className="h-10 w-full" /></div> : (
        <>
          <SettingsRow label="Your calendar" description={link?.linked ? `Linked as ${link.google_email || 'your Google account'}` : 'Get team events on your personal Google Calendar.'}>
            {link?.linked
              ? <Button variant="outline" onClick={() => void unlink()}><Unlink /> Unlink</Button>
              : <Button asChild><a href="/api/auth/google/calendar"><CalendarDays /> Link Google Calendar <ExternalLink className="size-3.5" /></a></Button>}
          </SettingsRow>
          {canSync && (
            <SettingsRow label="Sync team events to members’ calendars" description="Meetings, league meets and other events appear on every linked member’s calendar." htmlFor="cal-sync">
              <Switch id="cal-sync" checked={syncOn} disabled={saving} onCheckedChange={() => void toggleSync()} />
            </SettingsRow>
          )}
          {link?.linked && !link?.team_sync_enabled && (
            <p className="flex items-center gap-2 border-t border-border px-4 py-3 text-sm text-muted-foreground"><Badge variant="outline">Off</Badge> Team sync is off — an admin can turn it on.</p>
          )}
        </>
      )}
    </SettingsGroup>
  );
}
