import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { NotebookEditor } from '../../src/notebook/NotebookEditor';
import { NotebookSync } from '../../src/notebook/NotebookSync';
import '../../src/index.css';
import '../../src/modern/modern.css';
import '../../src/notebook/notebook.css';
import '../../src/notebook/notebook-desktop.css';

const sync = new NotebookSync(1);
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
function assert(condition: boolean, message: string) { if (!condition) throw new Error(message); }
function button(text: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === text);
  if (!found) throw new Error(`Missing control: ${text}`);
  return found;
}
function Fixture() {
  const [ready, setReady] = useState(false), [result, setResult] = useState('Not run');
  useEffect(() => { void sync.start().then(() => setReady(true)); return () => { sync.destroy(); }; }, []);
  useEffect(() => { if (ready && new URLSearchParams(location.search).get('run') === '1') void run(); }, [ready]);
  async function run() {
    setResult('Running');
    try {
      const viewport = document.querySelector<HTMLElement>('.nb-paper-scroll')!;
      const page = document.querySelector<HTMLElement>('.nb-paper')!;
      let drawing = document.querySelector<SVGGraphicsElement>('[data-canvas-id="oversized-drawing"]');
      for (let attempt=0; !drawing && attempt<150; attempt++) { await frame(); drawing=document.querySelector<SVGGraphicsElement>('[data-canvas-id="oversized-drawing"]'); }
      assert(!!drawing, 'Wait for the real drawing to mount');
      const before = JSON.stringify(sync.doc.getMap('canvas').toJSON());
      button('View').click(); await frame();
      // The actual viewport has padding, borders and vertical scrolling. Neither
      // scrollWidth nor getBoundingClientRect is replaced with a test number.
      viewport.style.padding = '16px 24px'; viewport.style.border = '3px solid #555';
      viewport.scrollTop = 120; viewport.scrollLeft = 80;
      const results = [];
      for (const width of [1100, 950]) {
        document.querySelector<HTMLElement>('#fixture-editor')!.style.width = `${width}px`;
        button('Reset to 100%').click(); await frame();
        viewport.scrollLeft = 0;
        const naturalRight = drawing.getBoundingClientRect().right;
        const bounds = viewport.getBoundingClientRect();
        assert(naturalRight > bounds.right, 'Fixture must genuinely overflow before Fit width');
        button('Fit width').click(); await frame();
        // Zero scroll is necessary to prove scaling, rather than a scrolled view
        // merely bringing the right edge into view.
        viewport.scrollLeft = 0; await frame();
        const style = getComputedStyle(viewport), rect = viewport.getBoundingClientRect();
        const right = rect.left + viewport.clientLeft + viewport.clientWidth - parseFloat(style.paddingRight);
        const left = rect.left + viewport.clientLeft + parseFloat(style.paddingLeft);
        const drawingRect = drawing.getBoundingClientRect();
        assert(drawingRect.right <= right + 1, `Drawing right ${drawingRect.right} exceeds viewport ${right}`);
        assert(drawingRect.left >= left - 1, 'Drawing left is clipped');
        const zoom = Number(page.style.zoom);
        assert(zoom >= .5 && zoom < 1, 'Fit width must use a supported reduced scale');
        results.push({ width, zoom, drawingRight: drawingRect.right, availableRight: right, scrollTop: viewport.scrollTop });
      }
      assert(JSON.stringify(sync.doc.getMap('canvas').toJSON()) === before, 'View control rewrote saved drawing geometry');
      setResult(`PASS: ${JSON.stringify(results)}`);
    } catch (error) { setResult(`FAIL: ${error instanceof Error ? error.message : error}`); }
  }
  return <><header style={{padding:12,background:'#222',color:'white'}}><strong>Synthetic notebook browser regression — no account or real team data</strong><button style={{marginLeft:12}} disabled={!ready} onClick={() => void run()}>Run real Fit Width checks</button><output style={{display:'block'}} aria-live="polite">{result}</output></header><div id="fixture-editor" style={{width:1100,height:720,display:'flex',flexDirection:'column',margin:20}}>{ready && <MemoryRouter><NotebookEditor sync={sync} onChanged={() => {}} pages={[]} onNavigate={() => {}} /></MemoryRouter>}</div></>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
