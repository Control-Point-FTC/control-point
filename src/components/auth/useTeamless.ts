// Shared logic for the zero-team screen (Classic TeamlessScreen and the Modern
// page): create a workspace, join one with an access code, or delete the
// account (type your email, then confirm). The requests themselves come from
// App, so both looks behave the same.
import { useState } from 'react';
import { confirmDialog, notify } from '../dialog';

export type TeamlessMode = 'menu' | 'create' | 'join' | 'delete';

export function useTeamless({ user, onCreateTeam, onJoinTeam, onDeleteAccount }: {
  user: any;
  onCreateTeam: (input: { ftc_number?: string; name?: string }) => Promise<void>;
  onJoinTeam: (accessCode: string) => Promise<void>;
  onDeleteAccount: () => Promise<void>;
}) {
  const [mode, setMode] = useState<TeamlessMode>('menu');
  const [teamName, setTeamName] = useState('');
  const [code, setCode] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const emailMatches = confirmEmail.trim().toLowerCase() === (user?.email || '').toLowerCase();

  const doCreate = async () => {
    if (!teamName.trim() || busy) return;
    setBusy(true);
    try {
      await onCreateTeam({ name: teamName.trim() });
    } catch (e: any) {
      notify(e.message || 'Could not create team', 'error');
    } finally {
      setBusy(false);
    }
  };

  const doJoin = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    try {
      await onJoinTeam(code.trim());
    } catch (e: any) {
      notify(e.message || 'Could not join team', 'error');
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!emailMatches) {
      notify('Type your email address exactly to confirm.', 'info');
      return;
    }
    if (!(await confirmDialog({ title: 'Delete account', message: 'This is permanent. Delete your account and all of your personal data?', confirmLabel: 'Delete my account', danger: true }))) return;
    setBusy(true);
    try {
      await onDeleteAccount();
    } catch (e: any) {
      notify(e.message || 'Could not delete your account.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return { mode, setMode, teamName, setTeamName, code, setCode, confirmEmail, setConfirmEmail, busy, emailMatches, doCreate, doJoin, doDelete };
}
