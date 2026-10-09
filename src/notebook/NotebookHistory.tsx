import React, { useEffect, useState } from 'react';
import { apiJson } from '../services/api';
import type { NotebookSync } from './NotebookSync';

type Version = { id: number; revision: number; authorId: number | null; savedAt: string };
/** History data is fetched only on explicit tab selection, under the live team guard. */
export function NotebookHistory({ sync }: { sync: NotebookSync }) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const abort = new AbortController();
    const headers = sync.scope ? { 'X-CP-Notebook-Team': String(sync.scope.teamId) } : undefined;
    void apiJson<Version[]>(`/api/notebook/pages/${sync.pageId}/versions`, { headers, cache: 'no-store', signal: abort.signal }).then(setVersions).catch(e => { if (!abort.signal.aborted) { setVersions([]); setError(e.message); } }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => { abort.abort(); };
  }, [sync]);
  return <div className="nb-history-list" aria-label="Page revision history">{loading ? <span role="status">Loading revisions…</span> : error ? <span role="alert">{error}</span> : !versions.length ? <span>No earlier revisions yet. Changes are saved automatically.</span> : <><strong>Saved revisions</strong>{versions.map(v => <div key={v.id}><span>Revision {v.revision}</span><time dateTime={v.savedAt}>{new Date(v.savedAt).toLocaleString()}</time></div>)}</>}</div>;
}
