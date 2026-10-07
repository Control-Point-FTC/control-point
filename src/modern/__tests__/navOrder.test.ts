import { describe, it, expect } from 'vitest';
import { applyNavOrder, moveId, type ModernNavSection } from '../nav';

const item = (id: string) => ({ id, path: id, labelKey: id, icon: () => null, matches: [id] });
const sections: ModernNavSection[] = [
  { id: 'team', label: 'Team', items: [item('teams'), item('attendance'), item('tasks')] },
  { id: 'compete', label: 'Compete', items: [item('stats'), item('predict')] },
  { id: 'build', label: 'Build', items: [item('cad'), item('code')] },
];
const ids = (s: ModernNavSection[]) => s.map((x) => `${x.id}:${x.items.map((i) => i.id).join(',')}`);

describe('sidebar order', () => {
  it('applies a saved section and item order', () => {
    const r = applyNavOrder(sections, { sections: ['compete', 'team', 'build'], items: { team: ['tasks', 'teams', 'attendance'] } });
    expect(ids(r)).toEqual(['compete:stats,predict', 'team:tasks,teams,attendance', 'build:cad,code']);
  });

  it('pages not in the saved order keep their default place after the saved ones (nothing is hidden)', () => {
    const r = applyNavOrder(sections, { sections: ['build'], items: { team: ['tasks'] } });
    expect(ids(r)).toEqual(['build:cad,code', 'team:tasks,teams,attendance', 'compete:stats,predict']);
    // Unknown ids in the saved order are ignored.
    expect(ids(applyNavOrder(sections, { sections: ['gone', 'team'] }))[0]).toBe('team:teams,attendance,tasks');
  });

  it('no saved order: unchanged', () => {
    expect(applyNavOrder(sections, null)).toBe(sections);
  });

  it('moves an id up, down or to a drop position, clamped', () => {
    expect(moveId(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
    expect(moveId(['a', 'b', 'c'], 'a', 1)).toEqual(['b', 'a', 'c']);
    expect(moveId(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(moveId(['a', 'b', 'c'], 'b', 9)).toEqual(['a', 'c', 'b']);
    expect(moveId(['a', 'b'], 'z', 0)).toEqual(['a', 'b']);
  });
});
