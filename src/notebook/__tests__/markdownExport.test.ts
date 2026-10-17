import { describe, it, expect } from 'vitest';
import { markdownFileName, notebookPageMarkdown } from '../markdownExport';

const t = (text: string, marks?: any[]) => ({ type: 'text', text, ...(marks ? { marks } : {}) });
const p = (...content: any[]) => ({ type: 'paragraph', content });

describe('notebook page as Markdown', () => {
  it('converts headings, marks, links, lists, checklists, quotes, code and tables', () => {
    const md = notebookPageMarkdown({
      title: 'Intake v3', createdAt: '2026-10-15T18:00:00Z',
      content: { type: 'doc', content: [
        { type: 'heading', attrs: { level: 2 }, content: [t('Results')] },
        p(t('Grabbed '), t('9 of 10', [{ type: 'bold' }]), t(' rings, see '), t('the video', [{ type: 'link', attrs: { href: 'https://example.com/v' } }]), t(' and '), t('x*y', [{ type: 'code' }])),
        { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('Lower roller')), { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('by 10 mm'))] }] }] }] },
        { type: 'orderedList', content: [{ type: 'listItem', content: [p(t('First'))] }, { type: 'listItem', content: [p(t('Second'))] }] },
        { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [p(t('Test at 12V'))] }, { type: 'taskItem', attrs: { checked: false }, content: [p(t('Retest'))] }] },
        { type: 'blockquote', content: [p(t('Mentor: nice work'))] },
        { type: 'codeBlock', attrs: { language: 'java' }, content: [t('intake.setPower(1);')] },
        { type: 'table', content: [
          { type: 'tableRow', content: [{ type: 'tableHeader', content: [p(t('Run'))] }, { type: 'tableHeader', content: [p(t('Rings'))] }] },
          { type: 'tableRow', content: [{ type: 'tableCell', content: [p(t('1'))] }, { type: 'tableCell', content: [p(t('9|10'))] }] },
        ] },
        { type: 'notebookFile', attrs: { name: 'intake.pdf' } },
      ] },
    }, ['Type Test']);
    expect(md).toBe([
      '# Intake v3', '', '*Written 2026-10-15 · Type Test*', '',
      '## Results', '',
      'Grabbed **9 of 10** rings, see [the video](https://example.com/v) and `x*y`', '',
      '- Lower roller', '  - by 10 mm', '',
      '1. First', '2. Second', '',
      '- [x] Test at 12V', '- [ ] Retest', '',
      '> Mentor: nice work', '',
      '```java', 'intake.setPower(1);', '```', '',
      '| Run | Rings |', '| --- | --- |', String.raw`| 1 | 9\|10 |`, '',
      '[file: intake.pdf]', '',
    ].join('\n'));
  });
  it('escapes Markdown characters in plain text and drops unsafe links', () => {
    const md = notebookPageMarkdown({ title: 'x', content: { type: 'doc', content: [p(t('2*3 = 6 # not a heading')), p(t('click', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]))] } });
    expect(md).toContain(String.raw`2\*3 = 6 \# not a heading`);
    expect(md).toContain('\nclick\n');
    expect(md).not.toContain('javascript:');
  });
  it('makes a safe file name', () => {
    expect(markdownFileName('Intake v3: lower roller!')).toBe('intake-v3-lower-roller.md');
    expect(markdownFileName('')).toBe('notebook-page.md');
  });
});
