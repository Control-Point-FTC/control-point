import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { RefOpen } from '../pages/RefOpen';
import { apiJson } from '../../services/api';
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), apiJson: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

function Where() { const l = useLocation(); return <p data-testid="where">{l.pathname + l.search}</p>; }
function open(path: string, onSwitchTeam = vi.fn()) {
  render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/t/:teamId/:type/:id" element={<RefOpen activeTeamId={3} onSwitchTeam={onSwitchTeam} />} />
    <Route path="*" element={<Where />} />
  </Routes></MemoryRouter>);
  return onSwitchTeam;
}

describe('stable record links', () => {
  it('re-checks the link and opens the record where it lives', async () => {
    vi.mocked(apiJson).mockResolvedValue({ status: 'ok', type: 'task', id: 42, label: 'Wire drivetrain', href: '/tasks?task=42' } as any);
    open('/t/3/task/42');
    expect((await screen.findByTestId('where')).textContent).toBe('/tasks?task=42');
    expect(vi.mocked(apiJson).mock.calls[0][0]).toBe('/api/refs/task/42?team=3');
  });

  it('says a record was deleted, without crashing', async () => {
    vi.mocked(apiJson).mockResolvedValue({ status: 'deleted', type: 'page', id: 9, label: 'Old intake' } as any);
    open('/t/3/page/9');
    expect(await screen.findByText('This was deleted')).toBeTruthy();
    expect(screen.getByText(/“Old intake” no longer exists, but it may still be in the notebook trash/)).toBeTruthy();
  });

  it('never says whether something hidden exists', async () => {
    vi.mocked(apiJson).mockResolvedValue({ status: 'unavailable', type: 'page', id: 5 } as any);
    open('/t/3/page/5');
    expect(await screen.findByText('This isn’t available')).toBeTruthy();
    expect(screen.getByText('You don’t have access to it, or it no longer exists.')).toBeTruthy();
  });

  it('offers to switch to the team a record is in', async () => {
    vi.mocked(apiJson).mockResolvedValue({ status: 'switch_team', type: 'event', id: 8, teamId: 7, teamName: 'Rivals' } as any);
    const onSwitch = open('/t/7/event/8');
    fireEvent.click(await screen.findByRole('button', { name: 'Switch to Rivals' }));
    expect(onSwitch).toHaveBeenCalledWith(7);
  });

  it('shows a plain message when the check itself fails', async () => {
    vi.mocked(apiJson).mockRejectedValue(new Error('Network down'));
    open('/t/3/task/1');
    expect(await screen.findByText('Couldn’t open this link')).toBeTruthy();
  });
});
