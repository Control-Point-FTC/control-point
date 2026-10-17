import { describe, it, expect } from 'vitest';
import { extractActionProposals, stripEventBlocks } from '../../services/aiService';

describe('Bruno parts card', () => {
  it('reads a parts block and hides it from the chat', () => {
    const text = 'Adding it.\n```parts\n[{"name":"Rhino wheel","quantity":4,"section":"Drivetrain"}]\n```';
    expect(extractActionProposals(text)).toEqual([{ kind: 'part', items: [{ name: 'Rhino wheel', quantity: 4, section: 'Drivetrain' }] }]);
    expect(stripEventBlocks(text)).toBe('Adding it.');
  });
});
