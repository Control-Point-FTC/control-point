import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));
const ai = vi.hoisted(() => ({ streamBuildHelper: vi.fn() }));
vi.mock('../../services/aiService', async (orig) => ({ ...(await orig<object>()), ...ai }));

import { ImportEmailDialog, QuickAddDialog } from '../pages/communication/LogDialogs';
import { clearDrafts } from '../drafts';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
Element.prototype.scrollIntoView ??= function () {} as any;
const json = (body: any, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 400, json: async () => body });
const lastBody = () => JSON.parse(api.apiFetch.mock.calls.at(-1)![1].body);
const threads = [{ id: 9, subject: 'Filament sponsorship', recipient: 'sponsors@polymaker.com', date: '2026-09-01' }];

beforeEach(() => {
  api.apiFetch.mockReset();
  api.apiFetch.mockImplementation(() => json({ id: 1 }));
  ai.streamBuildHelper.mockReset();
  clearDrafts();
});
afterEach(cleanup);

describe('Modern Bruno quick add', () => {
  it('Bruno fills the review form (with the thread), then it logs the same body as Classic', async () => {
    ai.streamBuildHelper.mockImplementation(async (_m: any, onChunk: (c: string) => void) => {
      onChunk('```communications\n[{"recipient":"sponsors@polymaker.com","subject":"Re: Filament sponsorship","body":"Thanks!","date":"2026-10-01","type":"email","direction":"inbound","parent_id":9}]\n```');
    });
    const onLogged = vi.fn();
    render(<QuickAddDialog threads={threads} onClose={vi.fn()} onLogged={onLogged} />);
    fireEvent.change(screen.getByLabelText('Email to parse'), { target: { value: 'From: sponsors@polymaker.com …' } });
    fireEvent.click(screen.getByRole('button', { name: /Parse with Bruno/ }));
    expect(await screen.findByLabelText('Recipient')).toHaveValue('sponsors@polymaker.com');
    expect(screen.getByRole('radio', { name: /They did/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('combobox', { name: 'Thread' })).toHaveTextContent('Filament sponsorship');
    fireEvent.click(screen.getByRole('button', { name: 'Log it' }));
    await waitFor(() => expect(onLogged).toHaveBeenCalled());
    expect(api.apiFetch.mock.calls.at(-1)![0]).toBe('/api/communications');
    expect(lastBody()).toEqual({ recipient: 'sponsors@polymaker.com', subject: 'Re: Filament sponsorship', body: 'Thanks!', date: '2026-10-01 12:00', type: 'email', direction: 'inbound', parent_id: 9 });
  });

  it('manual entry survives a remount (look switch), and closing discards it', async () => {
    const first = render(<QuickAddDialog threads={threads} onClose={vi.fn()} onLogged={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fill in the fields myself' }));
    fireEvent.change(await screen.findByLabelText('Recipient'), { target: { value: 'coach@school.org' } });
    first.unmount();
    const onClose = vi.fn();
    render(<QuickAddDialog threads={threads} onClose={onClose} onLogged={vi.fn()} />);
    expect(screen.getByLabelText('Recipient')).toHaveValue('coach@school.org');
    fireEvent.keyDown(screen.getByLabelText('Recipient'), { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    cleanup();
    render(<QuickAddDialog threads={threads} onClose={vi.fn()} onLogged={vi.fn()} />);
    expect(screen.getByLabelText('Email to parse')).toHaveValue('');
  });

  it('logging needs a recipient and a subject', async () => {
    render(<QuickAddDialog threads={threads} onClose={vi.fn()} onLogged={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fill in the fields myself' }));
    expect(await screen.findByRole('button', { name: 'Log it' })).toBeDisabled();
  });
});

describe('Modern saved-email import', () => {
  it('reads a pasted email, lets Bruno refine it, and logs it', async () => {
    const onLogged = vi.fn();
    render(<ImportEmailDialog onClose={vi.fn()} onLogged={onLogged} />);
    fireEvent.click(screen.getByRole('button', { name: /Paste the email text instead/ }));
    fireEvent.change(screen.getByLabelText('Saved email text'), { target: { value: 'To: mentor@team.org\nSubject: Practice moved\nDate: 2026-10-02 18:00\n\nPractice is on Thursday.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Read it' }));
    expect(await screen.findByLabelText('Recipient')).toHaveValue('mentor@team.org');
    expect(screen.getByLabelText('Subject')).toHaveValue('Practice moved');
    ai.streamBuildHelper.mockImplementation(async (_m: any, onChunk: (c: string) => void) => {
      onChunk('```communications\n[{"recipient":"mentor@team.org","subject":"Practice moved to Thursday","body":"Practice is on Thursday.","date":"2026-10-02","type":"announcement","direction":"outbound"}]\n```');
    });
    fireEvent.click(screen.getByRole('button', { name: /Refine with Bruno/ }));
    await waitFor(() => expect(screen.getByLabelText('Subject')).toHaveValue('Practice moved to Thursday'));
    fireEvent.click(screen.getByRole('button', { name: 'Log it' }));
    await waitFor(() => expect(onLogged).toHaveBeenCalled());
    expect(lastBody()).toMatchObject({ recipient: 'mentor@team.org', subject: 'Practice moved to Thursday', type: 'announcement', direction: 'outbound' });
  });

  it('a too-large file is refused with a message', () => {
    render(<ImportEmailDialog onClose={vi.fn()} onLogged={vi.fn()} />);
    const big = new File(['x'], 'huge.html');
    Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 });
    fireEvent.change(screen.getByLabelText('Choose a saved email file'), { target: { files: [big] } });
    expect(screen.getByRole('alert')).toHaveTextContent('over 5 MB');
  });
});
