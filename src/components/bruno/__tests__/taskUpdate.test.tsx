// Bruno edits an existing task instead of adding a duplicate ("Updating the
// task…" used to confirm as "Added 1 item" and create a second task).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { extractActionProposals, stripEventBlocks } from '../../../services/aiService';
import { resolveProposals, setProposalContext, setTaskIndex } from '../../../services/proposalContext';
import { normalizeTaskUpdate } from '../../../utils/brunoTasks';
import { resultLinks } from '../resultLinks';
import ActionProposalCard from '../../ActionProposalCard';
import { ProposalCard } from '../../../modern/pages/bruno/BrunoParts';

const roster = ['Arnav Patel', 'Grace Hopper'];
afterEach(() => { cleanup(); setProposalContext(null); });

const reply = 'Updating the task to note it is for First Street Kids.\n```task-update\n[{"id":12,"description":"For the First Street Kids demo","priority":"HIGH"}]\n```';

describe('Bruno task updates', () => {
  it('reads a task-update block as an edit, not a new task, and hides it from the text', () => {
    expect(extractActionProposals(reply)).toEqual([{ kind: 'task-update', items: [{ id: 12, description: 'For the First Street Kids demo', priority: 'HIGH' }] }]);
    expect(stripEventBlocks(reply)).toBe('Updating the task to note it is for First Street Kids.');
  });

  it('keeps only the fields that change, cleaned', () => {
    expect(normalizeTaskUpdate({ id: '#7', due_date: null, priority: 'none', assignees: ['arnav', 'Zed'], status: 'In Progress', repeat: 'weekly' }, roster)).toEqual({
      id: 7, unmatched: ['Zed'], unmatchedRoles: [], refused: [],
      changes: { due_date: null, priority: null, assignees: ['Arnav Patel'], status: 'in-progress', recurrence: { freq: 'weekly', interval: 1 } },
    });
    // Done needs the completion dialog's proof; nobody matched never unassigns everyone.
    expect(normalizeTaskUpdate({ id: 3, status: 'done', assignees: ['Zed'] }, roster)).toEqual({ id: 3, changes: {}, unmatched: ['Zed'], unmatchedRoles: [], refused: ['status'] });
    expect(normalizeTaskUpdate({ id: 0, title: 'x' }, roster)).toBeNull();
    expect(normalizeTaskUpdate({ id: 5 }, roster)).toBeNull();
    // Long text is kept whole (cutting it would erase saved words).
    const long = 'x'.repeat(2000);
    expect(normalizeTaskUpdate({ id: 5, description: long }, roster)?.changes.description).toBe(long);
    // Before the roster loads, names are kept for the server to resolve.
    expect(normalizeTaskUpdate({ id: 5, assignees: ['arnav'] }, null)?.changes.assignees).toEqual(['arnav']);
    // Roles: the team's spelling, never a guess between two.
    const teamRoles = [{ name: 'Builders', members: ['Arnav Patel'] }, { name: 'Twin', members: [] }, { name: 'Twin', members: [] }];
    expect(normalizeTaskUpdate({ id: 5, roles: ['builders', 'Twin', 'Pit'] }, roster, teamRoles)).toEqual({ id: 5, changes: { roles: ['Builders'] }, unmatched: [], unmatchedRoles: ['Twin', 'Pit'], refused: [] });
  });

  it('Confirm sends exactly the resolved changes', () => {
    setProposalContext({ today: '2026-10-11', roster });
    expect(resolveProposals([{ kind: 'task-update', items: [{ id: 12, title: 'ignored label?', assignees: ['grace'] }, { id: 0 }] }])).toEqual([
      { kind: 'task-update', items: [{ id: 12, title: 'ignored label?', assignees: ['Grace Hopper'] }] },
    ]);
  });

  it('the card names the real task, says Update, and flags a deleted one', () => {
    setProposalContext({ today: '2026-10-11', roster });
    setTaskIndex([{ id: 12, title: 'Build the intake', status: 'todo' }]);
    const proposals = [{ kind: 'task-update', items: [{ id: 12, priority: 'high', description: 'For the demo' }, { id: 99, title: 'Gone' }] }] as any;
    render(<MemoryRouter><ActionProposalCard proposals={proposals} status="pending" onConfirm={() => {}} onDismiss={() => {}} /></MemoryRouter>);
    expect(screen.getByText('Update 2 items?')).toBeTruthy();
    expect(screen.getByText('Build the intake — description becomes “For the demo” · high priority')).toBeTruthy();
    expect(screen.getByText('Task #99 — not found (it may have been deleted)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Update all 2' })).toBeTruthy();
  });

  it('once applied, both cards say Updated and link to the task', () => {
    setTaskIndex([{ id: 12, title: 'Build the intake', status: 'todo' }]);
    const proposals = [{ kind: 'task-update', items: [{ id: 12, priority: 'high' }] }] as any;
    const links = resultLinks({ applied: { 'task-update': 1 }, created: { 'task-update': [12] } });
    expect(links).toEqual([{ label: 'View task', to: '/tasks?task=12' }]);
    render(<MemoryRouter><ActionProposalCard proposals={proposals} status="done" links={links} onConfirm={() => {}} onDismiss={() => {}} /><ProposalCard proposals={proposals} status="done" links={links} onConfirm={() => {}} onDismiss={() => {}} /></MemoryRouter>);
    expect(screen.getAllByText(/Updated 1 item/)).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'View task' })).toHaveLength(2);
    // New and edited tasks together: one link to the list.
    expect(resultLinks({ applied: { task: 1, 'task-update': 1 }, created: { task: [3], 'task-update': [12] } })).toEqual([{ label: 'View 2 tasks', to: '/tasks' }]);
  });
});

describe('the shared task list behind edit cards', () => {
  it('several cards share one request; a task change refetches once', async () => {
    const { loadTaskIndex, invalidateTaskIndex, getTaskIndex } = await import('../../../services/proposalContext');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify([{ id: 12, title: 'Build the intake', status: 'todo' }]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    try {
      await Promise.all([loadTaskIndex(), loadTaskIndex(), loadTaskIndex()]);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(getTaskIndex()?.get(12)?.title).toBe('Build the intake');
      await loadTaskIndex(); // fresh enough: no new request
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      invalidateTaskIndex(); // no card open: just forgotten
      expect(getTaskIndex()).toBeNull();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally { fetchSpy.mockRestore(); }
  });
});
