import React from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {prosemirrorJSONToYDoc} from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import {NotebookReader} from '../NotebookReader';
import {NotebookSync} from '../NotebookSync';
import {notebookSchema} from '../editorSchema';
import {insertCanvasItem} from '../canvasModel';
const sessions:NotebookSync[]=[];
afterEach(()=>{cleanup();sessions.splice(0).forEach(sync=>sync.destroy());vi.unstubAllGlobals();});
function mount() {
  const sync=new NotebookSync(1);sessions.push(sync);
  const doc=prosemirrorJSONToYDoc(notebookSchema,{type:'doc',content:[{type:'heading',attrs:{level:2},content:[{type:'text',text:'Shared discoveries'}]},{type:'paragraph',content:[{type:'text',text:'Typed notes <img src=x onerror=alert(1)>'}]}]});
  Y.applyUpdate(sync.doc,Y.encodeStateAsUpdate(doc));doc.destroy();
  sync.doc.getMap('meta').set('title','Team journal');
  sync.data={editable:false,protected:true,legacyCanvas:null} as any;sync.status='saved';
  insertCanvasItem(sync.doc,{id:'reader-text',type:'text',x:0,y:0,width:200,height:100,z:1,rotation:0,locked:false,groupId:null,content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Freeform typed text'}]}]}});
  const view=render(<NotebookReader sync={sync}/>);
  return {sync,view};
}
describe('desktop notebook reader',()=>{
  it('renders typed notes and text boxes for read-only pages without remote work or document edits',()=>{
    const {sync}=mount(),fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    const before=Y.encodeStateAsUpdate(sync.doc);
    fireEvent.click(screen.getByRole('button',{name:'Reading mode'}));
    expect(screen.getByRole('heading',{name:'Shared discoveries'})).toBeTruthy();
    expect(screen.getByText('Freeform typed text')).toBeTruthy();
    expect(screen.getByText('Typed notes <img src=x onerror=alert(1)>')).toBeTruthy();
    expect(screen.getByLabelText('Page reading content').querySelector('img')).toBeNull();
    fireEvent.change(screen.getByLabelText('Reader text size'),{target:{value:'28'}});
    fireEvent.change(screen.getByLabelText('Reader line spacing'),{target:{value:'2.2'}});
    fireEvent.change(screen.getByLabelText('Reader background'),{target:{value:'dark'}});
    expect(screen.getByLabelText('Page reading content')).toHaveStyle({fontSize:'28px',lineHeight:'2.2'});
    expect(screen.getByRole('dialog')).toHaveClass('nb-reader-dark');
    expect(Y.encodeStateAsUpdate(sync.doc)).toEqual(before);expect(fetch).not.toHaveBeenCalled();
  });
  it('updates live typed content and resets reading preferences',()=>{
    const {sync}=mount();fireEvent.click(screen.getByRole('button',{name:'Reading mode'}));
    act(()=>{const item=sync.doc.getMap<Y.Map<unknown>>('canvas').get('reader-text')!;const content=item.get('content') as Y.XmlFragment;((content.get(0) as Y.XmlElement).get(0) as Y.XmlText).insert(0,'Updated ');});
    expect(screen.getByText('Updated Freeform typed text')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Reader text size'),{target:{value:'32'}});
    fireEvent.click(screen.getByRole('button',{name:'Reset reading preferences'}));
    expect(screen.getByLabelText('Reader text size')).toHaveValue('20');
  });
  it('returns keyboard focus to the entry control on close',async()=>{
    mount();const trigger=screen.getByRole('button',{name:'Reading mode'});trigger.focus();
    fireEvent.click(trigger);fireEvent.click(screen.getByRole('button',{name:'Return to page'}));
    await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(()=>expect(document.activeElement).toBe(trigger));
  });
  it('removes reading content when page access becomes unavailable',()=>{
    const {sync,view}=mount();fireEvent.click(screen.getByRole('button',{name:'Reading mode'}));
    sync.status='unavailable';view.rerender(<NotebookReader sync={sync}/>);
    expect(screen.queryByRole('dialog')).toBeNull();expect(screen.getByRole('button',{name:'Reading mode'})).toBeDisabled();
    expect(screen.queryByText('Freeform typed text')).toBeNull();
  });
});
