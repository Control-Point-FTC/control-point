import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import { ChevronDown, ChevronUp, MoreHorizontal, PanelTopClose, PanelTopOpen } from 'lucide-react';
import type { NotebookPageItem } from './types';
import { notebookPageLink, normalizeNotebookLink } from './pageLinks';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Input, Label } from '../components/ui-kit';
import { NotebookFind } from './NotebookFind';
import { useNotebookMobile } from './useNotebookMobile';
import { notebookCommandGlyph } from './NotebookIcons';
import { HomeTab, useHomeRibbonState } from './ribbon/HomeTab';
import { HistoryTab } from './ribbon/HistoryTab';
import { RibbonButton, RibbonGroup, RibbonItem, RibbonMenu } from './ribbon/RibbonParts';
import { RibbonDensityContext, densityKey, useDensityPreference, type RibbonDensity } from './ribbon/density';
import { ToolScroller } from './ribbon/ToolScroller';
import { TOOL_ROW_LIMITS, useNarrow } from './ribbon/useNarrow';
import { RecordLinkDialog } from './ribbon/RecordLinkDialog';
import { TaskFromNote } from './ribbon/TaskFromNote';
import { ViewControls } from './ribbon/ViewControls';
import { TableGrid } from './ribbon/TableGrid';
import { TagSummary } from './ribbon/TagSummary';
import { sortTable } from './tableSort';
import { useNotebookWorkspace } from './workspaceContext';
import { Thesaurus } from './ribbon/Thesaurus';
import { autoCapitalizeEnabled, setAutoCapitalize } from './autoCapitalize';
import './ribbon/ribbon.css';
import { claimShellActionsSlot, releaseShellActionsSlot } from '../modern/chrome/shellActionsSlot';

const SYMBOLS = ['©','®','™','§','¶','†','‡','•','…','–','—','‘','’','“','”','«','»','‹','›','¡','¿','×','÷','±','∓','≈','≠','≤','≥','√','∞','∑','∏','∫','∂','∆','π','θ','λ','μ','Ω','α','β','γ','δ','σ','φ','ψ','←','↑','→','↓','↔','⇒','⇐','⇔','★','☆','✓','✗','⚠','●','○','◆','◇','▲','▼','°','′','″','€','£','¥','₹'];
const EMOJI = ['😀','😁','😂','🤣','😊','😍','🤔','😮','😢','😡','👍','👎','👏','🙌','💪','✌️','🤝','👀','🧠','💡','📌','📝','📊','📅','✅','❌','⭐','🔥','🎉','🚀','🤖','🔧','⚙️','🔩','💻','📐','📏','🔬','🧪','⚡','🔋','🏆','🎯','💯','❓','❗','💤','🎓','📚','✏️','📎','🔗','💬','👥','🕒','📍'];
const CODE_LANGUAGES = ['javascript','typescript','python','java','cpp','json','bash','html','css'];
const SHORTCUTS: [string, string][] = [
  ['Bold / italic / underline', 'Ctrl+B / Ctrl+I / Ctrl+U'], ['Undo / redo', 'Ctrl+Z / Ctrl+Y'], ['Find in page', 'Ctrl+F'], ['Thesaurus', 'Shift+F7'],
  ['Indent / outdent a list item', 'Tab / Shift+Tab'], ['Paste as plain text', 'Ctrl+Shift+V'],
  ['Rename the selected page or section', 'F2'], ['Move to trash', 'Delete'], ['Reorder in the sidebar', 'Alt+Shift+↑ / ↓'],
  ['Drawing: back to typing', 'Esc'], ['Drawing: nudge the selection', 'Arrow keys'],
];

// OneNote's tab order. Every tab is always present on a computer; File, Draw,
// History and View are filled by the open page (export/print, canvas tools,
// versions, zoom). Phones leave out Draw and View: drawing and page zoom are
// computer-only.
export const ribbonTabs = [['file','File'],['home','Home'],['insert','Insert'],['draw','Draw'],['history','History'],['review','Review'],['view','View'],['help','Help']] as const;
type Tab = typeof ribbonTabs[number][0];
const ALL_TABS: readonly Tab[] = ribbonTabs.map(([id]) => id);
const PHONE_TABS: readonly Tab[] = ['file', 'home', 'insert', 'history', 'review', 'help'];
const isTab = (value: unknown): value is Tab => ribbonTabs.some(([id]) => id === value);
const tabLabel = (tab: Tab) => ribbonTabs.find(([id]) => id === tab)![1];

function readPref(key: string | undefined) { try { return key ? localStorage.getItem(key) : null; } catch { return null; } }
function writePref(key: string | undefined, value: string) { try { if (key) localStorage.setItem(key, value); } catch { /* optional device preference */ } }

type TabsProps = { tabs: readonly Tab[]; group: Tab; onSelect: (tab: Tab) => void };
/** The tab strip (File, Home, Insert …); arrow keys move between tabs. */
function RibbonTabs({ tabs, group, onSelect }: TabsProps) {
  return <div className="nb-command-tabs" role="tablist" aria-label="Notebook commands">
    {tabs.map(id => <button key={id} type="button" role="tab" aria-selected={group === id} tabIndex={group === id ? 0 : -1} onClick={() => onSelect(id)} onKeyDown={e => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const index = tabs.indexOf(id), n = tabs.length;
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (index + (e.key === 'ArrowRight' ? 1 : n - 1)) % n;
      onSelect(tabs[next]); e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role=tab]')[next]?.focus();
    }}>{tabLabel(id)}</button>)}
  </div>;
}

/** Narrow windows and phones: the same tabs as one menu button ("Home ▾"). */
function TabPicker({ tabs, group, onSelect }: TabsProps) {
  return <DropdownMenu modal={false}>
    <DropdownMenuTrigger asChild><button type="button" className="nb-tab-picker" aria-label={`Commands: ${tabLabel(group)}`} title="Choose a command tab" onMouseDown={e => e.preventDefault()}><span>{tabLabel(group)}</span><ChevronDown size={14} aria-hidden="true" /></button></DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="nb-rmenu">
      {tabs.map(id => <DropdownMenuItem key={id} role="menuitemradio" aria-checked={group === id} onSelect={() => onSelect(id)}>{tabLabel(id)}</DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>;
}

function ShareGlyph() { const Glyph = notebookCommandGlyph('Share'); return Glyph ? <Glyph size={16} /> : null; }

/** The page bar's right end for the open page: save status, the app's
 *  controls (clock, sticky notes, Search, Bruno), Share, a menu for less
 *  frequent page actions, and the button that hides the toolbar. */
function PageBarActions({ pageId, onNotice, status, collapsed, onToggleCollapsed }: { pageId?: number; onNotice?: (message: string) => void; status?: React.ReactNode; collapsed: boolean; onToggleCollapsed?: () => void }) {
  const mobile = useNotebookMobile();
  const workspace = useNotebookWorkspace();
  // Claim the shared controls while this is the visible toolbar (split view
  // hides the inactive pane's); release them only if held here.
  const slotEl = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = slotEl.current;
    if (!el) return;
    if (el.closest('[hidden]')) releaseShellActionsSlot(el); else claimShellActionsSlot(el);
  });
  useEffect(() => { const el = slotEl.current; return () => { if (el) releaseShellActionsSlot(el); }; }, [mobile]);
  const share = async () => {
    if (!pageId || !onNotice) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('unavailable');
      await navigator.clipboard.writeText(new URL(notebookPageLink(pageId), window.location.origin).href);
      onNotice('Page link copied. Anyone on your team who can open this page can follow it.');
    } catch { onNotice('Copying isn’t available here. Copy the address from the browser bar instead.'); }
  };
  const canShare = !!pageId && !!onNotice;
  const toggleLabel = collapsed ? 'Show the ribbon' : 'Hide the ribbon';
  const menu = [
    ...(mobile && canShare ? [{ label: 'Share', onSelect: () => { void share(); } }] : []),
    ...(workspace?.pageActions ?? []),
    ...(mobile && onToggleCollapsed ? [{ label: toggleLabel, onSelect: onToggleCollapsed }] : []),
  ];
  return <>
    {status && <span className="nb-bar-status">{status}</span>}
    <span className="nb-bar-actions">
      {/* The app's clock and weather, sticky notes, Search and Bruno render here (the app top bar is hidden in the notebook). */}
      {!mobile && <span ref={slotEl} className="nb-shell-actions" />}
      {!mobile && canShare && <button type="button" className="nb-bar-btn" aria-label="Share" title="Copy a link to this page" onClick={() => { void share(); }}><ShareGlyph /><span>Share</span></button>}
      {menu.length > 0 && <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild><button type="button" className="nb-bar-icon" aria-label="More page actions" title="More page actions"><MoreHorizontal size={18} /></button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="nb-rmenu">{menu.map(item => <DropdownMenuItem key={item.label} disabled={item.disabled} onSelect={item.onSelect}>{item.label}</DropdownMenuItem>)}</DropdownMenuContent>
      </DropdownMenu>}
      {!mobile && onToggleCollapsed && <button type="button" className="nb-bar-icon nb-ribbon-toggle" aria-label={toggleLabel} title={toggleLabel} aria-expanded={!collapsed} onClick={onToggleCollapsed}>{collapsed ? <PanelTopOpen size={18} /> : <PanelTopClose size={18} />}</button>}
    </span>
  </>;
}

/** Row one goes into the notebook's page bar when there is one; on its own
 *  (tests, an editor outside the workspace) it stays at the top of the toolbar. */
function PageBarSlot({ host, children }: { host?: HTMLElement | null; children: React.ReactNode }) {
  return host ? createPortal(children, host) : <div className="nb-page-bar nb-page-bar-inline">{children}</div>;
}

/** Compact (default) or expanded: the chevron at the right end, like OneNote. */
/** Compact (default) or expanded: the chevron at the right end, like OneNote.
 *  It sits after a divider so it doesn't read as another dropdown, and only
 *  a click on it changes the saved choice (never the window or panel width). */
function DensityToggle({ density, onChange }: { density: RibbonDensity; onChange: (value: RibbonDensity) => void }) {
  const compact = density === 'compact';
  const label = compact ? 'Show the full toolbar' : 'Use the compact toolbar';
  return <button type="button" className="nb-density-toggle" aria-label={label} title={label} aria-pressed={!compact} onMouseDown={e => e.preventDefault()} onClick={() => onChange(compact ? 'expanded' : 'compact')}>{compact ? <ChevronDown size={18} /> : <ChevronUp size={18} />}</button>;
}

const EXPANDED_NOTICE = 'Full toolbar on. The chevron at the right end brings back the compact row.';
/** The member's density, plus a notice when the chevron turns the full toolbar on (cleared on going back). */
function useDensity(memberId: number | null | undefined, setNotice: React.Dispatch<React.SetStateAction<string>>) {
  const [density, save] = useDensityPreference(densityKey(memberId));
  const setDensity = (value: RibbonDensity) => { save(value); setNotice(current => value === 'expanded' ? EXPANDED_NOTICE : current === EXPANDED_NOTICE ? '' : current); };
  return [density, setDensity] as const;
}

type ToolbarProps = {
  editor: Editor | null; disabled: boolean; pages: NotebookPageItem[]; pageId: number; preferenceKey?: string; panels?: Record<string, React.ReactNode>; requestedGroup?: { group: string; key: number };
  /** The page bar's slot for this page's status and actions, and whether this toolbar is the visible one. */
  barHost?: HTMLElement | null; active?: boolean; status?: React.ReactNode;
};
export function NotebookToolbar({ editor, disabled, pages, pageId, preferenceKey, panels = {}, requestedGroup, barHost, active = true, status }: ToolbarProps) {
  const mobile = useNotebookMobile();
  const [group, setGroup] = useState<Tab>(() => { const saved = readPref(preferenceKey); return saved && ['home','insert','review','help'].includes(saved) ? saved as Tab : 'home'; });
  const [collapsed, setCollapsed] = useState(() => readPref(preferenceKey && `${preferenceKey}:collapsed`) === '1');
  useEffect(()=>{if(requestedGroup && isTab(requestedGroup.group)){setGroup(requestedGroup.group);setCollapsed(false);}},[requestedGroup]);
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState('');
  const [label, setLabel] = useState('');
  const [notice, setNotice] = useState('');
  const [recordOpen, setRecordOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  // Editing stopped (read-only, conflict): the record picker and task dialog close.
  useEffect(() => { if (disabled) { setRecordOpen(false); setTaskOpen(false); } }, [disabled]);
  const [tableMenu, setTableMenu] = useState(false);
  const workspace = useNotebookWorkspace();
  const [density, setDensity] = useDensity(workspace?.memberId, setNotice);
  const compact = density === 'compact';
  const bar = useRef<HTMLDivElement>(null);
  useNarrow(bar, TOOL_ROW_LIMITS);
  const pageSection = pages.find(p => p.id === pageId)?.sectionId;
  const [localTags, setLocalTags] = useState(false);
  const tagsWorkspace = workspace;
  const findingTags = tagsWorkspace?.setTagSummaryOpen ? !!tagsWorkspace.tagSummaryOpen : localTags;
  const setFindingTags = (open: boolean) => (tagsWorkspace?.setTagSummaryOpen ?? setLocalTags)(open);
  const [finding, setFinding] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [thesaurus, setThesaurus] = useState(false);
  const [spellcheck, setSpellcheck] = useState(() => readPref('cp-notebook-spellcheck') !== 'off');
  const [capitalize, setCapitalize] = useState(autoCapitalizeEnabled);
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
    const find = (event: KeyboardEvent) => {
      if (!(event.target instanceof Node) || !editor.view.dom.closest('.nb-document')?.contains(event.target)) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); setFinding(true); setGroup('review'); setCollapsed(false); }
      else if (event.shiftKey && event.key === 'F7') { event.preventDefault(); setThesaurus(true); }
    };
    window.addEventListener('keydown', find); return () => window.removeEventListener('keydown', find);
  }, [editor]);
  // Remembered colors and an armed format painter survive tab switches.
  const home = useHomeRibbonState(editor, disabled, setNotice);
  // Native spellcheck only (no AI); the choice is kept on this device.
  useEffect(() => { if (editor && !editor.isDestroyed) editor.view.dom.setAttribute('spellcheck', spellcheck ? 'true' : 'false'); }, [editor, spellcheck]);
  if (!editor) return null;
  const tabs: readonly Tab[] = mobile ? PHONE_TABS : ALL_TABS;
  const shown: Tab = tabs.includes(group) ? group : 'home';
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
  const tableActions = ([['Insert row above', () => chain().addRowBefore().run()], ['Insert row below', () => chain().addRowAfter().run()], ['Insert column left', () => chain().addColumnBefore().run()], ['Insert column right', () => chain().addColumnAfter().run()],
      ['Delete row', () => chain().deleteRow().run()], ['Delete column', () => chain().deleteColumn().run()], ['Merge cells', () => chain().mergeCells().run()], ['Split cell', () => chain().splitCell().run()],
      ['Header row', () => chain().toggleHeaderRow().run()], ['Delete table', () => chain().deleteTable().run()], ['Reset cell fill', () => chain().setCellAttribute('backgroundColor', null).run()]] as [string, () => void][]);
  const tables = editor.isActive('table') && <RibbonGroup label="Table layout">
    {compact
      ? <RibbonMenu label="Table layout" disabled={disabled}>{tableActions.map(([name, run]) => <RibbonItem key={name} onSelect={run}>{name}</RibbonItem>)}</RibbonMenu>
      : tableActions.map(([name, run]) => <RibbonButton key={name} label={name} showLabel disabled={disabled} onClick={run} />)}
    <RibbonButton label="Sort ascending" icon="SortAsc" showLabel disabled={disabled} onClick={() => { const problem = sortTable(editor.state, editor.view.dispatch, 'asc'); if (problem) setNotice(problem); else editor.commands.focus(); }} />
    <RibbonButton label="Sort descending" icon="SortDesc" showLabel disabled={disabled} onClick={() => { const problem = sortTable(editor.state, editor.view.dispatch, 'desc'); if (problem) setNotice(problem); else editor.commands.focus(); }} />
    <label className="nb-rfield">Cell fill <input aria-label="Cell shading" type="color" disabled={disabled} defaultValue="#eab308" onChange={e => chain().setCellAttribute('backgroundColor', e.target.value).run()} /></label>
  </RibbonGroup>;
  const pagePanel = (tab: Tab) => panels[tab] ?? <span className="nb-small" role="status">These commands load with the page.</span>;

  const content: Record<Tab, React.ReactNode> = {
    file: pagePanel('file'),
    home: <HomeTab editor={editor} disabled={disabled} notify={setNotice} state={home} findingTags={findingTags} onFindTags={() => setFindingTags(!findingTags)} onCreateTask={() => setTaskOpen(true)} />,
    insert: <>
      <RibbonGroup label="Tables"><RibbonMenu label="Table" showLabel disabled={disabled} open={tableMenu} onOpenChange={setTableMenu}><TableGrid onPick={(rows, cols) => { setTableMenu(false); chain().insertTable({ rows, cols, withHeaderRow: true }).run(); }} /></RibbonMenu></RibbonGroup>
      {panels.insert && <RibbonGroup label="Files">{panels.insert}</RibbonGroup>}
      {workspace?.openTemplates && <RibbonGroup label="Pages"><RibbonButton label="Page templates" icon="Template" showLabel disabled={!workspace.tree?.permissions.edit || !pageSection} onClick={() => { if (pageSection) workspace.openTemplates?.(pageSection); }} /></RibbonGroup>}
      <RibbonGroup label="Links"><RibbonButton label="Link" showLabel shortcut="Ctrl+K" active={editor.isActive('link')} disabled={disabled} onClick={openLink} /><RibbonButton label="Task or meeting" icon="Record" showLabel disabled={disabled} onClick={() => setRecordOpen(true)} /></RibbonGroup>
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
      <RibbonGroup label="Proofing"><RibbonButton label="Thesaurus" showLabel shortcut="Shift+F7" active={thesaurus} onClick={() => setThesaurus(v => !v)} /><RibbonButton label="Spelling" showLabel active={spellcheck} onClick={() => { const next = !spellcheck; setSpellcheck(next); writePref('cp-notebook-spellcheck', next ? 'on' : 'off'); setNotice(next ? 'Spelling marks on. Right-click a marked word for suggestions.' : 'Spelling marks off.'); }} /><RibbonButton label="Auto-capitalize" showLabel active={capitalize} onClick={() => { const next = !capitalize; setCapitalize(next); setAutoCapitalize(next); setNotice(next ? 'New lines start with a capital letter. Press Backspace right after to undo one.' : 'Auto-capitalize off.'); }} /></RibbonGroup>
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

  return <RibbonDensityContext.Provider value={density}><div ref={bar} className="nb-command-bar" data-collapsed={collapsed} data-density={density}>
    {active && <PageBarSlot host={barHost}><PageBarActions pageId={pageId} onNotice={setNotice} status={status} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} /></PageBarSlot>}
    <div className="nb-tool-row">
      <TabPicker tabs={tabs} group={shown} onSelect={select} />
      <RibbonTabs tabs={tabs} group={shown} onSelect={select} />
      {!collapsed && <ToolScroller compact={compact}><div className="nb-toolbar nb-ribbon" role="toolbar" aria-label={`${tabLabel(shown)} commands`} data-ribbon={shown}>
        {content[shown]}
      </div></ToolScroller>}
      {!collapsed && <DensityToggle density={density} onChange={setDensity} />}
    </div>
    {notice && <span role="status" className="nb-small nb-toolbar-shared">{notice}</span>}
    {thesaurus && <Thesaurus editor={editor} disabled={disabled} onClose={() => setThesaurus(false)} />}
    {findingTags && <TagSummary pageId={pageId} sectionId={pages.find(p => p.id === pageId)?.sectionId} onClose={() => setFindingTags(false)} />}
    {recordOpen && !disabled && <RecordLinkDialog editor={editor} open={recordOpen} onOpenChange={setRecordOpen} />}
    {taskOpen && !disabled && <TaskFromNote editor={editor} pageId={pageId} pageTitle={pages.find(p => p.id === pageId)?.title ?? ''} open={taskOpen} onOpenChange={setTaskOpen} notify={setNotice} />}
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
  </div></RibbonDensityContext.Provider>;
}

/** The ribbon before a page is open (loading, or an empty notebook): the
 *  same tabs in the same place, so the workspace never jumps or looks empty. */
export function NotebookRibbonShell({ loading, barHost }: { loading: boolean; barHost?: HTMLElement | null }) {
  const mobile = useNotebookMobile();
  const [group, setGroup] = useState<Tab>('home');
  const workspace = useNotebookWorkspace();
  const [notice, setNotice] = useState('');
  const [density, setDensity] = useDensity(workspace?.memberId, setNotice);
  const bar = useRef<HTMLDivElement>(null);
  useNarrow(bar, TOOL_ROW_LIMITS);
  const section = workspace?.currentSection ?? null;
  const canStart = !loading && !!workspace?.openTemplates && !!workspace.tree?.permissions.edit && section != null;
  const tabs: readonly Tab[] = mobile ? PHONE_TABS : ALL_TABS;
  const shown: Tab = tabs.includes(group) ? group : 'home';
  return <RibbonDensityContext.Provider value={density}><div ref={bar} className="nb-command-bar nb-ribbon-shell" aria-busy={loading} data-density={density}>
    <PageBarSlot host={barHost}><PageBarActions collapsed={false} /></PageBarSlot>
    <div className="nb-tool-row">
      <TabPicker tabs={tabs} group={shown} onSelect={setGroup} />
      <RibbonTabs tabs={tabs} group={shown} onSelect={setGroup} />
      <ToolScroller compact={density === 'compact'}><div className="nb-toolbar nb-ribbon" role="toolbar" aria-label="Note formatting">
        {/* View's layout choice works without a page, so it's never a dead end. */}
        {shown === 'view' && <ViewControls />}
        {canStart && shown !== 'view' && <RibbonGroup label="Pages"><RibbonButton label="Start from a template" icon="Template" showLabel onClick={() => workspace!.openTemplates!(section!)} /></RibbonGroup>}
        <span className="nb-small" role="status">{loading ? 'Opening your notebook…' : 'Open a page to use these commands, or start one with New page.'}</span>
      </div></ToolScroller>
      <DensityToggle density={density} onChange={setDensity} />
    </div>
    {notice && <span role="status" className="nb-small nb-toolbar-shared">{notice}</span>}
  </div></RibbonDensityContext.Provider>;
}
