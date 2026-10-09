import type { Editor } from '@tiptap/core';
export interface NotebookMatch { from: number; to: number }
/** Textblock position maps keep matches correct across differently marked spans. */
export function notebookMatches(editor: Editor, query: string, caseSensitive = false): NotebookMatch[] {
  if (!query) return [];
  const matches: NotebookMatch[] = [];
  editor.state.doc.descendants((node, position) => {
    if (!node.isTextblock) return true;
    const positions: number[] = [], parts: string[] = [];
    node.descendants((child, offset) => {
      if (!child.isText || !child.text) return;
      parts.push(child.text);
      for (let i = 0; i < child.text.length; i++) positions.push(position + 1 + offset + i);
    });
    const source = parts.join('');
    // Unicode lowercasing can change length. Use escaped RegExp matches on the
    // original string so mapped UTF-16 offsets remain valid for the editor.
    const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi');
    for (const match of source.matchAll(pattern)) {
      const start = match.index!; const end = start + match[0].length - 1;
      if (matches.length >= 5000) break;
      matches.push({ from: positions[start], to: positions[end] + 1 });
    }
    return false;
  });
  return matches;
}
export function replaceNotebookMatches(editor: Editor, matches: NotebookMatch[], replacement: string) {
  if (!editor.isEditable || !matches.length) return false;
  let tr = editor.state.tr;
  for (const match of [...matches].sort((a,b) => b.from - a.from)) tr = replacement ? tr.insertText(replacement, match.from, match.to) : tr.delete(match.from, match.to);
  editor.view.dispatch(tr); return true;
}
export function notebookIndent(editor: Editor, direction: -1 | 1) {
  if (!editor.isEditable) return;
  if (editor.isActive('listItem')) { direction === 1 ? editor.commands.sinkListItem('listItem') : editor.commands.liftListItem('listItem'); return; }
  if (editor.isActive('taskItem')) { direction === 1 ? editor.commands.sinkListItem('taskItem') : editor.commands.liftListItem('taskItem'); return; }
  const type = editor.isActive('heading') ? 'heading' : 'paragraph';
  editor.commands.updateAttributes(type, { indent: Math.min(6, Math.max(0, Number(editor.getAttributes(type).indent ?? 0) + direction)) });
}
