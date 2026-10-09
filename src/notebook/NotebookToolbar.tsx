import React from 'react';
import type { Editor } from '@tiptap/react';
import { NOTEBOOK_FONTS, NOTEBOOK_TAGS } from './editorSchema';

export function NotebookToolbar({ editor, disabled }: { editor: Editor | null; disabled: boolean }) {
  if (!editor) return null;
  const action = (label: string, run: () => void, active = false, desktop = false) => <button
    type="button" title={label} aria-label={label} aria-pressed={active}
    className={`nb-tool ${active ? 'is-active' : ''} ${desktop ? 'nb-desktop' : ''}`}
    disabled={disabled} onMouseDown={e => e.preventDefault()} onClick={run}>{label}</button>;
  const chain = () => editor.chain().focus();
  const tag = (value: string) => {
    const type = ['heading', 'paragraph', 'taskItem', 'blockquote', 'codeBlock'].find(t => editor.isActive(t)) ?? 'paragraph';
    chain().updateAttributes(type, { nbTag: value || null }).run();
  };
  return <div className="nb-toolbar" role="toolbar" aria-label="Note formatting">
    <select aria-label="Font" className="nb-desktop" disabled={disabled} value={editor.getAttributes('textStyle').fontFamily ?? ''} onChange={e => e.target.value ? chain().setFontFamily(e.target.value).run() : chain().unsetFontFamily().run()}>
      <option value="">Default font</option>{NOTEBOOK_FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
    </select>
    <select aria-label="Font size" className="nb-desktop" disabled={disabled} value={editor.getAttributes('textStyle').fontSize ?? ''} onChange={e => e.target.value ? chain().setFontSize(e.target.value).run() : chain().unsetFontSize().run()}>
      <option value="">Default size</option>{[10,12,14,16,18,20,24,28,32,40,48,64,96].map(n => <option key={n} value={`${n}px`}>{n}</option>)}
    </select>
    {action('Undo', () => chain().undo().run())}{action('Redo', () => chain().redo().run())}
    {action('Bold', () => chain().toggleBold().run(), editor.isActive('bold'))}
    {action('Italic', () => chain().toggleItalic().run(), editor.isActive('italic'))}
    {action('Underline', () => chain().toggleUnderline().run(), editor.isActive('underline'))}
    {action('Strike', () => chain().toggleStrike().run(), editor.isActive('strike'), true)}
    {action('Highlight', () => chain().toggleHighlight({ color: '#eab308' }).run(), editor.isActive('highlight'))}
    {action('Checklist', () => chain().toggleTaskList().run(), editor.isActive('taskList'))}
    {action('Bullets', () => chain().toggleBulletList().run(), editor.isActive('bulletList'))}
    {action('Numbered', () => chain().toggleOrderedList().run(), editor.isActive('orderedList'), true)}
    <select aria-label="Paragraph style" disabled={disabled} value={editor.isActive('heading', { level: 1 }) ? '1' : editor.isActive('heading', { level: 2 }) ? '2' : editor.isActive('heading', { level: 3 }) ? '3' : 'paragraph'} onChange={e => e.target.value === 'paragraph' ? chain().setParagraph().run() : chain().toggleHeading({ level: Number(e.target.value) as 1|2|3 }).run()}>
      <option value="paragraph">Body</option><option value="1">Title</option><option value="2">Heading</option><option value="3">Subheading</option>
    </select>
    <label className="nb-desktop">Text <input aria-label="Text color" type="color" disabled={disabled} value={editor.getAttributes('textStyle').color?.startsWith('#') ? editor.getAttributes('textStyle').color : '#171717'} onChange={e => chain().setColor(e.target.value).run()} /></label>
    <label className="nb-desktop">Fill <input aria-label="Text background color" type="color" disabled={disabled} defaultValue="#eab308" onChange={e => chain().setBackgroundColor(e.target.value).run()} /></label>
    {['left', 'center', 'right', 'justify'].map(a => action(a, () => chain().setTextAlign(a).run(), editor.isActive({ textAlign: a }), true))}
    {action('Subscript', () => chain().toggleSubscript().run(), editor.isActive('subscript'), true)}
    {action('Superscript', () => chain().toggleSuperscript().run(), editor.isActive('superscript'), true)}
    {action('Quote', () => chain().toggleBlockquote().run(), editor.isActive('blockquote'), true)}
    {action('Code', () => chain().toggleCodeBlock().run(), editor.isActive('codeBlock'), true)}
    {action('Divider', () => chain().setHorizontalRule().run(), false, true)}
    {action('Clear formatting', () => chain().unsetAllMarks().clearNodes().run(), false, true)}
    <select aria-label="Block tag" className="nb-desktop" disabled={disabled} value="" onChange={e => tag(e.target.value)}><option value="">Tag…</option>{NOTEBOOK_TAGS.map(t => <option key={t} value={t}>{t}</option>)}<option value="">Clear tag</option></select>
    {action('Table', () => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), false, true)}
    {editor.isActive('table') && <>
      {action('Add row', () => chain().addRowAfter().run(), false, true)}
      {action('Add column', () => chain().addColumnAfter().run(), false, true)}
      {action('Delete row', () => chain().deleteRow().run(), false, true)}
      {action('Delete column', () => chain().deleteColumn().run(), false, true)}
      {action('Merge cells', () => chain().mergeCells().run(), false, true)}
      {action('Split cell', () => chain().splitCell().run(), false, true)}
      {action('Header row', () => chain().toggleHeaderRow().run(), false, true)}
      {action('Delete table', () => chain().deleteTable().run(), false, true)}
      <label className="nb-desktop">Cell fill <input aria-label="Cell shading" type="color" disabled={disabled} defaultValue="#eab308" onChange={e => chain().setCellAttribute('backgroundColor', e.target.value).run()} /></label>
    </>}
  </div>;
}
