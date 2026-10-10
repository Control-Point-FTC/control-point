import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import NotebookCanvas from '../NotebookCanvas';
import { PageLinkSourceContext } from '../PageLinkPopup';
import { RecordNavigationContext } from '../recordNavigation';
const openRecord = vi.fn();
import { pageLinkKey } from '../pageLinkMenu';
import { NotebookSync } from '../NotebookSync';
import { canvasJSON, seedCanvas, type Ink } from '../canvasModel';
import * as geometry from '../canvasGeometry';
const providers: NotebookSync[] = [];
afterEach(() => { cleanup(); providers.splice(0).forEach(p => p.destroy()); vi.restoreAllMocks(); });
const LINKS = { pages: () => [{ id: 5, sectionId: 1, parentId: null, title: 'Drivetrain', sort: 0, protected: false, ownProtected: false, revision: 1, updatedAt: '' }], currentPageId: () => 1, enabled: () => true };
function mount(editable = true, mobile = false, strokes = 0, scoped = false, scopeId?: string) {
    const sync = new NotebookSync(1,scoped?{memberId:123,teamId:456}:undefined);
    const zoom = vi.fn();
    providers.push(sync);
    if (strokes) seedCanvas(sync.doc, { version: 1, objects: Array.from({length:strokes},(_,i): Ink => ({ id:`stroke-${i}`, type:'stroke',tool:'pen',x:i%100,y:Math.floor(i/100),width:10,height:10,z:i,rotation:0,locked:false,groupId:null,color:'#111111',strokeWidth:2,opacity:1,points:[[0,0,.5],[10,10,.5]] })) });
    function Harness() { const [ribbon, setRibbon] = useState<React.ReactNode>(null); return <><div>{ribbon}</div><div className="nb-paper-scroll"><RecordNavigationContext.Provider value={openRecord}><PageLinkSourceContext.Provider value={LINKS}><NotebookCanvas sync={sync} scopeId={scopeId} editable={editable} mobile={mobile} onZoom={zoom} onRibbon={setRibbon} onEditorFocus={() => { }} onEditorRemoved={() => { }}><p>Flow text remains here</p></NotebookCanvas></PageLinkSourceContext.Provider></RecordNavigationContext.Provider></div></>; }
    render(<Harness />);
    const surface = screen.getByLabelText('Page drawing surface');
    Object.defineProperties(surface, { offsetWidth: { value: 1000 }, offsetHeight: { value: 600 } });
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 600, right: 1000, bottom: 600, x: 0, y: 0, toJSON() { } });
    surface.setPointerCapture = vi.fn();
    return { sync, surface, zoom };
}
const caret = () => screen.getByLabelText('Type to add a text box here') as HTMLTextAreaElement;
const boxText = (sync: NotebookSync, i = 0) => JSON.stringify((canvasJSON(sync.doc).objects[i] as any)?.content ?? null);
function pointer(surface: HTMLElement, type: string, x: number, y: number, id = 1, source = 'mouse') { const event = new Event(type, { bubbles: true }); Object.assign(event, { pointerId: id, button: 0, clientX: x, clientY: y, pressure: .5, pointerType: source }); fireEvent(surface, event); }
describe('desktop shared drawing surface', () => {
    it('starts PDF text boxes inside a nested flow without treating the outer flow as its text editor',()=>{
        const {sync}=mount(true,false,0,false,'block-pdf-1');
        fireEvent.click(screen.getByRole('button',{name:'Drawing type'}));
        pointer(screen.getByText('Flow text remains here'),'pointerdown',100,100);
        expect(canvasJSON(sync.doc).objects).toHaveLength(0);
        fireEvent.input(caret(),{target:{value:'n'}});
        expect(canvasJSON(sync.doc).objects[0]).toMatchObject({type:'text',pdfScope:'block-pdf-1'});
    });
    it('anchors PDF ink to its page without selecting or erasing another surface',()=>{
        const {sync,surface}=mount(true,false,1,false,'pdf-block-pdf-2');
        expect(surface.querySelectorAll('.nb-canvas-ink path')).toHaveLength(0);
        fireEvent.click(screen.getByRole('button',{name:'Drawing pen'}));pointer(surface,'pointerdown',100,100);pointer(surface,'pointerup',200,120);
        expect(canvasJSON(sync.doc).objects.find(item=>item.id!=='stroke-0')).toMatchObject({pdfScope:'pdf-block-pdf-2'});
        fireEvent.click(screen.getByRole('button',{name:'Undo ink'}));expect(canvasJSON(sync.doc).objects.map(item=>item.id)).toEqual(['stroke-0']);
    });
    it('keeps flow text clickable when drawing is disabled with a remembered pen',()=>{
        const key='cp:notebook:drawing:123:456';localStorage.setItem(key,JSON.stringify({tool:'pen',color:'#111111',size:3}));
        try{const {surface}=mount(false,false,0,true);expect(surface).toHaveAttribute('data-tool','type');expect(screen.getByText('Flow text remains here')).toBeVisible();expect(JSON.parse(localStorage.getItem(key)!).tool).toBe('pen');}
        finally{localStorage.removeItem(key);}
    });
    it('saves the largest highlighter size within the shared stroke budget', () => {
        const { sync, surface } = mount();
        fireEvent.click(screen.getByRole('button',{name:'Drawing highlighter'}));
        fireEvent.change(screen.getByRole('combobox',{name:'Stroke size'}),{target:{value:'12'}});
        pointer(surface,'pointerdown',100,100); pointer(surface,'pointerup',200,120);
        expect(canvasJSON(sync.doc).objects[0]).toMatchObject({type:'stroke',tool:'highlighter',strokeWidth:64,opacity:.35});
    });
    it('keeps 2,000 retained strokes from rebuilding during live pointer samples', async () => {
        const path = vi.spyOn(geometry,'inkPath');
        const { surface } = mount(true,false,2000);
        expect(path).toHaveBeenCalledTimes(2000); path.mockClear();
        fireEvent.click(screen.getByRole('button',{name:'Drawing pen'}));
        pointer(surface,'pointerdown',300,300); pointer(surface,'pointermove',350,330);
        await waitFor(() => expect(surface.querySelector('.nb-canvas-live path')).not.toBeNull());
        expect(path).not.toHaveBeenCalled();
        expect(surface.querySelectorAll('.nb-canvas-ink path')).toHaveLength(2000);
        pointer(surface,'pointercancel',350,330);
    });
    it('switches a two-finger gesture to page zoom without committing ink', () => {
        const { sync, surface, zoom } = mount();
        fireEvent.click(screen.getByRole('button', { name: 'Drawing pen' }));
        pointer(surface,'pointerdown',100,100,1,'touch');
        pointer(surface,'pointerdown',200,100,2,'touch');
        pointer(surface,'pointermove',300,100,2,'touch');
        expect(zoom).toHaveBeenCalledWith(200);
        pointer(surface,'pointerup',100,100,1,'touch');
        pointer(surface,'pointerup',300,100,2,'touch');
        expect(canvasJSON(sync.doc).objects).toHaveLength(0);
    });
    it('rejects palm touches while preserving an active stylus stroke', () => {
        const { sync, surface } = mount();
        fireEvent.click(screen.getByRole('button', { name: 'Drawing pen' }));
        pointer(surface,'pointerdown',100,100,1,'pen');
        pointer(surface,'pointerdown',400,400,2,'touch');
        pointer(surface,'pointerup',400,400,2,'touch');
        pointer(surface,'pointerup',200,150,1,'pen');
        expect(canvasJSON(sync.doc).objects).toHaveLength(1);
    });
    it('snaps pen ink to the visible ruler edge', () => {
        const { sync, surface } = mount();
        fireEvent.click(screen.getByRole('button', { name: 'Drawing ruler' }));
        expect(screen.getByRole('group', { name: 'Drawing ruler' })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Drawing pen' }));
        pointer(surface,'pointerdown',100,183);
        pointer(surface,'pointerup',200,185);
        expect(canvasJSON(sync.doc).objects[0]).toMatchObject({ type:'stroke',y:180,height:.1 });
    });
    it('commits retained ink and supports independent drawing undo and redo', () => {
        const { sync, surface } = mount();
        fireEvent.click(screen.getByRole('button', { name: 'Drawing pen' }));
        pointer(surface, 'pointerdown', 100, 100);
        pointer(surface, 'pointermove', 150, 125);
        pointer(surface, 'pointerup', 200, 150);
        expect(canvasJSON(sync.doc).objects).toHaveLength(1);
        expect(canvasJSON(sync.doc).objects[0]).toMatchObject({ type: 'stroke', x: 100, y: 100, width: 100, height: 50 });
        expect(screen.getByText('Flow text remains here')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Undo ink' }));
        expect(canvasJSON(sync.doc).objects).toHaveLength(0);
        fireEvent.click(screen.getByRole('button', { name: 'Redo ink' }));
        expect(canvasJSON(sync.doc).objects).toHaveLength(1);
    });
    it('cancels live ink without saving a partial stroke', () => {
        const { sync, surface } = mount();
        fireEvent.click(screen.getByRole('button', { name: 'Drawing highlighter' }));
        pointer(surface, 'pointerdown', 100, 100);
        pointer(surface, 'pointermove', 150, 125);
        pointer(surface, 'pointercancel', 150, 125);
        expect(canvasJSON(sync.doc).objects).toHaveLength(0);
    });
    it('puts a caret where you click and makes the text box when you type', async () => {
        const { sync, surface } = mount();
        fireEvent.click(screen.getByRole('button', { name: 'Drawing type' }));
        pointer(surface, 'pointerdown', 300, 200);
        expect(canvasJSON(sync.doc).objects).toHaveLength(0);
        fireEvent.keyDown(caret(), { key: 'Escape' });
        expect(screen.queryByLabelText('Type to add a text box here')).toBeNull();
        expect(canvasJSON(sync.doc).objects).toHaveLength(0);
        pointer(surface, 'pointerdown', 300, 200);
        fireEvent.input(caret(), { target: { value: 'h' } });
        expect(canvasJSON(sync.doc).objects[0]).toMatchObject({ type: 'text', x: 300, y: 200 });
        // Everything typed while the box gets ready is carried in, each line capitalized.
        fireEvent.input(caret(), { target: { value: 'hello\nworld' } });
        await waitFor(() => expect(boxText(sync)).toContain('"text":"Hello"'));
        expect(boxText(sync)).toContain('"text":"World"');
        await waitFor(() => expect(document.activeElement?.getAttribute('aria-label')).toBe('Canvas text'));
        expect(screen.queryByLabelText('Type to add a text box here')).toBeNull();
    });
    it('waits for an IME to commit, and Backspace restores a lowercase first letter', async () => {
        const { sync, surface } = mount();
        fireEvent.click(screen.getByRole('button', { name: 'Drawing type' }));
        pointer(surface, 'pointerdown', 40, 40);
        fireEvent.input(caret(), { target: { value: 'ni' }, isComposing: true });
        expect(canvasJSON(sync.doc).objects).toHaveLength(0);
        fireEvent.change(caret(), { target: { value: '你' } });
        fireEvent.compositionEnd(caret());
        await waitFor(() => expect(boxText(sync)).toContain('"text":"你"'));
        pointer(surface, 'pointerdown', 400, 300);
        fireEvent.input(caret(), { target: { value: 'q' } });
        await waitFor(() => expect(boxText(sync, 1)).toContain('"text":"Q"'));
        await waitFor(() => expect(document.activeElement?.getAttribute('aria-label')).toBe('Canvas text'));
        const box = document.activeElement as HTMLElement & { editor?: any };
        box.editor.view.someProp('handleKeyDown', (f: any) => f(box.editor.view, new KeyboardEvent('keydown', { key: 'Backspace' })));
        expect(boxText(sync, 1)).toContain('"text":"q"');
    });
    it('keeps what was typed but leaves focus alone when the caret is left before the box is ready', async () => {
        const { sync, surface } = mount();
        fireEvent.click(screen.getByRole('button', { name: 'Drawing type' }));
        pointer(surface, 'pointerdown', 50, 50);
        fireEvent.input(caret(), { target: { value: 'note' } });
        fireEvent.keyDown(caret(), { key: 'Escape' });
        await waitFor(() => expect(boxText(sync)).toContain('"text":"Note"'));
        expect(document.activeElement?.getAttribute('aria-label')).not.toBe('Canvas text');
    });
    it('keeps typed text through a tool switch and keeps a caret moved to another spot', async () => {
        const { sync, surface } = mount();
        fireEvent.click(screen.getByRole('button', { name: 'Drawing type' }));
        pointer(surface, 'pointerdown', 50, 50);
        fireEvent.input(caret(), { target: { value: 'parts list' } });
        fireEvent.click(screen.getByRole('button', { name: 'Drawing pen' }));
        await waitFor(() => expect(boxText(sync)).toContain('"text":"Parts list"'));
        fireEvent.click(screen.getByRole('button', { name: 'Drawing type' }));
        pointer(surface, 'pointerdown', 300, 300);
        const first = caret();
        first.focus();
        expect(document.activeElement).toBe(first);
        pointer(surface, 'pointerdown', 500, 400);
        fireEvent.blur(first);
        expect(caret().style.left).toBe('500px');
    });
    it('makes a text box at once on double-click, with move and width handles', () => {
        const { sync, surface } = mount();
        fireEvent.click(screen.getByRole('button', { name: 'Drawing type' }));
        fireEvent.doubleClick(surface, { clientX: 120, clientY: 80 });
        expect(canvasJSON(sync.doc).objects[0]).toMatchObject({ type: 'text', x: 120, y: 80 });
        const width = (canvasJSON(sync.doc).objects[0] as any).width;
        fireEvent.keyDown(screen.getByRole('button', { name: /Move text box/ }), { key: 'ArrowRight', shiftKey: true });
        fireEvent.keyDown(screen.getByRole('separator', { name: /Text box width/ }), { key: 'ArrowLeft' });
        expect(canvasJSON(sync.doc).objects[0]).toMatchObject({ x: 130, y: 80, width: width - 1 });
    });
    it('undoes a whole handle drag in one step and keeps boxes inside the page limits', () => {
        const { sync, surface } = mount();
        fireEvent.click(screen.getByRole('button', { name: 'Drawing type' }));
        fireEvent.doubleClick(surface, { clientX: 120, clientY: 80 });
        const grip = screen.getByRole('button', { name: /Move text box/ });
        grip.setPointerCapture = vi.fn();
        pointer(grip, 'pointerdown', 120, 70);
        for (const x of [130, 150, 170, 190]) pointer(grip, 'pointermove', x, 70);
        pointer(grip, 'pointerup', 190, 70);
        expect(canvasJSON(sync.doc).objects[0]).toMatchObject({ x: 190, y: 80 });
        fireEvent.click(screen.getByRole('button', { name: 'Undo ink' }));
        expect(canvasJSON(sync.doc).objects[0]).toMatchObject({ x: 120, y: 80 });
        pointer(grip, 'pointerdown', 120, 70);
        pointer(grip, 'pointermove', 90000, 70);
        pointer(grip, 'pointerup', 90000, 70);
        expect(canvasJSON(sync.doc).objects[0]).toMatchObject({ x: 50000 });
        fireEvent.keyDown(grip, { key: 'ArrowRight', shiftKey: true });
        expect(canvasJSON(sync.doc).objects[0]).toMatchObject({ x: 50000 });
    });
    it('copies, cuts, pastes and duplicates the selection from the keyboard', () => {
        const { sync, surface } = mount();
        fireEvent.click(screen.getByRole('button', { name: 'Drawing type' }));
        fireEvent.doubleClick(surface, { clientX: 100, clientY: 100 });
        expect(canvasJSON(sync.doc).objects).toHaveLength(1);
        fireEvent.keyDown(surface, { key: 'd', ctrlKey: true });
        expect(canvasJSON(sync.doc).objects).toHaveLength(2);
        fireEvent.keyDown(surface, { key: 'c', ctrlKey: true });
        expect(screen.getByRole('status')).toHaveTextContent('Copied 1 item');
        fireEvent.keyDown(surface, { key: 'v', ctrlKey: true });
        expect(canvasJSON(sync.doc).objects).toHaveLength(3);
        fireEvent.keyDown(surface, { key: 'x', metaKey: true });
        expect(canvasJSON(sync.doc).objects).toHaveLength(2);
        fireEvent.keyDown(surface, { key: 'v', ctrlKey: true });
        expect(canvasJSON(sync.doc).objects).toHaveLength(3);
        expect(screen.getByRole('status')).toHaveTextContent('Pasted 1 item.');
    });
    it('leaves shortcuts alone inside text, for readers and phones, and with nothing copied', async () => {
        const reader = mount(false);
        const before = canvasJSON(reader.sync.doc).objects.length;
        for (const key of ['c', 'x', 'v', 'd']) expect(fireEvent.keyDown(reader.surface, { key, ctrlKey: true })).toBe(true); // not prevented
        expect(canvasJSON(reader.sync.doc).objects).toHaveLength(before);
        cleanup();
        const phone = mount(true, true);
        expect(fireEvent.keyDown(phone.surface, { key: 'v', ctrlKey: true })).toBe(true);
        cleanup();
        const { sync, surface } = mount();
        expect(fireEvent.keyDown(surface, { key: 'v', ctrlKey: true })).toBe(true); // empty canvas clipboard: native paste
        fireEvent.click(screen.getByRole('button', { name: 'Drawing type' }));
        fireEvent.doubleClick(surface, { clientX: 100, clientY: 100 });
        const box = await waitFor(() => { const el = surface.querySelector<HTMLElement>('[data-canvas-id] [role=textbox]'); if (!el) throw new Error('not ready'); return el; });
        expect(fireEvent.keyDown(box, { key: 'd', ctrlKey: true })).toBe(true); // typing in a text box
        expect(canvasJSON(sync.doc).objects).toHaveLength(1);
    });
    it('opens task and meeting links from canvas text boxes in the app', async () => {
        const { surface } = mount();
        fireEvent.click(screen.getByRole('button', { name: 'Drawing type' }));
        fireEvent.doubleClick(surface, { clientX: 60, clientY: 60 });
        const box = await waitFor(() => { const el = surface.querySelector<HTMLElement & { editor?: any }>('[data-canvas-id] [role=textbox]'); if (!el?.editor) throw new Error('not ready'); return el; });
        box.editor.commands.insertContent([{ type: 'text', text: 'Wire it', marks: [{ type: 'link', attrs: { href: '/tasks?task=5' } }] }]);
        fireEvent.click(box.querySelector('a')!);
        expect(openRecord).toHaveBeenCalledWith('/tasks?task=5');
    });
    it('offers page links in canvas text boxes too', async () => {
        const { surface } = mount();
        fireEvent.click(screen.getByRole('button', { name: 'Drawing type' }));
        fireEvent.doubleClick(surface, { clientX: 60, clientY: 60 });
        const box = await waitFor(() => { const el = surface.querySelector<HTMLElement & { editor?: any }>('[data-canvas-id] [role=textbox]'); if (!el?.editor) throw new Error('not ready'); return el; });
        box.editor.commands.insertContent('[[dri');
        expect(pageLinkKey.getState(box.editor.state)).toMatchObject({ active: true, query: 'dri' });
    });
    it('prevents readers and mobile users from changing canvas objects', () => {
        const { sync, surface } = mount(false, true);
        expect(screen.queryByRole('button', { name: 'Drawing pen' })).toBeNull();
        pointer(surface, 'pointerdown', 100, 100);
        pointer(surface, 'pointerup', 200, 150);
        expect(canvasJSON(sync.doc).objects).toHaveLength(0);
    });
});
