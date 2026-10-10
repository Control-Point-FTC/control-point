import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {NotebookPaperControls,paperViewStyle,useNotebookPaperView} from '../NotebookPaperView';
afterEach(()=>{cleanup();vi.restoreAllMocks();localStorage.clear();});
function Host({storageKey}:{storageKey:string}){const [value,change]=useNotebookPaperView(storageKey);return <><NotebookPaperControls value={value} onChange={change}/><article data-testid="paper" style={paperViewStyle(value)}><input aria-label="Retained title" hidden={!value.showTitle} defaultValue="Shared notebook title"/></article></>;}
it('remembers paper appearance per account, team and page without storing note contents',()=>{
  const key='cp-notebook-paper:1:2:3',view=render(<Host storageKey={key}/>);
  fireEvent.change(screen.getByLabelText('Paper pattern'),{target:{value:'grid'}});fireEvent.change(screen.getByLabelText('Paper line spacing'),{target:{value:'40'}});fireEvent.change(screen.getByLabelText('Page color'),{target:{value:'#fff8e5'}});fireEvent.click(screen.getByRole('button',{name:'Hide page title'}));
  expect(screen.getByTestId('paper').style.backgroundSize).toBe('40px 40px');expect(screen.queryByRole('textbox',{name:'Retained title'})).toBeNull();expect(localStorage.getItem(key)).not.toContain('Shared notebook title');
  view.rerender(<Host storageKey="cp-notebook-paper:4:2:3"/>);expect(screen.getByLabelText('Paper pattern')).toHaveValue('blank');expect(screen.getByLabelText('Retained title')).toHaveValue('Shared notebook title');
  view.rerender(<Host storageKey={key}/>);expect(screen.getByLabelText('Paper pattern')).toHaveValue('grid');expect(screen.getByRole('button',{name:'Show page title'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Reset page appearance'}));expect(screen.getByLabelText('Paper pattern')).toHaveValue('blank');expect(screen.getByLabelText('Retained title')).toHaveValue('Shared notebook title');
});
it('rejects malformed stored colors and keeps controls usable when device storage fails',()=>{
  localStorage.setItem('bad',JSON.stringify({pattern:'grid',spacing:999,lineColor:'red',background:'#000000',showTitle:false}));const view=render(<Host storageKey="bad"/>);expect(screen.getByLabelText('Paper pattern')).toHaveValue('blank');
  vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('Storage unavailable');});vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('Storage unavailable');});view.rerender(<Host storageKey="blocked"/>);
  fireEvent.change(screen.getByLabelText('Paper pattern'),{target:{value:'ruled'}});expect(screen.getByLabelText('Paper pattern')).toHaveValue('ruled');expect(screen.getByTestId('paper').style.backgroundImage).toContain('repeating-linear-gradient');
});
it('offers page colors with readable contrast against the notebook text',()=>{
  render(<Host storageKey="colors"/>);const select=screen.getByLabelText('Page color') as HTMLSelectElement;
  const luminance=(hex:string)=>{const channels=[1,3,5].map(offset=>parseInt(hex.slice(offset,offset+2),16)/255).map(value=>value<=.04045?value/12.92:Math.pow((value+.055)/1.055,2.4));return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;};
  for(const option of select.options)expect((luminance(option.value)+.05)/(luminance('#151515')+.05)).toBeGreaterThan(7);
});
