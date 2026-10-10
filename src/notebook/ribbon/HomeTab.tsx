// Home: clipboard, basic text, paragraph and styles, in OneNote's order and
// with OneNote's behaviour (format painter applies to the next selection,
// split buttons remember the last color), drawn in Control Point's style.
import React, { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { NOTEBOOK_COLORS, NOTEBOOK_FONTS, NOTEBOOK_TAGS } from '../editorSchema';
import { notebookIndent } from '../editorActions';
import { pasteNotebookText } from '../NotebookMobileToolbar';
import { ColorPalette, RibbonButton, RibbonGroup, RibbonItem, RibbonMenu, RibbonSplit } from './RibbonParts';

export const HIGHLIGHT_COLORS = ['#fde047', '#86efac', '#67e8f9', '#f9a8d4', '#fdba74', '#93c5fd', '#c4b5fd', '#d4d4d8'] as const;
const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 96];
const TAG_LABELS: Record<(typeof NOTEBOOK_TAGS)[number], string> = { todo: 'To Do', important: 'Important', question: 'Question', remember: 'Remember for later' };
type Marks = { type: string; attrs: Record<string, unknown> }[];

/** Home state that must survive switching tabs or hiding the ribbon (the
 *  remembered colors and an armed format painter): owned by the toolbar. */
export function useHomeRibbonState(editor: Editor | null, disabled: boolean, notify: (message: string) => void) {
  const [fontColor, setFontColor] = useState('#ef4444');
  const [highlight, setHighlight] = useState<string>(HIGHLIGHT_COLORS[0]);
  const [painter, setPainter] = useState<Marks | null>(null);
  // Format painter: pick up formatting, then apply it to the next selection
  // the person makes with the mouse or Shift+arrows. Escape cancels.
  useEffect(() => {
    if (!painter || !editor || editor.isDestroyed) return;
    const dom = editor.view.dom;
    const apply = () => {
      const { from, to, empty } = editor.state.selection;
      if (empty) return;
      let tr = editor.state.tr.removeMark(from, to);
      for (const mark of painter) { const type = editor.schema.marks[mark.type]; if (type) tr = tr.addMark(from, to, type.create(mark.attrs)); }
      editor.view.dispatch(tr);
      setPainter(null); notify('Formatting applied.');
    };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === 'Shift') apply(); };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPainter(null); notify('Format painter cancelled.'); } };
    dom.addEventListener('pointerup', apply); dom.addEventListener('keyup', onKeyUp); document.addEventListener('keydown', onKeyDown);
    return () => { dom.removeEventListener('pointerup', apply); dom.removeEventListener('keyup', onKeyUp); document.removeEventListener('keydown', onKeyDown); };
  }, [painter, editor]);
  useEffect(() => { if (disabled) setPainter(null); }, [disabled]);
  const togglePainter = () => {
    if (!editor) return;
    if (painter) { setPainter(null); return; }
    setPainter(editor.state.selection.$from.marks().filter(m => m.type.name !== 'link').map(m => ({ type: m.type.name, attrs: { ...m.attrs } })));
    notify('Format painter on: select text to apply this formatting. Esc cancels.');
  };
  return { fontColor, setFontColor, highlight, setHighlight, painterOn: !!painter, togglePainter };
}
export type HomeRibbonState = ReturnType<typeof useHomeRibbonState>;

export function HomeTab({ editor, disabled, notify, state }: { editor: Editor; disabled: boolean; notify: (message: string) => void; state: HomeRibbonState }) {
  const chain = () => editor.chain().focus();
  const { fontColor, setFontColor, highlight, setHighlight } = state;

  const clipboard = async (kind: 'cut' | 'copy') => {
    const { from, to, empty } = editor.state.selection;
    if (empty) { notify('Select something first.'); return; }
    editor.commands.focus();
    if (document.execCommand?.(kind)) return;
    // Clipboard access can wait on a permission prompt: only cut if the page,
    // the selection and edit rights are all unchanged by then.
    const doc = editor.state.doc, selection = editor.state.selection;
    try {
      await navigator.clipboard.writeText(doc.textBetween(from, to, '\n'));
      if (kind !== 'cut') return;
      if (disabled || !editor.isEditable || !editor.state.doc.eq(doc) || !editor.state.selection.eq(selection)) { notify('Text copied. The page or selection changed before it could be cut.'); return; }
      chain().deleteRange({ from, to }).run();
    } catch { notify(`Press ${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+${kind === 'cut' ? 'X' : 'C'} to ${kind}.`); }
  };
  const paste = async (plain: boolean) => {
    const before = editor.state.selection;
    try {
      if (!plain && navigator.clipboard?.read) {
        for (const item of await navigator.clipboard.read()) {
          if (!item.types.includes('text/html')) continue;
          const html = await (await item.getType('text/html')).text();
          // Parsed through the notebook schema: unsupported markup and unsafe links are dropped.
          if (editor.state.selection.eq(before)) { chain().insertContent(html).run(); return; }
        }
      }
      const text = await navigator.clipboard.readText();
      if (!editor.state.selection.eq(before)) { notify('Your selection changed. Paste again at the cursor.'); return; }
      editor.commands.focus(); pasteNotebookText(editor, text);
    } catch { notify(`Your browser keeps the clipboard private here. Press ${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+V${plain ? ' (or Ctrl+Shift+V for plain text)' : ''} to paste.`); }
  };
  const tag = (value: string | null) => {
    const type = ['heading', 'paragraph', 'taskItem', 'blockquote', 'codeBlock'].find(t => editor.isActive(t)) ?? 'paragraph';
    chain().updateAttributes(type, { nbTag: value }).run();
  };
  const style = editor.isActive('heading') ? String(editor.getAttributes('heading').level) : editor.isActive('blockquote') ? 'quote' : editor.isActive('codeBlock') ? 'code' : 'paragraph';
  const setStyle = (value: string) => {
    // Normal also leaves a quote: lifting removes the blockquote wrapper.
    if (value === 'paragraph') { const command = chain().setParagraph(); if (editor.isActive('blockquote')) command.lift('blockquote'); command.run(); }
    else if (value === 'quote') chain().setParagraph().toggleBlockquote().run();
    else if (value === 'code') chain().toggleCodeBlock().run();
    else chain().setHeading({ level: Number(value) as 1 | 2 | 3 | 4 | 5 | 6 }).run();
  };
  const align = (['left', 'center', 'right', 'justify'] as const).find(a => editor.isActive({ textAlign: a })) ?? 'left';
  const size = String(editor.getAttributes('textStyle').fontSize ?? '').replace('px', '');

  return <>
    <RibbonGroup label="Undo">
      <RibbonButton label="Undo" shortcut="Ctrl+Z" disabled={disabled} onClick={() => chain().undo().run()} />
      <RibbonButton label="Redo" shortcut="Ctrl+Y" disabled={disabled} onClick={() => chain().redo().run()} />
    </RibbonGroup>
    <RibbonGroup label="Clipboard">
      <RibbonSplit label="Paste" showLabel menuLabel="Paste options" shortcut="Ctrl+V" disabled={disabled} onClick={() => { void paste(false); }}>
        <RibbonItem onSelect={() => { void paste(false); }}>Keep formatting</RibbonItem>
        <RibbonItem onSelect={() => { void paste(true); }}>Paste as plain text</RibbonItem>
      </RibbonSplit>
      <RibbonButton label="Cut" shortcut="Ctrl+X" disabled={disabled} onClick={() => { void clipboard('cut'); }} />
      <RibbonButton label="Copy" shortcut="Ctrl+C" onClick={() => { void clipboard('copy'); }} />
      <RibbonButton label="Format painter" active={state.painterOn} disabled={disabled} onClick={state.togglePainter} />
    </RibbonGroup>
    <RibbonGroup label="Basic text">
      <select aria-label="Font" title="Font" className="nb-rselect nb-rfont" disabled={disabled} value={editor.getAttributes('textStyle').fontFamily ?? ''} onChange={e => e.target.value ? chain().setFontFamily(e.target.value).run() : chain().unsetFontFamily().run()}>
        <option value="">Default font</option>{NOTEBOOK_FONTS.map(f => <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>)}
      </select>
      <input aria-label="Font size" title="Font size (8–96)" className="nb-rselect nb-rsize" list="nb-font-sizes" inputMode="numeric" disabled={disabled} placeholder="16" key={size} defaultValue={size}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
        onBlur={e => { const raw = e.target.value.trim(); if (!raw) { if (size) chain().unsetFontSize().run(); return; } const n = Number(raw); if (n >= 8 && n <= 96) chain().setFontSize(`${n}px`).run(); else { notify('Font sizes go from 8 to 96.'); e.target.value = size; } }} />
      <datalist id="nb-font-sizes">{SIZES.map(n => <option key={n} value={n} />)}</datalist>
      <RibbonButton label="Bold" shortcut="Ctrl+B" active={editor.isActive('bold')} disabled={disabled} onClick={() => chain().toggleBold().run()} />
      <RibbonButton label="Italic" shortcut="Ctrl+I" active={editor.isActive('italic')} disabled={disabled} onClick={() => chain().toggleItalic().run()} />
      <RibbonButton label="Underline" shortcut="Ctrl+U" active={editor.isActive('underline')} disabled={disabled} onClick={() => chain().toggleUnderline().run()} />
      <RibbonButton label="Strikethrough" icon="Strike" active={editor.isActive('strike')} disabled={disabled} onClick={() => chain().toggleStrike().run()} />
      <RibbonSplit label="Font color" accent={fontColor} menuLabel="Font color options" disabled={disabled} onClick={() => chain().setColor(fontColor).run()}>
        <ColorPalette label="Font color" colors={NOTEBOOK_COLORS} value={editor.getAttributes('textStyle').color} onPick={c => { setFontColor(c); chain().setColor(c).run(); }} resetLabel="Automatic" onReset={() => chain().unsetColor().run()} />
      </RibbonSplit>
      <RibbonSplit label="Highlight" accent={highlight} menuLabel="Highlight colors" active={editor.isActive('highlight')} disabled={disabled} onClick={() => editor.isActive('highlight') ? chain().unsetHighlight().run() : chain().setHighlight({ color: highlight }).run()}>
        <ColorPalette label="Highlight" colors={HIGHLIGHT_COLORS} value={editor.getAttributes('highlight').color} onPick={c => { setHighlight(c); chain().setHighlight({ color: c }).run(); }} resetLabel="No highlight" onReset={() => chain().unsetHighlight().run()} />
        {/* Text fills from older pages or pasted HTML are a separate mark. */}
        <RibbonItem onSelect={() => chain().unsetBackgroundColor().run()}>Remove text fill</RibbonItem>
      </RibbonSplit>
      <RibbonSplit label="Subscript" shortcut="Ctrl+=" menuLabel="Subscript and superscript" active={editor.isActive('subscript')} disabled={disabled} onClick={() => chain().toggleSubscript().run()}>
        <RibbonItem onSelect={() => chain().toggleSubscript().run()}>Subscript</RibbonItem>
        <RibbonItem onSelect={() => chain().toggleSuperscript().run()}>Superscript</RibbonItem>
      </RibbonSplit>
      <RibbonButton label="Clear formatting" disabled={disabled} onClick={() => chain().unsetAllMarks().clearNodes().run()} />
    </RibbonGroup>
    <RibbonGroup label="Paragraph">
      <RibbonButton label="Bullets" active={editor.isActive('bulletList')} disabled={disabled} onClick={() => chain().toggleBulletList().run()} />
      <RibbonButton label="Numbering" icon="Numbered" active={editor.isActive('orderedList')} disabled={disabled} onClick={() => chain().toggleOrderedList().run()} />
      <RibbonButton label="Checklist" active={editor.isActive('taskList')} disabled={disabled} onClick={() => chain().toggleTaskList().run()} />
      <RibbonButton label="Decrease indent" icon="Outdent" shortcut="Shift+Tab" disabled={disabled} onClick={() => { editor.commands.focus(); notebookIndent(editor, -1); }} />
      <RibbonButton label="Increase indent" icon="Indent" shortcut="Tab" disabled={disabled} onClick={() => { editor.commands.focus(); notebookIndent(editor, 1); }} />
      <RibbonMenu label="Alignment" icon={align} disabled={disabled}>
        {(['left', 'center', 'right', 'justify'] as const).map(a => <RibbonItem key={a} aria-checked={align === a} role="menuitemradio" onSelect={() => chain().setTextAlign(a).run()}>{a === 'justify' ? 'Justify' : `Align ${a}`}</RibbonItem>)}
      </RibbonMenu>
    </RibbonGroup>
    <RibbonGroup label="Tags">
      <RibbonMenu label="Tag" showLabel disabled={disabled}>
        {NOTEBOOK_TAGS.map(t => <RibbonItem key={t} onSelect={() => tag(t)}>{TAG_LABELS[t]}</RibbonItem>)}
        <RibbonItem onSelect={() => tag(null)}>Remove tag</RibbonItem>
      </RibbonMenu>
    </RibbonGroup>
    <RibbonGroup label="Styles">
      <select aria-label="Paragraph style" title="Styles" className="nb-rselect nb-rstyle" disabled={disabled} value={style} onChange={e => setStyle(e.target.value)}>
        <option value="paragraph">Normal</option>
        {[1, 2, 3, 4, 5, 6].map(level => <option key={level} value={String(level)}>Heading {level}</option>)}
        <option value="quote">Quote</option><option value="code">Code</option>
      </select>
    </RibbonGroup>
  </>;
}
