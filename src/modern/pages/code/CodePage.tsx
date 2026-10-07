// Modern Code (phase 8e), rebuilt on the shadcn kit over the shared
// useCodeController / useGitHubRepo (same codeService endpoints, drafts →
// main workflow, auto-save, history / compare / revert and code-scope rules
// as Legacy). A file rail with the linked GitHub repo, an editor card with the
// branch switch and save status, a history sheet, and commit / new-file
// dialogs. Loaded lazily (Monaco is heavy).
import { useMemo, useState } from 'react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import {
  AlertCircle, Check, ChevronDown, ChevronRight, Code2, Download, FileCode2, Folder, GitBranch, GitCommitHorizontal, GitCompare, Github,
  History, Link2, Loader2, MoreHorizontal, Plus, RefreshCw, RotateCcw, Search, Sparkles, Trash2, Unlink, X,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../../../components/cn';
import {
  Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Input, Label, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
  Skeleton, Textarea, ToggleGroup, ToggleGroupItem,
} from '../../../components/ui-kit';
import { useIsNarrow } from '../../../components/scout/ScoutUi';
import { useTheme } from '../../../hooks/useTheme';
import { CODE_LANGUAGES, useCodeController } from '../../../components/code/useCodeController';
import { guessLanguage, monacoLanguage, useGitHubRepo, type TreeNode } from '../../../components/code/useGitHubRepo';
import type { Member, Team } from '../../../types';
import { Page, PageHeader, EmptyState } from '../../ui/page';
import { Reveal } from '../../ui/motion';

type Ctl = ReturnType<typeof useCodeController>;
const LANG_LABEL = Object.fromEntries(CODE_LANGUAGES);

export function CodePage({ teams, currentUser, hasScope, activeTeamId }: { teams: Team[]; currentUser?: Member; hasScope?: (s: string) => boolean; activeTeamId?: number | null }) {
  const ctl = useCodeController({ teams, currentUser, hasScope, activeTeamId });
  return (
    <Page>
      <PageHeader
        eyebrow={<>Build · {ctl.currentTeam?.name ?? 'Your team'}</>}
        title="Code"
        description="Robot code with a safe drafts branch: edits auto-save to drafts, and a commit promotes them to main."
        actions={ctl.canManageCode && <Button onClick={() => ctl.setShowNewFileModal(true)}><Plus /> New file</Button>}
      />
      {ctl.error && (
        <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p className="min-w-0 flex-1">{ctl.error}</p>
          <Button variant="ghost" size="icon-sm" onClick={() => ctl.setError(null)} aria-label="Dismiss" className="max-sm:size-11"><X /></Button>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-6">
          <FileRail ctl={ctl} />
          <RepoPanel teamId={ctl.selectedTeamId} isAdmin={ctl.canManageCode} />
        </aside>
        <div className="min-w-0">
          {ctl.selectedFile ? <EditorCard ctl={ctl} /> : (
            <EmptyState
              icon={FileCode2}
              title="Pick a file to open it"
              description={ctl.files.length ? 'Choose a file on the left.' : 'No code files yet.'}
              action={ctl.canManageCode && <Button onClick={() => ctl.setShowNewFileModal(true)}><Plus /> Create a file</Button>}
              className="min-h-80"
            />
          )}
        </div>
      </div>
      <HistorySheet ctl={ctl} />
      <CommitDialog ctl={ctl} />
      <NewFileDialog ctl={ctl} />
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

function FileRail({ ctl }: { ctl: Ctl }) {
  const [q, setQ] = useState('');
  const files = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? ctl.files.filter((f) => f.file_name.toLowerCase().includes(t)) : ctl.files;
  }, [ctl.files, q]);
  return (
    <Reveal>
      <h2 className="mb-2 text-sm font-semibold">Files</h2>
      {ctl.files.length > 6 && (
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a file" aria-label="Find a file" className="h-9 pl-8 max-sm:h-11" />
        </div>
      )}
      {!ctl.files.length && ctl.loading ? <div className="space-y-1.5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9" />)}</div> : (
        <ul className="space-y-0.5" aria-label="Code files">
          {files.map((f) => {
            const active = ctl.selectedFile?.id === f.id;
            return (
              <li key={f.id}>
                <button
                  onClick={() => ctl.setSelectedFile(f)}
                  aria-current={active ? 'true' : undefined}
                  className={cn('flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 max-sm:min-h-11', active ? 'bg-accent/15 font-medium text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}
                >
                  <FileCode2 className={cn('size-4 shrink-0', active && 'text-accent')} />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{f.file_name}</span>
                  <span className="text-[10px] uppercase text-muted-foreground">{f.language}</span>
                </button>
              </li>
            );
          })}
          {!ctl.files.length && <li className="px-2.5 py-2 text-sm text-muted-foreground">No files yet.</li>}
        </ul>
      )}
    </Reveal>
  );
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

const SAVE_STATUS = {
  saved: { label: 'All changes saved', icon: Check, cls: 'text-success' },
  saving: { label: 'Saving…', icon: Loader2, cls: 'animate-spin text-sky-500 motion-reduce:animate-none' },
  unsaved: { label: 'Unsaved changes', icon: AlertCircle, cls: 'text-amber-500' },
} as const;

function EditorCard({ ctl }: { ctl: Ctl }) {
  const { theme } = useTheme();
  const monacoTheme = theme === 'light' ? 'light' : 'vs-dark';
  const file = ctl.selectedFile!;
  const lang = file.language === 'java' ? 'java' : 'plaintext';
  const status = SAVE_STATUS[ctl.autoSaveStatus];
  const comparing = ctl.compareMode && ctl.comparePair.base && ctl.comparePair.head;
  return (
    <Reveal className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Code2 className="size-4 shrink-0 text-accent" />
          <span className="truncate font-mono text-sm font-medium">{file.file_name}</span>
          <Badge variant="secondary">{LANG_LABEL[file.language] ?? file.language}</Badge>
        </div>
        <ToggleGroup type="single" aria-label="Branch" value={ctl.currentBranch} onValueChange={(v) => { if (v) ctl.switchBranch(v as 'main' | 'drafts'); }}>
          <ToggleGroupItem value="drafts"><GitBranch /> Drafts</ToggleGroupItem>
          <ToggleGroupItem value="main"><GitCommitHorizontal /> Main</ToggleGroupItem>
        </ToggleGroup>
        {ctl.currentBranch === 'drafts' && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status"><status.icon className={cn('size-3.5', status.cls)} />{status.label}</span>
        )}
        {ctl.selectedCommit && <Badge variant="outline">Viewing {ctl.selectedCommit.hash.substring(0, 8)}</Badge>}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={ctl.formatDocument} className="max-sm:h-11"><Sparkles /> Format</Button>
          <Button variant={ctl.compareMode ? 'secondary' : 'ghost'} size="sm" aria-pressed={ctl.compareMode} onClick={() => { ctl.setCompareMode(!ctl.compareMode); if (!ctl.compareMode) ctl.setShowHistory(true); }} className="max-sm:h-11"><GitCompare /> Compare</Button>
          <Button variant="ghost" size="sm" onClick={() => ctl.setShowHistory(true)} className="max-sm:h-11"><History /> History</Button>
          {ctl.currentBranch === 'drafts' && ctl.canManageCode && (
            <Button size="sm" onClick={() => ctl.setShowCommitModal(true)} disabled={ctl.loading || !(ctl.unsavedChanges || ctl.canCommit)} className="max-sm:h-11"><GitCommitHorizontal /> Commit</Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="More file actions" className="max-sm:size-11"><MoreHorizontal /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => void ctl.handleDownload()}><Download /> Download {ctl.currentBranch}</DropdownMenuItem>
              {ctl.canManageCode && (<><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => void ctl.handleDeleteFile()} className="text-destructive focus:text-destructive"><Trash2 /> Delete file</DropdownMenuItem></>)}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {ctl.compareMode && !comparing && (
        <p className="border-b border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">Compare: pick a <span className="font-medium text-foreground">base</span> and a <span className="font-medium text-foreground">head</span> commit in History.</p>
      )}
      <div className="h-[clamp(24rem,calc(100dvh-20rem),56rem)] min-h-0">
        {comparing ? (
          <DiffEditor
            height="100%"
            language={lang}
            original={ctl.history.find((h) => h.id === ctl.comparePair.base)?.content || ''}
            modified={ctl.history.find((h) => h.id === ctl.comparePair.head)?.content || ''}
            onMount={(editor, monaco) => { ctl.diffEditorRef.current = editor; ctl.monacoRef.current = monaco; }}
            theme={monacoTheme}
            options={{ automaticLayout: true }}
          />
        ) : (
          <Editor
            height="100%"
            language={lang}
            value={ctl.code}
            onMount={ctl.handleEditorMount}
            onChange={(value) => ctl.editCode(value || '')}
            theme={monacoTheme}
            options={{ minimap: { enabled: true }, wordWrap: 'on', fontSize: 13, fontFamily: '"Fira Code", monospace', automaticLayout: true, readOnly: !ctl.canManageCode, domReadOnly: !ctl.canManageCode }}
          />
        )}
      </div>
    </Reveal>
  );
}

function HistorySheet({ ctl }: { ctl: Ctl }) {
  const narrow = useIsNarrow();
  return (
    <Sheet open={ctl.showHistory} onOpenChange={ctl.setShowHistory}>
      <SheetContent side={narrow ? 'bottom' : 'right'} className={cn('gap-0 p-0', !narrow && 'sm:max-w-md')}>
        <SheetHeader className="border-b border-border px-6 py-5 pr-12">
          <SheetTitle>History · {ctl.currentBranch}</SheetTitle>
          <SheetDescription>{ctl.compareMode ? 'Pick a base and a head to compare them.' : 'Open a commit to read it, or revert to it.'}</SheetDescription>
        </SheetHeader>
        <ol className="flex-1 divide-y divide-border overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          {ctl.history.map((c) => {
            const viewing = ctl.selectedCommit?.id === c.id;
            return (
              <li key={c.id} className={cn('px-6 py-3', viewing && 'bg-accent/[0.08]')}>
                <div className="flex items-start gap-3">
                  <button onClick={() => ctl.handleViewCommit(c)} className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
                    <span className="block text-sm">{c.message}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <code className="rounded bg-muted px-1 font-mono text-[11px] text-accent">{c.hash.substring(0, 8)}</code>
                      {c.author_name || 'Unknown'} · {format(new Date(c.created_at), 'MMM dd, h:mm a')}
                    </span>
                  </button>
                  {ctl.compareMode ? (
                    <ToggleGroup type="single" aria-label={`Compare role for ${c.hash.substring(0, 8)}`} value={ctl.comparePair.base === c.id ? 'base' : ctl.comparePair.head === c.id ? 'head' : ''} onValueChange={(v) => ctl.setComparePair((p) => (v === 'base' ? { ...p, base: c.id } : v === 'head' ? { ...p, head: c.id } : p))}>
                      <ToggleGroupItem value="base" size="sm" className="max-sm:h-11">Base</ToggleGroupItem>
                      <ToggleGroupItem value="head" size="sm" className="max-sm:h-11">Head</ToggleGroupItem>
                    </ToggleGroup>
                  ) : ctl.canManageCode && (
                    <Button variant="ghost" size="sm" onClick={() => void ctl.handleRevert(c.id, ctl.currentBranch)} className="shrink-0 max-sm:h-11"><RotateCcw /> Revert</Button>
                  )}
                </div>
              </li>
            );
          })}
          {!ctl.history.length && <li className="px-6 py-8 text-center text-sm text-muted-foreground">No commits yet.</li>}
          {ctl.historyHasMore && ctl.history.length > 0 && (
            <li className="px-6 py-3"><Button variant="outline" className="w-full" onClick={() => void ctl.loadHistory(true)}>Load more commits</Button></li>
          )}
        </ol>
      </SheetContent>
    </Sheet>
  );
}

function CommitDialog({ ctl }: { ctl: Ctl }) {
  return (
    <Dialog open={ctl.showCommitModal} onOpenChange={(o) => { if (!o && !ctl.committing) ctl.setShowCommitModal(false); }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>Commit to main</DialogTitle>
          <DialogDescription>{ctl.code.length.toLocaleString()} characters from drafts become the new main. Unsaved edits are saved first.</DialogDescription>
        </DialogHeader>
        <form id="commit-form" onSubmit={(e) => { e.preventDefault(); void ctl.handleCommit(); }} className="grid gap-2">
          <Label htmlFor="commit-msg">Commit message</Label>
          <Textarea id="commit-msg" rows={4} value={ctl.commitMessage} onChange={(e) => ctl.setCommitMessage(e.target.value)} disabled={ctl.committing} placeholder="Describe your changes…" />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => { ctl.setShowCommitModal(false); ctl.setCommitMessage(''); }} disabled={ctl.committing}>Cancel</Button>
          <Button type="submit" form="commit-form" disabled={ctl.committing || !ctl.commitMessage.trim()}>{ctl.committing ? <><Loader2 className="animate-spin" /> Committing…</> : <><GitCommitHorizontal /> Commit</>}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewFileDialog({ ctl }: { ctl: Ctl }) {
  return (
    <Dialog open={ctl.showNewFileModal} onOpenChange={(o) => { if (!o && !ctl.creating) { ctl.setShowNewFileModal(false); ctl.setNewFileName(''); } }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>New file</DialogTitle>
          <DialogDescription>It starts empty on the drafts branch.</DialogDescription>
        </DialogHeader>
        <form id="newfile-form" onSubmit={(e) => { e.preventDefault(); void ctl.handleCreateFile(); }} className="grid gap-4">
          <fieldset disabled={ctl.creating} className="m-0 grid min-w-0 gap-4 border-0 p-0">
            <div className="grid gap-2">
              <Label htmlFor="nf-name">File name</Label>
              <Input id="nf-name" value={ctl.newFileName} onChange={(e) => ctl.setNewFileName(e.target.value)} placeholder="Example.java" className="font-mono max-sm:h-11" />
            </div>
            <div className="grid gap-2">
              <Label id="nf-lang">Language</Label>
              <ToggleGroup type="single" aria-labelledby="nf-lang" value={ctl.newFileLanguage} onValueChange={(v) => { if (v) ctl.setNewFileLanguage(v); }} className="grid w-full grid-cols-4">
                {CODE_LANGUAGES.map(([v, l]) => <ToggleGroupItem key={v} value={v}>{l}</ToggleGroupItem>)}
              </ToggleGroup>
            </div>
          </fieldset>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => { ctl.setShowNewFileModal(false); ctl.setNewFileName(''); }} disabled={ctl.creating}>Cancel</Button>
          <Button type="submit" form="newfile-form" disabled={ctl.creating || !ctl.newFileName || !ctl.selectedTeamId}>{ctl.creating ? 'Creating…' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// GitHub repo
// ---------------------------------------------------------------------------

function RepoPanel({ teamId, isAdmin }: { teamId: number | null; isAdmin: boolean }) {
  const r = useGitHubRepo(teamId);
  const { theme } = useTheme();
  if (!teamId) return null;
  const node = (n: TreeNode, depth: number): React.ReactNode => n.type === 'tree' ? (
    <li key={n.path}>
      <button onClick={() => r.toggleDir(n.path)} aria-expanded={r.expanded.has(n.path)} className="flex min-h-8 w-full items-center gap-1.5 rounded-md pr-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 max-sm:min-h-11" style={{ paddingLeft: depth * 12 + 6 }}>
        {r.expanded.has(n.path) ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
        <Folder className="size-4 shrink-0 text-accent/80" /><span className="truncate">{n.name}</span>
      </button>
      {r.expanded.has(n.path) && <ul>{n.children.map((c) => node(c, depth + 1))}</ul>}
    </li>
  ) : (
    <li key={n.path}>
      <button onClick={() => void r.openFile(n.path)} title={n.path} className={cn('flex min-h-8 w-full items-center gap-1.5 rounded-md pr-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 max-sm:min-h-11', r.selectedPath === n.path ? 'bg-accent/15 text-foreground' : 'text-muted-foreground')} style={{ paddingLeft: depth * 12 + 24 }}>
        <FileCode2 className="size-3.5 shrink-0" /><span className="truncate font-mono text-xs">{n.name}</span>
      </button>
    </li>
  );
  return (
    <Reveal delay={0.05}>
      <div className="mb-2 flex items-center gap-2">
        <Github className="size-4" />
        <h2 className="text-sm font-semibold">GitHub repo</h2>
        {r.repo && <Badge variant="soft" className="ml-auto">{r.repo.branch}</Badge>}
      </div>
      {r.error && <p role="alert" className="mb-2 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">{r.error}</p>}
      {r.loading ? <Skeleton className="h-24" /> : !r.repo ? (
        isAdmin ? (
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void r.handleConnect(); }}>
            <p className="text-xs text-muted-foreground">Link the robot code repo so Bruno can answer questions about your code. Public repos only.</p>
            <Input value={r.url} onChange={(e) => r.setUrl(e.target.value)} placeholder="https://github.com/owner/repo" aria-label="GitHub repo URL" className="font-mono text-xs max-sm:h-11" />
            <Button type="submit" size="sm" disabled={r.connecting || !r.url.trim()} className="w-full max-sm:h-11">{r.connecting ? <Loader2 className="animate-spin" /> : <Link2 />} {r.connecting ? 'Connecting…' : 'Connect repo'}</Button>
          </form>
        ) : <p className="text-xs text-muted-foreground">No GitHub repo linked yet — ask an admin to connect one.</p>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <a href={r.repo.repoUrl} target="_blank" rel="noreferrer" className="truncate font-mono font-medium text-accent hover:underline">{r.repo.owner}/{r.repo.repo}</a>
            <span>{r.repo.fileCount} files · synced {format(new Date(r.repo.syncedAt), 'MMM d, h:mm a')}</span>
          </div>
          {isAdmin && (
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" onClick={() => void r.handleSync()} disabled={r.syncing} className="flex-1 max-sm:h-11"><RefreshCw className={cn(r.syncing && 'animate-spin motion-reduce:animate-none')} /> {r.syncing ? 'Syncing…' : 'Sync'}</Button>
              <Button variant="ghost" size="sm" onClick={() => void r.handleUnlink()} className="max-sm:h-11"><Unlink /> Unlink</Button>
            </div>
          )}
          <ul className="max-h-72 overflow-y-auto rounded-lg border border-border p-1" aria-label="Repository files">
            {r.tree.length ? r.tree.map((n) => node(n, 0)) : <li className="p-2 text-xs text-muted-foreground">No files found in this repo.</li>}
          </ul>
        </div>
      )}
      <Dialog open={!!r.selectedPath} onOpenChange={(o) => { if (!o) r.closePreview(); }}>
        {r.selectedPath && (
          <DialogContent className="flex h-[min(80dvh,44rem)] w-[calc(100%-2rem)] max-w-4xl flex-col">
            <DialogHeader>
              <DialogTitle className="truncate font-mono text-sm">{r.selectedPath}</DialogTitle>
              <DialogDescription>{guessLanguage(r.selectedPath)} · read-only preview from GitHub</DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
              {r.fileLoading ? <p className="flex items-center gap-2 p-3 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading file…</p> : (
                <Editor height="100%" language={monacoLanguage(r.selectedPath)} value={r.fileContent || ''} theme={theme === 'light' ? 'light' : 'vs-dark'}
                  options={{ readOnly: true, minimap: { enabled: false }, scrollBeyondLastLine: false, fontSize: 12, wordWrap: 'on', padding: { top: 8 } }} />
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </Reveal>
  );
}
