import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { format } from 'date-fns';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));
vi.mock('html5-qrcode', () => ({ Html5Qrcode: vi.fn() }));
const dialog = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('../../components/dialog', async (orig) => ({ ...(await orig<object>()), ...dialog }));

import { InterfaceModeProvider } from '../interfaceMode';
import { AttendancePage } from '../pages/attendance/AttendancePage';
import { clearDrafts } from '../drafts';

const today = format(new Date(), 'yyyy-MM-dd');
const json = (body: any, ok = true) => Promise.resolve({ ok, json: async () => body });

function routeApi(url: string, init?: any) {
  if (url === '/api/attendance/sessions') return json([today]);
  if (url === '/api/attendance/summary') return json([{ member_id: 7, name: 'Ada', total: 4, present: 3, absent: 1, late: 0, excused: 0 }]);
  if (url === '/api/hidden-dates') return json([]);
  if (url === '/api/attendance/qr-session' && !init) return json({ session: null });
  if (url === '/api/attendance/qr-session') return json({ session: { token: 't', url: 'https://x/checkin/t', code: 'ABC123', expiresAt: new Date(Date.now() + 3600e3).toISOString() } });
  if (url === '/api/attendance/checkin-code') return json({ ok: true });
  return json({});
}

afterEach(cleanup);
beforeEach(() => {
  api.apiFetch.mockReset();
  api.apiFetch.mockImplementation(routeApi);
  dialog.notify.mockReset();
  clearDrafts();
});

const me = { id: 7, name: 'Ada', team_id: 1, interface_mode: 'modern' };
const members = [me, { id: 8, name: 'Grace' }];

function setup({ admin = true, attendance = [] as any[] } = {}) {
  const props = {
    members, attendance, events: [], refresh: { attendance: vi.fn() }, onRefresh: vi.fn(), currentUser: me,
    hasScope: (s: string) => (s === 'attendance' ? admin : false), activeTeamName: 'Team',
    insights: '', updateInsights: vi.fn(), isAiLoading: false,
  };
  const utils = render(
    <InterfaceModeProvider user={me} team={{}} onUserSaved={() => {}}>
      <MemoryRouter initialEntries={['/attendance']}><AttendancePage {...props} /></MemoryRouter>
    </InterfaceModeProvider>,
  );
  return { ...utils, props };
}

// Radix Tabs switch on mousedown (pointer) or keyboard focus.
const selectTab = (name: string) => fireEvent.mouseDown(screen.getByRole('tab', { name: new RegExp(name) }), { button: 0 });
const batchCalls = () => api.apiFetch.mock.calls.filter((c) => c[0] === '/api/attendance/batch').map((c) => JSON.parse(c[1].body));

describe('Modern Attendance (admins)', () => {
  it('roll call marks today with the same batch POST as Legacy, and tapping again clears', async () => {
    const { props } = setup();
    const row = (await screen.findByText('Grace')).closest('li, div[class*="flex-wrap"]') as HTMLElement;
    fireEvent.click(within(row).getByRole('radio', { name: 'Present' }));
    await waitFor(() => expect(batchCalls()).toEqual([{ date: today, records: [{ member_id: 8, status: 'P' }] }]));
    expect(props.refresh.attendance).toHaveBeenCalled();
    fireEvent.click(within(row).getByRole('radio', { name: 'Present' }));
    await waitFor(() => expect(batchCalls()[1]).toEqual({ date: today, records: [{ member_id: 8, status: null }] }));
  });

  it('rolls back and warns when a save fails', async () => {
    api.apiFetch.mockImplementation((url: string, init?: any) => (url === '/api/attendance/batch' ? json({}, false) : routeApi(url, init)));
    setup();
    const row = (await screen.findByText('Grace')).closest('li, div[class*="flex-wrap"]') as HTMLElement;
    fireEvent.click(within(row).getByRole('radio', { name: 'Late' }));
    await waitFor(() => expect(dialog.notify).toHaveBeenCalledWith('Failed to save attendance', 'error'));
    expect(within(row).getByRole('radio', { name: 'Late' })).toHaveAttribute('aria-checked', 'false');
  });

  it('two overlapping failed saves never leave an unsaved mark showing', async () => {
    const pending: ((ok: boolean) => void)[] = [];
    api.apiFetch.mockImplementation((url: string, init?: any) => (url === '/api/attendance/batch'
      ? new Promise((res) => { pending.push((ok) => res({ ok, json: async () => ({}) })); })
      : routeApi(url, init)));
    setup();
    const row = (await screen.findByText('Grace')).closest('li, div[class*="flex-wrap"]') as HTMLElement;
    fireEvent.click(within(row).getByRole('radio', { name: 'Present' }));
    fireEvent.click(within(row).getByRole('radio', { name: 'Late' }));
    await waitFor(() => expect(pending).toHaveLength(2));
    await act(async () => { pending[0](false); });
    expect(within(row).getByRole('radio', { name: 'Late' })).toHaveAttribute('aria-checked', 'true');
    await act(async () => { pending[1](false); });
    await waitFor(() => expect(within(row).getByRole('radio', { name: 'Present' })).toHaveAttribute('aria-checked', 'false'));
    expect(within(row).getByRole('radio', { name: 'Late' })).toHaveAttribute('aria-checked', 'false');
  });

  it('a newer failed save falls back to the last saved value', async () => {
    const pending: ((ok: boolean) => void)[] = [];
    api.apiFetch.mockImplementation((url: string, init?: any) => (url === '/api/attendance/batch'
      ? new Promise((res) => { pending.push((ok) => res({ ok, json: async () => ({}) })); })
      : routeApi(url, init)));
    setup();
    const row = (await screen.findByText('Grace')).closest('li, div[class*="flex-wrap"]') as HTMLElement;
    fireEvent.click(within(row).getByRole('radio', { name: 'Present' }));
    fireEvent.click(within(row).getByRole('radio', { name: 'Late' }));
    await waitFor(() => expect(pending).toHaveLength(2));
    await act(async () => { pending[0](true); });
    await act(async () => { pending[1](false); });
    await waitFor(() => expect(within(row).getByRole('radio', { name: 'Present' })).toHaveAttribute('aria-checked', 'true'));
  });

  it('fresh server data wins over an earlier confirmed save when a later edit fails', async () => {
    const pending: ((ok: boolean) => void)[] = [];
    api.apiFetch.mockImplementation((url: string, init?: any) => (url === '/api/attendance/batch'
      ? new Promise((res) => { pending.push((ok) => res({ ok, json: async () => ({}) })); })
      : routeApi(url, init)));
    const { rerender, props } = setup();
    const view = (attendance: any[]) => (
      <InterfaceModeProvider user={me} team={{}} onUserSaved={() => {}}>
        <MemoryRouter initialEntries={['/attendance']}><AttendancePage {...props} attendance={attendance} /></MemoryRouter>
      </InterfaceModeProvider>
    );
    const row = () => (screen.getByText('Grace').closest('li, div[class*="flex-wrap"]') as HTMLElement);
    await screen.findByText('Grace');
    fireEvent.click(within(row()).getByRole('radio', { name: 'Present' }));
    await waitFor(() => expect(pending).toHaveLength(1));
    // The broadcast refresh lands before the save response…
    rerender(view([{ member_id: 8, date: today, status: 'P' }]));
    await act(async () => { pending[0](true); });
    // …then another admin marks the cell Unexcused.
    rerender(view([{ member_id: 8, date: today, status: 'U' }]));
    await waitFor(() => expect(within(row()).getByRole('radio', { name: 'Unexcused' })).toHaveAttribute('aria-checked', 'true'));
    fireEvent.click(within(row()).getByRole('radio', { name: 'Late' }));
    await waitFor(() => expect(pending).toHaveLength(2));
    await act(async () => { pending[1](false); });
    await waitFor(() => expect(within(row()).getByRole('radio', { name: 'Unexcused' })).toHaveAttribute('aria-checked', 'true'));
  });

  it('grid cells take keyboard shortcuts', async () => {
    setup();
    selectTab('Grid');
    const cell = (await screen.findAllByRole('button', { name: /^Grace, / }))[0];
    cell.focus();
    fireEvent.keyDown(cell, { key: 'l' });
    await waitFor(() => expect(batchCalls()[0]).toMatchObject({ records: [{ member_id: 8, status: 'L' }] }));
  });

  it('meeting days menu hides a weekday with one bulk request', async () => {
    setup();
    selectTab('Grid');
    const trigger = await screen.findByRole('button', { name: /Meeting days/ });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    const sunday = await screen.findByRole('menuitemcheckbox', { name: new Date(2024, 0, 7).toLocaleDateString(undefined, { weekday: 'long' }) });
    fireEvent.click(sunday);
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/hidden-dates/bulk', expect.objectContaining({ method: 'POST' })));
    const dates = JSON.parse(api.apiFetch.mock.calls.find((c) => c[0] === '/api/hidden-dates/bulk')![1].body).dates as string[];
    expect(dates.length).toBeGreaterThan(50);
    expect(dates.every((d) => new Date(d + 'T12:00:00').getDay() === 0)).toBe(true);
  });

  it('starts a QR session with the chosen length', async () => {
    setup();
    fireEvent.click(await screen.findByRole('radio', { name: '30 min' }));
    fireEvent.click(screen.getByRole('button', { name: /Start check-in/ }));
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/attendance/qr-session', expect.objectContaining({ method: 'POST', body: JSON.stringify({ durationMinutes: 30 }) })));
    expect(await screen.findByText('ABC123')).toBeInTheDocument();
  });

  it('history opens a day sheet where statuses can be changed', async () => {
    setup();
    selectTab('History');
    fireEvent.click(await screen.findByRole('button', { name: /present/ }));
    const sheet = await screen.findByRole('dialog');
    const row = within(sheet).getByText('Ada').closest('li') as HTMLElement;
    fireEvent.click(within(row).getByRole('radio', { name: 'Excused' }));
    await waitFor(() => expect(batchCalls()[0]).toEqual({ date: today, records: [{ member_id: 7, status: 'E' }] }));
  });
});

describe('Modern Attendance (members)', () => {
  it('shows the personal view, and the typed day code survives a remount (mode switch)', async () => {
    const first = setup({ admin: false });
    expect(screen.queryByRole('tab', { name: /Grid/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Day code'), { target: { value: 'ab-c1 2' } });
    expect((screen.getByLabelText('Day code') as HTMLInputElement).value).toBe('ABC12');
    first.unmount();
    setup({ admin: false });
    expect((screen.getByLabelText('Day code') as HTMLInputElement).value).toBe('ABC12');
  });

  it('checks in with the code and refreshes attendance (no error toast)', async () => {
    const { props } = setup({ admin: false });
    fireEvent.change(screen.getByLabelText('Day code'), { target: { value: 'ABC123' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Check in' })); });
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/attendance/checkin-code', expect.objectContaining({ body: JSON.stringify({ code: 'ABC123' }) })));
    await waitFor(() => expect(props.refresh.attendance).toHaveBeenCalled());
    expect(dialog.notify).toHaveBeenCalledWith('Checked in — welcome!', 'success');
    expect(dialog.notify).not.toHaveBeenCalledWith(expect.anything(), 'error');
  });

  it('ignores pre-marked future days in personal stats', async () => {
    setup({ admin: false, attendance: [{ member_id: 7, date: '2999-01-01', status: 'E' }, { member_id: 7, date: '2020-01-02', status: 'P' }, { member_id: 7, date: '2020-01-01', status: 'P' }] });
    expect(screen.getByText('2 of 2 days')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('days in a row').previousSibling).toHaveTextContent('2'));
  });

  it('shows checked-in state and stats from my records', () => {
    setup({ admin: false, attendance: [{ member_id: 7, date: today, status: 'P' }, { member_id: 7, date: '2020-01-01', status: 'U' }] });
    expect(screen.getByText('You’re checked in')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 days')).toBeInTheDocument();
  });
});
