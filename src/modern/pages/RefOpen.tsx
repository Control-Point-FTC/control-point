// /t/<team>/<type>/<id>: a stable link to one record. Access is checked again
// every time it's opened, so a shared or old link can only show what the
// person may see now: it opens the record, says it was deleted, offers to
// switch to the team it's in, or says it isn't available (never which).
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Loader2, Link2Off, Trash2, ArrowLeftRight } from 'lucide-react';
import { apiJson } from '../../services/api';
import { Button } from '../../components/ui-kit';

export type RefStatus =
  | { status: 'ok'; type: string; id: number; label: string; href: string }
  | { status: 'deleted'; type: string; id: number; label: string }
  | { status: 'unavailable'; type: string; id: number }
  | { status: 'switch_team'; type: string; id: number; teamId: number; teamName: string };

export function resolveRef(type: string, id: string | number, teamId?: string | number, signal?: AbortSignal) {
  return apiJson<RefStatus>(`/api/refs/${encodeURIComponent(type)}/${encodeURIComponent(String(id))}${teamId ? `?team=${encodeURIComponent(String(teamId))}` : ''}`, { cache: 'no-store', signal });
}

/** Go to a resolved record: app pages in the app, files as a plain download/open. */
export function openResolved(href: string, navigate: (to: string, opts?: { replace?: boolean }) => void, replace = false) {
  if (href.startsWith('/api/')) window.location.assign(href); else navigate(href, { replace });
}

export function RefOpen({ activeTeamId, onSwitchTeam }: { activeTeamId?: number | null; onSwitchTeam: (teamId: number) => void }) {
  const { teamId, type = '', id = '' } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<RefStatus | { status: 'loading' } | { status: 'error'; message: string }>({ status: 'loading' });
  // Re-check whenever the active team changes (after "Switch team").
  useEffect(() => {
    const abort = new AbortController();
    setState({ status: 'loading' });
    resolveRef(type, id, teamId, abort.signal).then(r => {
      if (abort.signal.aborted) return;
      if (r.status === 'ok') openResolved(r.href, navigate, true); else setState(r);
    }).catch(e => { if (!abort.signal.aborted) setState({ status: 'error', message: e instanceof Error ? e.message : 'Couldn’t open that link.' }); });
    return () => abort.abort();
  }, [type, id, teamId, activeTeamId, navigate]);

  const box = (icon: React.ReactNode, title: string, body: React.ReactNode, action?: React.ReactNode) => (
    <div className="mx-auto mt-16 max-w-md rounded-xl border border-line bg-card p-6 text-center" role="status">
      <div className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">{icon}</div>
      <h1 className="text-base font-semibold">{title}</h1>
      <div className="mt-1 text-sm text-muted-foreground">{body}</div>
      <div className="mt-4 flex justify-center gap-2">{action}<Button variant="ghost" asChild><Link to="/">Go to dashboard</Link></Button></div>
    </div>
  );
  if (state.status === 'loading') return <p className="mt-16 flex items-center justify-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="size-4 animate-spin" /> Opening link…</p>;
  if (state.status === 'deleted') return box(<Trash2 className="size-5" />, 'This was deleted', <>“{state.label}” no longer exists{state.type === 'page' || state.type === 'section' ? ', but it may still be in the notebook trash' : ''}.</>);
  if (state.status === 'switch_team') return box(<ArrowLeftRight className="size-5" />, `This is in ${state.teamName}`, 'Switch to that team to open it.', <Button onClick={() => onSwitchTeam(state.teamId)}>Switch to {state.teamName}</Button>);
  if (state.status === 'error') return box(<Link2Off className="size-5" />, 'Couldn’t open this link', state.message);
  return box(<Link2Off className="size-5" />, 'This isn’t available', 'You don’t have access to it, or it no longer exists.');
}
