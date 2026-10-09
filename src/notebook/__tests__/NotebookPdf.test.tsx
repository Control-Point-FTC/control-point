import React from 'react';
import { act,cleanup,render,screen,waitFor } from '@testing-library/react';
import { afterEach,describe,expect,it,vi } from 'vitest';
const mock=vi.hoisted(()=>({getPage:vi.fn(),destroy:vi.fn(),render:vi.fn(),loadingDestroy:vi.fn()}));
vi.mock('../NotebookAttachments',()=>({fileBlob:async()=>({arrayBuffer:async()=>new ArrayBuffer(5)})}));
vi.mock('pdfjs-dist',()=>({GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:3,getPage:mock.getPage,destroy:mock.destroy}),destroy:mock.loadingDestroy})}));
import NotebookPdf from '../NotebookPdf';
let observers:{callback:any;element?:Element}[]=[];
class Observer {entry:any;constructor(callback:any){this.entry={callback};observers.push(this.entry);}observe(element:Element){this.entry.element=element;}disconnect(){} }
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();observers=[];});
describe('local notebook PDF printout',()=>{
  it('renders only nearby pages and cancels/destroys resources on removal',async()=>{
    vi.stubGlobal('IntersectionObserver',Observer);
    const cancel=vi.fn();mock.render.mockReturnValue({promise:Promise.resolve(),cancel});
    mock.getPage.mockImplementation(async()=>({getViewport:({scale}:any)=>({width:600*scale,height:900*scale}),render:mock.render,cleanup:vi.fn()}));
    vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({} as any);
    const view=render(<NotebookPdf sync={{pageId:1} as any} fileId={4}/>);
    await screen.findByText('3 PDF pages');expect(observers).toHaveLength(3);expect(mock.getPage).not.toHaveBeenCalled();
    act(()=>observers[0].callback([{isIntersecting:true}]));
    await waitFor(()=>expect(mock.getPage).toHaveBeenCalledWith(1));
    expect(mock.getPage).toHaveBeenCalledTimes(1);await waitFor(()=>expect(mock.render).toHaveBeenCalled());
    view.unmount();expect(mock.loadingDestroy).toHaveBeenCalled();expect(cancel).toHaveBeenCalled();
  });
});
