import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));
const dialog = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('../../components/dialog', async (orig) => ({ ...(await orig<object>()), ...dialog }));

import { InterfaceModeProvider } from '../interfaceMode';
import { TasksPage } from '../pages/tasks/TasksPage';
import { ContextMenuProvider } from '../../components/contextmenu/ContextMenuProvider';
import { clearDrafts } from '../drafts';
import { addDaysISO, teamToday } from '../../utils/dueShortcuts';

afterEach(cleanup);
beforeEach(() => { api.apiFetch.mockReset(); api.apiFetch.mockResolvedValue({ ok: true, json: async () => ({}) }); clearDrafts(); });

const me = { id: 7, name: 'Ada', team_id: 1, interface_mode: 'modern' };
const baseTasks = [
  { id: 1, title: 'Mount the climber hooks', status: 'todo', assignee_ids: [7], team_id: 1, due_date: '2020-01-02' },
  { id: 2, title: 'Print brackets', status: 'in-progress', assignee_ids: [8], team_id: 1 },
  { id: 3, title: 'Board budget review', status: 'todo', assignee_ids: [], team_id: 1, is_board: 1 },
];

function setup({ manage = true, admin = false, tasks = baseTasks, url = '/tasks' } = {}) {
  const onRequestComplete = vi.fn();
  const props = {
    tasks, setTasks: vi.fn(), teams: [{ id: 1, name: 'Team' }], members: [me, { id: 8, name: 'Grace' }],
    refresh: { tasks: vi.fn() }, currentUser: me, onRequestComplete,
    hasScope: (s: string) => (s === 'tasks' ? manage : s === 'admin' ? admin : false),
  };
  const utils = render(
    <InterfaceModeProvider user={me} team={{}} onUserSaved={() => {}}>
      <MemoryRouter initialEntries={[url]}><ContextMenuProvider><TasksPage {...props} /></ContextMenuProvider></MemoryRouter>
    </InterfaceModeProvider>,
  );
  return { ...utils, props, onRequestComplete };
}

describe('Modern Tasks', () => {
  it('shows lanes with counts; board tasks only for admins', () => {
    setup();
    expect(screen.getByRole('region', { name: 'To do (1)' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'In progress (1)' })).toBeInTheDocument();
    expect(screen.queryByText('Board budget review')).not.toBeInTheDocument();
    cleanup();
    setup({ admin: true });
    expect(screen.getByText('Board budget review')).toBeInTheDocument();
  });

  it('opens a task sheet and moves status with the same PATCH as Legacy', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Mount the climber hooks/ }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('Mount the climber hooks')).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('radio', { name: /In progress/ }));
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/tasks/1', expect.objectContaining({ method: 'PATCH' })));
    // (The sheet also loads the task's timeline with a GET; only the PATCH matters here.)
    const patch = api.apiFetch.mock.calls.find((c: any[]) => c[1]?.method === 'PATCH');
    expect(JSON.parse(patch[1].body)).toEqual({ status: 'in-progress' });
  });

  it('right-clicking a card offers open, edit, moves, copy and delete', async () => {
    setup();
    fireEvent.contextMenu(screen.getByRole('button', { name: /Mount the climber hooks/ }));
    const menu = screen.getByRole('menu');
    const labels = within(menu).getAllByRole('menuitem').map((b) => b.textContent);
    expect(labels).toEqual(['Open', 'Edit', 'Move to In progress', 'Move to Done', 'Copy title', 'Delete']);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Move to In progress' }));
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/tasks/1', expect.objectContaining({ method: 'PATCH' })));
    cleanup();
    setup({ manage: false });
    fireEvent.contextMenu(screen.getByRole('button', { name: /Mount the climber hooks/ }));
    expect(within(screen.getByRole('menu')).queryByRole('menuitem', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('Copy title says so when the browser has no clipboard API', () => {
    const had = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    try {
      setup();
      fireEvent.contextMenu(screen.getByRole('button', { name: /Mount the climber hooks/ }));
      fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Copy title' }));
      expect(dialog.notify).toHaveBeenCalledWith(expect.stringContaining('Could not copy'), 'error');
    } finally {
      if (had) Object.defineProperty(navigator, 'clipboard', had); else delete (navigator as any).clipboard;
    }
  });

  it('moving to Done asks for proof instead of PATCHing', async () => {
    const { onRequestComplete } = setup();
    fireEvent.click(screen.getByRole('button', { name: /Mount the climber hooks/ }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('radio', { name: /Done/ }));
    expect(onRequestComplete).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    // Nothing is written (the sheet's timeline GET is a read).
    expect(api.apiFetch.mock.calls.filter((c: any[]) => c[1]?.method)).toEqual([]);
  });

  it('managers can create; members cannot but can still open tasks', async () => {
    setup({ manage: false });
    expect(screen.queryByRole('button', { name: /New task/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Mount the climber hooks/ }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).queryByRole('button', { name: /Edit/ })).not.toBeInTheDocument();
  });

  it('a half-written new task survives a remount (mode switch)', async () => {
    const first = setup();
    fireEvent.click(screen.getByRole('button', { name: /New task/ }));
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Tune the intake' } });
    first.unmount();
    setup();
    expect(((await screen.findByLabelText('Title')) as HTMLInputElement).value).toBe('Tune the intake');
  });

  it('creates a task with the same POST body as Legacy', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /New task/ }));
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Tune the intake' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/tasks', expect.objectContaining({ method: 'POST' })));
    expect(JSON.parse(api.apiFetch.mock.calls[0][1].body)).toMatchObject({ title: 'Tune the intake', status: 'todo', is_board: 0, team_id: 1 });
  });

  it('search filters the board (cards animate out)', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('Search tasks'), { target: { value: 'brackets' } });
    await waitFor(() => expect(screen.queryByText('Mount the climber hooks')).not.toBeInTheDocument());
    expect(screen.getByText('Print brackets')).toBeInTheDocument();
  });

  it('opens the linked task from a notification deep link', async () => {
    setup({ url: '/tasks?task=2' });
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('Print brackets')).toBeInTheDocument();
  });

  it('members cannot open a board task through a deep link', async () => {
    setup({ url: '/tasks?task=3' });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('a save in flight survives a remount and cannot be submitted twice', async () => {
    let resolve!: (v: any) => void;
    api.apiFetch.mockImplementation(() => new Promise((r) => { resolve = r; }));
    const first = setup();
    fireEvent.click(screen.getByRole('button', { name: /New task/ }));
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Tune the intake' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
    first.unmount(); // user switches modes mid-save
    setup();
    expect(await screen.findByRole('button', { name: 'Create task' })).toBeDisabled();
    expect(api.apiFetch).toHaveBeenCalledTimes(1);
    resolve({ ok: true, json: async () => ({}) });
    await waitFor(() => expect(screen.queryByLabelText('Title')).not.toBeInTheDocument()); // editor closes when it lands
  });

  it('insights use the same filtered tasks and say which', async () => {
    setup();
    fireEvent.mouseDown(screen.getByRole('radio', { name: 'Insights' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Insights' }));
    expect(await screen.findByText('Whole team')).toBeInTheDocument();
  });

  it('Mine shows your open count and toggles the assignee filter', async () => {
    setup();
    const mine = screen.getByRole('button', { name: /Mine: 1 open task assigned to you/ });
    fireEvent.click(mine);
    expect(mine).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(screen.queryByText('Print brackets')).not.toBeInTheDocument());
    fireEvent.click(mine);
    expect(screen.getByText('Print brackets')).toBeInTheDocument();
  });

  it('Alt + Right moves a focused card to the next column', async () => {
    setup();
    const card = screen.getByRole('button', { name: /^Mount the climber hooks, To do/ });
    fireEvent.keyDown(card, { key: 'ArrowRight', altKey: true });
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/tasks/1', expect.objectContaining({ method: 'PATCH', body: expect.stringContaining('"in-progress"') })));
  });

  it('insights flag overdue and undated open tasks and show the on-time rate', async () => {
    setup({ tasks: [...baseTasks, { id: 4, title: 'Shipped late', status: 'done', team_id: 1, due_date: '2020-01-01', completed_at: new Date().toISOString() }] as any[] });
    fireEvent.mouseDown(screen.getByRole('radio', { name: 'Insights' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Insights' }));
    expect(await screen.findByRole('region', { name: 'Needs attention: Overdue' })).toHaveTextContent('Mount the climber hooks');
    expect(screen.getByRole('region', { name: 'Needs attention: No due date' })).toHaveTextContent('Print brackets');
    expect(screen.getByText(/0 of 1 tasks with a due date/)).toBeInTheDocument();
  });

  it('Bruno suggests tags in the editor: marked AI tagged with the reason, and Undo takes back only his', async () => {
    api.apiFetch.mockImplementation(async (url: string) => (url === '/api/tasks/suggest-tags'
      ? { ok: true, json: async () => ({ subsystems: [], awards: ['think'], labels: ['CAD'], reason: 'Design work worth showing judges.' }) }
      : { ok: true, json: async () => ({}) }));
    setup();
    fireEvent.click(screen.getByRole('button', { name: /New task/ }));
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Model the new claw' } });
    fireEvent.click(screen.getByRole('button', { name: /^Innovate/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Suggest tags' }));
    expect(await screen.findByText('Bruno: Design work worth showing judges.')).toBeInTheDocument();
    expect(api.apiFetch).toHaveBeenCalledWith('/api/tasks/suggest-tags', expect.objectContaining({ body: expect.stringContaining('Model the new claw') }));
    expect(screen.getByRole('button', { name: /Think ?\(AI tagged\)/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Innovate/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
    expect(screen.getByRole('button', { name: /^Think/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /Innovate/ })).toHaveAttribute('aria-pressed', 'true'); // the member's own pick stays
    expect(screen.queryByRole('button', { name: 'Remove label CAD' })).not.toBeInTheDocument();
  });

  it('clicking Suggest tags while the automatic suggestion runs still shows why it failed', async () => {
    let finish!: (v: any) => void;
    api.apiFetch.mockImplementation((url: string) => (url === '/api/tasks/suggest-tags'
      ? new Promise((r) => { finish = r; })
      : Promise.resolve({ ok: true, json: async () => ({}) })));
    setup();
    fireEvent.click(screen.getByRole('button', { name: /New task/ }));
    const title = screen.getByLabelText(/^Title/);
    fireEvent.change(title, { target: { value: 'Model the new claw' } });
    fireEvent.blur(title); // starts the automatic suggestion
    // Mousing down on the button blurs the title first, so it's already busy when the click lands.
    fireEvent.click(screen.getByRole('button', { name: /Bruno is tagging/ }));
    finish({ ok: false, json: async () => ({ error: "Bruno isn't set up on this server" }) });
    expect(await screen.findByText("Bruno isn't set up on this server")).toBeInTheDocument();
  });

  it('editing auto-saves only the fields you changed, then says so', async () => {
    setup();
    fireEvent.contextMenu(screen.getByRole('button', { name: /^Mount the climber hooks, To do/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Mount the climber hooks (v2)' } });
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/tasks/1', expect.objectContaining({ method: 'PATCH' })), { timeout: 4000 });
    const call = api.apiFetch.mock.calls.find((c: any[]) => c[0] === '/api/tasks/1' && c[1]?.method === 'PATCH')!;
    expect(JSON.parse(call[1].body)).toEqual({ title: 'Mount the climber hooks (v2)' });
    expect(await screen.findByText('All changes saved')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });

  it('a change made while a save is in flight is saved next (saves run in order)', async () => {
    const patches: string[] = [];
    let release!: () => void;
    api.apiFetch.mockImplementation(async (url: string, init?: any) => {
      if (url === '/api/tasks/1' && init?.method === 'PATCH') {
        patches.push(init.body);
        if (patches.length === 1) await new Promise<void>((r) => { release = r; });
        return { ok: true, json: async () => ({}) };
      }
      return { ok: true, json: async () => ({}) };
    });
    setup();
    fireEvent.contextMenu(screen.getByRole('button', { name: /^Mount the climber hooks, To do/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    const title = screen.getByLabelText(/^Title/);
    fireEvent.change(title, { target: { value: 'B' } });
    await waitFor(() => expect(patches).toHaveLength(1), { timeout: 4000 });
    // Back to the original while the first save is still out.
    fireEvent.change(title, { target: { value: 'Mount the climber hooks' } });
    await new Promise((r) => setTimeout(r, 1400));
    release();
    await waitFor(() => expect(patches).toHaveLength(2), { timeout: 4000 });
    expect(JSON.parse(patches[0])).toEqual({ title: 'B' });
    expect(JSON.parse(patches[1])).toEqual({ title: 'Mount the climber hooks' });
  }, 15000);

  it('closing with a failed save keeps the editor open with the reason', async () => {
    api.apiFetch.mockImplementation(async (url: string, init?: any) => (url === '/api/tasks/1' && init?.method === 'PATCH'
      ? { ok: false, json: async () => ({ error: 'Start date must be on or before the due date' }) }
      : { ok: true, json: async () => ({}) }));
    setup();
    fireEvent.contextMenu(screen.getByRole('button', { name: /^Mount the climber hooks, To do/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Renamed' } });
    fireEvent.keyDown(document.activeElement || document.body, { key: 'Escape' });
    expect(await screen.findByText('Start date must be on or before the due date')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Title/)).toHaveValue('Renamed');
  });

  it('a close whose save lands after a new editor opened leaves the new one alone', async () => {
    let release!: () => void;
    api.apiFetch.mockImplementation(async (url: string, init?: any) => {
      if (url === '/api/tasks/1' && init?.method === 'PATCH') await new Promise<void>((r) => { release = r; });
      return { ok: true, json: async () => ({}) };
    });
    setup();
    fireEvent.contextMenu(screen.getByRole('button', { name: /^Mount the climber hooks, To do/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Renamed' } });
    fireEvent.keyDown(document.activeElement || document.body, { key: 'Escape' });
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/tasks/1', expect.objectContaining({ method: 'PATCH' })));
    // While that save is out, a new task is started (e.g. from the Dashboard's New task).
    fireEvent.click(screen.getByRole('button', { name: /New task/, hidden: true }));
    fireEvent.change(await screen.findByLabelText(/^Title/), { target: { value: 'Fresh idea' } });
    release();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByLabelText(/^Title/)).toHaveValue('Fresh idea');
  });

  it('due shortcuts in the editor, and "Move to tomorrow" on the sheet', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /New task/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Tomorrow' }));
    const tomorrow = addDaysISO(teamToday(undefined), 1);
    expect((screen.getByLabelText('Due date') as HTMLInputElement).value).toBe(tomorrow);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: /^Mount the climber hooks, To do/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Move to tomorrow' }));
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/tasks/1', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ due_date: tomorrow }) })));
  });

  it('a late save never wipes a newer draft', async () => {
    let resolve!: (v: any) => void;
    api.apiFetch.mockImplementation(() => new Promise((r) => { resolve = r; }));
    const first = setup();
    fireEvent.click(screen.getByRole('button', { name: /New task/ }));
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'First task' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
    first.unmount();
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' })); // drop the restored editor
    fireEvent.click(screen.getByRole('button', { name: /New task/ }));
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Second task' } });
    resolve({ ok: true, json: async () => ({}) }); // the first save lands late
    await new Promise((r) => setTimeout(r, 20));
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Second task');
  });
});
