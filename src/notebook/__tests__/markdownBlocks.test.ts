import { describe, it, expect } from 'vitest';
import { markdownToNotebookBlocks } from '../markdownBlocks';
import { validatedNotebookDocument } from '../editorSchema';

const strip = (v: any): any => Array.isArray(v) ? v.map(strip) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'id').map(([k, x]) => [k, strip(x)])) : v;

describe('markdownToNotebookBlocks', () => {
  it('turns Markdown into real, schema-valid notebook blocks', () => {
    const blocks = markdownToNotebookBlocks([
      '## Intake test', '', 'We tried **19.2:1** with *new* `belts` and ~~old~~ [docs](https://example.com).', '',
      '- [x] Order belts', '- [ ] Test again', '', '1. First', '2. Second', '   - nested', '', '> Quote', '', '```java', 'int x = 1;', '```', '', '---', '',
      '| Part | Qty |', '| --- | --- |', '| Belt | 2 |',
    ].join('\n'));
    expect(blocks.map(b => b.type)).toEqual(['heading', 'paragraph', 'taskList', 'orderedList', 'blockquote', 'codeBlock', 'horizontalRule', 'table']);
    expect(() => validatedNotebookDocument({ type: 'doc', content: blocks })).not.toThrow();
    const para = strip(blocks[1]);
    expect(para.content).toEqual([
      { type: 'text', text: 'We tried ' }, { type: 'text', text: '19.2:1', marks: [{ type: 'bold' }] }, { type: 'text', text: ' with ' },
      { type: 'text', text: 'new', marks: [{ type: 'italic' }] }, { type: 'text', text: ' ' }, { type: 'text', text: 'belts', marks: [{ type: 'code' }] },
      { type: 'text', text: ' and ' }, { type: 'text', text: 'old', marks: [{ type: 'strike' }] }, { type: 'text', text: ' ' },
      { type: 'text', text: 'docs', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] }, { type: 'text', text: '.' },
    ]);
    expect(strip(blocks[2]).content.map((i: any) => i.attrs.checked)).toEqual([true, false]);
    expect(strip(blocks[3]).content[1].content[1].type).toBe('bulletList');
    expect(strip(blocks[5])).toMatchObject({ attrs: { language: 'java' }, content: [{ text: 'int x = 1;' }] });
    expect(strip(blocks[7]).content[0].content[0].type).toBe('tableHeader');
  });

  it('gives every block a fresh unique id', () => {
    const a = markdownToNotebookBlocks('one\n\ntwo');
    const b = markdownToNotebookBlocks('one');
    const ids = [...a, ...b].map(n => n.attrs?.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('drops unsafe links, raw HTML markup and images to plain text', () => {
    const [p] = strip(markdownToNotebookBlocks('[x](javascript:alert(1)) <b>hi</b> ![img](https://e.com/a.png)'));
    expect(JSON.stringify(p)).not.toContain('javascript');
    expect(JSON.stringify(p)).not.toContain('"link"');
    expect(() => validatedNotebookDocument({ type: 'doc', content: markdownToNotebookBlocks('<script>x</script>\n\n<div>y</div>') })).not.toThrow();
  });

  it('returns nothing for blank input and caps huge input', () => {
    expect(markdownToNotebookBlocks('   \n ')).toEqual([]);
    expect(markdownToNotebookBlocks('p\n\n'.repeat(5000)).length).toBeLessThanOrEqual(400);
  });
});
