import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';

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

describe('10c review fixes', () => {
  it("a Bruno reply for a closed dialog never fills the reopened one", async () => {
    let reply: () => void = () => {};
    ai.streamBuildHelper.mockImplementation((_m: any, onChunk: (c: string) => void) => new Promise<void>((r) => {
      reply = () => { onChunk('```communications\n[{"recipient":"old@x.test","subject":"Old","body":"","date":"2026-10-01","type":"email","direction":"outbound"}]\n```'); r(); };
    }));
    const first = render(<QuickAddDialog threads={threads} onClose={vi.fn()} onLogged={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Email to parse'), { target: { value: 'old email' } });
    fireEvent.click(screen.getByRole('button', { name: /Parse with Bruno/ }));
    fireEvent.keyDown(screen.getByLabelText('Email to parse'), { key: 'Escape' }); // close: discards the session
    first.unmount();
    render(<QuickAddDialog threads={threads} onClose={vi.fn()} onLogged={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fill in the fields myself' }));
    fireEvent.change(await screen.findByLabelText('Recipient'), { target: { value: 'new@x.test' } });
    await act(async () => { reply(); });
    expect(screen.getByLabelText('Recipient')).toHaveValue('new@x.test');
  });

  it('a save that lands after its dialog closed refreshes the log but leaves the new entry alone', async () => {
    let finish: () => void = () => {};
    api.apiFetch.mockImplementation(() => new Promise((r) => { finish = () => r({ ok: true, status: 200, json: async () => ({ id: 1 }) }); }));
    const firstLogged = vi.fn();
    const first = render(<QuickAddDialog threads={threads} onClose={vi.fn()} onLogged={firstLogged} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fill in the fields myself' }));
    fireEvent.change(await screen.findByLabelText('Recipient'), { target: { value: 'a@x.test' } });
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'First' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log it' }));
    fireEvent.keyDown(screen.getByLabelText('Subject'), { key: 'Escape' });
    first.unmount();
    const onLogged = vi.fn(); const onRefresh = vi.fn();
    render(<QuickAddDialog threads={threads} onClose={vi.fn()} onLogged={onLogged} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fill in the fields myself' }));
    fireEvent.change(await screen.findByLabelText('Recipient'), { target: { value: 'b@x.test' } });
    await act(async () => { finish(); });
    expect(screen.getByLabelText('Recipient')).toHaveValue('b@x.test');
    expect(onLogged).not.toHaveBeenCalled();
    expect(firstLogged).not.toHaveBeenCalled();
  });

  it('the thread picker searches every thread, not just the first 200', async () => {
    ai.streamBuildHelper.mockImplementation(async () => {});
    const many = Array.from({ length: 260 }, (_, i) => ({ id: i + 1, subject: `Thread ${i + 1}`, recipient: `p${i + 1}@x.test`, date: '2026-09-01' }));
    render(<QuickAddDialog threads={many} onClose={vi.fn()} onLogged={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fill in the fields myself' }));
    fireEvent.click(await screen.findByRole('combobox', { name: 'Thread' }));
    fireEvent.change(await screen.findByPlaceholderText('Search threads…'), { target: { value: 'Thread 250' } });
    fireEvent.click(await screen.findByRole('option', { name: /Thread 250/ }));
    expect(screen.getByRole('combobox', { name: 'Thread' })).toHaveTextContent('Thread 250');
  });
});

