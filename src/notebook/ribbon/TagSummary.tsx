// Home → Find Tags: the tag summary. Every tagged block in this page, this
// section or the whole notebook, grouped by tag, each one a jump to its spot.
import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { apiJson } from '../../services/api';
import { NOTEBOOK_TAGS } from '../editorSchema';
import { useNotebookWorkspace, type TagSummaryView } from '../workspaceContext';

type Tag = (typeof NOTEBOOK_TAGS)[number];
export type TaggedBlock = { pageId: number; pageTitle: string; sectionId: number; blockId: string | null; tag: Tag; text: string; done: boolean | null; updatedAt: string };
export const TAG_LABELS: Record<Tag, string> = { todo: 'To Do', important: 'Important', question: 'Question', remember: 'Remember for later' };
type Scope = 'page' | 'section' | 'all';

export function TagSummary({ pageId, sectionId, onClose }: { pageId: number; sectionId?: number; onClose: () => void }) {
  const workspace = useNotebookWorkspace();
  const [localView, setLocalView] = useState<TagSummaryView>({ scope: 'section', only: '', hideDone: false });
  const view = workspace?.tagSummaryView ?? localView;
  const setView = (change: Partial<TagSummaryView>) => (workspace?.setTagSummaryView ?? setLocalView)({ ...view, ...change });
  const scope = view.scope, only = view.only as Tag | '', hideDone = view.hideDone;
  const setScope = (value: Scope) => setView({ scope: value });
  const setOnly = (value: Tag | '') => setView({ only: value });
  const setHideDone = (value: boolean) => setView({ hideDone: value });
  const [result, setResult] = useState<{ blocks: TaggedBlock[]; truncated: boolean } | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setResult(null); setError('');
    const query = scope === 'page' ? `?page=${pageId}` : scope === 'section' && sectionId ? `?section=${sectionId}` : '';
    const headers = workspace?.teamId ? { 'X-CP-Notebook-Team': String(workspace.teamId) } : undefined;
    apiJson<{ blocks: TaggedBlock[]; truncated: boolean }>(`/api/notebook/tags${query}`, { headers, cache: 'no-store', signal: abort.signal })
      .then(r => { if (!abort.signal.aborted) setResult(r); })
      .catch(e => { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'Could not load tags.'); });
    return () => abort.abort();
  }, [scope, pageId, sectionId, workspace?.teamId, reload]);
  const groups = useMemo(() => {
    const shown = (result?.blocks ?? []).filter(b => (!only || b.tag === only) && !(hideDone && b.done));
    return NOTEBOOK_TAGS.map(tag => [tag, shown.filter(b => b.tag === tag)] as const).filter(([, items]) => items.length);
  }, [result, only, hideDone]);
  return <section className="nb-tag-summary" aria-label="Tag summary">
    <header>
      <h2>Tag summary</h2>
      <select aria-label="Where to look" value={scope} onChange={e => setScope(e.target.value as Scope)}>
        <option value="page">This page</option>
        <option value="section" disabled={!sectionId}>This section</option>
        <option value="all">All notebooks</option>
      </select>
      <select aria-label="Which tag" value={only} onChange={e => setOnly(e.target.value as Tag | '')}>
        <option value="">All tags</option>
        {NOTEBOOK_TAGS.map(t => <option key={t} value={t}>{TAG_LABELS[t]}</option>)}
      </select>
      <label><input type="checkbox" checked={hideDone} onChange={e => setHideDone(e.target.checked)} /> Hide done</label>
      <button type="button" onClick={() => setReload(n => n + 1)}>Refresh</button>
      <button type="button" aria-label="Close tag summary" onClick={onClose}><X size={15} /></button>
    </header>
    {error && <p role="alert" className="nb-small">{error}</p>}
    {!result && !error && <p role="status" className="nb-small">Finding tags…</p>}
    {result && !groups.length && <p className="nb-small">No tagged notes {scope === 'page' ? 'on this page' : scope === 'section' ? 'in this section' : 'in your notebooks'}{only || hideDone ? ' match these filters' : ''}. Tag a line from Home → Tag.</p>}
    {groups.map(([tag, items]) => <div key={tag} className="nb-tag-group" data-tag={tag}>
      <h3>{TAG_LABELS[tag]} <span>{items.length}</span></h3>
      <ul>{items.map((b, i) => <li key={`${b.pageId}:${b.blockId ?? i}`}>
        <button type="button" data-done={b.done || undefined} onClick={() => workspace?.openPage(b.pageId, b.blockId ?? undefined)}>
          <span>{b.done ? '✓ ' : ''}{b.text || '(no text)'}</span>{scope !== 'page' && <small>{b.pageTitle || 'Untitled'}</small>}
        </button>
      </li>)}</ul>
    </div>)}
    {result?.truncated && <p className="nb-small">Showing the first {result.blocks.length} tagged notes. Narrow it to a section to see the rest.</p>}
  </section>;
}
