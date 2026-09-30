/**
 * Bruno action-proposal parsing — client-side extraction of fenced action
 * blocks (```event, ```delete-event, ```tasks, ...) into confirm-card
 * proposals. Pure functions in src/services/aiService.ts.
 */
import { describe, it, expect } from 'vitest';
import { extractActionProposals, stripEventBlocks } from '../../../services/aiService';

describe('extractActionProposals', () => {
  it('parses a delete-event block into id-only items', () => {
    const text = `Removing those holidays:\n\`\`\`delete-event\n[{"id":12,"title":"Columbus Day","date":"2026-10-12"},{"id":13,"title":"Veterans Day","date":"2026-11-11"}]\n\`\`\``;
    const proposals = extractActionProposals(text);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].kind).toBe('delete-event');
    expect(proposals[0].items).toHaveLength(2);
    expect(proposals[0].items[0]).toMatchObject({ id: 12, title: 'Columbus Day', date: '2026-10-12' });
  });

  it('drops delete-event items without a valid positive integer id', () => {
    const text = `\`\`\`delete-event\n[{"id":"abc"},{"title":"No id"},{"id":-4},{"id":7}]\n\`\`\``;
    const proposals = extractActionProposals(text);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].items).toHaveLength(1);
    expect(proposals[0].items[0].id).toBe(7);
  });

  it('coerces string ids to numbers', () => {
    const text = `\`\`\`delete-event\n[{"id":"42","title":"X"}]\n\`\`\``;
    const proposals = extractActionProposals(text);
    expect(proposals[0].items[0].id).toBe(42);
  });

  it('returns no proposals for malformed JSON', () => {
    const text = `\`\`\`delete-event\nnot json at all\n\`\`\``;
    expect(extractActionProposals(text)).toHaveLength(0);
  });

  it('still parses event blocks alongside delete-event blocks', () => {
    const text = `\`\`\`event\n[{"title":"A","date":"2026-10-01"}]\n\`\`\`\n\`\`\`delete-event\n[{"id":9}]\n\`\`\``;
    const proposals = extractActionProposals(text);
    expect(proposals.map((p) => p.kind).sort()).toEqual(['delete-event', 'event']);
  });

  it('caps delete-event items at 20', () => {
    const items = Array.from({ length: 30 }, (_, i) => ({ id: i + 1 }));
    const text = `\`\`\`delete-event\n${JSON.stringify(items)}\n\`\`\``;
    expect(extractActionProposals(text)[0].items).toHaveLength(20);
  });
});

describe('stripEventBlocks', () => {
  it('strips delete-event blocks from displayed text', () => {
    const text = `Done:\n\`\`\`delete-event\n[{"id":1}]\n\`\`\`\nThanks!`;
    const stripped = stripEventBlocks(text);
    expect(stripped).not.toContain('delete-event');
    expect(stripped).not.toContain('"id":1');
    expect(stripped).toContain('Thanks!');
  });

  it('strips a partially-streamed delete-event block', () => {
    const text = `Working on it\n\`\`\`delete-event\n[{"id":1},`;
    expect(stripEventBlocks(text)).not.toContain('delete-event');
  });
});
