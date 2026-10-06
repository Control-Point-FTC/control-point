import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));
const dialog = vi.hoisted(() => ({ notify: vi.fn(), confirmDialog: vi.fn() }));
vi.mock('../../components/dialog', async (orig) => ({ ...(await orig<object>()), ...dialog }));

import { InterfaceModeProvider } from '../interfaceMode';
import { CommunicationPage } from '../pages/communication/CommunicationPage';
import { clearDrafts } from '../drafts';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
const json = (body: any, ok = true) => Promise.resolve({ ok, json: async () => body });
const me = { id: 7, name: 'Ada', team_id: 1, interface_mode: 'modern' };
const COMMS = [
  { id: 1, recipient: 'Acme Robotics', subject: 'Sponsorship', body: 'Would you sponsor us?', type: 'email', date: '2026-09-01 10:00', direction: 'outbound' },
  { id: 2, parent_id: 1, recipient: 'Acme Robotics', subject: 'Sponsorship', body: 'Yes — $500!', type: 'email', date: '2026-09-03 09:00', direction: 'inbound' },
  { id: 3, recipient: 'Parents', subject: 'Practice moved', body: 'Saturday instead', type: 'announcement', date: '2026-09-05 18:00', direction: 'outbound' },
];

afterEach(cleanup);
beforeEach(() => {
  api.apiFetch.mockReset();
  api.apiFetch.mockImplementation((url: string, init?: any) => (url === '/api/communications' && init?.method === 'POST' ? json({ id: 42 }) : json({})));
  dialog.confirmDialog.mockReset();
  dialog.confirmDialog.mockResolvedValue(true);
  clearDrafts();
});

function setup(manage = true) {
  const props = { communications: COMMS, setCommunications: vi.fn(), refresh: { communications: vi.fn() }, hasScope: (s: string) => manage && s === 'communications' };
  const utils = render(
    <InterfaceModeProvider user={me} team={{}} onUserSaved={() => {}}>
      <MemoryRouter><CommunicationPage {...props} /></MemoryRouter>
    </InterfaceModeProvider>,
  );
  return { ...utils, props };
}
const body = (url: string, method: string) => JSON.parse(api.apiFetch.mock.calls.find((c) => c[0] === url && c[1]?.method === method)![1].body);

describe('Modern Communication', () => {
  it('threads entries, newest activity first, and filters to awaiting replies', () => {
    setup();
    const list = screen.getByRole('list', { name: 'Conversations' });
    const items = within(list).getAllByRole('button');
    expect(items[0]).toHaveTextContent('Parents');
    expect(items[1]).toHaveTextContent('Acme Robotics');
    expect(items[1]).toHaveTextContent('2 entries');
    fireEvent.click(screen.getByRole('radio', { name: 'Awaiting reply' }));
    expect(within(screen.getByRole('list', { name: 'Conversations' })).getAllByRole('button')).toHaveLength(1);
  });

  it('logs a message with the Legacy body, then offers to log their reply', async () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: /Log message/ }));
    fireEvent.change(await screen.findByLabelText('To'), { target: { value: 'Venue' } });
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Booking' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Can we book Saturday?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log message', hidden: false }));
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/communications', expect.objectContaining({ method: 'POST' })));
    expect(body('/api/communications', 'POST')).toMatchObject({ recipient: 'Venue', subject: 'Booking', body: 'Can we book Saturday?', type: 'email' });
    expect(props.refresh.communications).toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, log their reply' }));
    fireEvent.change(await screen.findByLabelText('Message'), { target: { value: 'Saturday works' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to thread' }));
    await waitFor(() => expect(api.apiFetch.mock.calls.filter((c) => c[0] === '/api/communications' && c[1]?.method === 'POST')).toHaveLength(2));
    const reply = JSON.parse(api.apiFetch.mock.calls.filter((c) => c[0] === '/api/communications')[1][1].body);
    expect(reply).toMatchObject({ parent_id: 42, recipient: 'Venue', subject: 'Booking', body: 'Saturday works', direction: 'inbound', type: 'email' });
  });

  it('edits an entry (PUT) and deletes a thread after confirm', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Acme Robotics/ }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit entry' })[1]);
    fireEvent.change(await screen.findByLabelText('Message'), { target: { value: 'Yes — $750!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/communications/2', expect.objectContaining({ method: 'PUT' })));
    expect(body('/api/communications/2', 'PUT')).toMatchObject({ body: 'Yes — $750!', direction: 'inbound' });
    fireEvent.click(screen.getByRole('button', { name: 'Delete thread' }));
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/communications/1', { method: 'DELETE' }));
  });

  it('read-only without the communications scope', () => {
    setup(false);
    expect(screen.queryByRole('button', { name: /Log message/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Log their reply/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit entry' })).not.toBeInTheDocument();
  });

  it('a half-written log survives a remount (mode switch)', async () => {
    const first = setup();
    fireEvent.click(screen.getByRole('button', { name: /Log message/ }));
    fireEvent.change(await screen.findByLabelText('To'), { target: { value: 'Mayor' } });
    first.unmount();
    setup();
    expect(((await screen.findByLabelText('To')) as HTMLInputElement).value).toBe('Mayor');
  });
});
