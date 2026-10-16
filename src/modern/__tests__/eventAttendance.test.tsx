// Attendance tied to today's event: the late window before absences, RSVP
// chips in roll call, and follow-through totals.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TodayEventCard, RsvpChip, todaysEvents } from '../pages/attendance/EventAttendance';
import { followThrough, lateWindowEnds } from '../../utils/eventAttendance';

afterEach(cleanup);

describe('event attendance', () => {
  it('the late window is 15 minutes after the start; none for all-day events', () => {
    expect(lateWindowEnds('2099-03-01', '16:00')!.getTime()).toBe(new Date('2099-03-01T16:15:00').getTime());
    expect(lateWindowEnds('2099-03-01', '')).toBeNull();
  });

  it('before the window ends it waits; after, one click marks the rest', () => {
    const ev = { id: 1, title: 'Build', date: '2099-03-01', start_time: '16:00', rsvp_mode: 'full', rsvp_counts: { going: 2, maybe: 0, not_going: 1 } };
    const onMarkRest = vi.fn();
    const { rerender } = render(<TodayEventCard event={ev} unmarked={3} onMarkRest={onMarkRest} now={new Date('2099-03-01T16:10:00').getTime()} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Waiting for people to arrive/);
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<TodayEventCard event={ev} unmarked={3} onMarkRest={onMarkRest} now={new Date('2099-03-01T16:16:00').getTime()} />);
    fireEvent.click(screen.getByRole('button', { name: /Mark the 3 not here absent/ }));
    expect(onMarkRest).toHaveBeenCalled();
    expect(screen.getByText(/2 going · 0 maybe · 1 can't make it/)).toBeTruthy();
  });

  it("chips, today's events and follow-through totals", () => {
    render(<><RsvpChip status="going" /><RsvpChip status="not_going" /><RsvpChip /></>);
    expect(screen.getByText('Said going')).toBeTruthy();
    expect(screen.getByText("Can't make it")).toBeTruthy();
    expect(todaysEvents([{ id: 1, date: '2099-03-01', start_time: '18:00' }, { id: 2, date: '2099-03-01', start_time: '09:00' }, { id: 3, date: '2099-03-02' }], '2099-03-01').map((e) => e.id)).toEqual([2, 1]);
    expect(followThrough([{ said_going: 4, going_came: 3 }, { said_going: 0, going_came: 0 }])).toEqual({ said: 4, came: 3, percent: 75 });
    expect(followThrough([]).percent).toBeNull();
  });
});
