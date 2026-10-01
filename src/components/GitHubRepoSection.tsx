import React, { useState, useEffect, useMemo } from 'react';
import {
  Github,
  Link2,
  RefreshCw,
  Unlink,
  ChevronRight,
  ChevronDown,
  Folder,
  FileText,
  Loader,
  AlertCircle,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import { apiFetch } from '../services/api';
import { confirmDialog } from './dialog';

interface RepoEntry {
  path: string;
  type: 'blob' | 'tree';
  size?: number;
}

interface RepoStatus {
  owner: string;
  repo: string;
  repoUrl: string;
  branch: string;
  fileCount: number;
  syncedAt: string;
  fileTree: RepoEntry[];
}

interface GitHubRepoSectionProps {
  teamId: number | null;
  isAdmin: boolean;
}

function guessLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    java: 'Java', kt: 'Kotlin', py: 'Python', js: 'JavaScript', ts: 'TypeScript',
    c: 'C', cpp: 'C++', h: 'C/C++ Header', hpp: 'C++ Header', xml: 'XML',
    gradle: 'Gradle', md: 'Markdown', json: 'JSON', yml: 'YAML', yaml: 'YAML',
    txt: 'Text', properties: 'Properties', html: 'HTML', css: 'CSS',
  };
  return map[ext] || 'Text';
}

interface TreeNode {
  name: string;
  path: string;
  type: 'blob' | 'tree';
  children: TreeNode[];
}

function buildTree(entries: RepoEntry[]): TreeNode[] {
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

export const GitHubRepoSection: React.FC<GitHubRepoSectionProps> = ({ teamId, isAdmin }) => {
  const [repo, setRepo] = useState<RepoStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);

  const loadStatus = async () => {
    if (!teamId) {
      setRepo(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/code/repo');
      const data = await res.json().catch(() => null);
      setRepo(data);
      setSelectedPath(null);
      setFileContent(null);
      setExpanded(new Set());
    } catch (err) {
      setError(`Failed to load repo status: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

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
    setSelectedPath(path);
    setFileLoading(true);
    setFileContent(null);
    setError(null);
    try {
      const res = await apiFetch(`/api/code/repo/file?path=${encodeURIComponent(path)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not load file');
        return;
      }
      setFileContent(data.content ?? '');
    } catch (err) {
      setError(`Could not load file: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setFileLoading(false);
    }
  };

  const handleConnect = async () => {
    if (!url.trim()) return;
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
      setRepo(null);
      setSelectedPath(null);
      setFileContent(null);
    } catch (err) {
      setError(`Could not unlink repo: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    if (node.type === 'tree') {
      const isOpen = expanded.has(node.path);
      return (
        <div key={node.path}>
          <button
            onClick={() => toggleDir(node.path)}
            className="flex items-center gap-1.5 w-full px-2 py-1 text-sm text-text-muted hover:bg-secondary rounded text-left"
            style={{ paddingLeft: `${depth * 14 + 8}px` }}
          >
            {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-text-muted" /> : <ChevronRight className="w-3.5 h-3.5 text-text-muted" />}
            <Folder className="w-4 h-4 text-accent/80 flex-shrink-0" />
            <span className="truncate font-medium">{node.name}</span>
          </button>
          {isOpen && node.children.map((c) => renderNode(c, depth + 1))}
        </div>
      );
    }
    const isSelected = selectedPath === node.path;
    return (
      <button
        key={node.path}
        onClick={() => openFile(node.path)}
        className={`flex items-center gap-1.5 w-full px-2 py-1 text-sm rounded text-left ${
          isSelected ? 'bg-accent/15 text-text-base' : 'text-text-muted hover:bg-secondary hover:text-text-base'
        }`}
        style={{ paddingLeft: `${depth * 14 + 26}px` }}
        title={node.path}
      >
        <FileText className="w-4 h-4 text-text-muted flex-shrink-0" />
        <span className="truncate font-mono text-xs">{node.name}</span>
      </button>
    );
  };

  if (!teamId) return null;

  return (
    <div className="bg-elevated border border-line rounded-lg p-4 flex-shrink-0">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Github className="w-5 h-5 text-accent" />
          <h3 className="text-base font-bold text-text-base">GitHub Repo</h3>
          {repo && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-accent/15 text-accent text-xs font-bold rounded-full border border-accent/30">
              <span className="w-1.5 h-1.5 bg-accent rounded-full" />
              {repo.branch}
            </span>
          )}
        </div>
        {repo && isAdmin && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1 px-3 py-1 bg-secondary text-text-base rounded text-sm hover:bg-text-base/10 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync'}
            </button>
            <button
              onClick={handleUnlink}
              className="flex items-center gap-1 px-3 py-1 bg-secondary text-text-base rounded text-sm hover:bg-red-700 hover:text-red-100 transition-all"
            >
              <Unlink className="w-4 h-4" />
              Unlink
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 bg-red-500/20 border border-red-500/50 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-200 text-sm">{error}</p>
          <button onClick={() => setError(null)} className="text-red-300 hover:text-red-200 ml-auto flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-text-muted text-sm">
          <Loader className="w-4 h-4 animate-spin" /> Loading repo...
        </div>
      ) : !repo ? (
        isAdmin ? (
          <div className="mt-3">
            <p className="text-xs text-text-muted mb-2">
              Link the team's robot code repo — Bruno will see the file tree and can answer questions about your code. Public repos only.
            </p>
            <div className="flex gap-2 flex-wrap">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                placeholder="https://github.com/owner/repo"
                className="flex-1 min-w-[220px] px-3 py-2 bg-primary text-text-base rounded-lg border border-line focus:border-accent focus:outline-none text-sm font-mono"
              />
              <button
                onClick={handleConnect}
                disabled={connecting || !url.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-accent text-accent-ink font-bold rounded-lg hover:brightness-90 transition-all disabled:opacity-50 text-sm"
              >
                {connecting ? <Loader className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                {connecting ? 'Connecting...' : 'Connect repo'}
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-xs text-text-muted">No GitHub repo linked yet — ask an admin to connect one.</p>
        )
      ) : (
        <div className="mt-3">
          <div className="flex items-center gap-3 flex-wrap text-xs text-text-muted mb-3">
            <a href={repo.repoUrl} target="_blank" rel="noreferrer" className="text-accent font-mono font-bold hover:underline">
              {repo.owner}/{repo.repo}
            </a>
            <span>{repo.fileCount} files</span>
            <span>Synced {format(new Date(repo.syncedAt), 'MMM d, h:mm a')}</span>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {/* File tree */}
            <div className="bg-primary rounded-lg border border-line max-h-80 overflow-y-auto p-2">
              {tree.length === 0 ? (
                <p className="text-xs text-text-muted p-2">No files found in this repo.</p>
              ) : (
                tree.map((n) => renderNode(n, 0))
              )}
            </div>
            {/* File viewer */}
            <div className="bg-primary rounded-lg border border-line max-h-80 overflow-hidden flex flex-col min-h-[160px]">
              {selectedPath ? (
                <>
                  <div className="flex items-center justify-between px-3 py-2 border-b border-line flex-shrink-0">
                    <span className="text-xs font-mono text-text-muted truncate">{selectedPath}</span>
                    <span className="text-[10px] font-bold text-accent uppercase ml-2 flex-shrink-0">{guessLanguage(selectedPath)}</span>
                  </div>
                  <div className="flex-1 overflow-auto p-3">
                    {fileLoading ? (
                      <div className="flex items-center gap-2 text-text-muted text-sm">
                        <Loader className="w-4 h-4 animate-spin" /> Loading file...
                      </div>
                    ) : (
                      <pre className="text-xs font-mono text-text-base whitespace-pre-wrap break-words">{fileContent}</pre>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-xs text-text-muted p-4">Click a file to preview it here.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GitHubRepoSection;
