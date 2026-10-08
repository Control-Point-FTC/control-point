// Settings → Account & privacy: password, data export, cookie choices and
// account deletion. Passwords are deliberately NOT kept in the draft store —
// they stay in this component only and are cleared after a change.
import { passwordProblem } from '../../../utils/password';
import { PasswordChecklist } from '../../ui/PasswordChecklist';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cookie, Download, KeyRound, Loader2, TriangleAlert } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label } from '../../../components/ui-kit';
import { apiFetch } from '../../../services/api';
import { confirmDialog, notify } from '../../../components/dialog';
import { SettingsGroup, SettingsRow } from './SettingsPage';

function PasswordForm() {
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [nw2, setNw2] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setMsg(null);
    if (nw !== nw2) { setMsg({ ok: false, text: 'New passwords do not match.' }); return; }
    const weak = passwordProblem(nw);
    if (weak) { setMsg({ ok: false, text: weak }); return; }
    setBusy(true);
    try {
      const res = await apiFetch('/api/auth/change-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: cur, newPassword: nw }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { setMsg({ ok: true, text: 'Password changed. Other devices were signed out.' }); setCur(''); setNw(''); setNw2(''); }
      else setMsg({ ok: false, text: data.error || 'Could not change password.' });
    } catch {
      setMsg({ ok: false, text: 'Could not change password.' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="grid gap-4 p-4 sm:max-w-sm" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <div className="grid gap-2"><Label htmlFor="pw-cur">Current password</Label><Input id="pw-cur" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></div>
      <div className="grid gap-2"><Label htmlFor="pw-new">New password</Label><Input id="pw-new" type="password" autoComplete="new-password" value={nw} onChange={(e) => setNw(e.target.value)} /><PasswordChecklist value={nw} /></div>
      <div className="grid gap-2"><Label htmlFor="pw-new2">Confirm new password</Label><Input id="pw-new2" type="password" autoComplete="new-password" value={nw2} onChange={(e) => setNw2(e.target.value)} /></div>
      {msg && <p className={msg.ok ? 'text-sm text-success' : 'text-sm text-destructive'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
      <Button type="submit" disabled={busy || !cur || !nw || !nw2} className="justify-self-start">{busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Change password</Button>
    </form>
  );
}

export function AccountSection({ currentUser, teams = [] }: any) {
  const user = currentUser || {};
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [deleting, setDeleting] = useState(false);

  const exportData = async () => {
    setExporting(true);
    try {
      const res = await apiFetch('/api/auth/export');
      if (!res.ok) { notify('Could not export your data.', 'error'); return; }
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `control-point-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch {
      notify('Could not export your data.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const emailMatches = confirmEmail.trim().toLowerCase() === String(user.email || '').toLowerCase() && !!user.email;
  const deleteAccount = async () => {
    if (!emailMatches) { notify('Type your email address exactly to confirm.', 'info'); return; }
    if (!(await confirmDialog({ title: 'Delete account', message: 'This is permanent. Delete your account and all of your personal data?', confirmLabel: 'Delete my account', danger: true }))) return;
    setDeleting(true);
    try {
      const res = await apiFetch('/api/auth/account', { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        try { localStorage.removeItem('cp-session-tag'); localStorage.removeItem('sessionId'); } catch { /* storage unavailable */ }
        window.location.reload();
      } else notify(data.error || 'Could not delete your account.', 'error');
    } catch {
      notify('Could not delete your account.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <SettingsGroup title="Password">
        {user.hasPassword ? <PasswordForm /> : <p className="p-4 text-sm text-muted-foreground">You sign in with Google, so there’s no Control Point password to change.</p>}
      </SettingsGroup>

      <SettingsGroup title="Your data">
        <SettingsRow label="Download my data" description="A JSON file of your profile and everything you’ve created.">
          <Button variant="outline" onClick={() => void exportData()} disabled={exporting}>{exporting ? <Loader2 className="animate-spin" /> : <Download />} Download</Button>
        </SettingsRow>
        <SettingsRow label="Cookies & storage" description="Choose which optional cookies and storage this site may use.">
          <Button variant="outline" onClick={() => window.dispatchEvent(new Event('cp:cookie-settings'))}><Cookie /> Cookie settings</Button>
        </SettingsRow>
      </SettingsGroup>

      <section className="mb-8 rounded-xl border border-destructive/40 bg-destructive/[0.04]">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-destructive"><TriangleAlert className="size-4" /> Delete account</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {teams.length > 0
                ? `Leave or delete your ${teams.length === 1 ? 'workspace' : `${teams.length} workspaces`} first, then you can delete your account.`
                : 'Permanently deletes your account and personal data. This can’t be undone.'}
            </p>
          </div>
          {teams.length > 0
            ? <Button variant="outline" onClick={() => navigate('/teams?tab=workspaces')} className="shrink-0">Manage workspaces</Button>
            : <Button variant="destructive" onClick={() => { setConfirmEmail(''); setDeleteOpen(true); }} className="shrink-0">Delete my account</Button>}
        </div>
      </section>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>Type <span className="font-medium text-foreground">{user.email}</span> to confirm.</DialogDescription>
          </DialogHeader>
          <Input value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} placeholder={user.email} aria-label="Confirm your email" autoComplete="off" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={!emailMatches || deleting} onClick={() => void deleteAccount()}>{deleting && <Loader2 className="animate-spin" />} Delete forever</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
