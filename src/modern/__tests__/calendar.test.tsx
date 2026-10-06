import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));
const ai = vi.hoisted(() => ({ streamBuildHelper: vi.fn(), applyActionProposals: vi.fn(), notifyBrunoDataChanged: vi.fn() }));
vi.mock('../../services/aiService', async (orig) => ({ ...(await orig<object>()), ...ai }));
const dialog = vi.hoisted(() => ({ confirmDialog: vi.fn(), notify: vi.fn() }));
vi.mock('../../components/dialog', async (orig) => ({ ...(await orig<object>()), ...dialog }));

import { InterfaceModeProvider } from '../interfaceMode';
import { CalendarPage } from '../pages/calendar/CalendarPage';
import { clearDrafts } from '../drafts';
import { toDateKey } from '../../components/calendar/useCalendarController';

afterEach(cleanup);
beforeEach(() => {
  api.apiFetch.mockReset();
  api.apiFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
  ai.streamBuildHelper.mockReset();
  ai.applyActionProposals.mockReset();
  dialog.confirmDialog.mockReset();
  dialog.confirmDialog.mockResolvedValue(true);
  clearDrafts();
});

const me = { id: 7, name: 'Ada', team_id: 1, interface_mode: 'modern' };
const now = new Date();
const today = toDateKey(now);
const later = toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
const baseEvents = [
  { id: 1, title: 'Build night', date: later, start_time: '23:00', end_time: '23:30', event_type: 'meeting', location: 'Shop', team_id: 1 },
  { id: 2, title: 'Qualifier', date: later, start_time: '23:40', event_type: 'competition' },
];

function setup({ manage = true, events = baseEvents } = {}) {
  const props = {
    events, setEvents: vi.fn(), teams: [{ id: 1, name: 'Team', number: 123 }],
    refresh: { events: vi.fn() }, currentUser: me,
    hasScope: (s: string) => (s === 'calendar' ? manage : false),
  };
  const utils = render(
    <InterfaceModeProvider user={me} team={{}} onUserSaved={() => {}}>
      <MemoryRouter initialEntries={['/calendar']}><CalendarPage {...props} /></MemoryRouter>
    </InterfaceModeProvider>,
  );
  return { ...utils, props };
}

describe('Modern Calendar', () => {
  it('lists upcoming events and opens a details sheet for members (no Edit/Delete)', async () => {
    setup({ manage: false });
    expect(screen.queryByRole('button', { name: /New event/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /Build night/ })[0]);
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('Shop')).toBeInTheDocument();
    expect(within(sheet).getByText('Team #123')).toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: /Edit/ })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
  });

  it('managers create with the same POST body as Legacy', async () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: /New event/ }));
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Scrimmage' } });
    fireEvent.change(screen.getByLabelText(/Starts/), { target: { value: '18:00' } });
    fireEvent.click(screen.getByRole('radio', { name: /Competition/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Create event' }));
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/events', expect.objectContaining({ method: 'POST' })));
    expect(JSON.parse(api.apiFetch.mock.calls[0][1].body)).toEqual({
      title: 'Scrimmage', description: '', date: today, start_time: '18:00', end_time: '', location: '',
      event_type: 'competition', team_id: null, created_by: 7,
    });
    expect(props.setEvents).toHaveBeenCalled();
    await waitFor(() => expect(props.refresh.events).toHaveBeenCalled());
  });

  it('edits with PATCH and deletes after confirm from the details sheet', async () => {
    setup();
    fireEvent.click(screen.getAllByRole('button', { name: /Build night/ })[0]);
    let sheet = await screen.findByRole('dialog');
    fireEvent.click(within(sheet).getByRole('button', { name: /Edit/ }));
    const title = await screen.findByLabelText('Title');
    fireEvent.change(title, { target: { value: 'Build night (late)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/events/1', expect.objectContaining({ method: 'PATCH' })));
    expect(JSON.parse(api.apiFetch.mock.calls[0][1].body)).toMatchObject({ title: 'Build night (late)', team_id: 1, created_by: 7 });

    fireEvent.click(screen.getAllByRole('button', { name: /Qualifier/ })[0]);
    sheet = await screen.findByRole('dialog');
    fireEvent.click(within(sheet).getByRole('button', { name: /Delete/ }));
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/events/2', { method: 'DELETE' }));
    expect(dialog.confirmDialog).toHaveBeenCalledWith(expect.objectContaining({ message: 'Delete "Qualifier"?' }));
  });

  it('cancelled delete sends nothing', async () => {
    dialog.confirmDialog.mockResolvedValue(false);
    setup();
    fireEvent.click(screen.getAllByRole('button', { name: /Qualifier/ })[0]);
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /Delete/ }));
    await waitFor(() => expect(dialog.confirmDialog).toHaveBeenCalled());
    expect(api.apiFetch).not.toHaveBeenCalled();
  });

  it('a half-written new event survives a remount (mode switch)', async () => {
    const first = setup();
    fireEvent.click(screen.getByRole('button', { name: /New event/ }));
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Outreach fair' } });
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Library' } });
    first.unmount();
    setup();
    expect(((await screen.findByLabelText('Title')) as HTMLInputElement).value).toBe('Outreach fair');
    expect((screen.getByLabelText('Location') as HTMLInputElement).value).toBe('Library');
  });

  it('Bruno quick-add: one event fills the form, several can be created together', async () => {
    ai.streamBuildHelper.mockImplementation(async (_m: any, onChunk: (c: string) => void) => {
      onChunk('```event\n[{"title":"Parent night","date":"' + later + '","time":"18:00"}]\n```');
    });
    setup();
    fireEvent.click(screen.getByRole('button', { name: /New event/ }));
    fireEvent.change(await screen.findByLabelText(/Quick add with Bruno/), { target: { value: 'parent night tomorrow 6pm' } });
    fireEvent.click(screen.getByRole('button', { name: /Parse/ }));
    await waitFor(() => expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Parent night'));
    expect((screen.getByLabelText(/Starts/) as HTMLInputElement).value).toBe('18:00');

    ai.streamBuildHelper.mockImplementation(async (_m: any, onChunk: (c: string) => void) => {
      onChunk('```event\n[{"title":"A","date":"' + later + '"},{"title":"B","date":"' + later + '"}]\n```');
    });
    ai.applyActionProposals.mockResolvedValue({ event: 2 });
    fireEvent.change(screen.getByLabelText(/Quick add with Bruno/), { target: { value: 'two things' } });
    fireEvent.click(screen.getByRole('button', { name: /Parse/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Create all 2 events/ }));
    await waitFor(() => expect(ai.applyActionProposals).toHaveBeenCalledWith([{ kind: 'event', items: [expect.objectContaining({ title: 'A' }), expect.objectContaining({ title: 'B' })] }]));
  });

  it('switches between Month, Week and Agenda', async () => {
    setup();
    expect(screen.getByRole('grid')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Agenda' }));
    await waitFor(() => expect(screen.queryByRole('grid')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('radio', { name: 'Week' }));
    expect(await screen.findAllByRole('button', { name: /Add event on/ })).toHaveLength(7);
  });

  it('type filter hides other types', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Competition', pressed: false }));
    await waitFor(() => expect(screen.queryAllByRole('button', { name: /Build night/ })).toHaveLength(0));
    expect(screen.getAllByRole('button', { name: /Qualifier/ }).length).toBeGreaterThan(0);
  });
});
