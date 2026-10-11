// Bruno's record references as chips. The server appends the references it
// checked as a ```refs block (see server/brunoRefs.ts); only those become
// chips, and a chip opens the stable link (/t/<team>/<type>/<id>), which
// checks access again when clicked. Anything else Bruno wrote as a ref: link
// shows as plain text.
import { Link } from 'react-router-dom';
import { Box, Calendar, CheckSquare, ClipboardList, FileText, FolderOpen, NotebookText, Package, Shapes, User } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';

export type BrunoRef = { type: string; id: number; label: string; status: 'ok' | 'deleted' };
export type BrunoRefs = { team: number; byKey: Map<string, BrunoRef> };

const BLOCK_RE = /```refs\s*\r?\n([\s\S]*?)\r?\n```/;

/** The reply without its refs block (or a half-streamed one), plus the checked refs. */
export function splitRefs(text: string): { body: string; refs: BrunoRefs | null } {
  const src = String(text || '');
  let refs: BrunoRefs | null = null;
  // The server's block is the last one (its appendix); the model can't write one.
  const all = [...src.matchAll(new RegExp(BLOCK_RE.source, 'g'))];
  const m = all.at(-1);
  if (m) {
    try {
      const parsed = JSON.parse(m[1]);
      if (Number.isInteger(parsed?.team) && Array.isArray(parsed?.refs)) {
        refs = { team: parsed.team, byKey: new Map(parsed.refs.filter((r: any) => typeof r?.type === 'string' && Number.isInteger(r?.id) && typeof r?.label === 'string').map((r: BrunoRef) => [`${r.type}:${r.id}`, r])) };
      }
    } catch { /* malformed: no chips */ }
  }
  return { body: src.replace(/```refs[\s\S]*?(```|$)/g, '').trimEnd(), refs };
}

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  task: CheckSquare, event: Calendar, page: NotebookText, section: FolderOpen, inventory: Package, member: User,
  file: FileText, cad_doc: Shapes, cad_snapshot: Box, cad_review: ClipboardList, cad_part: Package, scout: ClipboardList,
};
const NOUN: Record<string, string> = {
  task: 'task', event: 'event', page: 'notebook page', section: 'notebook section', inventory: 'inventory part', member: 'teammate',
  file: 'file', cad_doc: 'CAD document', cad_snapshot: 'CAD snapshot', cad_review: 'design review', cad_part: 'CAD part', scout: 'scouting entry',
};

/** Render one ref: link: a chip when the server checked it, plain text otherwise. */
export function RefLink({ href, refs, children }: { href: string; refs: BrunoRefs | null; children?: ReactNode }) {
  const m = /^ref:([a-z_]{1,20}):(\d{1,12})$/.exec(href);
  const ref = m && refs?.byKey.get(`${m[1]}:${m[2]}`);
  if (!m || !ref || !refs) return <>{children}</>;
  const Icon = ICONS[ref.type] ?? FileText;
  const chip = 'mx-0.5 inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 align-baseline text-[0.92em] font-medium leading-tight';
  if (ref.status === 'deleted') {
    return <span className={`${chip} border-text-base/15 text-text-muted line-through`} title={`This ${NOUN[ref.type] ?? 'item'} was deleted`}><Icon className="size-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{ref.label}</span><span className="sr-only"> (deleted)</span></span>;
  }
  return (
    <Link to={`/t/${refs.team}/${ref.type}/${ref.id}`} className={`${chip} border-accent/30 bg-accent/10 text-text-base no-underline hover:bg-accent/20`} title={`Open ${NOUN[ref.type] ?? 'item'}: ${ref.label}`}>
      <Icon className="size-3.5 shrink-0 text-accent" aria-hidden="true" /><span className="truncate">{ref.label}</span>
    </Link>
  );
}
