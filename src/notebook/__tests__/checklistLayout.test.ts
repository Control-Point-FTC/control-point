// Checklist items sit beside their checkbox: prose.css's flex rule must match
// the item the editor really renders. It targeted li[data-type=taskItem], an
// attribute the rendered item doesn't carry, so every box sat above its text.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { notebookExtensions } from '../editorSchema';

const css = readFileSync(join(process.cwd(), 'src/notebook/prose.css'), 'utf8');
let editor: Editor | null = null;
afterEach(() => { editor?.destroy(); editor = null; });

describe('checklist layout', () => {
  it('lays each rendered checklist item out beside its checkbox', () => {
    const host = document.createElement('div'); document.body.append(host);
    editor = new Editor({ element: host, extensions: notebookExtensions(false, true), content: { type: 'doc', content: [{ type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Order rollers' }] }] }] }] } });
    editor.view.dom.classList.add('nb-prose');
    const item = host.querySelector('ul li')!;
    expect(item).toBeTruthy();
    const flexSelectors = [...css.matchAll(/([^{}]+)\{display:flex;gap:10px;align-items:flex-start\}/g)].flatMap(m => m[1].split(',').map(s => s.trim()));
    expect(flexSelectors.some(selector => item.matches(selector))).toBe(true);
  });
});
