import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import '../../i18n';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));
const dialog = vi.hoisted(() => ({ notify: vi.fn(), confirmDialog: vi.fn() }));
vi.mock('../../components/dialog', async (orig) => ({ ...(await orig<object>()), ...dialog }));

import { ReactionsSection } from '../pages/settings/ReactionsSection';
import { SettingsPage } from '../pages/settings/SettingsPage';
import { EmojiPicker } from '../pages/messages/Reactions';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
Element.prototype.scrollIntoView ??= function () {};
const json = (body: any, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 400, json: async () => body });
const emoji = (id: number) => ({ id, name: `r${id}`, image_url: `/api/files/${id}` });

let list: any[] = [];
beforeEach(() => {
  list = [];
  api.apiFetch.mockReset();
  api.apiFetch.mockImplementation((url: string, init?: RequestInit) => {
    if (url === '/api/chat/custom-emoji' && !init?.method) return json(list);
    if (url === '/api/chat/custom-emoji' && init?.method === 'POST') return json({ ok: true, id: 9, name: 'zog_hype', image_url: '/api/files/9' });
    if (url.startsWith('/api/chat/custom-emoji/') && init?.method === 'DELETE') return json({ ok: true });
    return json({});
  });
  dialog.notify.mockReset();
  dialog.confirmDialog.mockReset();
  dialog.confirmDialog.mockResolvedValue(true);
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

const png = () => new File(['x'], 'hype.png', { type: 'image/png' });
const calls = (method?: string) => api.apiFetch.mock.calls.filter((c) => (c[1]?.method ?? 'GET') === (method ?? 'GET'));

describe('Settings → Reactions', () => {
  it('is a section of the Settings page, deep-linked by ?section=reactions', async () => {
    render(<MemoryRouter initialEntries={['/settings?section=reactions']}><SettingsPage currentUser={{ id: 7 }} teams={[]} /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Reactions' })).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByText(/No custom reactions yet/)).toBeInTheDocument();
    expect(api.apiFetch).toHaveBeenCalledWith('/api/chat/custom-emoji');
  });

  it('lists your reactions from GET /api/chat/custom-emoji', async () => {
    list = [emoji(1), emoji(2)];
    render(<ReactionsSection />);
    const grid = await screen.findByRole('list', { name: 'Your custom reactions' });
    expect(within(grid).getAllByRole('listitem')).toHaveLength(2);
    expect(within(grid).getByAltText('r1')).toHaveAttribute('src', expect.stringContaining('/api/files/1'));
    expect(screen.getByText('My custom reactions · 2/25')).toBeInTheDocument();
    expect(calls('GET').map((c) => c[0])).toEqual(['/api/chat/custom-emoji']);
  });

  it('uploads multipart form data (image + cleaned name) with no JSON Content-Type', async () => {
    render(<ReactionsSection />);
    await screen.findByText(/No custom reactions yet/);
    const upload = screen.getByRole('button', { name: 'Upload reaction' });
    expect(upload).toBeDisabled();
    const file = png();
    fireEvent.change(screen.getByTestId('reaction-file'), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  zog hype ' } });
    fireEvent.click(upload);
    await waitFor(() => expect(calls('POST')).toHaveLength(1));
    const [url, init] = calls('POST')[0];
    expect(url).toBe('/api/chat/custom-emoji');
    expect(init.headers).toBeUndefined();
    const body = init.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('name')).toBe('zog_hype');
    expect((body.get('image') as File).name).toBe('hype.png');
    expect(await screen.findByAltText('zog_hype')).toBeInTheDocument();
    expect(dialog.notify).toHaveBeenCalledWith(':zog_hype: added — only you can use it.', 'success');
    expect(screen.getByLabelText('Name')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Upload reaction' })).toBeDisabled();
  });

  it('refuses non-images and a missing name without calling the server', async () => {
    render(<ReactionsSection />);
    await screen.findByText(/No custom reactions yet/);
    fireEvent.change(screen.getByTestId('reaction-file'), { target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] } });
    expect(dialog.notify).toHaveBeenCalledWith('Pick an image file (PNG, JPG, GIF, WebP).', 'error');
    fireEvent.change(screen.getByTestId('reaction-file'), { target: { files: [png()] } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload reaction' }));
    expect(dialog.notify).toHaveBeenLastCalledWith('Give your reaction a name.', 'error');
    expect(calls('POST')).toHaveLength(0);
  });

  it('shows the server error when an upload is refused', async () => {
    api.apiFetch.mockImplementation((url: string, init?: RequestInit) =>
      init?.method === 'POST' ? json({ error: 'You have 25 custom reactions — delete one to add another' }, false) : json([]));
    render(<ReactionsSection />);
    await screen.findByText(/No custom reactions yet/);
    fireEvent.change(screen.getByTestId('reaction-file'), { target: { files: [png()] } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'robo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload reaction' }));
    await waitFor(() => expect(dialog.notify).toHaveBeenCalledWith('You have 25 custom reactions — delete one to add another', 'error'));
    expect(screen.queryByAltText('robo')).toBeNull();
  });

  it('stops at 25: uploads are disabled until one is deleted', async () => {
    list = Array.from({ length: 25 }, (_, i) => emoji(i + 1));
    render(<ReactionsSection />);
    const limit = await screen.findByRole('button', { name: 'Limit reached (25): delete one first' });
    expect(limit).toBeDisabled();
    expect(screen.getByText('My custom reactions · 25/25')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose reaction image' })).toBeDisabled();
    expect(screen.getByLabelText('Name')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete :r3:' }));
    await waitFor(() => expect(screen.getByText('My custom reactions · 24/25')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Upload reaction' })).toBeDisabled(); // still needs an image
    expect(screen.getByRole('button', { name: 'Choose reaction image' })).toBeEnabled();
    expect(screen.getByText('1 slot left.')).toBeInTheDocument();
  });

  it('deletes with DELETE /api/chat/custom-emoji/:id after confirming', async () => {
    list = [emoji(4), emoji(5)];
    render(<ReactionsSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete :r4:' }));
    expect(dialog.confirmDialog).toHaveBeenCalledWith(expect.objectContaining({ title: 'Delete custom reaction?', danger: true }));
    await waitFor(() => expect(screen.queryByAltText('r4')).toBeNull());
    expect(calls('DELETE')).toEqual([['/api/chat/custom-emoji/4', { method: 'DELETE' }]]);
    expect(screen.getByAltText('r5')).toBeInTheDocument();
    expect(dialog.notify).toHaveBeenCalledWith('Reaction deleted.', 'success');
  });

  it('keeps the reaction when the delete is cancelled or fails', async () => {
    list = [emoji(4)];
    render(<ReactionsSection />);
    dialog.confirmDialog.mockResolvedValueOnce(false);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete :r4:' }));
    await waitFor(() => expect(dialog.confirmDialog).toHaveBeenCalled());
    expect(calls('DELETE')).toHaveLength(0);
    api.apiFetch.mockImplementation(() => json({ error: 'Reaction not found' }, false));
    fireEvent.click(screen.getByRole('button', { name: 'Delete :r4:' }));
    await waitFor(() => expect(dialog.notify).toHaveBeenCalledWith('Reaction not found', 'error'));
    expect(screen.getByAltText('r4')).toBeInTheDocument();
  });
});

describe('Emoji picker hint', () => {
  it('links to Settings → Reactions and closes the picker', async () => {
    const onClose = vi.fn();
    const Where = () => <p data-testid="where">{useLocation().pathname + useLocation().search}</p>;
    render(
      <MemoryRouter initialEntries={['/messages']}>
        <Routes><Route path="*" element={<><EmojiPicker onPick={vi.fn()} onClose={onClose} /><Where /></>} /></Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('link', { name: 'Upload your own in Settings → Reactions' }));
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByTestId('where')).toHaveTextContent('/settings?section=reactions');
  });
});
