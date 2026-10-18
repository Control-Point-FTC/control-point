import type { Editor } from '@tiptap/core';
/** Pastes plain text as real paragraphs (one per line), never as markup. */
export function pasteNotebookText(editor: Editor, text: string) {
  if (!editor.isEditable || !text) return;
  editor.commands.insertContent(text.replace(/\r\n?/g, '\n').split('\n').map(line => ({ type: 'paragraph', ...(line ? { content: [{ type: 'text', text: line }] } : {}) })));
}
