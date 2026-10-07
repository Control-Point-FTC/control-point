// Join another workspace with an invite link or an access code (whichever
// the person was sent). Used from the Workspaces tab and the switcher.
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label,
} from '../../../components/ui-kit';

export function JoinWorkspaceDialog({ open, onOpenChange, onJoin }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Joins (link or code); rejects with a readable message. */
  onJoin: (input: string) => Promise<void>;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setValue(''); setError(''); } }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) { setError('Paste an invite link or type an access code'); return; }
    setBusy(true);
    setError('');
    try {
      await onJoin(value.trim());
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || 'Could not join that workspace');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Join a workspace</DialogTitle>
            <DialogDescription>Paste the invite link your team sent you, or type an access code.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="join-input">Invite link or code</Label>
            <Input
              id="join-input" value={value} autoFocus autoComplete="off" spellCheck={false}
              placeholder="https://…/join/…  or  CP-XXXX-XXXXXX"
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={!!error} aria-describedby={error ? 'join-error' : undefined}
            />
            {error && <p id="join-error" role="alert" className="text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Join</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
