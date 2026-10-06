import React from 'react';
import { 
  Code2, 
  Save, 
  GitBranch, 
  History, 
  Download, 
  Upload, 
  Plus, 
  Trash2,
  FileText,
  Clock,
  User,
  MessageSquare,
  ChevronDown,
  Check,
  AlertCircle,
  Loader
} from 'lucide-react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { format } from 'date-fns';
import { useTheme } from '../hooks/useTheme';
import { Member, Team } from '../types';
import { GitHubRepoSection } from './GitHubRepoSection';
import { useCodeController } from './code/useCodeController';
import { Select as ThemedSelect } from './Select';

interface CodeViewProps {
  teams: Team[];
  members: Member[];
  currentUser?: Member;
  onRefresh: () => void;
  setLoading: (loading: boolean) => void;
  hasScope?: (scope: string) => boolean;
  activeTeamId?: number | null;
}

export const CodeView: React.FC<CodeViewProps> = ({ teams, members, currentUser, onRefresh, setLoading, hasScope, activeTeamId }) => {
  // Editor, branch, history and file state + handlers are shared with the Modern Code page.
  const {
    canManageCode, files, selectedFile, setSelectedFile, currentBranch, setCurrentBranch, code, setCode,
    history, historyHasMore, loadHistory, showHistory, setShowHistory, compareMode, setCompareMode, comparePair, setComparePair,
    showNewFileModal, setShowNewFileModal, newFileName, setNewFileName, newFileLanguage, setNewFileLanguage,
    showCommitModal, setShowCommitModal, commitMessage, setCommitMessage, loading, error, setError,
    selectedTeamId, currentTeam, unsavedChanges, setUnsavedChanges, autoSaveStatus, setAutoSaveStatus, selectedCommit, setSelectedCommit,
    diffEditorRef, monacoRef, canCommit, handleEditorMount, formatDocument, handleRevert, handleCreateFile, handleCommit,
    handleDownload, handleDeleteFile, handleViewCommit,
  } = useCodeController({ teams, currentUser, hasScope, activeTeamId });
  const { theme } = useTheme();
  const monacoTheme = theme === 'light' ? 'light' : 'vs-dark';

  const renderAutoSaveIndicator = () => {
    if (currentBranch !== 'drafts') return null;
    
    const icons: Record<'saved' | 'saving' | 'unsaved', React.ReactNode> = {
      saved: <Check className="w-4 h-4 text-green-400" />,
      saving: <Loader className="w-4 h-4 animate-spin text-blue-400" />,
      unsaved: <AlertCircle className="w-4 h-4 text-yellow-400" />
    };

    const labels: Record<'saved' | 'saving' | 'unsaved', string> = {
      saved: 'All changes saved',
      saving: 'Saving...',
      unsaved: 'Unsaved changes'
    };

    return (
      <div className="flex items-center gap-2 text-xs text-text-muted px-3 py-1 bg-secondary rounded-lg">
        {icons[autoSaveStatus]}
        {labels[autoSaveStatus]}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6 flex-1 min-h-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Code2 className="w-6 h-6 text-accent" />
          <h2 className="text-2xl font-bold text-text-base">Code Management</h2>
        </div>
        {canManageCode && (
          <button
            onClick={() => setShowNewFileModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-accent-ink font-bold rounded-lg hover:brightness-90 transition-all"
          >
            <Plus className="w-4 h-4" />
            New File
          </button>
        )}
      </div>

      {/* GitHub repo linking */}
      <GitHubRepoSection teamId={selectedTeamId} isAdmin={hasScope ? hasScope('code') : false} />

      {/* Error Alert */}
      {error && (        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 flex items-start gap-3 flex-shrink-0">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-200 text-sm">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-red-300 hover:text-red-200 ml-auto flex-shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* Team & File Selection — scoped to the active team */}
      <div className="flex gap-4 flex-wrap flex-shrink-0">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs font-bold text-text-muted mb-2 block">TEAM</label>
          <div className="w-full px-3 py-2 bg-elevated text-text-base rounded-lg border border-line font-semibold">
            {currentTeam?.name || 'Loading…'}
          </div>
        </div>

        {selectedTeamId && (
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-bold text-text-muted mb-2 block">SELECT FILE</label>
            <ThemedSelect
              value={selectedFile?.id || ''}
              onChange={(e) => {
                const file = files.find(f => f.id === parseInt(e.target.value));
                setSelectedFile(file || null);
              }}
              className="w-full px-3 py-2 bg-elevated text-text-base rounded-lg border border-line focus:border-accent focus:outline-none"
            >
              <option value="">Choose a file...</option>
              {files.map(f => (
                <option key={f.id} value={f.id}>{f.file_name}</option>
              ))}
            </ThemedSelect>
          </div>
        )}
      </div>

      {/* Main Editor Area */}
      {selectedFile ? (
        <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-hidden" style={{ minHeight: '60vh' }}>
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 flex-wrap bg-elevated p-3 rounded-lg flex-shrink-0">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-accent" />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setCurrentBranch('drafts');
                    setSelectedCommit(null);
                  }}
                  className={`px-3 py-1 rounded text-sm font-bold transition-all ${
                    currentBranch === 'drafts'
                      ? 'bg-accent text-accent-ink'
                      : 'bg-secondary text-text-muted hover:bg-text-base/10'
                  }`}
                >
                  Drafts
                </button>
                <button
                  onClick={() => {
                    setCurrentBranch('main');
                    setSelectedCommit(null);
                  }}
                  className={`px-3 py-1 rounded text-sm font-bold transition-all ${
                    currentBranch === 'main'
                      ? 'bg-accent text-accent-ink'
                      : 'bg-secondary text-text-muted hover:bg-text-base/10'
                  }`}
                >
                  Main
                </button>
              </div>
            </div>

            {renderAutoSaveIndicator()}

            <div className="flex items-center gap-2">
              <button
                onClick={formatDocument}
                className="flex items-center gap-1 px-3 py-1 bg-secondary text-text-base rounded text-sm hover:bg-text-base/10 transition-all"
              >
                Format
              </button>
              <button
                onClick={() => setCompareMode(!compareMode)}
                className={`flex items-center gap-1 px-3 py-1 rounded text-sm font-bold transition-all ${
                  compareMode ? 'bg-accent text-accent-ink' : 'bg-secondary text-text-base hover:bg-text-base/10'
                }`}
              >
                Compare
              </button>
            </div>

            <div className="flex items-center gap-2 flex-wrap justify-end">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center gap-1 px-3 py-1 bg-secondary text-text-base rounded text-sm hover:bg-text-base/10 transition-all"
              >
                <History className="w-4 h-4" />
                History
              </button>
              <button
                onClick={handleDownload}
                disabled={loading}
                className="flex items-center gap-1 px-3 py-1 bg-blue-700 text-blue-100 rounded text-sm hover:bg-blue-600 transition-all disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
              {currentBranch === 'drafts' && canManageCode && (
                <button
                  onClick={() => setShowCommitModal(true)}
                  disabled={loading || !(unsavedChanges || canCommit)}
                  className="flex items-center gap-1 px-3 py-1 bg-green-700 text-green-100 rounded text-sm hover:bg-green-600 transition-all disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  Commit
                </button>
              )}
              {canManageCode && (
                <button
                  onClick={handleDeleteFile}
                  disabled={loading}
                  className="flex items-center gap-1 px-3 py-1 bg-red-700 text-red-100 rounded text-sm hover:bg-red-600 transition-all disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              )}
            </div>
          </div>

          {/* Editor and History */}
          <div className="flex gap-4 flex-1 min-h-0">
            {/* Editor */}
            <div className="flex-1 min-w-0 flex flex-col">
              <div className="text-xs font-bold text-text-muted mb-2 px-3">
                {selectedFile.file_name} ({selectedFile.language})
              </div>
              <div className="flex-1 bg-primary rounded-lg border border-line min-h-0 flex flex-col">
                <div className="flex-1 min-h-0 overflow-auto">
                    {compareMode && comparePair.base && comparePair.head ? (
                      <DiffEditor
                        height="100%"
                        language={selectedFile.language === 'java' ? 'java' : 'plaintext'}
                        original={history.find(h => h.id === comparePair.base)?.content || ''}
                        modified={history.find(h => h.id === comparePair.head)?.content || ''}
                        onMount={(editor, monaco) => { diffEditorRef.current = editor; monacoRef.current = monaco; }}
                        theme={monacoTheme}
                        options={{ automaticLayout: true }}
                      />
                    ) : (
                      <Editor
                        height="100%"
                        language={selectedFile.language === 'java' ? 'java' : 'plaintext'}
                        value={code}
                        onMount={handleEditorMount}
                        onChange={(value) => {
                          setCode(value || '');
                          if (currentBranch === 'drafts') {
                            setUnsavedChanges(true);
                            setAutoSaveStatus('unsaved');
                          }
                        }}
                        theme={monacoTheme}
                        options={{
                          minimap: { enabled: true },
                          wordWrap: 'on',
                          fontSize: 13,
                          fontFamily: '"Fira Code", monospace',
                          automaticLayout: true,
                          readOnly: !canManageCode,
                          domReadOnly: !canManageCode
                        }}
                      />
                    )}
                </div>
              </div>
            </div>

            {/* History Sidebar */}
            {showHistory && (
              <div className="w-80 flex flex-col bg-elevated rounded-lg border border-line overflow-hidden">
                <div className="px-3 py-2 border-b border-line bg-secondary">
                  <h4 className="text-sm font-bold text-text-base flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Commit History
                  </h4>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {history.length > 0 ? (
                      history.map(commit => (
                        <div key={commit.id} className="w-full border-b border-line">
                          <div className={`w-full text-left px-3 py-2 hover:bg-secondary transition-all ${selectedCommit?.id === commit.id ? 'bg-accent/20' : ''}`}>
                            <div className="flex items-start gap-2">
                              <div className="flex-1 cursor-pointer" onClick={() => handleViewCommit(commit)}>
                                <div className="text-xs font-bold text-accent">{commit.hash.substring(0, 8)}</div>
                                <div className="text-xs text-text-base">{commit.message}</div>
                                <div className="flex items-center gap-1 text-[10px] text-text-muted">
                                  <User className="w-3 h-3" />
                                  {commit.author_name || 'Unknown'} • {format(new Date(commit.created_at), 'MMM dd, h:mm a')}
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <div className="flex gap-1">
                                  <button
                                    title="Use as base for compare"
                                    onClick={() => setComparePair(p => ({ ...p, base: commit.id }))}
                                    className={`px-2 py-1 text-[11px] rounded ${comparePair.base === commit.id ? 'bg-accent text-accent-ink' : 'bg-secondary text-text-base hover:bg-text-base/10'}`}
                                  >
                                    Base
                                  </button>
                                  <button
                                    title="Use as head for compare"
                                    onClick={() => setComparePair(p => ({ ...p, head: commit.id }))}
                                    className={`px-2 py-1 text-[11px] rounded ${comparePair.head === commit.id ? 'bg-accent text-accent-ink' : 'bg-secondary text-text-base hover:bg-text-base/10'}`}
                                  >
                                    Head
                                  </button>
                                </div>
                                <div className="flex gap-1 mt-1">
                                  {canManageCode && (
                                    <button
                                      onClick={() => handleRevert(commit.id, currentBranch === 'main' ? 'main' : 'drafts')}
                                      className="px-2 py-1 text-[11px] rounded bg-red-700 text-red-100 hover:bg-red-600"
                                    >
                                      Revert
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-3 text-xs text-text-muted text-center">
                        No commits yet
                      </div>
                    )}
                    {historyHasMore && history.length > 0 && (
                      <button
                        onClick={() => loadHistory(true)}
                        className="w-full mt-1 text-[11px] font-semibold text-text-muted hover:text-text-base border border-line hover:border-text-base/30 rounded-lg py-2 transition-colors"
                      >
                        Load more commits
                      </button>
                    )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <FileText className="w-16 h-16 text-text-muted mx-auto mb-4" />
            <p className="text-text-muted mb-2">Select a file to view code</p>
            {canManageCode && (
              <button
                onClick={() => setShowNewFileModal(true)}
                className="text-accent hover:underline text-sm font-bold"
              >
                Create a new file to get started
              </button>
            )}
          </div>
        </div>
      )}

      {/* New File Modal */}
      {showNewFileModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-elevated rounded-lg p-6 max-w-md w-full border border-line">
            <h3 className="text-lg font-bold text-text-base mb-4">Create New File</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-text-muted block mb-2">FILE NAME</label>
                <input
                  type="text"
                  placeholder="Example.java"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  className="w-full px-3 py-2 bg-primary text-text-base rounded-lg border border-line focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-text-muted block mb-2">LANGUAGE</label>
                <ThemedSelect
                  value={newFileLanguage}
                  onChange={(e) => setNewFileLanguage(e.target.value)}
                  className="w-full px-3 py-2 bg-primary text-text-base rounded-lg border border-line focus:border-accent focus:outline-none"
                >
                  <option value="java">Java</option>
                  <option value="cpp">C++</option>
                  <option value="python">Python</option>
                  <option value="javascript">JavaScript</option>
                </ThemedSelect>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowNewFileModal(false);
                  setNewFileName('');
                }}
                className="flex-1 px-4 py-2 bg-secondary text-text-base rounded-lg hover:bg-text-base/10 transition-all font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFile}
                disabled={loading || !newFileName || !selectedTeamId}
                className="flex-1 px-4 py-2 bg-accent text-accent-ink rounded-lg hover:brightness-90 transition-all font-bold disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Commit Modal */}
      {showCommitModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-elevated rounded-lg p-6 max-w-md w-full border border-line">
            <h3 className="text-lg font-bold text-text-base mb-4">Commit to Main</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-text-muted block mb-2">COMMIT MESSAGE</label>
                <textarea
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  placeholder="Describe your changes..."
                  rows={4}
                  className="w-full px-3 py-2 bg-primary text-text-base rounded-lg border border-line focus:border-accent focus:outline-none resize-none"
                />
              </div>
              <div className="text-xs text-text-muted">
                You will be committing {code.length} characters from the drafts branch to main.
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCommitModal(false);
                  setCommitMessage('');
                }}
                className="flex-1 px-4 py-2 bg-secondary text-text-base rounded-lg hover:bg-text-base/10 transition-all font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleCommit}
                disabled={loading || !commitMessage.trim()}
                className="flex-1 px-4 py-2 bg-green-700 text-green-100 rounded-lg hover:bg-green-600 transition-all font-bold disabled:opacity-50"
              >
                Commit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CodeView;
