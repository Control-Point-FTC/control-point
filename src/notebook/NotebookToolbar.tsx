import React, { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import type { NotebookPageItem } from './types';
import { notebookPageLink, normalizeNotebookLink } from './pageLinks';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label } from '../components/ui-kit';
import { NotebookFind } from './NotebookFind';
import { useNotebookMobile } from './useNotebookMobile';
import { NotebookMobileToolbar } from './NotebookMobileToolbar';
import { notebookCommandGlyph } from './NotebookIcons';
import { HomeTab, useHomeRibbonState } from './ribbon/HomeTab';
import { HistoryTab } from './ribbon/HistoryTab';
import { RibbonButton, RibbonGroup } from './ribbon/RibbonParts';
import { useNotebookWorkspace } from './workspaceContext';
import './ribbon/ribbon.css';

const SYMBOLS = ['©','®','™','§','¶','†','‡','•','…','–','—','‘','’','“','”','«','»','‹','›','¡','¿','×','÷','±','∓','≈','≠','≤','≥','√','∞','∑','∏','∫','∂','∆','π','θ','λ','μ','Ω','α','β','γ','δ','σ','φ','ψ','←','↑','→','↓','↔','⇒','⇐','⇔','★','☆','✓','✗','⚠','●','○','◆','◇','▲','▼','°','′','″','€','£','¥','₹'];
const EMOJI = ['😀','😁','😂','🤣','😊','😍','🤔','😮','😢','😡','👍','👎','👏','🙌','💪','✌️','🤝','👀','🧠','💡','📌','📝','📊','📅','✅','❌','⭐','🔥','🎉','🚀','🤖','🔧','⚙️','🔩','💻','📐','📏','🔬','🧪','⚡','🔋','🏆','🎯','💯','❓','❗','💤','🎓','📚','✏️','📎','🔗','💬','👥','🕒','📍'];
const CODE_LANGUAGES = ['javascript','typescript','python','java','cpp','json','bash','html','css'];
const SHORTCUTS: [string, string][] = [
  ['Bold / italic / underline', 'Ctrl+B / Ctrl+I / Ctrl+U'], ['Undo / redo', 'Ctrl+Z / Ctrl+Y'], ['Find in page', 'Ctrl+F'],
  ['Indent / outdent a list item', 'Tab / Shift+Tab'], ['Paste as plain text', 'Ctrl+Shift+V'],
  ['Rename the selected page or section', 'F2'], ['Move to trash', 'Delete'], ['Reorder in the sidebar', 'Alt+Shift+↑ / ↓'],
  ['Drawing: back to typing', 'Esc'], ['Drawing: nudge the selection', 'Arrow keys'],
];

// OneNote's tab order. Every tab is always present; File, Draw, History and
// View are filled by the open page (export/print, canvas tools, versions, zoom).
export const ribbonTabs = [['file','File'],['home','Home'],['insert','Insert'],['draw','Draw'],['history','History'],['review','Review'],['view','View'],['help','Help']] as const;
type Tab = typeof ribbonTabs[number][0];
const isTab = (value: unknown): value is Tab => ribbonTabs.some(([id]) => id === value);

function readPref(key: string | undefined) { try { return key ? localStorage.getItem(key) : null; } catch { return null; } }
function writePref(key: string | undefined, value: string) { try { if (key) localStorage.setItem(key, value); } catch { /* optional device preference */ } }

function RibbonTabs({ group, onSelect, collapsed, onToggleCollapsed, trailing }: { group: Tab; onSelect: (tab: Tab) => void; collapsed: boolean; onToggleCollapsed?: () => void; trailing?: React.ReactNode }) {
  const Toggle = notebookCommandGlyph(collapsed ? 'Expand ribbon' : 'Collapse ribbon');
  return <div className="nb-command-tabs" role="tablist" aria-label="Notebook commands">
    {ribbonTabs.map(([id, label]) => <button key={id} role="tab" aria-selected={group === id} tabIndex={group === id ? 0 : -1} onClick={() => onSelect(id)} onKeyDown={e => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const index = ribbonTabs.findIndex(([key]) => key === id), n = ribbonTabs.length;
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (index + (e.key === 'ArrowRight' ? 1 : n - 1)) % n;
      onSelect(ribbonTabs[next][0]); e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role=tab]')[next]?.focus();
    }}>{label}</button>)}
    {trailing && <span className="nb-topbar">{trailing}</span>}
    {onToggleCollapsed && Toggle && <button type="button" className="nb-ribbon-toggle" aria-label={collapsed ? 'Show the ribbon' : 'Hide the ribbon'} title={collapsed ? 'Show the ribbon' : 'Hide the ribbon'} aria-expanded={!collapsed} onClick={onToggleCollapsed}><Toggle size={16} /></button>}
  </div>;
}

/** Top bar actions beside the tabs. Share needs an open page. */
function TopBar({ pageId, onNotice }: { pageId?: number; onNotice?: (message: string) => void }) {
  const workspace = useNotebookWorkspace();
  const share = async () => {
    if (!pageId || !onNotice) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('unavailable');
      await navigator.clipboard.writeText(new URL(notebookPageLink(pageId), window.location.origin).href);
      onNotice('Page link copied. Anyone on your team who can open this page can follow it.');
    } catch { onNotice('Copying isn’t available here. Copy the address from the browser bar instead.'); }
  };
  return <>
    {workspace && <RibbonButton label="Sticky Notes" icon="Sticky" showLabel active={workspace.stickyNotesOpen} onClick={workspace.toggleStickyNotes} />}
    {pageId && onNotice && <RibbonButton label="Share" icon="Share" showLabel onClick={() => { void share(); }} />}
  </>;
}

export function NotebookToolbar({ editor, disabled, pages, pageId, preferenceKey, panels = {},requestedGroup }: { editor: Editor | null; disabled: boolean; pages: NotebookPageItem[]; pageId: number; preferenceKey?: string; panels?: Record<string, React.ReactNode>;requestedGroup?:{group:string;key:number} }) {
  const mobile = useNotebookMobile();
  const [group, setGroup] = useState<Tab>(() => { const saved = readPref(preferenceKey); return saved && ['home','insert','review','help'].includes(saved) ? saved as Tab : 'home'; });
  const [collapsed, setCollapsed] = useState(() => readPref(preferenceKey && `${preferenceKey}:collapsed`) === '1');
  useEffect(()=>{if(requestedGroup && isTab(requestedGroup.group)){setGroup(requestedGroup.group);setCollapsed(false);}},[requestedGroup]);
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState('');
  const [label, setLabel] = useState('');
  const [notice, setNotice] = useState('');
  const [finding, setFinding] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [spellcheck, setSpellcheck] = useState(() => readPref('cp-notebook-spellcheck') !== 'off');
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
  useEffect(() => {
    if (!editor) return;
    const find = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' && event.target instanceof Node && editor.view.dom.closest('.nb-document')?.contains(event.target)) { event.preventDefault(); setFinding(true); setGroup('review'); setCollapsed(false); } };
    window.addEventListener('keydown', find); return () => window.removeEventListener('keydown', find);
  }, [editor]);
  // Remembered colors and an armed format painter survive tab switches.
  const home = useHomeRibbonState(editor, disabled, setNotice);
  // Native spellcheck only (no AI); the choice is kept on this device.
  useEffect(() => { if (editor && !editor.isDestroyed) editor.view.dom.setAttribute('spellcheck', spellcheck ? 'true' : 'false'); }, [editor, spellcheck]);
  if (!editor) return null;
  if (mobile) return <NotebookMobileToolbar editor={editor} disabled={disabled} />;
  const chain = () => editor.chain().focus();
  const select = (tab: Tab) => { setGroup(tab); setCollapsed(false); writePref(preferenceKey && `${preferenceKey}:collapsed`, '0'); if (['home','insert','review','help'].includes(tab)) writePref(preferenceKey, tab); };
  const toggleCollapsed = () => setCollapsed(value => { writePref(preferenceKey && `${preferenceKey}:collapsed`, value ? '0' : '1'); return !value; });
  const openLink = () => { setHref(editor.getAttributes('link').href ?? ''); setLabel(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)); setLinkOpen(true); };
  const copyBlockLink = () => {
    let blockId: string | null = null;
    for (let depth = editor.state.selection.$from.depth; depth > 0; depth--) { const id = editor.state.selection.$from.node(depth).attrs.id; if (typeof id === 'string') { blockId = id; break; } }
    if (!blockId) { setNotice('Select a text block first.'); return; }
    void navigator.clipboard.writeText(new URL(notebookPageLink(pageId, blockId), window.location.origin).href).then(() => setNotice('Block link copied.')).catch(() => setNotice('Clipboard is unavailable.'));
  };
  const pickers = <span className="nb-picker-anchor">
    {(['symbols','emoji'] as const).map(kind => <RibbonButton key={kind} label={kind === 'symbols' ? 'Symbols' : 'Emoji'} showLabel active={picker === kind} disabled={disabled} onClick={() => setPicker(p => p === kind ? null : kind)} />)}
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
  </span>;
  const tables = editor.isActive('table') && <RibbonGroup label="Table layout">
    {([['Insert row above', () => chain().addRowBefore().run()], ['Insert row below', () => chain().addRowAfter().run()], ['Insert column left', () => chain().addColumnBefore().run()], ['Insert column right', () => chain().addColumnAfter().run()],
      ['Delete row', () => chain().deleteRow().run()], ['Delete column', () => chain().deleteColumn().run()], ['Merge cells', () => chain().mergeCells().run()], ['Split cell', () => chain().splitCell().run()],
      ['Header row', () => chain().toggleHeaderRow().run()], ['Delete table', () => chain().deleteTable().run()], ['Reset cell fill', () => chain().setCellAttribute('backgroundColor', null).run()]] as [string, () => void][])
      .map(([name, run]) => <RibbonButton key={name} label={name} showLabel disabled={disabled} onClick={run} />)}
    <label className="nb-rfield">Cell fill <input aria-label="Cell shading" type="color" disabled={disabled} defaultValue="#eab308" onChange={e => chain().setCellAttribute('backgroundColor', e.target.value).run()} /></label>
  </RibbonGroup>;
  const pagePanel = (tab: Tab) => panels[tab] ?? <span className="nb-small" role="status">These commands load with the page.</span>;

  const content: Record<Tab, React.ReactNode> = {
    file: pagePanel('file'),
    home: <HomeTab editor={editor} disabled={disabled} notify={setNotice} state={home} />,
    insert: <>
      <RibbonGroup label="Tables"><RibbonButton label="Table" showLabel disabled={disabled} onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} /></RibbonGroup>
      {panels.insert && <RibbonGroup label="Files">{panels.insert}</RibbonGroup>}
      <RibbonGroup label="Links"><RibbonButton label="Link" showLabel shortcut="Ctrl+K" active={editor.isActive('link')} disabled={disabled} onClick={openLink} /></RibbonGroup>
      <RibbonGroup label="Blocks">
        <RibbonButton label="Code block" icon="Code" showLabel active={editor.isActive('codeBlock')} disabled={disabled} onClick={() => chain().toggleCodeBlock().run()} />
        {editor.isActive('codeBlock') && <select aria-label="Code language" className="nb-rselect" disabled={disabled} value={editor.getAttributes('codeBlock').language ?? ''} onChange={e => chain().updateAttributes('codeBlock', { language: e.target.value || null }).run()}><option value="">Plain text</option>{CODE_LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}</select>}
        <RibbonButton label="Inline code" icon="Code" active={editor.isActive('code')} disabled={disabled} onClick={() => chain().toggleCode().run()} />
        <RibbonButton label="Quote" showLabel active={editor.isActive('blockquote')} disabled={disabled} onClick={() => chain().toggleBlockquote().run()} />
        <RibbonButton label="Divider" showLabel disabled={disabled} onClick={() => chain().setHorizontalRule().run()} />
      </RibbonGroup>
      <RibbonGroup label="Symbols">{pickers}</RibbonGroup>
      {tables}
    </>,
    draw: pagePanel('draw'),
    history: <HistoryTab versions={pagePanel('history')} pageId={pageId} notify={setNotice} />,
    review: <>
      <RibbonGroup label="Proofing"><RibbonButton label="Spelling" showLabel active={spellcheck} onClick={() => { const next = !spellcheck; setSpellcheck(next); writePref('cp-notebook-spellcheck', next ? 'on' : 'off'); setNotice(next ? 'Spelling marks on. Right-click a marked word for suggestions.' : 'Spelling marks off.'); }} /></RibbonGroup>
      <RibbonGroup label="Find"><RibbonButton label="Find in page" icon="Find" showLabel shortcut="Ctrl+F" active={finding} onClick={() => setFinding(v => !v)} /></RibbonGroup>
      <RibbonGroup label="Comments">
        <RibbonButton label="Discussions" icon="Discussion" showLabel onClick={() => { const input = document.getElementById(`nb-comment-input-${pageId}`); input?.scrollIntoView({ block: 'center', behavior: 'smooth' }); input?.focus(); }} />
        <RibbonButton label="Copy block link" showLabel onClick={copyBlockLink} />
      </RibbonGroup>
    </>,
    view: pagePanel('view'),
    help: <>
      <RibbonGroup label="Help"><RibbonButton label="Keyboard shortcuts" icon="Shortcuts" showLabel onClick={() => setShortcuts(true)} /></RibbonGroup>
      <p className="nb-notebook-help"><strong>Make this space yours.</strong> Select text to format it from Home. Insert adds tables, files, links and symbols; Draw has pens and shapes; History has versions; Review has spelling, find and discussions.</p>
    </>,
  };

  return <div className="nb-command-bar" data-collapsed={collapsed}>
    <RibbonTabs group={group} onSelect={select} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} trailing={<TopBar pageId={pageId} onNotice={setNotice} />} />
    {!collapsed && <div className="nb-toolbar nb-ribbon" role="toolbar" aria-label={`${ribbonTabs.find(([id]) => id === group)![1]} commands`} data-ribbon={group}>
      {content[group]}
    </div>}
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
    <Dialog open={shortcuts} onOpenChange={setShortcuts}><DialogContent><DialogHeader><DialogTitle>Keyboard shortcuts</DialogTitle><DialogDescription>Use Cmd instead of Ctrl on a Mac.</DialogDescription></DialogHeader>
      <table className="nb-shortcuts"><tbody>{SHORTCUTS.map(([what, keys]) => <tr key={what}><th scope="row">{what}</th><td><kbd>{keys}</kbd></td></tr>)}</tbody></table>
    </DialogContent></Dialog>
  </div>;
}

/** The ribbon before a page is open (loading, or an empty notebook): the
 *  same tabs in the same place, so the workspace never jumps or looks empty. */
export function NotebookRibbonShell({ loading }: { loading: boolean }) {
  const [group, setGroup] = useState<Tab>('home');
  return <div className="nb-command-bar nb-ribbon-shell" aria-busy={loading}>
    <RibbonTabs group={group} onSelect={setGroup} collapsed={false} trailing={<TopBar />} />
    <div className="nb-toolbar nb-ribbon" role="toolbar" aria-label="Note formatting">
      <span className="nb-small" role="status">{loading ? 'Opening your notebook…' : 'Open a page to use these commands, or start one with New page.'}</span>
    </div>
  </div>;
}
