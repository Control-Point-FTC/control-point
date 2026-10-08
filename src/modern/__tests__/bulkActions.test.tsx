// V3.5 bulk control: pages use the shared selection + bulk bar and send the
// same per-row requests as single edits.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));
const dialog = vi.hoisted(() => ({ notify: vi.fn(), confirmDialog: vi.fn(async () => true) }));
vi.mock('../../components/dialog', async (orig) => ({ ...(await orig<object>()), ...dialog }));

import { InterfaceModeProvider } from '../interfaceMode';
import { TasksPage } from '../pages/tasks/TasksPage';
import { AttendancePage } from '../pages/attendance/AttendancePage';
import { ContextMenuProvider } from '../../components/contextmenu/ContextMenuProvider';
import { clearDrafts } from '../drafts';

afterEach(cleanup);
beforeEach(() => {
  api.apiFetch.mockReset();
  api.apiFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
  dialog.notify.mockClear();
  dialog.confirmDialog.mockClear();
  clearDrafts();
});

const me = { id: 7, name: 'Ada', team_id: 1, interface_mode: 'modern' };
const members = [me, { id: 8, name: 'Grace' }, { id: 9, name: 'Linus' }];
const wrap = (ui: React.ReactNode) => (
  <InterfaceModeProvider user={me} team={{}} onUserSaved={() => {}}>
    <MemoryRouter><ContextMenuProvider>{ui}</ContextMenuProvider></MemoryRouter>
  </InterfaceModeProvider>
);
const calls = (method: string) => api.apiFetch.mock.calls.filter((c) => c[1]?.method === method);

describe('Tasks bulk actions', () => {
  const tasks = [
    { id: 1, title: 'Wire the hub', status: 'todo', assignee_ids: [8], team_id: 1 },
    { id: 2, title: 'Print brackets', status: 'in-progress', assignee_ids: [], team_id: 1 },
    { id: 3, title: 'Tune PID', status: 'todo', assignee_ids: [], team_id: 1 },
  ];
  const setup = (manage = true) => {
    const setTasks = vi.fn();
    render(wrap(<TasksPage tasks={tasks} setTasks={setTasks} teams={[{ id: 1, name: 'Team' }]} members={members}
      refresh={{ tasks: vi.fn() }} currentUser={me} onRequestComplete={vi.fn()} hasScope={(s: string) => s === 'tasks' && manage} />));
    return { setTasks };
  };

  it('selects cards and deletes them after one confirmation', async () => {
    const { setTasks } = setup();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Wire the hub' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Tune PID' }));
    const bar = screen.getByRole('toolbar', { name: '2 tasks selected' });
    await act(async () => { fireEvent.click(within(bar).getByRole('button', { name: 'Delete' })); });
    expect(dialog.confirmDialog).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(calls('DELETE').map((c) => c[0]).sort()).toEqual(['/api/tasks/1', '/api/tasks/3']));
    expect(setTasks).toHaveBeenCalled();
  });

  it('assigning adds the person and keeps who is already on the task', async () => {
    setup();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all shown tasks' }));
    expect(screen.getByRole('toolbar', { name: '3 tasks selected' })).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Assign' }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Linus' }));
    await waitFor(() => expect(calls('PATCH')).toHaveLength(3));
    const body = (id: number) => JSON.parse(calls('PATCH').find((c) => c[0] === `/api/tasks/${id}`)![1].body);
    expect(body(1)).toEqual({ assignee_ids: [8, 9] });
    expect(body(2)).toEqual({ assignee_ids: [9] });
  });

  it('people who can only move their own tasks get no checkboxes', () => {
    setup(false);
    expect(screen.queryByRole('checkbox', { name: /Select/ })).not.toBeInTheDocument();
  });
});

describe('Attendance bulk marking', () => {
  it('marks the selected members in one batch request', async () => {
    render(wrap(<AttendancePage members={members} attendance={[]} events={[]} refresh={{ attendance: vi.fn() }}
      hasScope={(s: string) => s === 'attendance'} currentUser={me} onRefresh={vi.fn()} />));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Grace' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Linus' }));
    const bar = screen.getByRole('toolbar', { name: '2 members selected' });
    await act(async () => { fireEvent.click(within(bar).getByRole('button', { name: /Present/ })); });
    await waitFor(() => expect(calls('POST')).toHaveLength(1));
    const [url, init] = calls('POST')[0];
    expect(url).toBe('/api/attendance/batch');
    expect(JSON.parse(init.body).records).toEqual([{ member_id: 8, status: 'P' }, { member_id: 9, status: 'P' }]);
  });

  it('right-clicking a roll-call row offers the marks', () => {
    render(wrap(<AttendancePage members={members} attendance={[]} events={[]} refresh={{ attendance: vi.fn() }}
      hasScope={(s: string) => s === 'attendance'} currentUser={me} onRefresh={vi.fn()} />));
    fireEvent.contextMenu(screen.getByText('Grace'));
    const labels = within(screen.getByRole('menu')).getAllByRole('menuitem').map((b) => b.textContent);
    expect(labels).toEqual(['Mark Present', 'Mark Late', 'Mark Excused', 'Mark Unexcused', 'Mark School event']);
  });
});
