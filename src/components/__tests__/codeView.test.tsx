// Legacy CodeView now runs on the shared useCodeController: a smoke test that
// it still opens files, edits on drafts and shares the editor buffer draft.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange }: any) => <textarea aria-label="Code editor" value={value} onChange={(e) => onChange?.(e.target.value)} />,
  DiffEditor: () => null,
}));
const code = vi.hoisted(() => ({
  getCodeFiles: vi.fn(), createCodeFile: vi.fn(), getCodeFileContent: vi.fn(), saveDraft: vi.fn(), commitToMain: vi.fn(),
  getCommitHistory: vi.fn(), getCommit: vi.fn(), downloadCodeFile: vi.fn(), deleteCodeFile: vi.fn(), revertCommit: vi.fn(),
}));
vi.mock('../../services/codeService', () => code);
const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));

import { CodeView } from '../CodeView';
import { clearDrafts, getDraft } from '../../modern/drafts';

beforeEach(() => {
  Object.values(code).forEach((f) => f.mockReset());
  code.getCodeFiles.mockResolvedValue([{ id: 1, file_name: 'Drive.java', language: 'java' }]);
  code.getCodeFileContent.mockResolvedValue({ content: { drafts: 'class Drive {}', main: '' } });
  code.getCommitHistory.mockResolvedValue([]);
  api.apiFetch.mockReset();
  api.apiFetch.mockResolvedValue({ ok: true, json: async () => null });
  clearDrafts();
});
afterEach(cleanup);

describe('Legacy CodeView on the shared controller', () => {
  it('opens a file and edits the shared drafts buffer', async () => {
    render(<CodeView teams={[{ id: 1, name: 'Robo' } as any]} members={[]} currentUser={{ id: 7 } as any} onRefresh={() => {}} setLoading={() => {}} hasScope={() => true} activeTeamId={1} />);
    await waitFor(() => expect(code.getCodeFiles).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: 'Drive.java' }));
    await waitFor(() => expect(screen.getByLabelText('Code editor')).toHaveValue('class Drive {}'));
    fireEvent.change(screen.getByLabelText('Code editor'), { target: { value: 'class Drive { x }' } });
    expect(getDraft<any>('code:buffer', null)).toMatchObject({ fileId: 1, branch: 'drafts', text: 'class Drive { x }', unsaved: true });
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });
});
