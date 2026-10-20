// RSVP buttons: the choices follow the event's RSVP style; "Can't make it" asks
// for a reason; tapping your answer again takes it back; a failure rolls back.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));
const dialog = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('../../components/dialog', async (orig) => ({ ...(await orig<object>()), ...dialog }));

import { RsvpButtons, rsvpCountsText } from '../ui/RsvpButtons';
import { itemSummary } from '../../components/ActionProposalCard';

afterEach(cleanup);
beforeEach(() => { api.apiFetch.mockReset(); api.apiFetch.mockResolvedValue({ ok: true, json: async () => ({}) }); dialog.notify.mockReset(); });

const body = () => JSON.parse(api.apiFetch.mock.calls.at(-1)![1].body);

describe('RsvpButtons', () => {
  it('an old answer on an event no longer taking yours can still be taken back', async () => {
    const mine = { status: 'not_going', reason: 'Trip', excused: true };
    const { unmount } = render(<RsvpButtons event={{ id: 8, title: 'Scrimmage', rsvp_mode: 'none', invited: true, my_rsvp: mine }} />);
    expect(screen.queryByRole('button', { name: /Can't make it/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Take it back' }));
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/events/8/rsvp', expect.objectContaining({ method: 'PUT' })));
    expect(body()).toEqual({ status: null, reason: '' });
    unmount();
    // Not invited any more: same.
    render(<RsvpButtons event={{ id: 9, title: 'Builders night', rsvp_mode: 'decline_only', invited: false, my_rsvp: mine }} />);
    expect(screen.getByRole('button', { name: 'Take it back' })).toBeTruthy();
  });

  it('nothing to show when the event takes no answers from you and you gave none', () => {
    const { container } = render(<RsvpButtons event={{ id: 10, title: 'Meet', rsvp_mode: 'none', invited: true, my_rsvp: null }} />);
    expect(container.innerHTML).toBe('');
  });

  it("can't-make-it only: one button, asks why, sends the reason", async () => {
    render(<RsvpButtons event={{ id: 4, title: 'Practice', rsvp_mode: 'decline_only', invited: true, my_rsvp: null }} />);
    expect(screen.queryByRole('button', { name: /Going/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Can't make it/ }));
    fireEvent.change(screen.getByLabelText("Reason you can't make it"), { target: { value: 'Dentist' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/events/4/rsvp', expect.objectContaining({ method: 'PUT' })));
    expect(body()).toEqual({ status: 'not_going', reason: 'Dentist' });
    // The default mock says nothing was excused (a record already existed): no claim of an excuse.
    expect(await screen.findByText('Reason: Dentist')).toBeTruthy();
  });

  it('says "excused on attendance" only when the server actually excused it', async () => {
    api.apiFetch.mockResolvedValue({ ok: true, json: async () => ({ success: true, excused: true }) });
    render(<RsvpButtons event={{ id: 6, title: 'Practice', rsvp_mode: 'decline_only', invited: true, my_rsvp: null }} />);
    fireEvent.click(screen.getByRole('button', { name: /Can't make it/ }));
    fireEvent.change(screen.getByLabelText("Reason you can't make it"), { target: { value: 'Sick' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Reason: Sick · excused on attendance')).toBeTruthy();
  });

  it('full RSVP: Going, then tap again to take it back; a failed save rolls back', async () => {
    render(<RsvpButtons event={{ id: 5, title: 'Build', rsvp_mode: 'full', invited: true, my_rsvp: null }} />);
    fireEvent.click(screen.getByRole('button', { name: /Going/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Going/ })).toHaveAttribute('aria-pressed', 'true'));
    expect(body()).toEqual({ status: 'going', reason: '' });
    api.apiFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Nope' }) });
    fireEvent.click(screen.getByRole('button', { name: /Going/ }));
    await waitFor(() => expect(dialog.notify).toHaveBeenCalledWith('Nope', 'error'));
    expect(screen.getByRole('button', { name: /Going/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it("nothing for events without RSVP or for other roles; counts read plainly", () => {
    const { container } = render(<><RsvpButtons event={{ id: 1, rsvp_mode: 'none' }} /><RsvpButtons event={{ id: 2, rsvp_mode: 'full', invited: false }} /></>);
    expect(container.textContent).toBe('');
    expect(rsvpCountsText({ rsvp_mode: 'full', rsvp_counts: { going: 3, maybe: 1, not_going: 2 } })).toBe("3 going · 1 maybe · 2 can't make it");
    expect(rsvpCountsText({ rsvp_mode: 'decline_only', rsvp_counts: { going: 0, maybe: 0, not_going: 2 } })).toBe("2 can't make it");
  });

  it("Bruno's RSVP card reads plainly", () => {
    expect(itemSummary('event-rsvp', { id: 42, title: 'Saturday practice', status: 'not_going', reason: 'Dentist' })).toBe("Saturday practice — Can't make it · Dentist");
    expect(itemSummary('event-rsvp', { id: 42, status: null })).toBe('Event #42 — Take back my answer');
  });
});
