// V3.5 tasks: Completed view + review, keyboard moves on the board, and
// quick-add filling time / priority / repeat into their fields.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));
const dialog = vi.hoisted(() => ({ notify: vi.fn(), confirmDialog: vi.fn(async () => true) }));
vi.mock('../../components/dialog', async (orig) => ({ ...(await orig<object>()), ...dialog }));

import { InterfaceModeProvider } from '../interfaceMode';
import { TasksPage } from '../pages/tasks/TasksPage';
import { ContextMenuProvider } from '../../components/contextmenu/ContextMenuProvider';
import { clearDrafts } from '../drafts';

afterEach(cleanup);
beforeEach(() => {
  api.apiFetch.mockReset();
  api.apiFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
  clearDrafts();
});

const me = { id: 7, name: 'Ada', team_id: 1, interface_mode: 'modern' };
const members = [me, { id: 8, name: 'Arnav' }];
const tasks = [
  { id: 1, title: 'Wire the hub', status: 'done', review_status: 'pending', completed_by: 8, completed_at: '2026-10-07T20:00:00Z', completion_notes: 'Photo attached', assignee_ids: [8], team_id: 1 },
  { id: 2, title: 'Order servos', status: 'done', review_status: 'approved', completed_at: '2026-10-06T20:00:00Z', assignee_ids: [], team_id: 1 },
  { id: 3, title: 'Tune PID', status: 'todo', priority: 'high', recurrence: '{"freq":"weekly","interval":1}', assignee_ids: [], team_id: 1 },
  { id: 4, title: 'Print brackets', status: 'todo', assignee_ids: [], team_id: 1 },
];
function setup(list: any[] = tasks) {
  const setTasks = vi.fn();
  render(
    <InterfaceModeProvider user={me} team={{}} onUserSaved={() => {}}>
      <MemoryRouter><ContextMenuProvider>
        <TasksPage tasks={list} setTasks={setTasks} teams={[{ id: 1, name: 'Team' }]} members={members}
          refresh={{ tasks: vi.fn() }} currentUser={me} onRequestComplete={vi.fn()} hasScope={(s: string) => s === 'tasks'} />
      </ContextMenuProvider></MemoryRouter>
    </InterfaceModeProvider>,
  );
  return { setTasks };
}

describe('Completed view and review', () => {
  it('lists done tasks awaiting review and approves from the task sheet', async () => {
    setup();
    fireEvent.click(screen.getByRole('radio', { name: /Completed, 1 awaiting review/ }));
    expect(screen.getByText('Wire the hub')).toBeInTheDocument();
    expect(screen.queryByText('Order servos')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'All completed' }));
    expect(screen.getByText('Order servos')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Wire the hub' }));
    const sheet = await screen.findByRole('dialog');
    api.apiFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ task: { ...tasks[0], review_status: 'approved' } }) });
    await act(async () => { fireEvent.click(within(sheet).getByRole('button', { name: 'Approve' })); });
    expect(api.apiFetch).toHaveBeenCalledWith('/api/tasks/1/review', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(api.apiFetch.mock.calls.at(-1)![1].body)).toEqual({ action: 'approve', note: '' });
  });

  it('sending back needs a note', async () => {
    setup();
    fireEvent.click(screen.getByRole('radio', { name: /Completed/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Wire the hub' }));
    const sheet = await screen.findByRole('dialog');
    fireEvent.click(within(sheet).getByRole('button', { name: /Send back for changes/ }));
    const send = within(sheet).getByRole('button', { name: /^Send back$/ });
    expect(send).toBeDisabled();
    fireEvent.change(within(sheet).getByLabelText(/What needs to change/), { target: { value: 'Zip-tie it' } });
    await act(async () => { fireEvent.click(send); });
    expect(JSON.parse(api.apiFetch.mock.calls.at(-1)![1].body)).toEqual({ action: 'send_back', note: 'Zip-tie it' });
  });
});

describe('Proof of completion', () => {
  const history = JSON.stringify([
    { by: 8, at: '2026-10-05T18:00:00Z', notes: 'Mounted on the left rail', images: ['/api/files/41'], review: { status: 'changes_requested', by: 7, at: '2026-10-05T19:00:00Z', note: 'Show it from the front' } },
    { by: 8, at: '2026-10-07T20:00:00Z', notes: 'Front view attached', images: ['/api/files/42', '/api/files/43', '//evil.example/x.png', '/\\evil.example/y.png', 'https://evil.example/z.png'], review: null },
  ]);
  const proofTask = { ...tasks[0], completion_notes: 'Front view attached', completion_history: history };

  it('the task sheet shows every completion with its photos and review', async () => {
    setup([proofTask, ...tasks.slice(1)]);
    fireEvent.click(screen.getByRole('radio', { name: /Completed/ }));
    expect(screen.getByText('3 photos')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Wire the hub' }));
    const sheet = await screen.findByRole('dialog');
    const proof = within(sheet).getByRole('region', { name: /Proof of completion/ });
    expect(within(proof).getByText(/finished 2 times/)).toBeInTheDocument();
    const items = within(proof).getAllByRole('listitem');
    // Newest first.
    expect(within(items[0]).getByText('Front view attached')).toBeInTheDocument();
    expect(within(items[0]).getByText(/latest/)).toBeInTheDocument();
    expect(within(items[0]).getAllByRole('img').map((i) => i.getAttribute('src'))).toEqual(['/api/files/42', '/api/files/43']);
    expect(within(items[0]).getByRole('link', { name: /Open photo 1 from Arnav full size/ })).toHaveAttribute('href', '/api/files/42');
    expect(within(items[1]).getByText('Mounted on the left rail')).toBeInTheDocument();
    expect(within(items[1]).getByText(/Sent back by Ada/)).toBeInTheDocument();
    expect(within(items[1]).getByText('Show it from the front')).toBeInTheDocument();
  });

  it('a task finished before history existed still shows its proof', async () => {
    setup([{ ...tasks[0], completion_images: '["/api/files/9"]' }, ...tasks.slice(1)]);
    fireEvent.click(screen.getByRole('radio', { name: /Completed/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Wire the hub' }));
    const sheet = await screen.findByRole('dialog');
    const proof = within(sheet).getByRole('region', { name: /Proof of completion/ });
    expect(within(proof).getByText('Photo attached')).toBeInTheDocument();
    expect(within(proof).getByRole('img')).toHaveAttribute('src', '/api/files/9');
  });

  it('All completed keeps a task that was sent back', () => {
    const sentBack = { ...proofTask, id: 5, title: 'Mount the camera', status: 'in-progress', completed_at: null, review_status: 'changes_requested' };
    setup([...tasks, sentBack]);
    fireEvent.click(screen.getByRole('radio', { name: /Completed/ }));
    expect(screen.queryByText('Mount the camera')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'All completed' }));
    expect(screen.getByText('Mount the camera')).toBeInTheDocument();
  });
});

describe('Board', () => {
  it('shows priority and repeat on the card', () => {
    setup();
    const card = screen.getByRole('button', { name: /Tune PID/ });
    expect(within(card).getByText('High')).toBeInTheDocument();
    expect(within(card).getByText('Every week')).toBeInTheDocument();
  });

  it('arrow keys move focus; Shift+Right moves the card a column', async () => {
    setup();
    const tune = screen.getByRole('button', { name: /Tune PID/ });
    tune.focus();
    fireEvent.keyDown(tune, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Print brackets/ }));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight', shiftKey: true });
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/tasks/4', expect.objectContaining({ method: 'PATCH' })));
    expect(JSON.parse(api.apiFetch.mock.calls.at(-1)![1].body)).toEqual({ status: 'in-progress' });
  });
});

describe('Quick add', () => {
  it('fills time, priority and repeat from the parse', async () => {
    setup();
    api.apiFetch.mockImplementation(async (url: string) => (url === '/api/tasks/parse'
      ? { ok: true, json: async () => ({ items: [{ title: 'Test auto paths', due_date: '2026-10-15', due_time: '16:30', priority: 'high', recurrence: { freq: 'weekly', interval: 2 }, assigned_to: 8, assignee_ids: [8] }] }) }
      : { ok: true, json: async () => ({}) }));
    fireEvent.click(screen.getByRole('button', { name: /New task/ }));
    const sheet = await screen.findByRole('dialog');
    fireEvent.change(within(sheet).getByLabelText(/Quick add with Bruno/), { target: { value: 'Test auto paths high priority every 2 weeks Thursday 4:30pm @Arnav' } });
    await act(async () => { fireEvent.click(within(sheet).getByRole('button', { name: /Fill/ })); });
    await waitFor(() => expect(within(sheet).getByLabelText(/Title/)).toHaveValue('Test auto paths'));
    expect(within(sheet).getByLabelText(/^Time/)).toHaveValue('16:30');
    expect(within(sheet).getByRole('combobox', { name: 'Priority' })).toHaveTextContent('High');
    expect(within(sheet).getByRole('combobox', { name: 'Repeat' })).toHaveTextContent('Every 2 weeks');
    const body = JSON.parse(api.apiFetch.mock.calls.find((c) => c[0] === '/api/tasks/parse')![1].body);
    expect(body.tz).toBeTruthy();
  });
});
