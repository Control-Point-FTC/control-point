import React, { useEffect, useState } from 'react';
import { Bold, Italic, Underline, Undo2, Redo2, Highlighter, ListTodo, List, ListOrdered, Link2, Table2, Quote, Code2, Minus, Search, MessageSquare, Ellipsis, Smile, Sigma } from 'lucide-react';
import type { Editor } from '@tiptap/react';
import { NOTEBOOK_FONTS, NOTEBOOK_TAGS } from './editorSchema';
import type { NotebookPageItem } from './types';
import { notebookPageLink, normalizeNotebookLink } from './pageLinks';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label } from '../components/ui-kit';
import { notebookIndent } from './editorActions';
import { NotebookFind } from './NotebookFind';
import { useNotebookMobile } from './useNotebookMobile';
import { NotebookMobileToolbar } from './NotebookMobileToolbar';
import { notebookCommandGlyph } from './NotebookIcons';

const icons: Record<string, React.ComponentType<{ size?: number }>> = { Bold, Italic, Underline, Undo: Undo2, Redo: Redo2, Highlight: Highlighter, Checklist: ListTodo, Bullets: List, Numbered: ListOrdered, Link: Link2, Table: Table2, Quote, Code: Code2, Divider: Minus, Symbols: Sigma, Emoji: Smile };
const insertCommands = new Set(['Link', 'Table', 'Quote', 'Code', 'Divider', 'Symbols', 'Emoji', 'Add row', 'Row above', 'Add column', 'Column left', 'Delete row', 'Delete column', 'Merge cells', 'Split cell', 'Header row', 'Delete table', 'Reset cell fill']);

const SYMBOLS = ['©','®','™','§','¶','†','‡','•','…','–','—','‘','’','“','”','«','»','‹','›','¡','¿','×','÷','±','∓','≈','≠','≤','≥','√','∞','∑','∏','∫','∂','∆','π','θ','λ','μ','Ω','α','β','γ','δ','σ','φ','ψ','←','↑','→','↓','↔','⇒','⇐','⇔','★','☆','✓','✗','⚠','●','○','◆','◇','▲','▼','°','′','″','€','£','¥','₹'];
const EMOJI = ['😀','😁','😂','🤣','😊','😍','🤔','😮','😢','😡','👍','👎','👏','🙌','💪','✌️','🤝','👀','🧠','💡','📌','📝','📊','📅','✅','❌','⭐','🔥','🎉','🚀','🤖','🔧','⚙️','🔩','💻','📐','📏','🔬','🧪','⚡','🔋','🏆','🎯','💯','❓','❗','💤','🎓','📚','✏️','📎','🔗','💬','👥','🕒','📍'];

const ribbonTabs = [['file','File'],['home','Home'],['insert','Insert'],['draw','Draw'],['history','History'],['review','Review'],['view','View'],['help','Help']];
export function NotebookToolbar({ editor, disabled, pages, pageId, preferenceKey, panels = {},requestedGroup }: { editor: Editor | null; disabled: boolean; pages: NotebookPageItem[]; pageId: number; preferenceKey?: string; panels?: Record<string, React.ReactNode>;requestedGroup?:{group:string;key:number} }) {
  const mobile = useNotebookMobile();
  const [group, setGroup] = useState(() => { try { const saved = preferenceKey && localStorage.getItem(preferenceKey); return saved && ['home','insert','review','help'].includes(saved) ? saved : 'home'; } catch { return 'home'; } });
  useEffect(()=>{if(requestedGroup && ribbonTabs.some(([group])=>group===requestedGroup.group))setGroup(requestedGroup.group);},[requestedGroup]);
  const [expanded, setExpanded] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState('');
  const [label, setLabel] = useState('');
  const [notice, setNotice] = useState('');
  const [finding, setFinding] = useState(false);
  const [picker, setPicker] = useState<null | 'symbols' | 'emoji'>(null);
  // A picker must never stay open (or insert) once the editor is read-only.
  useEffect(() => { if (disabled) setPicker(null); }, [disabled]);
  // Mouse users keep focus in the editor, so Escape has to work document-wide while a picker is open.
  useEffect(() => {
    if (!picker) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPicker(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [picker]);
  const [format, setFormat] = useState<{ marks: { type: string; attrs: Record<string, any> }[] } | null>(null);
  useEffect(() => {
    if (!editor) return;
    const find = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' && event.target instanceof Node && editor.view.dom.closest('.nb-document')?.contains(event.target)) { event.preventDefault(); setFinding(true); setGroup('review'); } };
    window.addEventListener('keydown', find); return () => window.removeEventListener('keydown', find);
  }, [editor]);
  if (!editor) return null;
  if (mobile) return <NotebookMobileToolbar editor={editor} disabled={disabled} />;
  const action = (label: string, run: () => void, active = false, desktop = false) => {
    const Icon = notebookCommandGlyph(label) ?? icons[label], commandGroup = insertCommands.has(label) ? 'insert' : label === 'Copy block link' ? 'review' : 'home';
    return <button
    type="button" title={label} aria-label={label} aria-pressed={active}
    data-command-group={commandGroup} className={`nb-tool ${Icon ? 'nb-icon-tool' : ''} ${active ? 'is-active' : ''} ${desktop && commandGroup === 'home' ? 'nb-advanced' : ''}`}
    disabled={disabled} onMouseDown={e => e.preventDefault()} onClick={run}>{Icon ? <Icon size={17} /> : label}</button>;
  };
  const chain = () => editor.chain().focus();
  const tag = (value: string) => {
    const type = ['heading', 'paragraph', 'taskItem', 'blockquote', 'codeBlock'].find(t => editor.isActive(t)) ?? 'paragraph';
    chain().updateAttributes(type, { nbTag: value === '__clear' ? null : value || null }).run();
  };
  return <div className="nb-command-bar">
    <div className="nb-command-tabs" role="tablist" aria-label="Notebook commands">{ribbonTabs.filter(([id]) => ['home','insert','review','help'].includes(id) || panels[id]).map(([id,label]) => <button key={id} role="tab" aria-selected={group === id} onClick={() => { setGroup(id); setExpanded(false); if (preferenceKey) try { localStorage.setItem(preferenceKey, id); } catch { /* optional device preference */ } }} onKeyDown={e => {
      if (!['ArrowLeft','ArrowRight'].includes(e.key)) return; e.preventDefault(); const tabs = ribbonTabs.filter(([key]) => ['home','insert','review','help'].includes(key) || panels[key]).map(([key]) => key); const next = (tabs.indexOf(id) + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length; setGroup(tabs[next]); e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
    }}>{label}</button>)}</div>
    <div className="nb-toolbar" role="toolbar" aria-label="Note formatting" data-nb-group={group} data-expanded={expanded}>
    {panels[group] && <div className="nb-ribbon-panel" data-command-group={group}>{panels[group]}</div>}
    <select aria-label="Font" className="nb-desktop" disabled={disabled} value={editor.getAttributes('textStyle').fontFamily ?? ''} onChange={e => e.target.value ? chain().setFontFamily(e.target.value).run() : chain().unsetFontFamily().run()}>
      <option value="">Default font</option>{NOTEBOOK_FONTS.map(f => <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>)}
    </select>
    <select aria-label="Font size" className="nb-desktop" disabled={disabled} value={editor.getAttributes('textStyle').fontSize ?? ''} onChange={e => e.target.value ? chain().setFontSize(e.target.value).run() : chain().unsetFontSize().run()}>
      <option value="">Default size</option>{[10,12,14,16,18,20,24,28,32,40,48,64,96].map(n => <option key={n} value={`${n}px`}>{n}</option>)}
    </select>
    <input aria-label="Custom font size" className="nb-advanced nb-font-size" type="number" min={8} max={96} placeholder="px" disabled={disabled} onChange={e => { const n = Number(e.target.value); if (n >= 8 && n <= 96) chain().setFontSize(`${n}px`).run(); }} />
    {action('Undo', () => chain().undo().run())}{action('Redo', () => chain().redo().run())}
    {action('Bold', () => chain().toggleBold().run(), editor.isActive('bold'))}
    {action('Italic', () => chain().toggleItalic().run(), editor.isActive('italic'))}
    {action('Underline', () => chain().toggleUnderline().run(), editor.isActive('underline'))}
    {action('Strike', () => chain().toggleStrike().run(), editor.isActive('strike'), true)}
    {action('Highlight', () => chain().toggleHighlight({ color: '#eab308' }).run(), editor.isActive('highlight'))}
    {action('Checklist', () => chain().toggleTaskList().run(), editor.isActive('taskList'))}
    {action('Bullets', () => chain().toggleBulletList().run(), editor.isActive('bulletList'))}
    {action('Link', () => { setHref(editor.getAttributes('link').href ?? ''); setLabel(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)); setLinkOpen(true); }, editor.isActive('link'))}
    {action('Numbered', () => chain().toggleOrderedList().run(), editor.isActive('orderedList'), true)}
    <select aria-label="Paragraph style" disabled={disabled} value={editor.isActive('heading', { level: 1 }) ? '1' : editor.isActive('heading', { level: 2 }) ? '2' : editor.isActive('heading', { level: 3 }) ? '3' : editor.isActive('heading', { level: 4 }) ? '4' : editor.isActive('heading', { level: 5 }) ? '5' : editor.isActive('heading', { level: 6 }) ? '6' : 'paragraph'} onChange={e => e.target.value === 'paragraph' ? chain().setParagraph().run() : chain().toggleHeading({ level: Number(e.target.value) as 1|2|3|4|5|6 }).run()}>
      <option value="paragraph">Body</option><option value="1">Title</option><option value="2">Heading</option><option value="3">Subheading</option><option value="4">Heading 4</option><option value="5">Heading 5</option><option value="6">Heading 6</option>
    </select>
    <label className="nb-desktop">Text <input aria-label="Text color" type="color" disabled={disabled} value={editor.getAttributes('textStyle').color?.startsWith('#') ? editor.getAttributes('textStyle').color : '#171717'} onChange={e => chain().setColor(e.target.value).run()} /></label>
    <label className="nb-desktop">Fill <input aria-label="Text background color" type="color" disabled={disabled} defaultValue="#eab308" onChange={e => chain().setBackgroundColor(e.target.value).run()} /></label>
    {['left', 'center', 'right', 'justify'].map(a => action(a, () => chain().setTextAlign(a).run(), editor.isActive({ textAlign: a }), true))}
    {action('Subscript', () => chain().toggleSubscript().run(), editor.isActive('subscript'), true)}
    {action('Superscript', () => chain().toggleSuperscript().run(), editor.isActive('superscript'), true)}
    {action('Quote', () => chain().toggleBlockquote().run(), editor.isActive('blockquote'), true)}
    {action('Code', () => chain().toggleCodeBlock().run(), editor.isActive('codeBlock'), true)}
    {action('Divider', () => chain().setHorizontalRule().run(), false, true)}
    <span className="nb-picker-anchor" data-command-group="insert">
      {(['symbols','emoji'] as const).map(kind => (
        <button key={kind} type="button" title={kind === 'symbols' ? 'Symbols' : 'Emoji'} aria-label={kind === 'symbols' ? 'Symbols' : 'Emoji'} aria-expanded={picker === kind}
          data-command-group="insert" className={`nb-tool nb-icon-tool ${picker === kind ? 'is-active' : ''}`}
          disabled={disabled} onMouseDown={e => e.preventDefault()} onClick={() => setPicker(p => p === kind ? null : kind)}>
          {kind === 'symbols' ? <Sigma size={17} /> : <Smile size={17} />}
        </button>
      ))}
      {picker && <React.Fragment key="picker">
        <button type="button" aria-label="Close picker" className="nb-picker-backdrop" onClick={() => setPicker(null)} />
        <div className="nb-picker" role="dialog" aria-label={picker === 'emoji' ? 'Emoji picker' : 'Symbol picker'}>
          <div className="nb-picker-grid">
            {(picker === 'emoji' ? EMOJI : SYMBOLS).map(ch => (
              <button key={ch} type="button" className="nb-picker-cell" title={`Insert ${ch}`} aria-label={`Insert ${ch}`} disabled={disabled}
                onMouseDown={e => e.preventDefault()} onClick={() => { if (!disabled) editor.chain().focus().insertContent(ch).run(); }}>{ch}</button>
            ))}
          </div>
        </div>
      </React.Fragment>}
    </span>
    {action('Clear formatting', () => chain().unsetAllMarks().clearNodes().run(), false, true)}
    {action('Inline code', () => chain().toggleCode().run(), editor.isActive('code'), true)}
    {action('Indent', () => { editor.commands.focus(); notebookIndent(editor, 1); }, false, true)}
    {action('Outdent', () => { editor.commands.focus(); notebookIndent(editor, -1); }, false, true)}
    {action('Reset text color', () => chain().unsetColor().run(), false, true)}
    {action('Remove text fill', () => chain().unsetBackgroundColor().run(), false, true)}
    {action('Remove highlight', () => chain().unsetHighlight().run(), false, true)}
    {action('Copy formatting', () => { const marks = editor.state.selection.$from.marks().map(m => ({ type: m.type.name, attrs: { ...m.attrs } })).filter(m => m.type !== 'link'); setFormat({ marks }); setNotice('Formatting copied. Select text and choose Apply formatting.'); }, false, true)}
    {format && action('Apply formatting', () => {
      const { from, to, empty, $from } = editor.state.selection;
      let tr = editor.state.tr;
      if (empty) { tr = tr.setStoredMarks(format.marks.map(m => editor.schema.marks[m.type].create(m.attrs))); }
      else { tr = tr.removeMark(from, to); for (const mark of format.marks) tr = tr.addMark(from, to, editor.schema.marks[mark.type].create(mark.attrs)); }
      editor.view.dispatch(tr); editor.commands.focus();
    }, false, true)}
    <select aria-label="Block tag" data-command-group="review" disabled={disabled} value="" onChange={e => tag(e.target.value)}><option value="">Tag…</option>{NOTEBOOK_TAGS.map(t => <option key={t} value={t}>{t}</option>)}<option value="__clear">Clear tag</option></select>
    {editor.isActive('codeBlock') && <select aria-label="Code language" data-command-group="insert" disabled={disabled} value={editor.getAttributes('codeBlock').language ?? ''} onChange={e => chain().updateAttributes('codeBlock', { language: e.target.value || null }).run()}><option value="">Plain text</option>{['javascript','typescript','python','java','cpp','json','bash','html','css'].map(l => <option key={l} value={l}>{l}</option>)}</select>}
    <button type="button" className="nb-tool" data-command-group="review" onMouseDown={e => e.preventDefault()} onClick={() => setFinding(v => !v)}><Search size={16} /> Find in page</button>
    <button type="button" className="nb-tool" data-command-group="review" onClick={() => { const input = document.getElementById(`nb-comment-input-${pageId}`); input?.scrollIntoView({ block: 'center', behavior: 'smooth' }); input?.focus(); }}><MessageSquare size={16} /> Discussions</button>
    <button type="button" className="nb-tool nb-more-formatting" data-command-group="home" aria-expanded={expanded} onClick={() => setExpanded(v => !v)}><Ellipsis size={17} />{expanded ? 'Less' : 'More formatting'}</button>
    {action('Table', () => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), false, true)}
    {action('Copy block link', () => {
      let blockId: string | null = null;
      for (let depth = editor.state.selection.$from.depth; depth > 0; depth--) { const id = editor.state.selection.$from.node(depth).attrs.id; if (typeof id === 'string') { blockId = id; break; } }
      if (!blockId) { setNotice('Select a text block first.'); return; }
      void navigator.clipboard.writeText(new URL(notebookPageLink(pageId, blockId), window.location.origin).href).then(() => setNotice('Block link copied.')).catch(() => setNotice('Clipboard is unavailable.'));
    }, false, true)}
    {editor.isActive('table') && <>
      {action('Add row', () => chain().addRowAfter().run(), false, true)}
      {action('Row above', () => chain().addRowBefore().run(), false, true)}
      {action('Add column', () => chain().addColumnAfter().run(), false, true)}
      {action('Column left', () => chain().addColumnBefore().run(), false, true)}
      {action('Delete row', () => chain().deleteRow().run(), false, true)}
      {action('Delete column', () => chain().deleteColumn().run(), false, true)}
      {action('Merge cells', () => chain().mergeCells().run(), false, true)}
      {action('Split cell', () => chain().splitCell().run(), false, true)}
      {action('Header row', () => chain().toggleHeaderRow().run(), false, true)}
      {action('Delete table', () => chain().deleteTable().run(), false, true)}
      <label data-command-group="insert">Cell fill <input aria-label="Cell shading" type="color" disabled={disabled} defaultValue="#eab308" onChange={e => chain().setCellAttribute('backgroundColor', e.target.value).run()} /></label>
      {action('Reset cell fill', () => chain().setCellAttribute('backgroundColor', null).run(), false, true)}
    </>}
    <div className="nb-notebook-help" data-command-group="help"><strong>Make this space yours.</strong><span>Select text to format it. Use Insert for links, tables and code; Review for search and discussions.</span><span>Ctrl/⌘ B · bold &nbsp; Ctrl/⌘ I · italic &nbsp; Ctrl/⌘ U · underline &nbsp; Ctrl/⌘ F · find</span><span>In the sidebar: F2 · rename &nbsp; Delete · trash &nbsp; Alt + Shift + ↑/↓ · reorder</span></div>
    {notice && <span role="status" className="nb-small nb-toolbar-shared">{notice}</span>}
    {finding && <div className="nb-toolbar-shared nb-find-wrap"><NotebookFind editor={editor} disabled={disabled} onClose={() => setFinding(false)} /></div>}
    <Dialog open={linkOpen} onOpenChange={setLinkOpen}><DialogContent><DialogHeader><DialogTitle>Link to a page or website</DialogTitle><DialogDescription>Page links stay connected when pages are moved. Protected destinations stay available only to admins.</DialogDescription></DialogHeader>
      <form className="nb-form" onSubmit={e => {
        e.preventDefault();
        const address = normalizeNotebookLink(href, window.location.origin);
        if (editor.state.selection.empty) chain().insertContent({ type: 'text', text: label || href, marks: [{ type: 'link', attrs: { href: address } }] }).run();
        else chain().extendMarkRange('link').setLink({ href: address }).run();
        setLinkOpen(false);
      }}>
        <Label htmlFor="nb-link-page">Notebook page</Label><select id="nb-link-page" value="" onChange={e => { const p = pages.find(p => p.id === Number(e.target.value)); if (p) { setHref(notebookPageLink(p.id)); setLabel(p.title); } }}><option value="">Choose a page…</option>{pages.map(p => <option key={p.id} value={p.id}>{p.title}{p.protected ? ' · Admin only' : ''}</option>)}</select>
        <Label htmlFor="nb-link-url">Address</Label><Input id="nb-link-url" value={href} required onChange={e => setHref(e.target.value)} placeholder="https://… or /notebook?page=…" />
        <Label htmlFor="nb-link-label">Link text</Label><Input id="nb-link-label" value={label} onChange={e => setLabel(e.target.value)} />
        <DialogFooter><Button type="button" variant="ghost" onClick={() => { chain().unsetLink().run(); setLinkOpen(false); }}>Remove link</Button><Button type="submit" disabled={!href.trim()}>Insert link</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>
    </div>
  </div>;
}
