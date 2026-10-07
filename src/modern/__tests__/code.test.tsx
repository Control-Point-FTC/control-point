import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, renderHook, screen, cleanup, fireEvent, waitFor, within, act } from '@testing-library/react';
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
import { useCodeController } from '../../components/code/useCodeController';
import { clearDrafts } from '../drafts';
import { getScreenContext, setScreenRoute } from '../../services/brunoContext';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
const json = (body: any, ok = true) => Promise.resolve({ ok, json: async () => body });
const me = { id: 7, name: 'Ada', team_id: 1, interface_mode: 'modern' };
const FILES = [{ id: 1, file_name: 'Drive.java', language: 'java' }, { id: 2, file_name: 'Arm.java', language: 'java' }];
let server: Record<number, { drafts: string; main: string }>;
let fileList: any[];
const COMMITS = [
  { id: 101, hash: 'aaaaaaaaaa', message: 'Tune PID', author_name: 'Ada', created_at: '2026-09-01T10:00:00Z', content: 'v1' },
  { id: 102, hash: 'bbbbbbbbbb', message: 'Add arm', author_name: 'Bo', created_at: '2026-09-02T10:00:00Z', content: 'v2' },
];

beforeEach(() => {
  server = { 1: { drafts: 'class Drive {}', main: 'class Drive { /* main */ }' }, 2: { drafts: 'class Arm {}', main: '' } };
  Object.values(code).forEach((f) => f.mockReset());
  fileList = [...FILES];
  code.getCodeFiles.mockImplementation(async () => fileList);
  code.getCodeFileContent.mockImplementation(async (id: number) => ({ content: server[id] }));
  code.getCommitHistory.mockResolvedValue(COMMITS);
  code.saveDraft.mockImplementation(async (id: number, text: string) => { server[id].drafts = text; return {}; });
  code.commitToMain.mockImplementation(async (id: number) => { server[id].main = server[id].drafts; return {}; });
  code.createCodeFile.mockImplementation(async (_t: number, name: string, _p: string, language: string) => {
    const f = { id: 3, file_name: name, language };
    fileList = [...fileList, f];
    server[3] = { drafts: '', main: '' };
    return f;
  });
  code.deleteCodeFile.mockImplementation(async (id: number) => { fileList = fileList.filter((f) => f.id !== id); return { success: true }; });
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

  it("an auto-save that lands after a mode switch clears the new page's Unsaved badge", async () => {
    let release: () => void = () => {};
    code.saveDraft.mockImplementation((id: number, text: string) => new Promise((r) => { release = () => { server[id].drafts = text; r({}); }; }));
    const first = setup();
    await open('Drive.java');
    fireEvent.change(screen.getByLabelText('Code editor'), { target: { value: 'v1' } });
    await waitFor(() => expect(code.saveDraft).toHaveBeenCalledTimes(1), { timeout: 4500 });
    first.unmount();
    setup();
    await waitFor(() => expect(screen.getByLabelText('Code editor')).toHaveValue('v1'));
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await act(async () => { release(); });
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument());
  }, 15000);

  it('a repo connected while you switch modes shows on the page you return to', async () => {
    let linked = false;
    let finish: () => void = () => {};
    api.apiFetch.mockImplementation((url: string, init?: any) => {
      if (url === '/api/code/repo' && init?.method === 'POST') return new Promise((r) => { finish = () => { linked = true; r({ ok: true, json: async () => ({}) }); }; });
      if (url === '/api/code/repo') return json(linked ? { owner: 'robo', repo: 'ftc', repoUrl: 'https://github.com/robo/ftc', branch: 'main', fileCount: 0, syncedAt: '2026-09-01T10:00:00Z', fileTree: [] } : null);
      return json(null);
    });
    const first = setup();
    fireEvent.change(await screen.findByLabelText('GitHub repo URL'), { target: { value: 'https://github.com/robo/ftc' } });
    fireEvent.click(screen.getByRole('button', { name: /Connect repo/ }));
    first.unmount();
    setup();
    expect(await screen.findByLabelText('GitHub repo URL')).toBeInTheDocument();
    await act(async () => { finish(); });
    expect(await screen.findByText('robo/ftc')).toBeInTheDocument();
  });

  it('a delete finishing after you opened another file leaves that file and its edits alone', async () => {
    let finish: () => void = () => {};
    code.deleteCodeFile.mockImplementation((id: number) => new Promise((r) => { finish = () => { fileList = fileList.filter((f) => f.id !== id); r({ success: true }); }; }));
    const first = setup();
    await open('Drive.java');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More file actions' }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: /Delete file/ }));
    await waitFor(() => expect(code.deleteCodeFile).toHaveBeenCalledWith(1));
    first.unmount();
    setup();
    await open('Arm.java');
    fireEvent.change(screen.getByLabelText('Code editor'), { target: { value: 'class Arm { mine }' } });
    await act(async () => { finish(); });
    await waitFor(() => expect(screen.queryByRole('button', { name: /Drive.java/ })).not.toBeInTheDocument());
    expect(screen.getByLabelText('Code editor')).toHaveValue('class Arm { mine }');
  });

  it("a late load for a file you left never replaces the open file's edits", async () => {
    const replies: Record<number, (v: any) => void> = {};
    code.getCodeFileContent.mockImplementation((id: number) => new Promise((r) => { replies[id] = r; }));
    const first = setup();
    fireEvent.click(await screen.findByRole('button', { name: /Drive.java/ }));
    await waitFor(() => expect(replies[1]).toBeDefined());
    first.unmount();
    setup();
    fireEvent.click(await screen.findByRole('button', { name: /Arm.java/ }));
    await waitFor(() => expect(replies[2]).toBeDefined());
    await act(async () => { replies[2]({ content: server[2] }); });
    fireEvent.change(await screen.findByLabelText('Code editor'), { target: { value: 'class Arm { edited }' } });
    await act(async () => { replies[1]({ content: server[1] }); });
    expect(screen.getByLabelText('Code editor')).toHaveValue('class Arm { edited }');
  });

  it('a commit waits for an auto-save already in flight, so main gets the newest text', async () => {
    const order: string[] = [];
    let firstSave: () => void = () => {};
    code.saveDraft.mockImplementation((id: number, text: string) => {
      order.push(`save:${text}`);
      if (order.length === 1) return new Promise((r) => { firstSave = () => { server[id].drafts = text; order.push('save-landed:' + text); r({}); }; });
      server[id].drafts = text; order.push('save-landed:' + text); return Promise.resolve({});
    });
    code.commitToMain.mockImplementation(async (id: number) => { order.push('commit'); server[id].main = server[id].drafts; return {}; });
    setup();
    await open('Drive.java');
    fireEvent.change(screen.getByLabelText('Code editor'), { target: { value: 'v1' } });
    await waitFor(() => expect(code.saveDraft).toHaveBeenCalledTimes(1), { timeout: 4500 });
    fireEvent.change(screen.getByLabelText('Code editor'), { target: { value: 'v2' } });
    fireEvent.click(screen.getByRole('button', { name: /^Commit$/ }));
    const dlg = await screen.findByRole('dialog');
    fireEvent.change(within(dlg).getByLabelText('Commit message'), { target: { value: 'ship' } });
    fireEvent.click(within(dlg).getByRole('button', { name: /Commit/ }));
    await new Promise((r) => setTimeout(r, 50));
    expect(order).toEqual(['save:v1']); // queued behind the in-flight save
    await act(async () => { firstSave(); });
    await waitFor(() => expect(code.commitToMain).toHaveBeenCalled());
    expect(order).toEqual(['save:v1', 'save-landed:v1', 'save:v2', 'save-landed:v2', 'commit']);
    expect(server[1].main).toBe('v2');
  });

  it('a file created while you switch modes shows up in the list of the page you return to', async () => {
    let finish: () => void = () => {};
    code.createCodeFile.mockImplementation((_t: number, name: string, _p: string, language: string) => new Promise((r) => {
      finish = () => { const f = { id: 3, file_name: name, language }; fileList = [...fileList, f]; server[3] = { drafts: '', main: '' }; r(f); };
    }));
    const first = setup();
    await screen.findByRole('button', { name: /Drive.java/ });
    fireEvent.click(screen.getByRole('button', { name: /New file/ }));
    fireEvent.change(await screen.findByLabelText('File name'), { target: { value: 'Late.java' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    first.unmount();
    setup();
    // The returning page loads its list (the drafted dialog is still open on top).
    await waitFor(() => expect(code.getCodeFiles).toHaveBeenCalledTimes(2));
    await act(async () => { finish(); });
    expect(await screen.findByRole('button', { name: /Late.java/ })).toBeInTheDocument();
  });

  it("a commit saves its own file's newest edits even if you open another file meanwhile", async () => {
    let firstSave: () => void = () => {};
    code.saveDraft.mockImplementation((id: number, text: string) => {
      if (code.saveDraft.mock.calls.length === 1) return new Promise((r) => { firstSave = () => { server[id].drafts = text; r({}); }; });
      server[id].drafts = text; return Promise.resolve({});
    });
    setup();
    await open('Drive.java');
    fireEvent.change(screen.getByLabelText('Code editor'), { target: { value: 'v1' } });
    await waitFor(() => expect(code.saveDraft).toHaveBeenCalledTimes(1), { timeout: 4500 });
    fireEvent.change(screen.getByLabelText('Code editor'), { target: { value: 'v2' } });
    fireEvent.click(screen.getByRole('button', { name: /^Commit$/ }));
    const dlg = await screen.findByRole('dialog');
    fireEvent.change(within(dlg).getByLabelText('Commit message'), { target: { value: 'ship' } });
    fireEvent.click(within(dlg).getByRole('button', { name: /Commit/ }));
    // Open another file while the commit waits for the in-flight save.
    fireEvent.click(screen.getAllByRole('button', { name: /Arm.java/, hidden: true })[0]);
    await act(async () => { firstSave(); });
    await waitFor(() => expect(code.commitToMain).toHaveBeenCalledWith(1, 'ship', 7));
    expect(code.saveDraft.mock.calls.map((c) => [c[0], c[1]])).toEqual([[1, 'v1'], [1, 'v2']]);
    expect(server[1].main).toBe('v2');
  });

  it('a revert that finishes after a mode switch refreshes the page you came back to', async () => {
    let finish: () => void = () => {};
    code.revertCommit.mockImplementation(() => new Promise((r) => { finish = () => { server[1].drafts = 'reverted'; r({}); }; }));
    const first = setup();
    await open('Drive.java');
    fireEvent.click(screen.getByRole('button', { name: /History/ }));
    fireEvent.click(within(await screen.findByRole('dialog')).getAllByRole('button', { name: /Revert/ })[0]);
    first.unmount();
    setup();
    await waitFor(() => expect(screen.getByLabelText('Code editor')).toHaveValue('class Drive {}'));
    await act(async () => { finish(); });
    await waitFor(() => expect(screen.getByLabelText('Code editor')).toHaveValue('reverted'));
  });

  it('a revert drops auto-saves still waiting, so they cannot undo it', async () => {
    let firstSave: () => void = () => {};
    code.saveDraft.mockImplementation((id: number, text: string) => {
      if (code.saveDraft.mock.calls.length === 1) return new Promise((r) => { firstSave = () => { server[id].drafts = text; r({}); }; });
      server[id].drafts = text; return Promise.resolve({});
    });
    code.revertCommit.mockImplementation(async () => { server[1].drafts = 'reverted'; return {}; });
    setup();
    await open('Drive.java');
    fireEvent.change(screen.getByLabelText('Code editor'), { target: { value: 'v1' } });
    await waitFor(() => expect(code.saveDraft).toHaveBeenCalledTimes(1), { timeout: 4500 });
    // A second auto-save queues behind the slow first one…
    fireEvent.change(screen.getByLabelText('Code editor'), { target: { value: 'v2' } });
    await new Promise((r) => setTimeout(r, 3300));
    // …then the user reverts.
    fireEvent.click(screen.getByRole('button', { name: /History/ }));
    fireEvent.click(within(await screen.findByRole('dialog')).getAllByRole('button', { name: /Revert/ })[0]);
    expect(code.revertCommit).not.toHaveBeenCalled(); // waits for the running save
    await act(async () => { firstSave(); });
    await waitFor(() => expect(code.revertCommit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByLabelText('Code editor')).toHaveValue('reverted'));
    expect(code.saveDraft.mock.calls.map((c) => c[1])).toEqual(['v1']);
    expect(server[1].drafts).toBe('reverted');
  }, 15000);

  describe('revert vs queued saves (controller)', () => {
    const props = { teams: [{ id: 1, name: 'Robo', number: 4215 }], currentUser: { id: 7 }, hasScope: (x: string) => x === 'code', activeTeamId: 1 } as any;
    const slowFirstSave = () => {
      let release: () => void = () => {};
      code.saveDraft.mockImplementation((id: number, text: string) => {
        if (code.saveDraft.mock.calls.length === 1) return new Promise((r) => { release = () => { server[id].drafts = text; r({}); }; });
        server[id].drafts = text; return Promise.resolve({});
      });
      return () => release();
    };
    const openDrive = async () => {
      const h = renderHook(() => useCodeController(props));
      await waitFor(() => expect(h.result.current.files.length).toBe(2));
      act(() => h.result.current.setSelectedFile(FILES[0] as any));
      await waitFor(() => expect(h.result.current.code).toBe('class Drive {}'));
      return h;
    };

    it('a drafts revert while a commit waits stops the commit instead of publishing other text', async () => {
      const release = slowFirstSave();
      const { result } = await openDrive();
      act(() => result.current.editCode('v1'));
      await waitFor(() => expect(code.saveDraft).toHaveBeenCalledTimes(1), { timeout: 4500 });
      act(() => { result.current.editCode('v2'); result.current.setCommitMessage('ship'); });
      let commit!: Promise<void>;
      let revert!: Promise<void>;
      act(() => { commit = result.current.handleCommit(); });
      act(() => { revert = result.current.handleRevert(101, 'drafts') as Promise<void>; });
      await act(async () => { release(); await commit; await revert; });
      expect(code.commitToMain).not.toHaveBeenCalled();
      expect(code.saveDraft.mock.calls.map((c) => c[1])).toEqual(['v1']);
      expect(code.revertCommit).toHaveBeenCalledWith(101, 'drafts', 7);
      expect(result.current.error).toMatch(/reverted meanwhile/);
    }, 15000);

    it('a failed drafts revert saves the newer text it had dropped', async () => {
      const release = slowFirstSave();
      code.revertCommit.mockRejectedValue(new Error('boom'));
      const { result } = await openDrive();
      act(() => result.current.editCode('v1'));
      await waitFor(() => expect(code.saveDraft).toHaveBeenCalledTimes(1), { timeout: 4500 });
      act(() => result.current.editCode('v2'));
      await act(async () => { await new Promise((r) => setTimeout(r, 3300)); }); // second auto-save queued
      let revert!: Promise<void>;
      act(() => { revert = result.current.handleRevert(101, 'drafts') as Promise<void>; });
      await act(async () => { release(); await revert; });
      await waitFor(() => expect(code.saveDraft.mock.calls.map((c) => c[1])).toEqual(['v1', 'v2']));
      expect(server[1].drafts).toBe('v2');
      expect(result.current.error).toMatch(/Failed to revert/);
    }, 15000);

    it("a second revert while one runs is ignored, so a failed one can't race it", async () => {
      let fail: () => void = () => {};
      code.revertCommit.mockImplementation(() => new Promise((_r, rej) => { fail = () => rej(new Error('boom')); }));
      const { result } = await openDrive();
      let a!: Promise<void>;
      let b!: Promise<void>;
      act(() => { a = result.current.handleRevert(101, 'drafts') as Promise<void>; });
      await waitFor(() => expect(code.revertCommit).toHaveBeenCalledTimes(1));
      act(() => { b = result.current.handleRevert(102, 'drafts') as Promise<void>; });
      await act(async () => { fail(); await a; await b; });
      expect(code.revertCommit).toHaveBeenCalledTimes(1);
      // …and once it has finished, reverting works again.
      code.revertCommit.mockResolvedValue({});
      await act(async () => { await result.current.handleRevert(102, 'drafts'); });
      expect(code.revertCommit).toHaveBeenCalledTimes(2);
    });

    it('a main revert leaves queued draft saves alone', async () => {
      const release = slowFirstSave();
      const { result } = await openDrive();
      act(() => result.current.editCode('v1'));
      await waitFor(() => expect(code.saveDraft).toHaveBeenCalledTimes(1), { timeout: 4500 });
      act(() => result.current.editCode('v2'));
      await act(async () => { await new Promise((r) => setTimeout(r, 3300)); }); // second auto-save queued
      let revert!: Promise<void>;
      act(() => { revert = result.current.handleRevert(101, 'main') as Promise<void>; });
      await act(async () => { release(); await revert; });
      await waitFor(() => expect(code.saveDraft.mock.calls.map((c) => c[1])).toEqual(['v1', 'v2']));
      expect(server[1].drafts).toBe('v2');
      expect(code.revertCommit).toHaveBeenCalledWith(101, 'main', 7);
    }, 15000);
  });
});

describe('Code IDE layout', () => {
  it('explorer on the left, editor with its tab, and a status bar', async () => {
    setup();
    const explorer = screen.getByRole('complementary', { name: 'Explorer' });
    expect(await within(explorer).findByRole('list', { name: 'Code files' })).toBeInTheDocument();
    await open('Drive.java');
    const editor = screen.getByRole('region', { name: 'Editor' });
    expect(within(editor).getByText('Drive.java')).toBeInTheDocument();
    const bar = screen.getByRole('contentinfo');
    expect(within(bar).getByText('drafts')).toBeInTheDocument();
    expect(within(bar).getByRole('status')).toHaveTextContent(/saved|Unsaved|Saving/);
  });

  it("Files drawer interaction: opening it and picking a file closes it (breakpoints and bounds are checked in a real browser, see PR)", async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Open the file explorer' }));
    const drawer = await screen.findByRole('dialog');
    fireEvent.click(await within(drawer).findByRole('button', { name: /Drive\.java/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByLabelText('Code editor')).toHaveValue(server[1].drafts));
  });
});
