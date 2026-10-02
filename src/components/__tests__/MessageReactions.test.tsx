import { describe, expect, it } from 'vitest';
import { applyReactionToggle, isCustomReaction, type Reaction } from '../MessageReactions';

const base: Reaction[] = [
  { emoji: '👍', count: 2, reacted_by_me: false, member_ids: [2, 3] },
  { emoji: '❤️', count: 1, reacted_by_me: true, member_ids: [1] },
];

describe('applyReactionToggle', () => {
  it('adds a new reaction chip when none exists', () => {
    const next = applyReactionToggle(base, '🔥', 1);
    expect(next).toHaveLength(3);
    const added = next.find((r) => r.emoji === '🔥')!;
    expect(added.count).toBe(1);
    expect(added.reacted_by_me).toBe(true);
    expect(added.member_ids).toEqual([1]);
  });

  it('joins an existing chip I have not reacted to', () => {
    const next = applyReactionToggle(base, '👍', 1);
    const chip = next.find((r) => r.emoji === '👍')!;
    expect(chip.count).toBe(3);
    expect(chip.reacted_by_me).toBe(true);
    expect(chip.member_ids).toEqual([2, 3, 1]);
  });

  it('removes my reaction but keeps the chip when others remain', () => {
    const withOthers: Reaction[] = [
      { emoji: '❤️', count: 2, reacted_by_me: true, member_ids: [1, 4] },
    ];
    const next = applyReactionToggle(withOthers, '❤️', 1);
    expect(next).toHaveLength(1);
    expect(next[0].count).toBe(1);
    expect(next[0].reacted_by_me).toBe(false);
    expect(next[0].member_ids).toEqual([4]);
  });

  it('removes the chip entirely when I was the only reactor', () => {
    const next = applyReactionToggle(base, '❤️', 1);
    expect(next.find((r) => r.emoji === '❤️')).toBeUndefined();
    expect(next).toHaveLength(1);
  });

  it('does not mutate the input array', () => {
    const snapshot = JSON.parse(JSON.stringify(base));
    applyReactionToggle(base, '👍', 1);
    expect(base).toEqual(snapshot);
  });
});

describe('isCustomReaction', () => {
  it('detects custom: prefixed ids', () => {
    expect(isCustomReaction('custom:12')).toBe(true);
    expect(isCustomReaction('👍')).toBe(false);
  });
});
