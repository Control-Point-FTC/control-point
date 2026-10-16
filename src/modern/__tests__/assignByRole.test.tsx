import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { AssigneePicker, rolesWithMembers } from '../pages/tasks/AssigneePicker';
import { normalizeBrunoTask } from '../../utils/brunoTasks';
import ActionProposalCard from '../../components/ActionProposalCard';
import { setProposalContext } from '../../services/proposalContext';
import { smartGroups } from '../../utils/assigneeGroups';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
Element.prototype.scrollIntoView ??= function () {};
afterEach(() => { cleanup(); setProposalContext(null); });

const members = [
  { id: 1, name: 'Ana', roles: [{ id: 10, name: 'Builders', color: '#22c55e' }] },
  { id: 2, name: 'Lee', roles: [{ id: 10, name: 'Builders', color: '#22c55e' }, { id: 11, name: 'Coders', color: null }] },
  { id: 3, name: 'Max', roles: [] },
];

describe('assign tasks by role in the task editor', () => {
  it('lists roles with who holds them', () => {
    expect(rolesWithMembers(members)).toEqual([
      { id: 10, name: 'Builders', color: '#22c55e', memberIds: [1, 2] },
      { id: 11, name: 'Coders', color: null, memberIds: [2] },
    ]);
  });

  it('picking a role adds everyone in it; picking it again when all are in takes them out', () => {
    const changes: number[][] = [];
    function Harness() { const [sel, setSel] = useState<number[]>([3]); return <AssigneePicker members={members} selected={sel} onChange={(ids) => { changes.push(ids); setSel(ids); }} />; }
    render(<Harness />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: /Everyone with the Builders role \(2\)/ }));
    expect(changes.at(-1)).toEqual([3, 1, 2]);
    fireEvent.click(screen.getByRole('option', { name: /Everyone with the Builders role/ }));
    expect(changes.at(-1)).toEqual([3]);
  });
});

describe('smart groups', () => {
  it('Everyone, then coaches and alumni from role names; a real role of the same name wins; empty groups are left out', () => {
    const m = [
      { id: 1, roleNames: ['Head Coach'] },
      { id: 2, roleNames: ['Mentors', 'Builders'] },
      { id: 3, roleNames: ['Alumni 2025'] },
      { id: 4, roleNames: [] },
    ];
    expect(smartGroups(m)).toEqual([
      { key: 'everyone', name: 'Everyone', memberIds: [1, 2, 3, 4] },
      { key: 'coaches', name: 'Coaches & mentors', memberIds: [1, 2] },
      { key: 'alumni', name: 'Alumni', memberIds: [3] },
    ]);
    expect(smartGroups(m, ['everyone']).map((g) => g.key)).toEqual(['coaches', 'alumni']);
    expect(smartGroups([{ id: 1, roleNames: ['Builders'] }]).map((g) => g.key)).toEqual(['everyone']);
  });

  it('the picker offers Everyone, which adds the whole team and takes it out again', () => {
    const changes: number[][] = [];
    function Harness() { const [sel, setSel] = useState<number[]>([]); return <AssigneePicker members={members} selected={sel} onChange={(ids) => { changes.push(ids); setSel(ids); }} />; }
    render(<Harness />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'Everyone (3)' }));
    expect(changes.at(-1)).toEqual([1, 2, 3]);
    fireEvent.click(screen.getByRole('option', { name: 'Everyone (3)' }));
    expect(changes.at(-1)).toEqual([]);
  });
});

describe("Bruno's tasks by role", () => {
  it('matches role names in any case and reports unknown ones', () => {
    const roles = [{ name: 'Builders', members: ['Ana', 'Lee'] }];
    const t = normalizeBrunoTask({ title: 'Cut tiles', roles: ['builders', 'Pit crew'] }, '2026-10-11', ['Ana', 'Lee'], { fromText: false, roles });
    expect(t.roles).toEqual(['Builders']);
    expect(t.unmatchedRoles).toEqual(['Pit crew']);
  });

  it("the confirm card says who a role covers and flags roles the team doesn't have", () => {
    setProposalContext({ today: '2026-10-11', roster: ['Ana', 'Lee'], roles: [{ name: 'Builders', members: ['Ana', 'Lee'] }] });
    render(<ActionProposalCard proposals={[{ kind: 'task', items: [{ title: 'Cut tiles', roles: ['builders'] }, { title: 'Pit job', roles: ['Pit crew'] }] }] as any} status="pending" onConfirm={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText(/Cut tiles — → everyone in Builders \(Ana, Lee\)/)).toBeTruthy();
    expect(screen.getByText(/Pit job — no single role named Pit crew/)).toBeTruthy();
  });
});
