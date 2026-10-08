// Shared Resources logic for Legacy ResourcesView and the Modern Resources
// page. Extracted from ResourcesView: the page owns its list (GET
// /api/resources, refetched on the live `resources-changed` event), Bruno's
// link extraction (POST /api/resources/parse) into an editable preview,
// bulk save, and optimistic delete with row-only rollback. The paste box,
// the preview and the in-flight save lock are drafted (they survive a mode
// switch, so a returning page can't save the same links twice); the preview
// freezes while saving, async results are dropped after a sign-out or
// workspace switch, and only the newest parse may fill the preview. Save
// results reach whichever page is mounted: success refetches every list via
// `resources-changed`, and a failure is kept as a drafted error.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiJson } from '../../services/api';
import { getDraft, inEpoch, setDraft, useDraft } from '../../modern/drafts';
import { bulkDelete } from '../../modern/ui/selection';
import { notify } from '../dialog';
import { splitDuplicates } from '../../utils/resourceUrl';

export interface ResourceItem {
  id: number;
  url: string;
  title: string;
  description: string;
  category: string;
  created_by: number | null;
  created_by_name: string | null;
  created_at: number | string | null;
}

export interface ParsedItem {
  url: string;
  title: string;
  description: string;
  category: string;
  /** Set by the server: 'saved' (already in the library) or 'repeat' (twice in the paste). */
  duplicate?: 'saved' | 'repeat';
}

export const RESOURCE_CATEGORIES = [
  'Game Updates',
  'Parts & Suppliers',
  'CAD & Design',
  'Code & Programming',
  'Outreach',
  'Videos',
  'Community',
  'Other',
] as const;

export const RESOURCE_FILTERS = ['All', ...RESOURCE_CATEGORIES];

export function formatResourceDate(ts: number | string | null | undefined): string {
  if (!ts) return '';
  // SQLite CURRENT_TIMESTAMP is UTC "YYYY-MM-DD HH:MM:SS" — parse as UTC explicitly
  // so the date doesn't shift or read as "in the future" in US timezones.
  let ms: number;
  if (typeof ts === 'string') {
    const iso = ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z';
    ms = Date.parse(iso);
  } else {
    ms = ts;
  }
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

const SAVING_KEY = 'res:saving';
const PARSE_SEQ_KEY = 'res:parse-seq';
const SAVE_ERROR_KEY = 'res:save-error';

export function useResourcesController() {
  const [resources, setResources] = useState<ResourceItem[]>([]);
  // The library as it is when a reply lands (not when the request started).
  const resourcesRef = useRef(resources);
  resourcesRef.current = resources;
  const libraryLoaded = useRef(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState('All');

  // Paste box + preview (drafted)
  const [pasteText, setPasteText] = useDraft<string>('res:paste', '');
  const [preview, setPreview] = useDraft<ParsedItem[] | null>('res:preview', null);
  const [saving, setSaving] = useDraft<boolean>(SAVING_KEY, false);
  const [parsing, setParsing] = useDraft<boolean>('res:parsing', false);
  const [parseError, setParseError] = useDraft<string | null>('res:parse-error', null);
  const [saveError, setSaveError] = useDraft<string | null>(SAVE_ERROR_KEY, null);
  // Links the import left out because the library already has them.
  const [skipped, setSkipped] = useDraft<ParsedItem[]>('res:skipped', []);

  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());

  // Latest-wins: a slow older load can't overwrite a newer one.
  const loadSeq = useRef(0);
  const fetchResources = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setLoadError(null);
    try {
      const list = await apiJson<ResourceItem[]>('/api/resources');
      if (seq === loadSeq.current) { setResources(Array.isArray(list) ? list : []); libraryLoaded.current = true; }
    } catch (e: any) {
      if (seq === loadSeq.current) setLoadError(e?.message || 'Could not load resources');
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  // Live mission control: another user added/removed a resource — refetch, no page reload.
  useEffect(() => {
    const handler = () => { fetchResources(); };
    window.addEventListener('resources-changed', handler);
    return () => window.removeEventListener('resources-changed', handler);
  }, [fetchResources]);

  const items = useMemo(() => (filter === 'All' ? resources : resources.filter((r) => r.category === filter)), [resources, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: resources.length };
    for (const f of RESOURCE_CATEGORIES) c[f] = resources.filter((r) => r.category === f).length;
    return c;
  }, [resources]);

  const handleParse = async () => {
    const text = pasteText.trim();
    if (!text || getDraft('res:parsing', false) || getDraft(SAVING_KEY, false)) return;
    // Only the newest parse may fill the preview (an older reply that lands
    // after a remount and a newer parse is dropped), and only in this epoch.
    const seq = getDraft<number>(PARSE_SEQ_KEY, 0) + 1;
    setDraft(PARSE_SEQ_KEY, seq);
    const latest = () => getDraft<number>(PARSE_SEQ_KEY, 0) === seq;
    setParsing(true);
    const done = inEpoch(() => { if (latest()) setParsing(false); });
    setParseError(null);
    setSaveError(null);
    const show = inEpoch((list: ParsedItem[] | null, dups: ParsedItem[] = []) => { if (latest()) { setPreview(list); setSkipped(dups); } });
    // Errors go to whichever page is mounted, under the same guards.
    const fail = inEpoch((msg: string) => { if (latest()) setParseError(msg); });
    try {
      const res = await apiJson<{ items: ParsedItem[]; count: number }>('/api/resources/parse', {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      const list = Array.isArray(res.items) ? res.items : [];
      if (list.length === 0) {
        fail('No links found in that text — try pasting messages that include URLs.');
        show(null);
      } else {
        const rows = list.map((it) => ({
          url: it.url || '',
          title: it.title || domainOf(it.url || ''),
          description: it.description || '',
          category: RESOURCE_CATEGORIES.includes(it.category as any) ? it.category : 'Other',
        }));
        // Same page = same key (www, https, a trailing slash, tracking
        // parameters, YouTube link forms). Checked against the library as it
        // is now (kept live by resources_changed), so a link a teammate just
        // deleted counts as new. Only if the library never loaded do the
        // server's marks decide what's already saved.
        const existing = libraryLoaded.current
          ? resourcesRef.current.map((r) => r.url)
          : list.filter((it) => it.duplicate === 'saved').map((it) => it.url || '');
        const { fresh, duplicates } = splitDuplicates(rows, existing);
        const dups: ParsedItem[] = duplicates;
        if (!fresh.length) {
          const allSaved = dups.every((d) => d.duplicate === 'saved');
          fail(allSaved
            ? `${dups.length === 1 ? 'That link is' : `All ${dups.length} links are`} already in your library.`
            : 'Every link is already in your library or repeated in this paste.');
        }
        show(fresh.length ? fresh : null, dups);
      }
    } catch (e: any) {
      // 422 = no links found; surface the server's message
      fail(e?.body?.error || e?.message || 'Could not extract links from that text.');
      show(null);
    } finally {
      done();
    }
  };

  // Preview edits are ignored while saving (frozen in both modes).
  const updatePreviewRow = (idx: number, patch: Partial<ParsedItem>) => {
    if (getDraft(SAVING_KEY, false)) return;
    setPreview((prev) => (prev ? prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)) : prev));
  };
  const removePreviewRow = (idx: number) => {
    if (getDraft(SAVING_KEY, false)) return;
    setPreview((prev) => (prev ? prev.filter((_, i) => i !== idx) : prev));
  };
  const discardPreview = () => {
    if (getDraft(SAVING_KEY, false)) return;
    setPreview(null);
    setSkipped([]);
    setSaveError(null);
  };

  const handleSaveAll = async () => {
    const submitted = getDraft<ParsedItem[] | null>('res:preview', preview);
    if (!submitted || submitted.length === 0 || getDraft(SAVING_KEY, false)) return;
    const rows = submitted.filter((r) => r.url.trim());
    if (rows.length === 0) {
      setSaveError('Every row needs a URL before saving.');
      return;
    }
    setSaving(true);
    // Release only our own lock: after a sign-out / workspace switch a new
    // save may hold it. The same guard keeps the old box from being cleared.
    const unlock = inEpoch(() => setSaving(false));
    const clear = inEpoch(() => { setPreview(null); setSkipped([]); setPasteText(''); });
    const fail = inEpoch((msg: string) => setSaveError(msg));
    const tell = inEpoch((msg: string) => notify(msg, 'info'));
    setSaveError(null);
    try {
      const res = await apiJson<{ count?: number; skipped?: { url: string }[] }>('/api/resources', {
        method: 'POST',
        body: JSON.stringify({
          items: rows.map((r) => ({
            url: r.url.trim(),
            title: r.title.trim() || domainOf(r.url.trim()),
            description: r.description.trim(),
            category: r.category,
          })),
        }),
      });
      clear();
      // Someone saved the same link meanwhile: the server skipped it; say so
      // (only to the workspace and session that started this save).
      const late = Array.isArray(res?.skipped) ? res.skipped.length : 0;
      if (late) tell(`Saved ${res.count ?? 0}. ${late} ${late === 1 ? 'was' : 'were'} already in your library.`);
      // Refetch on every mounted Resources page (this one may have been left).
      window.dispatchEvent(new Event('resources-changed'));
    } catch (e: any) {
      fail(e?.body?.error || e?.message || 'Could not save those links.');
    } finally {
      unlock();
    }
  };

  const handleDelete = async (id: number) => {
    if (deletingIds.has(id)) return;
    // Capture the specific item for targeted rollback (not the whole array,
    // which could restore items deleted by concurrent requests).
    const index = resources.findIndex((r) => r.id === id);
    const deletedItem = resources[index];
    setResources((rs) => rs.filter((r) => r.id !== id));
    setDeletingIds((s) => new Set(s).add(id));
    try {
      await apiJson(`/api/resources/${id}`, { method: 'DELETE' });
    } catch {
      // Re-insert only the failed item (near its old spot), preserving other changes.
      if (deletedItem) {
        setResources((rs) => {
          if (rs.some((r) => r.id === id)) return rs;
          const at = Math.max(0, Math.min(index, rs.length));
          return [...rs.slice(0, at), deletedItem, ...rs.slice(at)];
        });
      }
    } finally {
      setDeletingIds((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  };

  const bulkDeleteResources = async (ids: number[]) => {
    const ok = await bulkDelete(ids, async (id) => {
      try { await apiJson(`/api/resources/${id}`, { method: 'DELETE' }); return true; } catch { return false; }
    }, { noun: 'resource' });
    if (ok === false) return false;
    const gone = new Set(ok.map(Number));
    setResources((rs) => rs.filter((r) => !gone.has(r.id)));
    window.dispatchEvent(new Event('resources-changed'));
    return true;
  };

  return {
    bulkDeleteResources,
    resources, loading, loadError, fetchResources, filter, setFilter, items, counts,
    pasteText, setPasteText, parsing, parseError, preview, skipped, saving, saveError,
    handleParse, updatePreviewRow, removePreviewRow, discardPreview, handleSaveAll, deletingIds, handleDelete,
  };
}
