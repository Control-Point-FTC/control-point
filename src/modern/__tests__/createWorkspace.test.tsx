import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));

import { CreateWorkspaceForm } from '../pages/people/CreateWorkspaceForm';

const lookup = (body: any, ok = true) => vi.fn(async () => ({ ok, json: async () => body }));

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
beforeEach(() => { api.apiFetch.mockReset(); });

function mount() {
  const onCreate = vi.fn(async () => {});
  const onRequested = vi.fn();
  render(<CreateWorkspaceForm onCreate={onCreate} onRequested={onRequested} />);
  return { onCreate, onRequested };
}

describe('CreateWorkspaceForm (FTC number first)', () => {
  it('creates from a verified FTC number', async () => {
    vi.stubGlobal('fetch', lookup({ number: 20000, name: 'Fresh Bots', schoolName: 'New School', claimed: false }));
    const p = mount();
    fireEvent.change(screen.getByLabelText('FTC team number'), { target: { value: '20000' } });
    expect(await screen.findByText('Fresh Bots', {}, { timeout: 3000 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Create workspace/ }));
    await waitFor(() => expect(p.onCreate).toHaveBeenCalledWith({ ftc_number: '20000' }));
  });

  it('a claimed number offers "Ask to join" instead of creating', async () => {
    vi.stubGlobal('fetch', lookup({ number: 4215, name: 'Hypnotic', claimed: true }));
    api.apiFetch.mockResolvedValue({ ok: true, json: async () => ({ pendingApproval: true, team: { name: 'Hypnotic Workspace' } }) });
    const p = mount();
    fireEvent.change(screen.getByLabelText('FTC team number'), { target: { value: '4215' } });
    const ask = await screen.findByRole('button', { name: /Ask to join/ }, { timeout: 3000 });
    expect(screen.getByRole('button', { name: /Create workspace/ })).toBeDisabled();
    fireEvent.click(ask);
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/teams/request-join', expect.objectContaining({ method: 'POST' })));
    expect(JSON.parse(api.apiFetch.mock.calls[0][1].body)).toEqual({ ftc_number: 4215 });
    await waitFor(() => expect(p.onRequested).toHaveBeenCalledWith('Hypnotic Workspace'));
  });

  it('a 409 from the server (claimed meanwhile) also offers "Ask to join"', async () => {
    vi.stubGlobal('fetch', lookup({ number: 4215, name: 'Hypnotic', claimed: false }));
    const onCreate = vi.fn(async () => { throw Object.assign(new Error('taken'), { data: { ftcTaken: { number: 4215 } } }); });
    render(<CreateWorkspaceForm onCreate={onCreate} onRequested={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('FTC team number'), { target: { value: '4215' } });
    await screen.findByText('Hypnotic', {}, { timeout: 3000 });
    fireEvent.click(screen.getByRole('button', { name: /Create workspace/ }));
    expect(await screen.findByRole('button', { name: /Ask to join/ })).toBeInTheDocument();
  });

  it('without a number, a typed name is required', async () => {
    const p = mount();
    const create = screen.getByRole('button', { name: /Create workspace/ });
    expect(create).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Team name'), { target: { value: 'Garage Club' } });
    fireEvent.click(create);
    await waitFor(() => expect(p.onCreate).toHaveBeenCalledWith({ ftc_number: undefined, name: 'Garage Club' }));
  });
});
