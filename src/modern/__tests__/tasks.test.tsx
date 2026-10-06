import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));

import { InterfaceModeProvider } from '../interfaceMode';
import { TasksPage } from '../pages/tasks/TasksPage';
import { clearDrafts } from '../drafts';

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
      <MemoryRouter initialEntries={[url]}><TasksPage {...props} /></MemoryRouter>
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
    expect(JSON.parse(api.apiFetch.mock.calls[0][1].body)).toEqual({ status: 'in-progress' });
  });

  it('moving to Done asks for proof instead of PATCHing', async () => {
    const { onRequestComplete } = setup();
    fireEvent.click(screen.getByRole('button', { name: /Mount the climber hooks/ }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('radio', { name: /Done/ }));
    expect(onRequestComplete).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    expect(api.apiFetch).not.toHaveBeenCalled();
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
});
