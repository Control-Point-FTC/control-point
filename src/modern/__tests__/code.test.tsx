import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange, options }: any) => <textarea aria-label="Code editor" value={value} readOnly={!!options?.readOnly} onChange={(e) => onChange?.(e.target.value)} />,
  DiffEditor: ({ original, modified }: any) => <div data-testid="diff">{original}|{modified}</div>,
}));
const code = vi.hoisted(() => ({
  getCodeFiles: vi.fn(), createCodeFile: vi.fn(), getCodeFileContent: vi.fn(), saveDraft: vi.fn(), commitToMain: vi.fn(),
  getCommitHistory: vi.fn(), getCommit: vi.fn(), downloadCodeFile: vi.fn(), deleteCodeFile: vi.fn(), revertCommit: vi.fn(),
}));
vi.mock('../../services/codeService', () => code);
const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));
const dialog = vi.hoisted(() => ({ notify: vi.fn(), confirmDialog: vi.fn() }));
vi.mock('../../components/dialog', async (orig) => ({ ...(await orig<object>()), ...dialog }));

import { InterfaceModeProvider } from '../interfaceMode';
import { CodePage } from '../pages/code/CodePage';
import { clearDrafts } from '../drafts';
import { getScreenContext, setScreenRoute } from '../../services/brunoContext';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
const json = (body: any, ok = true) => Promise.resolve({ ok, json: async () => body });
const me = { id: 7, name: 'Ada', team_id: 1, interface_mode: 'modern' };
const FILES = [{ id: 1, file_name: 'Drive.java', language: 'java' }, { id: 2, file_name: 'Arm.java', language: 'java' }];
let server: Record<number, { drafts: string; main: string }>;
const COMMITS = [
  { id: 101, hash: 'aaaaaaaaaa', message: 'Tune PID', author_name: 'Ada', created_at: '2026-09-01T10:00:00Z', content: 'v1' },
  { id: 102, hash: 'bbbbbbbbbb', message: 'Add arm', author_name: 'Bo', created_at: '2026-09-02T10:00:00Z', content: 'v2' },
];

beforeEach(() => {
  server = { 1: { drafts: 'class Drive {}', main: 'class Drive { /* main */ }' }, 2: { drafts: 'class Arm {}', main: '' } };
  Object.values(code).forEach((f) => f.mockReset());
  code.getCodeFiles.mockResolvedValue(FILES);
  code.getCodeFileContent.mockImplementation(async (id: number) => ({ content: server[id] }));
  code.getCommitHistory.mockResolvedValue(COMMITS);
  code.saveDraft.mockImplementation(async (id: number, text: string) => { server[id].drafts = text; return {}; });
  code.commitToMain.mockImplementation(async (id: number) => { server[id].main = server[id].drafts; return {}; });
  code.createCodeFile.mockImplementation(async (_t: number, name: string, _p: string, language: string) => ({ id: 3, file_name: name, language }));
  code.deleteCodeFile.mockResolvedValue({ success: true });
  code.revertCommit.mockResolvedValue({});
  api.apiFetch.mockReset();
  api.apiFetch.mockImplementation(() => json(null));
  dialog.confirmDialog.mockReset();
  dialog.confirmDialog.mockResolvedValue(true);
  clearDrafts();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const setup = (scoped = true) => render(
  <InterfaceModeProvider user={me} team={{}} onUserSaved={() => {}}>
    <MemoryRouter><CodePage teams={[{ id: 1, name: 'Robo', number: 4215 } as any]} currentUser={{ id: 7 } as any} hasScope={(s) => scoped && s === 'code'} activeTeamId={1} /></MemoryRouter>
  </InterfaceModeProvider>,
);
const open = async (name: string) => {
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(name) }));
  await waitFor(() => expect(screen.getByLabelText('Code editor')).toHaveValue(server[name === 'Drive.java' ? 1 : 2].drafts));
};

describe('Modern Code', () => {
  it('lists the team files and opens one on drafts; Bruno knows the open file', async () => {
    setScreenRoute('/code', 'Code');
    setup();
    await open('Drive.java');
    expect(screen.getByRole('radio', { name: /Drafts/ })).toHaveAttribute('aria-checked', 'true');
    expect(getScreenContext()).toMatchObject({ codeFileId: 1 });
    fireEvent.click(screen.getByRole('radio', { name: /Main/ }));
    await waitFor(() => expect(screen.getByLabelText('Code editor')).toHaveValue('class Drive { /* main */ }'));
  });

  it('read-only without the code scope', async () => {
    setup(false);
    await open('Drive.java');
    expect(screen.getByLabelText('Code editor')).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: /New file/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Commit$/ })).not.toBeInTheDocument();
  });

  it('auto-saves drafts 3 s after typing', async () => {
    setup();
    await open('Drive.java');
    fireEvent.change(screen.getByLabelText('Code editor'), { target: { value: 'class Drive { int x; }' } });
    expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes');
    await waitFor(() => expect(code.saveDraft).toHaveBeenCalledWith(1, 'class Drive { int x; }', 7), { timeout: 4500 });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('All changes saved'));
  });

  it('typing during a save keeps the buffer unsaved', async () => {
    let land: () => void = () => {};
    code.saveDraft.mockImplementation(() => new Promise((r) => { land = () => r({}); }));
    setup();
    await open('Drive.java');
    fireEvent.change(screen.getByLabelText('Code editor'), { target: { value: 'A' } });
    await waitFor(() => expect(code.saveDraft).toHaveBeenCalledTimes(1), { timeout: 4500 });
    fireEvent.change(screen.getByLabelText('Code editor'), { target: { value: 'AB' } });
    await act(async () => { land(); });
    expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes');
  });

  it('commit saves unsaved edits first, then promotes drafts to main', async () => {
    setup();
    await open('Drive.java');
    fireEvent.change(screen.getByLabelText('Code editor'), { target: { value: 'class Drive { fast(); }' } });
    fireEvent.click(screen.getByRole('button', { name: /^Commit$/ }));
    const dlg = await screen.findByRole('dialog');
    expect(within(dlg).getByRole('button', { name: /Commit/ })).toBeDisabled();
    fireEvent.change(within(dlg).getByLabelText('Commit message'), { target: { value: 'Go faster' } });
    fireEvent.click(within(dlg).getByRole('button', { name: /Commit/ }));
    await waitFor(() => expect(code.commitToMain).toHaveBeenCalledWith(1, 'Go faster', 7));
    expect(code.saveDraft).toHaveBeenCalledWith(1, 'class Drive { fast(); }', 7);
    expect(code.saveDraft.mock.invocationCallOrder[0]).toBeLessThan(code.commitToMain.mock.invocationCallOrder[0]);
    await waitFor(() => expect(screen.getByRole('radio', { name: /Main/ })).toHaveAttribute('aria-checked', 'true'));
    await waitFor(() => expect(screen.getByLabelText('Code editor')).toHaveValue('class Drive { fast(); }'));
  });

  it('unsaved code survives a remount (mode switch) instead of being replaced by the server copy', async () => {
    const first = setup();
    await open('Drive.java');
    fireEvent.change(screen.getByLabelText('Code editor'), { target: { value: 'class Drive { wip }' } });
    first.unmount();
    setup();
    await waitFor(() => expect(code.getCodeFileContent).toHaveBeenCalledTimes(2));
    expect(await screen.findByLabelText('Code editor')).toHaveValue('class Drive { wip }');
    expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes');
  });

  it('history: view, revert, and compare two commits', async () => {
    setup();
    await open('Drive.java');
    fireEvent.click(screen.getByRole('button', { name: /History/ }));
    const sheet = await screen.findByRole('dialog');
    fireEvent.click(within(sheet).getByRole('button', { name: /Tune PID/ }));
    expect(screen.getByLabelText('Code editor')).toHaveValue('v1');
    fireEvent.click(within(sheet).getAllByRole('button', { name: /Revert/ })[1]);
    await waitFor(() => expect(code.revertCommit).toHaveBeenCalledWith(102, 'drafts', 7));
    fireEvent.keyDown(sheet, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Compare/ }));
    const sheet2 = await screen.findByRole('dialog');
    fireEvent.click(within(sheet2).getAllByRole('radio', { name: 'Base' })[0]);
    fireEvent.click(within(sheet2).getAllByRole('radio', { name: 'Head' })[1]);
    expect(screen.getByTestId('diff')).toHaveTextContent('v1|v2');
  });

  it('creates a file and deletes one after confirming', async () => {
    setup();
    await screen.findByRole('button', { name: /Drive.java/ });
    fireEvent.click(screen.getByRole('button', { name: /New file/ }));
    const dlg = await screen.findByRole('dialog');
    fireEvent.change(within(dlg).getByLabelText('File name'), { target: { value: 'Intake.java' } });
    fireEvent.click(within(dlg).getByRole('radio', { name: 'Python' }));
    fireEvent.click(within(dlg).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(code.createCodeFile).toHaveBeenCalledWith(1, 'Intake.java', 'Intake.java', 'python', '', 7));
    expect(await screen.findByRole('button', { name: /Intake.java/ })).toHaveAttribute('aria-current', 'true');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More file actions' }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: /Delete file/ }));
    await waitFor(() => expect(code.deleteCodeFile).toHaveBeenCalledWith(3));
    expect(screen.queryByRole('button', { name: /Intake.java/ })).not.toBeInTheDocument();
  });

  it('GitHub repo: admins connect; the tree opens a read-only preview', async () => {
    let linked = false;
    api.apiFetch.mockImplementation((url: string, init?: any) => {
      if (url === '/api/code/repo' && init?.method === 'POST') { linked = true; return json({}); }
      if (url === '/api/code/repo') return json(linked ? { owner: 'robo', repo: 'ftc', repoUrl: 'https://github.com/robo/ftc', branch: 'main', fileCount: 2, syncedAt: '2026-09-01T10:00:00Z', fileTree: [{ path: 'src', type: 'tree' }, { path: 'src/Auto.java', type: 'blob' }] } : null);
      if (url.startsWith('/api/code/repo/file')) return json({ content: 'class Auto {}' });
      return json(null);
    });
    setup();
    fireEvent.change(await screen.findByLabelText('GitHub repo URL'), { target: { value: 'https://github.com/robo/ftc' } });
    fireEvent.click(screen.getByRole('button', { name: /Connect repo/ }));
    expect(await screen.findByText('robo/ftc')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /src/ }));
    fireEvent.click(screen.getByRole('button', { name: /Auto.java/ }));
    const dlg = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dlg).getByLabelText('Code editor')).toHaveValue('class Auto {}'));
    expect(within(dlg).getByLabelText('Code editor')).toHaveAttribute('readonly');
  });
});
