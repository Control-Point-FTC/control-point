import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import NotebookCanvas from '../NotebookCanvas';
import { NotebookSync } from '../NotebookSync';
import { canvasJSON, seedCanvas, type Ink } from '../canvasModel';
import * as geometry from '../canvasGeometry';
const providers: NotebookSync[] = [];
afterEach(() => { cleanup(); providers.splice(0).forEach(p => p.destroy()); vi.restoreAllMocks(); });
function mount(editable = true, mobile = false, strokes = 0, scoped = false) {
    const sync = new NotebookSync(1,scoped?{memberId:123,teamId:456}:undefined);
    const zoom = vi.fn();
    providers.push(sync);
    if (strokes) seedCanvas(sync.doc, { version: 1, objects: Array.from({length:strokes},(_,i): Ink => ({ id:`stroke-${i}`, type:'stroke',tool:'pen',x:i%100,y:Math.floor(i/100),width:10,height:10,z:i,rotation:0,locked:false,groupId:null,color:'#111111',strokeWidth:2,opacity:1,points:[[0,0,.5],[10,10,.5]] })) });
    function Harness() { const [ribbon, setRibbon] = useState<React.ReactNode>(null); return <><div>{ribbon}</div><div className="nb-paper-scroll"><NotebookCanvas sync={sync} editable={editable} mobile={mobile} onZoom={zoom} onRibbon={setRibbon} onEditorFocus={() => { }} onEditorRemoved={() => { }}><p>Flow text remains here</p></NotebookCanvas></div></>; }
    render(<Harness />);
    const surface = screen.getByLabelText('Page drawing surface');
    Object.defineProperties(surface, { offsetWidth: { value: 1000 }, offsetHeight: { value: 600 } });
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 600, right: 1000, bottom: 600, x: 0, y: 0, toJSON() { } });
    surface.setPointerCapture = vi.fn();
    return { sync, surface, zoom };
}
function pointer(surface: HTMLElement, type: string, x: number, y: number, id = 1, source = 'mouse') { const event = new Event(type, { bubbles: true }); Object.assign(event, { pointerId: id, button: 0, clientX: x, clientY: y, pressure: .5, pointerType: source }); fireEvent(surface, event); }
describe('desktop shared drawing surface', () => {
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
    it('prevents readers and mobile users from changing canvas objects', () => {
        const { sync, surface } = mount(false, true);
        expect(screen.queryByRole('button', { name: 'Drawing pen' })).toBeNull();
        pointer(surface, 'pointerdown', 100, 100);
        pointer(surface, 'pointerup', 200, 150);
        expect(canvasJSON(sync.doc).objects).toHaveLength(0);
    });
});
