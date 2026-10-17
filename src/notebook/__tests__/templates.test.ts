import { describe, it, expect } from 'vitest';
import { NOTEBOOK_TEMPLATES, notebookTemplate } from '../templates';
import { parseNotebookOps } from '../../../server/brunoNotebookActions';

const headings = (id: string) => (notebookTemplate(id).content ?? []).filter((n) => n.type === 'heading').map((n) => n.content?.[0]?.text);

describe('notebook templates', () => {
  it('has the engineering templates teams log most', () => {
    expect(NOTEBOOK_TEMPLATES.map((t) => t.id)).toEqual(expect.arrayContaining(['test', 'failure', 'outreach', 'competition', 'code', 'iteration']));
    expect(headings('iteration')).toEqual(['Hypothesis', 'Changes from the last version', 'Results', 'Was the hypothesis right?', 'Next iteration']);
    expect(headings('failure')).toContain('Root cause');
    expect(headings('competition')).toContain("What didn't");
  });
  it('every template ends with a paragraph and is a fresh copy', () => {
    for (const t of NOTEBOOK_TEMPLATES) {
      const doc = notebookTemplate(t.id);
      expect(doc.content?.at(-1)?.type).toBe('paragraph');
      expect(doc.content).not.toBe(t.content);
    }
  });
  it('Bruno can create a page from a new template', () => {
    expect(parseNotebookOps([{ op: 'create', title: 'Arm test', template: 'test' }])).toEqual([expect.objectContaining({ op: 'create', template: 'test' })]);
  });
});
