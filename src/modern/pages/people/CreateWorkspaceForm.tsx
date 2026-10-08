// New workspace, FTC number first: the number is checked against the
// official FTC record and names the workspace. Each FTC team gets one
// workspace — if the number is already taken, offer to ask that workspace
// to let you in instead. Teams without a number type a name.
import { useId, useState } from 'react';
import { BadgeCheck, Loader2, UserPlus } from 'lucide-react';
import { Button, Input, Label } from '../../../components/ui-kit';
import { lookupNote, useTeamLookup } from '../../../components/auth/useAuthForms';
import { apiFetch } from '../../../services/api';

export interface CreateWorkspaceInput { ftc_number?: string; name?: string }

export function CreateWorkspaceForm({ onCreate, onRequested, autoFocus }: {
  /** Creates the workspace; rejects with an Error (its `data` may carry `ftcTaken`). */
  onCreate: (input: CreateWorkspaceInput) => Promise<void>;
  /** A join request was sent to the workspace that owns the number. */
  onRequested: (teamName: string) => void;
  autoFocus?: boolean;
}) {
  const id = useId();
  const [teamNumber, setTeamNumber] = useState('');
  const [teamName, setTeamName] = useState('');
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState('');
  // Set when the server refuses a number another workspace holds.
  const [takenNumber, setTakenNumber] = useState<number | null>(null);
  const t = useTeamLookup({
    teamNumber,
    setTeamNumber: (v) => { setTeamNumber(v); setTakenNumber(null); setError(''); },
    teamName,
    setTeamName,
  });
  const noNumber = !teamNumber.trim();
  const taken = takenNumber ?? (t.lookup === 'found' && t.claimed ? Number(teamNumber) : null);
  const canCreate = !taken && !busy && (t.lookup === 'found' || ((noNumber || t.manual) && !!teamName.trim()));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) return;
    setBusy(true);
    setError('');
    try {
      await onCreate(t.lookup === 'found' ? { ftc_number: teamNumber.trim() } : { ftc_number: teamNumber.trim() || undefined, name: teamName.trim() });
    } catch (err: any) {
      if (err?.data?.ftcTaken) setTakenNumber(Number(err.data.ftcTaken.number));
      else setError(err?.message || 'Could not create the workspace');
    } finally {
      setBusy(false);
    }
  };

  const askToJoin = async () => {
    if (!taken) return;
    setAsking(true);
    setError('');
    try {
      const res = await apiFetch('/api/teams/request-join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ftc_number: taken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not send the request');
      onRequested(data.team?.name || `Team #${taken}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAsking(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-num`}>FTC team number</Label>
        <div className="relative">
          <Input
            id={`${id}-num`} inputMode="numeric" autoFocus={autoFocus} value={teamNumber} placeholder="e.g. 4215"
            onChange={(e) => t.onNumChange(e.target.value.replace(/\D/g, ''))} className="h-11 pr-10 font-mono"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2" aria-hidden="true">
            {t.lookup === 'loading' && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            {t.lookup === 'found' && !taken && <BadgeCheck className="size-4 text-success" />}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">Not an FTC team? Leave this empty and type a name.</p>
      </div>

      <div aria-live="polite" className="grid gap-2">
        {t.lookup === 'found' && (
          <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
            <BadgeCheck className="mt-0.5 size-4 shrink-0 text-success" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{t.foundName}</p>
              {t.foundSchool && <p className="truncate text-xs text-muted-foreground">{t.foundSchool}</p>}
            </div>
          </div>
        )}
        {taken && (
          <div role="alert" className="grid gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            <p>Team #{taken} already has a workspace on Control Point. Each FTC team gets one — ask them to let you in.</p>
            <Button type="button" variant="outline" className="justify-self-start" disabled={asking} onClick={() => void askToJoin()}>
              {asking ? <Loader2 className="animate-spin" /> : <UserPlus />} Ask to join
            </Button>
          </div>
        )}
        {lookupNote(t.lookup, t.retryAfter) && !t.manual && (
          <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            {lookupNote(t.lookup, t.retryAfter)}{' '}
            <button type="button" onClick={() => t.setManual(true)} className="font-medium text-foreground underline underline-offset-4">Enter a team name instead</button>
          </p>
        )}
      </div>

      {(noNumber || t.manual) && (
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-name`}>Team name</Label>
          <Input id={`${id}-name`} value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="e.g. Circuit Breakers" className="h-11" />
        </div>
      )}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={!canCreate} className="h-11">
        {busy && <Loader2 className="animate-spin" />} Create workspace
      </Button>
    </form>
  );
}
