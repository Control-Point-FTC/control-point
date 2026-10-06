// Shared GitHub-repo logic for the Code page (Legacy GitHubRepoSection and the
// Modern repo panel): status (/api/code/repo), connect, sync, unlink, the file
// tree and a read-only file preview. Loads are latest-wins (switching files
// or teams quickly can't show a stale file), and the half-typed repo URL is
// drafted so it survives a mode switch.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../../services/api';
import { confirmDialog } from '../dialog';
import { useDraft } from '../../modern/drafts';

export interface RepoEntry { path: string; type: 'blob' | 'tree'; size?: number }
export interface RepoStatus { owner: string; repo: string; repoUrl: string; branch: string; fileCount: number; syncedAt: string; fileTree: RepoEntry[] }
export interface TreeNode { name: string; path: string; type: 'blob' | 'tree'; children: TreeNode[] }

export function guessLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    java: 'Java', kt: 'Kotlin', py: 'Python', js: 'JavaScript', ts: 'TypeScript',
    c: 'C', cpp: 'C++', h: 'C/C++ Header', hpp: 'C++ Header', xml: 'XML',
    gradle: 'Gradle', md: 'Markdown', json: 'JSON', yml: 'YAML', yaml: 'YAML',
    txt: 'Text', properties: 'Properties', html: 'HTML', css: 'CSS',
  };
  return map[ext] || 'Text';
}

/** Map file extension to Monaco editor language ID for syntax highlighting. */
export function monacoLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    java: 'java', kt: 'kotlin', py: 'python', js: 'javascript', ts: 'typescript',
    tsx: 'typescript', jsx: 'javascript', c: 'c', cpp: 'cpp', h: 'cpp', hpp: 'cpp',
    xml: 'xml', gradle: 'java', md: 'markdown', json: 'json', yml: 'yaml', yaml: 'yaml',
    html: 'html', css: 'css', sh: 'shell', properties: 'ini', txt: 'plaintext',
  };
  return map[ext] || 'plaintext';
}

export function buildTree(entries: RepoEntry[]): TreeNode[] {
  const root: TreeNode[] = [];
  const dirMap = new Map<string, TreeNode>();
  const ensureDir = (dirPath: string): TreeNode[] => {
    if (!dirPath) return root;
    const existing = dirMap.get(dirPath);
    if (existing) return existing.children;
    const parentPath = dirPath.includes('/') ? dirPath.slice(0, dirPath.lastIndexOf('/')) : '';
    const parentChildren = ensureDir(parentPath);
    const node: TreeNode = { name: dirPath.split('/').pop() || dirPath, path: dirPath, type: 'tree', children: [] };
    dirMap.set(dirPath, node);
    parentChildren.push(node);
    return node.children;
  };
  for (const e of entries) {
    if (e.type === 'tree') {
      ensureDir(e.path);
      continue;
    }
    const parentPath = e.path.includes('/') ? e.path.slice(0, e.path.lastIndexOf('/')) : '';
    const parentChildren = ensureDir(parentPath);
    parentChildren.push({ name: e.path.split('/').pop() || e.path, path: e.path, type: 'blob', children: [] });
  }
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'tree' ? -1 : 1));
    nodes.forEach((n) => sortNodes(n.children));
  };
  sortNodes(root);
  return root;
}

export function useGitHubRepo(teamId: number | null) {
  const [repo, setRepo] = useState<RepoStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useDraft<string>('code:repo-url', '');
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const statusSeq = useRef(0);
  const fileSeq = useRef(0);

  const loadStatus = useCallback(async () => {
    const seq = ++statusSeq.current;
    fileSeq.current++; // any open preview belongs to the old status
    if (!teamId) {
      setRepo(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/code/repo');
      const data = await res.json().catch(() => null);
      if (seq !== statusSeq.current) return;
      setRepo(data);
      setSelectedPath(null);
      setFileContent(null);
      setExpanded(new Set());
    } catch (err) {
      if (seq === statusSeq.current) setError(`Failed to load repo status: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (seq === statusSeq.current) setLoading(false);
    }
  }, [teamId]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const tree = useMemo(() => (repo ? buildTree(repo.fileTree) : []), [repo]);

  const toggleDir = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const openFile = async (path: string) => {
    const seq = ++fileSeq.current;
    setSelectedPath(path);
    setFileLoading(true);
    setFileContent(null);
    setError(null);
    try {
      const res = await apiFetch(`/api/code/repo/file?path=${encodeURIComponent(path)}`);
      const data = await res.json().catch(() => ({}));
      if (seq !== fileSeq.current) return;
      if (!res.ok) {
        setError(data.error || 'Could not load file');
        return;
      }
      setFileContent(data.content ?? '');
    } catch (err) {
      if (seq === fileSeq.current) setError(`Could not load file: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (seq === fileSeq.current) setFileLoading(false);
    }
  };

  /** Close the file preview (a load still in flight is ignored). */
  const closePreview = () => {
    fileSeq.current++;
    setSelectedPath(null);
    setFileContent(null);
    setFileLoading(false);
  };

  const handleConnect = async () => {
    if (!url.trim() || connecting) return;
    setConnecting(true);
    setError(null);
    try {
      const res = await apiFetch('/api/code/repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: url.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not connect repo');
        return;
      }
      setUrl('');
      await loadStatus();
    } catch (err) {
      setError(`Could not connect repo: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setConnecting(false);
    }
  };

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setError(null);
    try {
      const res = await apiFetch('/api/code/repo/sync', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Sync failed');
        return;
      }
      await loadStatus();
    } catch (err) {
      setError(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleUnlink = async () => {
    if (!(await confirmDialog({ title: 'Unlink repository', message: `Unlink ${repo?.owner}/${repo?.repo}? The file tree will no longer feed Bruno's code answers.`, confirmLabel: 'Unlink', danger: true }))) return;
    setError(null);
    try {
      const res = await apiFetch('/api/code/repo', { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Could not unlink repo');
        return;
      }
      fileSeq.current++;
      setRepo(null);
      setSelectedPath(null);
      setFileContent(null);
    } catch (err) {
      setError(`Could not unlink repo: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return {
    repo, loading, url, setUrl, connecting, syncing, error, setError, expanded, toggleDir, selectedPath, fileContent, fileLoading, tree,
    openFile, closePreview, handleConnect, handleSync, handleUnlink,
  };
}
