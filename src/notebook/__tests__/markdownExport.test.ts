import { describe, it, expect } from 'vitest';
import { entryDetailsLine, markdownFileName, notebookPageMarkdown } from '../markdownExport';

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

describe('Markdown export edge cases', () => {
  const doc = (...content: any[]) => ({ title: 'x', content: { type: 'doc', content } });
  const body = (md: string) => md.split('\n').slice(2).join('\n');

  it('names drawings and keeps canvas text boxes', () => {
    const md = notebookPageMarkdown({ title: 'x', content: { type: 'doc', content: [] }, canvas: { version: 1, objects: [
      { type: 'stroke' }, { type: 'stroke' }, { type: 'shape' },
      { type: 'text', content: { type: 'doc', content: [p(t('Gear ratio 3:1'))] } },
    ] } });
    expect(md).toContain('[drawing: 2 strokes, 1 shape]');
    expect(md).toContain('Text boxes on the page:\n\nGear ratio 3:1');
  });
  it('nests children under ordered items and keeps blocks inside an item', () => {
    const md = notebookPageMarkdown(doc({ type: 'orderedList', content: [{ type: 'listItem', content: [p(t('Parent')), { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('child'))] }] }, { type: 'codeBlock', content: [t('x = 1')] }] }] }));
    expect(body(md)).toBe(['1. Parent', '   - child', '', '   ```', '   x = 1', '   ```', ''].join('\n'));
  });
  it('keeps blank lines inside code and fences longer than the code\'s backticks', () => {
    const md = notebookPageMarkdown(doc({ type: 'codeBlock', content: [t('a\n\n\nb\n```')] }, p(t('use `x`', [{ type: 'code' }]))));
    expect(md).toContain('````\na\n\n\nb\n```\n````');
    expect(md).toContain('`` use `x` ``');
  });
  it('escapes plain text that would become formatting, including the title', () => {
    const md = notebookPageMarkdown({ title: '*Intake*', content: { type: 'doc', content: [p(t('~~retired~~')), p(t('1. not a list')), p(t('- not a bullet'))] } });
    expect(md).toContain(String.raw`# \*Intake\*`);
    expect(md).toContain(String.raw`\~\~retired\~\~`);
    expect(md).toContain(String.raw`1\. not a list`);
    expect(md).toContain(String.raw`\- not a bullet`);
  });
  it('keeps spaces outside formatting markers and encodes parentheses in links', () => {
    const md = notebookPageMarkdown(doc(p(t('Results ', [{ type: 'bold' }]), t('ok'), t(' math', [{ type: 'link', attrs: { href: 'https://example.com/Function_(mathematics)' } }]))));
    expect(md).toContain('**Results** ok [math](https://example.com/Function_%28mathematics%29)');
  });
});

describe('inline code edge spaces', () => {
  it('keeps spaces that are part of the code', () => {
    const md = notebookPageMarkdown({ title: 'x', content: { type: 'doc', content: [p(t('  x', [{ type: 'code' }])), p(t(' y ', [{ type: 'code' }]))] } });
    expect(md).toContain('`  x`');
    expect(md).toContain('`  y  `');
  });
});

describe('entry details in the export', () => {
  it('adds the details line when a page has them', () => {
    expect(entryDetailsLine({ workDate: '2026-10-15', type: 'test', stage: null, subsystems: ['Intake'], awards: [] })).toEqual(['Type Test · work happened on 2026-10-15 · subsystems Intake']);
    expect(entryDetailsLine(null)).toEqual([]);
    expect(notebookPageMarkdown({ title: 'x', createdAt: '2026-10-16T12:00:00Z', content: { type: 'doc', content: [] } }, entryDetailsLine({ workDate: null, type: 'build', stage: null, subsystems: [], awards: [] }))).toContain('*Written 2026-10-16 · Type Build*');
  });
});
