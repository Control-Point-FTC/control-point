import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import NotebookCanvas from '../NotebookCanvas';
import { NotebookSync } from '../NotebookSync';
import { canvasJSON } from '../canvasModel';
const providers: NotebookSync[] = [];
afterEach(() => { cleanup(); providers.splice(0).forEach(p => p.destroy()); vi.restoreAllMocks(); });
function mount(editable = true, mobile = false) {
    const sync = new NotebookSync(1);
    providers.push(sync);
    function Harness() { const [ribbon, setRibbon] = useState<React.ReactNode>(null); return <><div>{ribbon}</div><NotebookCanvas sync={sync} editable={editable} mobile={mobile} onRibbon={setRibbon} onEditorFocus={() => { }} onEditorRemoved={() => { }}><p>Flow text remains here</p></NotebookCanvas></>; }
    render(<Harness />);
    const surface = screen.getByLabelText('Page drawing surface');
    Object.defineProperties(surface, { offsetWidth: { value: 1000 }, offsetHeight: { value: 600 } });
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 600, right: 1000, bottom: 600, x: 0, y: 0, toJSON() { } });
    surface.setPointerCapture = vi.fn();
    return { sync, surface };
}
function pointer(surface: HTMLElement, type: string, x: number, y: number) { const event = new Event(type, { bubbles: true }); Object.assign(event, { pointerId: 1, button: 0, clientX: x, clientY: y, pressure: .5, pointerType: 'mouse' }); fireEvent(surface, event); }
describe('desktop shared drawing surface', () => {
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
