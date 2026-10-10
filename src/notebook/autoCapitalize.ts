import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

// New lines start with a capital letter, like most note apps. Backspace right
// after it puts the lowercase letter back; code blocks are left alone; the
// choice is kept on this device (Review → Auto-capitalize).
//
// A plain text-input handler rather than a Tiptap input rule: input rules
// give up when another plugin touches the document in the same keystroke
// (block ids are assigned on a block's first character).
export const AUTO_CAPITALIZE_KEY = 'cp-notebook-autocapitalize';
export function autoCapitalizeEnabled() {
  try { return localStorage.getItem(AUTO_CAPITALIZE_KEY) !== 'off'; } catch { return true; }
}
export function setAutoCapitalize(on: boolean) {
  try { localStorage.setItem(AUTO_CAPITALIZE_KEY, on ? 'on' : 'off'); } catch { /* optional device preference */ }
}

type Undo = { pos: number; original: string } | null;
const key = new PluginKey<Undo>('notebookAutoCapitalize');

/** Let Backspace put back the lowercase letter at `pos` (used when text
 *  arrives some other way, e.g. a canvas text box made by typing). */
export function rememberCapital(view: EditorView, pos: number, original: string) {
  view.dispatch(view.state.tr.setMeta(key, { pos, original }));
}

export const AutoCapitalize = Extension.create({
  name: 'notebookAutoCapitalize',
  addProseMirrorPlugins() {
    return [new Plugin<Undo>({
      key,
      state: {
        init: () => null,
        // Only the very next keystroke can undo it. Follow-up fixes made by
        // other plugins in the same keystroke (block ids) don't count.
        apply: (tr, prev) => {
          if (tr.getMeta(key) !== undefined) return tr.getMeta(key);
          if (prev && tr.getMeta('appendedTransaction')) return { ...prev, pos: tr.mapping.map(prev.pos) };
          return tr.docChanged || tr.selectionSet ? null : prev;
        },
      },
      props: {
        handleTextInput(view, from, to, text) {
          // Keyboards send one letter; autocorrect and some phones send a word.
          if (!/^[a-z][^\n]*$/.test(text) || from !== to || !autoCapitalizeEnabled()) return false;
          const $from = view.state.doc.resolve(from);
          // A new line: the start of a block, or right after Shift+Enter.
          const lineStart = $from.parentOffset === 0 || $from.nodeBefore?.type.name === 'hardBreak';
          if (!lineStart || !$from.parent.isTextblock || $from.parent.type.spec.code) return false;
          if ((view.state.storedMarks ?? $from.marks()).some(mark => mark.type.spec.code)) return false;
          const tr = view.state.tr.insertText(text[0].toUpperCase() + text.slice(1), from, to);
          view.dispatch(tr.setMeta(key, { pos: from, original: text[0] }));
          return true;
        },
        handleKeyDown(view, event) {
          const undo = key.getState(view.state);
          if (event.key !== 'Backspace' || !undo) return false;
          const { selection } = view.state;
          if (!selection.empty || selection.from !== undo.pos + 1) return false;
          event.preventDefault();
          view.dispatch(view.state.tr.insertText(undo.original, undo.pos, undo.pos + 1).setMeta(key, null));
          return true;
        },
      },
    })];
  },
});
