// Shared Owner-portal logic for Legacy OwnerView and the Modern owner
// console. Same /api/owner/* endpoints and confirmations: the overview,
// users (search / team filter, quick delete), AI control (owner-timezone
// usage), misuse flags (dismiss / warn / timeout / disable) and feedback
// (resolve deletes it server-side). Per-user management (AI kill switch,
// timeouts, token budgets, warnings, move workspace, delete membership or the
// whole account) lives in useOwnerUser. Note and limit inputs are drafted per
// flag / user so they survive a mode switch; loads are latest-wins.
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../services/api';
import { confirmDialog, notify } from '../dialog';
import { deleteDraft, useDraft } from '../../modern/drafts';

export type OwnerTab = 'overview' | 'users' | 'ai' | 'flags' | 'feedback';

/** The owner's timezone drives "today" and the daily history server-side. */
export function aiOverviewUrl() {
  let tz = 'America/New_York';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch { /* default */ }
  return `/api/owner/ai-overview?tz=${encodeURIComponent(tz)}`;
}

const json = async (url: string) => {
  const r = await apiFetch(url);
  return r.ok ? r.json() : null;
};

export function useOwnerConsole() {
  const [tab, setTab] = useState<OwnerTab>('overview');
  const [overview, setOverview] = useState<any>(null);
  const [feedback, setFeedback] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [aiOverview, setAiOverview] = useState<any>(null);
  const [flags, setFlags] = useState<any[]>([]);
  const [flagFilter, setFlagFilter] = useState<'open' | 'all'>('open');
  const [loading, setLoading] = useState(true);
  const [userSearch, setUserSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const seq = useRef({ users: 0, ai: 0, flags: 0 });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [o, f, u, a, fl] = await Promise.all([
        json('/api/owner/overview'), json('/api/owner/feedback'), json('/api/owner/users'), json(aiOverviewUrl()), json('/api/owner/ai-flags'),
      ]);
      setOverview(o);
      setFeedback(Array.isArray(f) ? f : []);
      setUsers(Array.isArray(u) ? u : []);
      setAiOverview(a);
      setFlags(Array.isArray(fl) ? fl : []);
    } catch { /* keep what we have */ } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void loadAll(); }, [loadAll]);

  const reloadFlags = useCallback(async (filter: 'open' | 'all' = flagFilter) => {
    const id = ++seq.current.flags;
    const r = await apiFetch(`/api/owner/ai-flags?status=${filter}`).catch(() => null);
    if (r?.ok && id === seq.current.flags) setFlags(await r.json());
  }, [flagFilter]);
  const reloadUsers = useCallback(async () => {
    const id = ++seq.current.users;
    const r = await apiFetch('/api/owner/users').catch(() => null);
    if (r?.ok && id === seq.current.users) setUsers(await r.json());
  }, []);
  const reloadAi = useCallback(async () => {
    const id = ++seq.current.ai;
    const r = await apiFetch(aiOverviewUrl()).catch(() => null);
    if (r?.ok && id === seq.current.ai) setAiOverview(await r.json());
  }, []);
  // Fresh numbers every time the AI Control tab opens.
  useEffect(() => { if (tab === 'ai') void reloadAi(); }, [tab, reloadAi]);
  const reloadAfterChange = () => { void reloadUsers(); void reloadAi(); void reloadFlags(); };

  const chooseFlagFilter = (f: 'open' | 'all') => { setFlagFilter(f); void reloadFlags(f); };

  const setFeedbackStatus = async (id: number, status: 'new' | 'resolved') => {
    const res = await apiFetch(`/api/owner/feedback/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    }).catch(() => null);
    if (res?.ok) {
      // Resolved feedback is deleted server-side (user gets notified), so drop it from the list.
      if (status === 'resolved') setFeedback((fs) => fs.filter((f) => f.id !== id));
      else setFeedback((fs) => fs.map((f) => (f.id === id ? { ...f, status } : f)));
    } else notify('Could not update feedback', 'error');
  };

  const handleFlagAction = async (id: number, action: string, note: string, timeoutHours?: number) => {
    const r = await apiFetch(`/api/owner/ai-flags/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, note, timeoutHours }),
    }).catch(() => null);
    if (r?.ok) {
      notify(action === 'dismiss' ? 'Flag dismissed' : action === 'warn' ? 'Warning recorded' : action === 'timeout' ? 'AI timed out for user' : 'AI disabled for user', 'success');
      deleteDraft(`owner:flag-note:${id}`);
      reloadAfterChange();
    } else {
      notify('Action failed', 'error');
    }
  };

  const quickDeleteUser = async (u: any) => {
    const ok = await confirmDialog({
      title: 'Delete user',
      message: `Remove ${u.name} (${u.email}) from ${u.team_name || 'their team'}? Their private AI chats and usage history go with them. This can't be undone.`,
      confirmLabel: 'Delete', danger: true,
    });
    if (!ok) return;
    const r = await apiFetch(`/api/owner/users/${u.id}`, { method: 'DELETE' }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) { notify(j.error || 'Delete failed', 'error'); return; }
    notify('User deleted', 'success');
    reloadAfterChange();
  };

  const totals = overview?.totals || {};
  const openFlagCount = aiOverview?.flags?.open || 0;
  const teams = Array.from(new Set(users.map((u) => u.team_name).filter(Boolean))).sort() as string[];
  const filteredUsers = users.filter((u) => {
    if (teamFilter !== 'all' && u.team_name !== teamFilter) return false;
    if (userSearch) {
      const q = userSearch.toLowerCase();
      return (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
    }
    return true;
  });

  return {
    tab, setTab, overview, feedback, users, aiOverview, flags, flagFilter, chooseFlagFilter, loading, userSearch, setUserSearch,
    teamFilter, setTeamFilter, selectedId, setSelectedId, totals, openFlagCount, teams, filteredUsers,
    setFeedbackStatus, handleFlagAction, quickDeleteUser, reloadFlags, reloadUsers, reloadAi, reloadAfterChange,
  };
}

/** A flag's reviewer note (drafted per flag) and an action runner with a busy flag. */
export function useFlagReview(flag: any, onAction: (id: number, action: string, note: string, timeoutHours?: number) => Promise<void>) {
  const [note, setNote] = useDraft<string>(`owner:flag-note:${flag.id}`, '');
  const [busy, setBusy] = useState(false);
  const run = async (action: string, timeoutHours?: number) => {
    if (busy) return;
    setBusy(true);
    try { await onAction(flag.id, action, note, timeoutHours); } finally { setBusy(false); }
  };
  return { note, setNote, busy, run };
}

/** One user's management drawer. */
export function useOwnerUser(userId: number, { onClose, onChanged, teams }: { onClose: () => void; onChanged: () => void; teams: any[] }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dailyLimit, setDailyLimit] = useDraft<string | null>(`owner:limit:${userId}`, null);
  const [replyMax, setReplyMax] = useDraft<string | null>(`owner:reply:${userId}`, null);
  const [warnNote, setWarnNote] = useDraft<string>(`owner:warn:${userId}`, '');
  const [moveTeamId, setMoveTeamId] = useDraft<string>(`owner:move:${userId}`, '');
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState('');
  const seq = useRef(0);

  const load = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    try {
      const r = await apiFetch(`/api/owner/users/${userId}`);
      if (r.ok && id === seq.current) setData(await r.json());
    } catch { /* keep */ } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [userId]);
  useEffect(() => { void load(); }, [load]);

  // Inputs show the saved value until edited (a drafted edit wins).
  const limitValue = dailyLimit ?? (data?.user?.ai_daily_token_limit ? String(data.user.ai_daily_token_limit) : '');
  const replyValue = replyMax ?? (data?.user?.ai_max_tokens_reply ? String(data.user.ai_max_tokens_reply) : '');

  const patchAi = async (body: any, msg = 'AI controls updated', clear?: () => void) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await apiFetch(`/api/owner/users/${userId}/ai`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { notify(j.error || 'Update failed', 'error'); return; }
      notify(msg, 'success');
      clear?.();
      await load(); onChanged();
    } catch { notify('Update failed', 'error'); } finally { setBusy(false); }
  };
  const saveDailyLimit = () => patchAi({ ai_daily_token_limit: limitValue || null }, 'Daily limit saved', () => setDailyLimit(null));
  const saveReplyMax = () => patchAi({ ai_max_tokens_reply: replyValue || null }, 'Reply cap saved', () => setReplyMax(null));

  const doWarn = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await apiFetch(`/api/owner/users/${userId}/warn`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: warnNote }),
      });
      if (!r.ok) { notify('Warn failed', 'error'); return; }
      notify('Warning recorded', 'success');
      setWarnNote('');
      await load(); onChanged();
    } catch { notify('Warn failed', 'error'); } finally { setBusy(false); }
  };

  const doMoveUser = async () => {
    const u = data?.user;
    const dest = (teams || []).find((t: any) => String(t.id) === String(moveTeamId));
    if (!dest) { notify('Pick a workspace first', 'error'); return; }
    const ok = await confirmDialog({
      title: 'Move user',
      message: `Move ${u?.name} (${u?.email}) from ${u?.team_name || 'their team'} to ${dest.name}? They'll lose their current roles and be signed out. They won't be notified.`,
      confirmLabel: 'Move',
    });
    if (!ok) return;
    setMoving(true);
    setMoveError('');
    try {
      const r = await apiFetch(`/api/owner/users/${userId}/move`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teamId: dest.id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = j.error || `Move failed (HTTP ${r.status})`;
        setMoveError(msg);
        notify(msg, 'error');
        return;
      }
      notify(`Moved to ${dest.name}`, 'success');
      setMoveTeamId('');
      await load(); onChanged();
    } catch (e: any) {
      const msg = e?.message?.includes('fetch') || e?.name === 'TypeError'
        ? 'Network error — check your connection and try again.'
        : (e?.message || 'Move failed unexpectedly.');
      setMoveError(msg);
      notify(msg, 'error');
    } finally { setMoving(false); }
  };

  const doDeleteMembership = async () => {
    const u = data?.user;
    const ok = await confirmDialog({
      title: 'Delete user',
      message: `Remove ${u?.name} (${u?.email}) from ${u?.team_name || 'their team'}? Sessions, private AI chats, and usage history are removed too. This can't be undone.`,
      confirmLabel: 'Delete', danger: true,
    });
    if (!ok) return;
    const r = await apiFetch(`/api/owner/users/${userId}`, { method: 'DELETE' }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) { notify(j.error || 'Delete failed', 'error'); return; }
    notify('User deleted', 'success');
    onClose(); onChanged();
  };

  const doDeleteAccount = async () => {
    const u = data?.user;
    const n = (data?.siblings?.length || 0) + 1;
    const ok = await confirmDialog({
      title: 'Delete entire account',
      message: `Delete EVERYTHING for ${u?.email} across ${n} team${n > 1 ? 's' : ''}? This can't be undone.`,
      confirmLabel: 'Delete everything', danger: true,
    });
    if (!ok) return;
    const r = await apiFetch(`/api/owner/accounts?email=${encodeURIComponent(u.email)}`, { method: 'DELETE' }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) { notify(j.error || 'Delete failed', 'error'); return; }
    if (j.skipped?.length) notify(`Deleted ${j.deleted.length}, skipped ${j.skipped.length} (see console)`, 'info');
    else notify(`Account deleted (${j.deleted.length} membership${j.deleted.length === 1 ? '' : 's'})`, 'success');
    onClose(); onChanged();
  };

  const timeoutUntil = (() => {
    const t = data?.user?.ai_timeout_until;
    if (!t) return null;
    const ms = new Date(String(t).replace(' ', 'T') + 'Z').getTime();
    return ms > Date.now() ? new Date(ms) : null;
  })();

  return {
    data, loading, busy, moving, moveError, setMoveError,
    dailyLimit: limitValue, setDailyLimit: (v: string) => setDailyLimit(v.replace(/[^0-9]/g, '')),
    replyMax: replyValue, setReplyMax: (v: string) => setReplyMax(v.replace(/[^0-9]/g, '')),
    warnNote, setWarnNote, moveTeamId, setMoveTeamId, timeoutUntil,
    patchAi, saveDailyLimit, saveReplyMax, doWarn, doMoveUser, doDeleteMembership, doDeleteAccount,
  };
}
