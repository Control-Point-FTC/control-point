import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { format } from 'date-fns';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));
vi.mock('../../components/FtcStats', async (orig) => ({
  ...(await orig<object>()),
  useFtcTeam: () => ({ loading: false, notConnected: true, data: null, error: null, refresh: () => {} }),
}));

import { InterfaceModeProvider } from '../interfaceMode';
import { HomePage } from '../pages/HomePage';
import { InboxPage } from '../pages/InboxPage';
import { clearDrafts } from '../drafts';

afterEach(cleanup);
beforeEach(() => { api.apiFetch.mockReset(); clearDrafts(); });

const today = format(new Date(), 'yyyy-MM-dd');
const me = { id: 7, name: 'Ada Lovelace', role: 'Builder', team_id: 1, interface_mode: 'modern' };

function homeProps(over: Record<string, any> = {}) {
  return {
    teams: [{ id: 1, name: 'Hypnotic Robotics', number: '4215' }],
    members: [me, { id: 8, name: 'Grace' }],
    attendance: [], tasks: [
      { id: 1, title: 'Wire the drivetrain', status: 'todo', assignee_ids: [7], due_date: '2020-01-01' },
      { id: 2, title: 'Print brackets', status: 'in_progress', assignee_ids: [7] },
    ],
    setTasks: vi.fn(), events: [{ id: 3, title: 'Build night', date: today }], budget: [],
    currentUser: me, isAdmin: false, hiddenDates: [], setAttendance: vi.fn(), setLoading: vi.fn(), onRefresh: vi.fn(),
    onRequestComplete: vi.fn(), summary: '', insights: null, isAiLoading: false, updateSummary: vi.fn(), updateInsights: vi.fn(),
    onboardingState: null, notifications: [], unreadMentions: 0, activeChannelId: null,
    ...over,
  };
}

function renderInModern(ui: React.ReactNode) {
  return render(
    <InterfaceModeProvider user={me} team={{}} onUserSaved={() => {}}>
      <MemoryRouter initialEntries={['/dashboard']}>{ui}</MemoryRouter>
    </InterfaceModeProvider>,
  );
}

describe('Modern Home', () => {
  it('members get "My work" with their tasks; admins get "Team pulse"', () => {
    renderInModern(<HomePage {...homeProps()} />);
    expect(screen.getByRole('heading', { name: 'My work' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Team pulse' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Wire the drivetrain').length).toBeGreaterThan(0);
    cleanup();
    renderInModern(<HomePage {...homeProps({ isAdmin: true })} />);
    expect(screen.getByRole('heading', { name: 'Team pulse' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Briefing' })).toBeInTheDocument();
  });

  it('needs-attention lists overdue tasks and the missing check-in', () => {
    renderInModern(<HomePage {...homeProps()} />);
    expect(screen.getByText("You haven't checked in today")).toBeInTheDocument();
    expect(screen.getByText(/Overdue · due/)).toBeInTheDocument();
  });

  it('checking in posts the same attendance batch as Legacy', async () => {
    api.apiFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    renderInModern(<HomePage {...homeProps()} />);
    fireEvent.click(screen.getAllByRole('radio', { name: /i'm here/i })[0]);
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalled());
    const [url, init] = api.apiFetch.mock.calls[0];
    expect(url).toBe('/api/attendance/batch');
    expect(JSON.parse(init.body)).toMatchObject({ date: today, records: [{ member_id: 7, status: 'P' }] });
  });

  it('an unsent absence reason survives a remount (mode switch)', async () => {
    const { unmount } = renderInModern(<HomePage {...homeProps()} />);
    fireEvent.click(screen.getAllByRole('radio', { name: /out/i })[0]);
    fireEvent.change(await screen.findByLabelText('Reason'), { target: { value: 'Dentist appointment' } });
    unmount(); // Legacy ↔ Modern swap remounts the page
    renderInModern(<HomePage {...homeProps()} />);
    fireEvent.click(screen.getAllByRole('radio', { name: /out/i })[0]);
    expect(((await screen.findByLabelText('Reason')) as HTMLTextAreaElement).value).toBe('Dentist appointment');
  });
});

function Where() { const l = useLocation(); return <span data-testid="where">{l.pathname + l.search}</span>; }

describe('Modern Inbox', () => {
  const notes = [
    { id: 1, content: 'You were mentioned by Grace: "hey"', type: 'mention', is_read: 0, timestamp: new Date().toISOString(), meta: JSON.stringify({ channel_id: 4, channel_name: 'build' }) },
    { id: 2, content: 'New task assigned: Print brackets', type: 'task', is_read: 1, timestamp: new Date().toISOString(), meta: JSON.stringify({ task_id: 2 }) },
  ];
  const actions = () => ({ markRead: vi.fn(), markUnread: vi.fn(), remove: vi.fn(), clearAll: vi.fn(), open: vi.fn() });

  it('defaults to unread and can show all', () => {
    renderInModern(<InboxPage notifications={notes} actions={actions()} onOpenChannel={() => {}} />);
    expect(screen.getByText(/You were mentioned/)).toBeInTheDocument();
    expect(screen.queryByText(/Print brackets/)).not.toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('radio', { name: 'All' }));
    fireEvent.click(screen.getByRole('radio', { name: 'All' }));
    expect(screen.getByText(/Print brackets/)).toBeInTheDocument();
  });

  it('opening a row marks it read and goes to its source', () => {
    const a = actions();
    const onOpenChannel = vi.fn();
    render(
      <InterfaceModeProvider user={me} team={{}} onUserSaved={() => {}}>
        <MemoryRouter initialEntries={['/inbox']}>
          <Routes><Route path="*" element={<><InboxPage notifications={notes} actions={a} onOpenChannel={onOpenChannel} /><Where /></>} /></Routes>
        </MemoryRouter>
      </InterfaceModeProvider>,
    );
    fireEvent.click(screen.getByText(/You were mentioned/));
    expect(a.markRead).toHaveBeenCalledWith([1]);
    expect(onOpenChannel).toHaveBeenCalledWith(4);
    expect(screen.getByTestId('where').textContent).toBe('/chat');
  });

  it('mark all read and clear all call the shared actions', async () => {
    const a = actions();
    renderInModern(<InboxPage notifications={notes} actions={a} onOpenChannel={() => {}} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /mark all read/i })); });
    expect(a.markRead).toHaveBeenCalledWith([1]);
    fireEvent.click(screen.getByRole('button', { name: /clear all/i }));
    expect(a.clearAll).toHaveBeenCalled();
  });

  it('shows a friendly empty state', () => {
    renderInModern(<InboxPage notifications={[]} actions={actions()} onOpenChannel={() => {}} />);
    expect(screen.getByText('No unread notifications')).toBeInTheDocument();
  });
});
