// Shared Code-page logic for Legacy CodeView and the Modern Code page. Same
// codeService endpoints and rules: files are scoped to the active team, the
// editor works on a file's `drafts` branch (auto-saved 3 s after typing) and
// "Commit" promotes drafts to `main`; history is paged, two commits can be
// compared, and a commit can be reverted. Only members with the code scope
// can edit, commit, revert, create or delete.
//
// The open file, branch, editor buffer (with its unsaved flag), commit
// message and new-file form are drafted, so unsaved code survives a mode
// switch. Loads are latest-wins; auto-save only marks the buffer saved if it
// didn't change while saving; Commit first saves any unsaved edits so they
// are part of the commit; the commit / create locks are drafted and released
// only by their own request.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CodeCommit, CodeContent, CodeFile, Member, Team } from '../../types';
import {
  commitToMain, createCodeFile, deleteCodeFile, downloadCodeFile, getCodeFileContent, getCodeFiles, getCommitHistory, revertCommit, saveDraft,
} from '../../services/codeService';
import { confirmDialog } from '../dialog';
import { setScreenEntity } from '../../services/brunoContext';
import { getDraft, inEpoch, useDraft } from '../../modern/drafts';

type Branch = 'main' | 'drafts';
interface Buffer { fileId: number; branch: Branch; text: string; unsaved: boolean }
export const CODE_LANGUAGES: [string, string][] = [['java', 'Java'], ['cpp', 'C++'], ['python', 'Python'], ['javascript', 'JavaScript']];
const HISTORY_PAGE = 50;
const BUFFER_KEY = 'code:buffer';
const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

// Module-wide (shared by every mounted Code page, so a page left by a mode
// switch can't win a race against the page that replaced it):
// - the newest content request id — older responses never touch the buffer;
// - one save queue — saves run in order, so a commit waits for an auto-save
//   already in flight and the server's drafts end up holding the newest text;
// - a "files changed" bus — the mounted page reloads its file list.
let contentRequest = 0;
let saveQueue: Promise<unknown> = Promise.resolve();
// Per-file revert counter. A save queued before a revert of its file is
// dropped when its turn comes, so it can't put the pre-revert text back.
const revertGen = new Map<number, number>();
const genOf = (fileId: number) => revertGen.get(fileId) ?? 0;
// One revert at a time across every mounted page: a second click while one
// runs is ignored, so a failed revert's retry can't race a later revert.
let revertRunning = false;
const filesBus = new EventTarget();
const filesChanged = () => filesBus.dispatchEvent(new Event('changed'));
// A file's content changed on the server (revert / commit): the mounted page
// showing it reloads its content and history.
const contentChanged = (fileId: number) => filesBus.dispatchEvent(new CustomEvent('content', { detail: fileId }));

export function useCodeController({ teams, currentUser, hasScope, activeTeamId }: {
  teams: Team[]; currentUser?: Member; hasScope?: (scope: string) => boolean; activeTeamId?: number | null;
}) {
  const canManageCode = hasScope ? hasScope('code') : false;
  const [files, setFiles] = useState<CodeFile[]>([]);
  const [selectedFile, setSelectedFile] = useDraft<CodeFile | null>('code:file', null);
  const [currentBranch, setCurrentBranch] = useDraft<Branch>('code:branch', 'drafts');
  const [buffer, setBuffer] = useDraft<Buffer | null>(BUFFER_KEY, null);
  const [history, setHistory] = useState<CodeCommit[]>([]);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [fileContentObj, setFileContentObj] = useState<CodeContent | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [comparePair, setComparePair] = useState<{ base?: number; head?: number }>({});
  const [showNewFileModal, setShowNewFileModal] = useDraft<boolean>('code:new-open', false);
  const [newFileName, setNewFileName] = useDraft<string>('code:new-name', '');
  const [newFileLanguage, setNewFileLanguage] = useDraft<string>('code:new-lang', 'java');
  const [showCommitModal, setShowCommitModal] = useDraft<boolean>('code:commit-open', false);
  const [commitMessage, setCommitMessage] = useDraft<string>('code:commit-msg', '');
  const [committing, setCommitting] = useDraft<boolean>('code:committing', false);
  const [creating, setCreating] = useDraft<boolean>('code:creating', false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCommit, setSelectedCommit] = useState<CodeCommit | null>(null);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const diffEditorRef = useRef<any>(null);
  const loading = busy || committing || creating;

  // The editor shows the buffer when it belongs to this file and branch.
  const ownsBuffer = (b: Buffer | null) => !!b && !!selectedFile && b.fileId === selectedFile.id && b.branch === currentBranch;
  const code = ownsBuffer(buffer) ? buffer!.text : '';
  const unsavedChanges = ownsBuffer(buffer) ? buffer!.unsaved : false;
  const [autoSaveStatus, setAutoSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>(unsavedChanges ? 'unsaved' : 'saved');
  // A save that finished on another (unmounted) page marks the shared buffer
  // saved; follow it so this page doesn't keep showing "Unsaved changes".
  useEffect(() => {
    if (!unsavedChanges) setAutoSaveStatus((st) => (st === 'unsaved' ? 'saved' : st));
  }, [unsavedChanges]);
  const setCode = useCallback((text: string) => {
    if (!selectedFile) return;
    setBuffer((b) => ({ fileId: selectedFile.id, branch: currentBranch, text, unsaved: ownsBuffer(b) ? b!.unsaved : false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFile?.id, currentBranch]);
  const setUnsavedChanges = useCallback((unsaved: boolean) => {
    setBuffer((b) => (b ? { ...b, unsaved } : b));
  }, [setBuffer]);
  /** Typing in the editor: on drafts the change waits for auto-save. */
  const editCode = (text: string) => {
    setCode(text);
    if (currentBranch === 'drafts') {
      setUnsavedChanges(true);
      setAutoSaveStatus('unsaved');
    }
  };

  // Bruno screen context: the file open in the editor.
  useEffect(() => {
    setScreenEntity('codeFileId', selectedFile?.id ?? null);
    return () => setScreenEntity('codeFileId', null);
  }, [selectedFile?.id]);

  const canCommit = useMemo(() => {
    if (!fileContentObj) return false;
    const drafts = fileContentObj.content?.drafts || '';
    const main = fileContentObj.content?.main || '';
    return drafts !== main && drafts.trim().length > 0;
  }, [fileContentObj]);

  // The Code page is scoped to the active team (top-right switcher). There is
  // no cross-team picker here — the API 403s other teams anyway. A team
  // change (not the first mount) drops the open file.
  const selectedTeamId = activeTeamId ?? null;
  const currentTeam = useMemo(() => teams.find((t) => t.id === selectedTeamId), [teams, selectedTeamId]);
  const lastTeam = useRef(selectedTeamId);
  useEffect(() => {
    if (lastTeam.current === selectedTeamId) return;
    lastTeam.current = selectedTeamId;
    setSelectedFile(null);
    setBuffer(null);
    setFiles([]);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeamId]);

  const filesSeq = useRef(0);
  const loadFiles = useCallback(async () => {
    if (!selectedTeamId) return;
    const seq = ++filesSeq.current;
    try {
      setBusy(true);
      setError(null);
      const list = await getCodeFiles(selectedTeamId);
      if (seq === filesSeq.current) setFiles(list);
    } catch (err) {
      if (seq === filesSeq.current) setError(`Failed to load files: ${errText(err)}`);
    } finally {
      if (seq === filesSeq.current) setBusy(false);
    }
  }, [selectedTeamId]);
  useEffect(() => { void loadFiles(); }, [loadFiles]);
  useEffect(() => {
    const on = () => { void loadFiles(); };
    filesBus.addEventListener('changed', on);
    return () => filesBus.removeEventListener('changed', on);
  }, [loadFiles]);

  // This page's own loading state (spinner, commit gating) follows its own
  // newest request; the shared buffer only takes the newest request overall.
  const localContentSeq = useRef(0);
  const loadFileContent = useCallback(async () => {
    const file = getDraft<CodeFile | null>('code:file', null);
    if (!file) return;
    const branch = getDraft<Branch>('code:branch', 'drafts');
    const local = ++localContentSeq.current;
    const mine = () => local === localContentSeq.current;
    const seq = ++contentRequest;
    const latest = () => seq === contentRequest;
    const stillOpen = () => getDraft<CodeFile | null>('code:file', null)?.id === file.id && getDraft<Branch>('code:branch', 'drafts') === branch;
    const write = inEpoch((fn: () => void) => { if (latest() && stillOpen()) fn(); });
    try {
      setBusy(true);
      const content = await getCodeFileContent(file.id);
      if (mine()) setFileContentObj(content);
      // Keep unsaved edits for this file + branch (e.g. after a mode switch).
      // Only the newest request for the file + branch still open may write.
      write(() => {
        const b = getDraft<Buffer | null>(BUFFER_KEY, null);
        if (b && b.fileId === file.id && b.branch === branch && b.unsaved) {
          setAutoSaveStatus('unsaved');
        } else {
          setBuffer({ fileId: file.id, branch, text: branch === 'drafts' ? content.content.drafts : content.content.main, unsaved: false });
          setAutoSaveStatus('saved');
        }
      });
    } catch (err) {
      if (mine()) setError(`Failed to load file content: ${errText(err)}`);
    } finally {
      if (mine()) setBusy(false);
    }
  }, [setBuffer]);

  const historySeq = useRef(0);
  const loadHistory = useCallback(async (append = false) => {
    const file = getDraft<CodeFile | null>('code:file', null);
    if (!file) return;
    const branch = getDraft<Branch>('code:branch', 'drafts');
    const seq = ++historySeq.current;
    try {
      const commits = await getCommitHistory(file.id, branch, HISTORY_PAGE, append ? history.length : 0);
      if (seq !== historySeq.current) return;
      setHistory((prev) => (append ? [...prev, ...commits] : commits));
      setHistoryHasMore(commits.length === HISTORY_PAGE);
    } catch (err) {
      if (seq === historySeq.current) setError(`Failed to load history: ${errText(err)}`);
    }
  }, [history.length]);

  useEffect(() => {
    const on = (e: Event) => {
      if (getDraft<CodeFile | null>('code:file', null)?.id !== (e as CustomEvent<number>).detail) return;
      void loadHistory();
      void loadFileContent();
    };
    filesBus.addEventListener('content', on);
    return () => filesBus.removeEventListener('content', on);
  }, [loadHistory, loadFileContent]);

  // Open file or branch changed: load its content and history.
  useEffect(() => {
    if (!selectedFile) return;
    setSelectedCommit(null);
    void loadHistory();
    void loadFileContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFile?.id, currentBranch]);

  /**
   * Save the drafts buffer as it is now (captured when called, so a queued
   * save still writes the file it was meant for), queued behind any save
   * already running; marks it saved only if nothing changed meanwhile.
   * Resolves false if the save failed.
   */
  const saveNow = useCallback((): Promise<boolean> => {
    const snapshot = getDraft<Buffer | null>(BUFFER_KEY, null);
    const gen = snapshot ? genOf(snapshot.fileId) : 0;
    const run = saveQueue.then(() => (snapshot && genOf(snapshot.fileId) !== gen ? true : saveBuffer(snapshot)));
    saveQueue = run.catch(() => {});
    return run;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, setBuffer]);
  const saveBuffer = async (b: Buffer | null): Promise<boolean> => {
    if (!b || !b.unsaved || b.branch !== 'drafts' || !currentUser) return true;
    try {
      setAutoSaveStatus('saving');
      await saveDraft(b.fileId, b.text, currentUser.id);
      const now = getDraft<Buffer | null>(BUFFER_KEY, null);
      if (now && now.fileId === b.fileId && now.branch === b.branch && now.text === b.text) {
        setBuffer({ ...now, unsaved: false });
        setAutoSaveStatus('saved');
      } else {
        setAutoSaveStatus('unsaved');
      }
      return true;
    } catch (err) {
      setAutoSaveStatus('unsaved');
      console.error('Auto-save failed:', err);
      return false;
    }
  };

  // Auto-save 3 s after the last edit on drafts.
  useEffect(() => {
    if (!canManageCode || !unsavedChanges || !selectedFile || currentBranch !== 'drafts') return;
    const timer = setTimeout(() => { void saveNow(); }, 3000);
    return () => clearTimeout(timer);
  }, [canManageCode, unsavedChanges, code, selectedFile, currentBranch, saveNow]);

  const handleEditorMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
  };
  const formatDocument = () => {
    try {
      const action = editorRef.current?.getAction?.('editor.action.formatDocument');
      if (action) action.run();
    } catch (e) {
      console.error('Format failed', e);
    }
  };

  const handleRevert = async (commitId: number, branch: Branch) => {
    if (!currentUser) return setError('Must be signed in to revert');
    if (revertRunning) return;
    revertRunning = true;
    try {
      setBusy(true);
      const file = getDraft<CodeFile | null>('code:file', null);
      // Reverting drafts: saves of this file still waiting are dropped and one
      // already running finishes first, so the revert is the last write.
      // (Saves only ever write drafts, so a main revert leaves them alone.)
      if (file && branch === 'drafts') {
        revertGen.set(file.id, genOf(file.id) + 1);
        await saveQueue;
      }
      await revertCommit(commitId, branch, currentUser.id);
      // The reverted content replaces that branch's buffer (an unsaved edit
      // there is superseded); edits to the other branch are kept.
      const cur = getDraft<Buffer | null>(BUFFER_KEY, null);
      if (!cur || (cur.fileId === file?.id && cur.branch === branch)) setBuffer(null);
      if (file) contentChanged(file.id); // the mounted page (maybe not this one) reloads
    } catch (err) {
      setError(`Failed to revert: ${errText(err)}`);
      // The revert didn't happen, but it dropped queued saves of this file:
      // save the newer text still in the editor now.
      const file = getDraft<CodeFile | null>('code:file', null);
      const cur = getDraft<Buffer | null>(BUFFER_KEY, null);
      if (branch === 'drafts' && file && cur && cur.fileId === file.id && cur.branch === 'drafts' && cur.unsaved) void saveNow();
    } finally {
      revertRunning = false;
      setBusy(false);
    }
  };

  const handleCreateFile = async () => {
    const name = getDraft('code:new-name', newFileName);
    const language = getDraft('code:new-lang', newFileLanguage);
    if (!name || !selectedTeamId || !currentUser) {
      setError('Please fill in all fields');
      return;
    }
    if (getDraft('code:creating', false)) return;
    setCreating(true);
    const release = inEpoch(() => setCreating(false));
    // Open the new file only if the editor still shows what it did when
    // Create was pressed; otherwise it just joins the list.
    const openAtStart = getDraft<CodeFile | null>('code:file', null)?.id ?? null;
    const opened = inEpoch((file: CodeFile) => {
      setNewFileName('');
      setShowNewFileModal(false);
      if ((getDraft<CodeFile | null>('code:file', null)?.id ?? null) !== openAtStart) return;
      setSelectedFile(file);
      setCurrentBranch('drafts');
      setBuffer({ fileId: file.id, branch: 'drafts', text: '', unsaved: false });
    });
    try {
      setError(null);
      const newFile = await createCodeFile(selectedTeamId, name, `${name}`, language, '', currentUser.id);
      setFiles((fs) => [...fs, newFile]);
      opened(newFile);
      filesChanged(); // the page mounted now (maybe not this one) reloads its list
    } catch (err) {
      setError(`Failed to create file: ${errText(err)}`);
    } finally {
      release();
    }
  };

  const handleCommit = async () => {
    const message = getDraft('code:commit-msg', commitMessage).trim();
    const file = getDraft<CodeFile | null>('code:file', null);
    if (!file || !currentUser || !message) {
      setError('Please enter a commit message');
      return;
    }
    if (getDraft('code:committing', false)) return;
    setCommitting(true);
    const release = inEpoch(() => setCommitting(false));
    // Show main afterwards only if the committed file is still the open one.
    const done = inEpoch(() => {
      setCommitMessage('');
      setShowCommitModal(false);
      if (getDraft<CodeFile | null>('code:file', null)?.id === file?.id) setCurrentBranch('main');
    });
    try {
      setError(null);
      // This file's unsaved edits (captured now) are saved first, after any
      // save already in flight, so they're part of the commit.
      const gen = genOf(file.id);
      const b = getDraft<Buffer | null>(BUFFER_KEY, null);
      if (b && b.fileId === file.id && b.branch === 'drafts' && b.unsaved) {
        if (!(await saveNow())) throw new Error('Could not save your latest changes');
      } else {
        await saveQueue; // a save of this file may still be in flight
      }
      // A drafts revert landed while we waited: the text this commit was for
      // is gone, so publish nothing rather than something else.
      if (genOf(file.id) !== gen) throw new Error('the drafts were reverted meanwhile, so nothing was committed. Check the file and commit again');
      await commitToMain(file.id, message, currentUser.id);
      done();
      contentChanged(file.id); // the mounted page (maybe not this one) reloads
    } catch (err) {
      setError(`Failed to commit: ${errText(err)}`);
    } finally {
      release();
    }
  };

  const handleDownload = async () => {
    if (!selectedFile) {
      setError('No file selected');
      return;
    }
    try {
      setBusy(true);
      await downloadCodeFile(selectedFile.id, currentBranch);
    } catch (err) {
      setError(`Failed to download: ${errText(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteFile = async () => {
    if (!selectedFile) return;
    if (!(await confirmDialog({ title: 'Delete file', message: 'Are you sure you want to delete this file?', confirmLabel: 'Delete', danger: true }))) return;
    const id = selectedFile.id;
    // Closing touches the editor only if it still shows the deleted file
    // (another file may have been opened meanwhile, maybe in the other mode).
    const close = inEpoch(() => {
      if (getDraft<CodeFile | null>('code:file', null)?.id !== id) return;
      setSelectedFile(null);
      if (getDraft<Buffer | null>(BUFFER_KEY, null)?.fileId === id) setBuffer(null);
    });
    try {
      setBusy(true);
      await deleteCodeFile(id);
      setFiles((fs) => fs.filter((f) => f.id !== id));
      filesChanged();
      close();
    } catch (err) {
      setError(`Failed to delete: ${errText(err)}`);
    } finally {
      setBusy(false);
    }
  };

  /** Show a commit's content in the editor (read view; not an edit). */
  const handleViewCommit = (commit: CodeCommit) => {
    setSelectedCommit(commit);
    if (selectedFile) setBuffer({ fileId: selectedFile.id, branch: currentBranch, text: commit.content, unsaved: false });
  };
  /** Pick a file; switching files keeps no edits across (the old file was auto-saved). */
  const openFile = (file: CodeFile | null) => setSelectedFile(file);
  const switchBranch = (branch: Branch) => { setCurrentBranch(branch); setSelectedCommit(null); };

  return {
    canManageCode, files, selectedFile, setSelectedFile: openFile, currentBranch, setCurrentBranch, switchBranch, code, setCode, editCode,
    history, historyHasMore, loadHistory, fileContentObj, showHistory, setShowHistory, compareMode, setCompareMode, comparePair, setComparePair,
    showNewFileModal, setShowNewFileModal, newFileName, setNewFileName, newFileLanguage, setNewFileLanguage,
    showCommitModal, setShowCommitModal, commitMessage, setCommitMessage, committing, creating, loading, error, setError,
    selectedTeamId, currentTeam, unsavedChanges, setUnsavedChanges, autoSaveStatus, setAutoSaveStatus, selectedCommit, setSelectedCommit,
    editorRef, monacoRef, diffEditorRef, canCommit, handleEditorMount, formatDocument, handleRevert, handleCreateFile, handleCommit,
    handleDownload, handleDeleteFile, handleViewCommit,
  };
}
