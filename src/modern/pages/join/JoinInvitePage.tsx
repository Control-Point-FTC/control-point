// Signed-out landing for an invite link: "Join <team>" with create-account
// and sign-in choices. The link is used automatically once signed in.
import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck, Users } from 'lucide-react';
import { Button } from '../../../components/ui-kit';
import { AuthHeading, AuthLayout } from '../auth/AuthLayout';
import { fetchInvitePreview, type InvitePreview } from './joinLink';

export function JoinInvitePage({ token, pendingTeam, onCreateAccount, onSignIn, onDismiss }: {
  token: string;
  /** Set after a signup through an approval link: the request was sent. */
  pendingTeam?: string | null;
  onCreateAccount: (teamName: string) => void;
  onSignIn: () => void;
  onDismiss: () => void;
}) {
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    fetchInvitePreview(token).then((p) => { if (live) setPreview(p); }).catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [token]);

  if (pendingTeam) {
    return (
      <AuthLayout onBack={onDismiss} backLabel="Home">
        <AuthHeading
          title="Request sent"
          description={<>Someone on <span className="font-medium text-foreground">{pendingTeam}</span> needs to approve you. We’ll email you when you’re in — then sign in.</>}
        />
        <Button className="h-11 w-full" onClick={onSignIn}>Go to sign in</Button>
      </AuthLayout>
    );
  }

  const dead = error || (preview && preview.state !== 'active');
  return (
    <AuthLayout onBack={onDismiss} backLabel="Home">
      {!preview && !error ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Checking your invite…</p>
      ) : dead ? (
        <>
          <AuthHeading title="This invite can’t be used" description={error || preview?.message || ''} />
          <Button variant="outline" className="h-11 w-full" onClick={onDismiss}>Back to Control Point</Button>
        </>
      ) : (
        <>
          <div className="mb-6 flex size-12 items-center justify-center rounded-xl bg-accent/15 text-accent"><Users className="size-6" /></div>
          <AuthHeading
            title={`Join ${preview!.team.name}`}
            description={<>You’ve been invited to {preview!.team.name}{preview!.team.number ? ` (#${preview!.team.number})` : ''} on Control Point.</>}
          />
          {preview!.requires_approval && (
            <p className="mb-4 flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" /> Someone on the team approves each new member.
            </p>
          )}
          <div className="grid gap-2">
            <Button className="h-11 w-full" onClick={() => onCreateAccount(preview!.team.name)}>Create an account</Button>
            <Button variant="outline" className="h-11 w-full" onClick={onSignIn}>I already have an account</Button>
          </div>
        </>
      )}
    </AuthLayout>
  );
}
