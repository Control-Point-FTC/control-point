import { describe, it, expect } from 'vitest';
import { STARTER_CHECKLISTS, cleanChecklistTemplate, itemCount, runProgress, starterTemplate } from '../checklists';

describe('checklist templates', () => {
  it('starter templates have the advertised sizes', () => {
    const sizes = Object.fromEntries(STARTER_CHECKLISTS.map((s) => [s.key, itemCount(starterTemplate(s.key)!)]));
    expect(sizes).toEqual({ 'pre-match': 24, 'post-match': 9, 'pit-setup': 27, 'pit-teardown': 19, 'travel-day': 12, 'robot-lockup': 14, 'competition-debrief': 8 });
  });
  it('validates, trims and keeps item ids unique', () => {
    const c = cleanChecklistTemplate({ title: '  Pit  ', sections: [{ title: 'Power', items: [' Charge ', '', { id: 'x', text: 'Plug in' }, { id: 'x', text: 'Again' }] }] });
    expect(c).toEqual({ value: { title: 'Pit', sections: [{ id: 's1', title: 'Power', items: [{ id: 's1i1', text: 'Charge' }, { id: 'x', text: 'Plug in' }, { id: 's1i4', text: 'Again' }] }] } });
    expect(cleanChecklistTemplate({ title: 'x', items: ['a', 'b'] })).toMatchObject({ value: { sections: [{ items: [{ text: 'a' }, { text: 'b' }] }] } });
    expect(cleanChecklistTemplate({ title: '', items: ['a'] })).toHaveProperty('error');
    expect(cleanChecklistTemplate({ title: 'x', items: [] })).toHaveProperty('error');
    expect(cleanChecklistTemplate({ title: 'x', items: Array(121).fill('a') })).toHaveProperty('error');
  });
  it('progress leaves N/A items out of the total', () => {
    const t = starterTemplate('post-match')!;
    const ids = t.sections[0].items.map((i) => i.id);
    expect(runProgress(t.sections, { [ids[0]]: 'done', [ids[1]]: 'na', [ids[2]]: 'partial' })).toEqual({ done: 1, total: 8, partial: 1, na: 1 });
  });
});
