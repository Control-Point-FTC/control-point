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
import { ContextMenuProvider } from '../../components/contextmenu/ContextMenuProvider';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
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
      <MemoryRouter initialEntries={['/calendar']}><ContextMenuProvider><CalendarPage {...props} /></ContextMenuProvider></MemoryRouter>
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
      event_type: 'competition', team_id: null, created_by: 7, reminder_minutes: null, repeat: null,
    });
    expect(props.setEvents).toHaveBeenCalled();
    await waitFor(() => expect(props.refresh.events).toHaveBeenCalled());
  });

  it('an end time before the start is flagged inline, blocks saving, and correcting it unblocks (H-1)', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /New event/ }));
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Practice' } });
    fireEvent.change(screen.getByLabelText(/Starts/), { target: { value: '15:59' } });
    fireEvent.change(screen.getByLabelText(/Ends/), { target: { value: '04:59' } });
    expect(screen.getByRole('alert')).toHaveTextContent('End time must be after the start time');
    expect(screen.getByLabelText(/Ends/)).toHaveAttribute('aria-invalid', 'true');
    const create = screen.getByRole('button', { name: 'Create event' });
    expect(create).toBeDisabled();
    fireEvent.click(create);
    expect(api.apiFetch).not.toHaveBeenCalledWith('/api/events', expect.anything());
    // Fixing the time clears the error immediately — no dead end.
    fireEvent.change(screen.getByLabelText(/Ends/), { target: { value: '16:59' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(create).toBeEnabled();
    fireEvent.click(create);
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/events', expect.objectContaining({ method: 'POST' })));
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
    fireEvent.change(await screen.findByLabelText(/Quick add with Bruno/, {}, { timeout: 5000 }), { target: { value: 'parent night tomorrow 6pm' } });
    fireEvent.click(screen.getByRole('button', { name: /Parse/ }));
    await waitFor(() => expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Parent night'), { timeout: 5000 });
    expect((screen.getByLabelText(/Starts/) as HTMLInputElement).value).toBe('18:00');

    ai.streamBuildHelper.mockImplementation(async (_m: any, onChunk: (c: string) => void) => {
      onChunk('```event\n[{"title":"A","date":"' + later + '"},{"title":"B","date":"' + later + '"}]\n```');
    });
    ai.applyActionProposals.mockResolvedValue({ event: 2 });
    fireEvent.change(screen.getByLabelText(/Quick add with Bruno/), { target: { value: 'two things' } });
    fireEvent.click(screen.getByRole('button', { name: /Parse/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Create all 2 events/ }, { timeout: 5000 }));
    await waitFor(() => expect(ai.applyActionProposals).toHaveBeenCalledWith([{ kind: 'event', items: [expect.objectContaining({ title: 'A' }), expect.objectContaining({ title: 'B' })] }]), { timeout: 5000 });
  }, 20000);

  it('Bruno quick-add keeps a range: "from 3 to 5pm" fills Starts and Ends (L-2)', async () => {
    ai.streamBuildHelper.mockImplementation(async (_m: any, onChunk: (c: string) => void) => {
      onChunk('```event\n[{"title":"Build session","date":"' + later + '","time":"15:00","end":"17:00"}]\n```');
    });
    setup();
    fireEvent.click(screen.getByRole('button', { name: /New event/ }));
    fireEvent.change(await screen.findByLabelText(/Quick add with Bruno/, {}, { timeout: 5000 }), { target: { value: 'build session from 3 to 5pm' } });
    fireEvent.click(screen.getByRole('button', { name: /Parse/ }));
    await waitFor(() => expect((screen.getByLabelText(/Starts/) as HTMLInputElement).value).toBe('15:00'), { timeout: 5000 });
    expect((screen.getByLabelText(/Ends/) as HTMLInputElement).value).toBe('17:00');
  }, 20000);

  it('All day clears and locks the times', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /New event/ }));
    fireEvent.change(await screen.findByLabelText(/Starts/), { target: { value: '09:00' } });
    fireEvent.click(screen.getByRole('switch', { name: 'All day' }));
    expect((screen.getByLabelText(/Starts/) as HTMLInputElement).value).toBe('');
    expect(screen.getByLabelText(/Starts/)).toBeDisabled();
    expect(screen.getByLabelText(/Ends/)).toBeDisabled();
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

  it('a Bruno reply that lands after its editor closed never touches a newer draft', async () => {
    let finish: () => void = () => {};
    ai.streamBuildHelper.mockImplementation((_m: any, onChunk: (c: string) => void) => new Promise<void>((res) => {
      finish = () => { onChunk('```event\n[{"title":"Stale","date":"' + later + '"}]\n```'); res(); };
    }));
    setup();
    fireEvent.click(screen.getByRole('button', { name: /New event/ }));
    fireEvent.change(await screen.findByLabelText(/Quick add with Bruno/, {}, { timeout: 5000 }), { target: { value: 'something' } });
    fireEvent.click(screen.getByRole('button', { name: /Parse/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: /New event/ }));
    fireEvent.change(await screen.findByLabelText('Title', {}, { timeout: 5000 }), { target: { value: 'Fresh' } });
    finish();
    await waitFor(() => expect(screen.getByRole('button', { name: /Parse/ })).toBeInTheDocument());
    await new Promise((r) => setTimeout(r, 0));
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Fresh');
  }, 20000);

  it('keeps the last remaining Bruno proposal creatable', async () => {
    ai.streamBuildHelper.mockImplementation(async (_m: any, onChunk: (c: string) => void) => {
      onChunk('```event\n[{"title":"A","date":"' + later + '"},{"title":"B","date":"' + later + '"}]\n```');
    });
    setup();
    fireEvent.click(screen.getByRole('button', { name: /New event/ }));
    fireEvent.change(await screen.findByLabelText(/Quick add with Bruno/), { target: { value: 'two' } });
    fireEvent.click(screen.getByRole('button', { name: /Parse/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove A' }));
    expect(screen.getByRole('button', { name: /Create all 1 events/ })).toBeInTheDocument();
  });
});

describe('L-2 review regressions', () => {
  it('Bruno filling times turns All day off', async () => {
    ai.streamBuildHelper.mockImplementation(async (_m: any, onChunk: (c: string) => void) => {
      onChunk('```event\n[{"title":"Build","date":"' + later + '","time":"15:00","end":"17:00"}]\n```');
    });
    setup();
    fireEvent.click(screen.getByRole('button', { name: /New event/ }));
    fireEvent.click(await screen.findByRole('switch', { name: 'All day' }));
    fireEvent.change(screen.getByLabelText(/Quick add with Bruno/), { target: { value: 'build 3 to 5pm' } });
    fireEvent.click(screen.getByRole('button', { name: /Parse/ }));
    await waitFor(() => expect((screen.getByLabelText(/Starts/) as HTMLInputElement).value).toBe('15:00'), { timeout: 5000 });
    expect(screen.getByRole('switch', { name: 'All day' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByLabelText(/Starts/)).not.toBeDisabled();
  }, 20000);
});

describe('Calendar direct manipulation', () => {
  const cell = (k: string) => document.querySelector(`[data-cm-type="calendar-day"][data-cm-id="${k}"]`) as HTMLElement;
  const chip = (id: number) => document.querySelector(`[data-cm-type="calendar-event"][data-cm-id="${id}"]`) as HTMLElement;

  it('double-clicking a day opens a new event on that date', async () => {
    setup();
    fireEvent.doubleClick(cell(today));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('New event')).toBeInTheDocument();
    expect((within(sheet).getByLabelText(/Date/) as HTMLInputElement).value).toBe(today);
  });

  it('a real double-click (click, click, dblclick) edits instead of opening details', async () => {
    setup();
    fireEvent.click(chip(1), { detail: 1 });
    fireEvent.click(chip(1), { detail: 2 });
    fireEvent.doubleClick(chip(1), { detail: 2 });
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('Edit event')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 350)); // the single-click timer never fires
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('a single click still opens the details sheet', async () => {
    setup();
    fireEvent.click(chip(1), { detail: 1 });
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).queryByText('Edit event')).not.toBeInTheDocument();
    expect(within(sheet).getByText('Shop')).toBeInTheDocument();
  });

  it('double-clicking an event opens it for editing', async () => {
    setup();
    fireEvent.doubleClick(chip(1));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('Edit event')).toBeInTheDocument();
    expect((within(sheet).getByLabelText('Title') as HTMLInputElement).value).toBe('Build night');
  });

  it('dragging an event onto another day moves only its date', async () => {
    const { props } = setup();
    const store = new Map<string, string>();
    const dataTransfer = { setData: (t: string, v: string) => store.set(t, v), getData: (t: string) => store.get(t) ?? '', effectAllowed: '', dropEffect: '' };
    fireEvent.dragStart(chip(1), { dataTransfer });
    fireEvent.dragOver(cell(today), { dataTransfer });
    fireEvent.drop(cell(today), { dataTransfer });
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/events/1', expect.objectContaining({ method: 'PATCH' })));
    const call = api.apiFetch.mock.calls.find((c: any) => c[0] === '/api/events/1');
    expect(JSON.parse(call![1].body)).toEqual({ date: today });
    expect(props.setEvents).toHaveBeenCalled();
  });

  it('right-click on a day offers a new event there', async () => {
    setup();
    fireEvent.contextMenu(cell(today));
    const dayMenu = screen.getByRole('menu');
    fireEvent.click(within(dayMenu).getByRole('menuitem', { name: /New event on/ }));
    const sheet = await screen.findByRole('dialog');
    expect((within(sheet).getByLabelText(/Date/) as HTMLInputElement).value).toBe(today);
  });

  it('right-click on an event offers open, edit and delete', () => {
    setup();
    fireEvent.contextMenu(chip(1));
    const labels = within(screen.getByRole('menu')).getAllByRole('menuitem').map((b) => b.textContent);
    expect(labels).toEqual(['Open', 'Edit', 'Delete']);
  });

  it('members can open but not add, edit or move', () => {
    setup({ manage: false });
    expect(chip(1)).not.toHaveAttribute('draggable', 'true');
    fireEvent.doubleClick(cell(today));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.contextMenu(chip(1));
    expect(within(screen.getByRole('menu')).getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['Open']);
  });
});

describe('Calendar: one sheet at a time', () => {
  it('choosing Edit from the menu right after a click cancels the pending details open', async () => {
    setup();
    const chip = document.querySelector('[data-cm-type="calendar-event"][data-cm-id="1"]') as HTMLElement;
    fireEvent.click(chip, { detail: 1 });
    fireEvent.contextMenu(chip);
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Edit' }));
    await new Promise((r) => setTimeout(r, 350));
    const open = screen.getAllByRole('dialog');
    expect(open).toHaveLength(1);
    expect(within(open[0]).getByText('Edit event')).toBeInTheDocument();
  });
});

describe('Calendar: pending opens follow the view', () => {
  it('switching view right after a click cancels the pending details open', async () => {
    setup();
    const chip = document.querySelector('[data-cm-type="calendar-event"][data-cm-id="1"]') as HTMLElement;
    fireEvent.click(chip, { detail: 1 });
    fireEvent.click(screen.getByRole('radio', { name: /Agenda/ }));
    await new Promise((r) => setTimeout(r, 350));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
