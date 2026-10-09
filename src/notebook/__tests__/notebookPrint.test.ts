import {afterEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({file:vi.fn(),getPage:vi.fn(),destroy:vi.fn(),pages:2}));
vi.mock('../NotebookAttachments',()=>({fileBlob:mock.file}));
vi.mock('pdfjs-dist',()=>({GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:mock.pages,getPage:mock.getPage}),destroy:mock.destroy})}));
import {prepareNotebookPrint} from '../notebookPrint';
const file=(id:number,display:string,mimeType:string)=>({type:'notebookFile',attrs:{id:`file-${id}`,fileId:id,name:`File ${id}`,display,mimeType,size:5,width:640}});
const stroke=(id:string,pdfScope?:string)=>({id,type:'stroke',tool:'highlighter',x:10,y:20,width:100,height:30,z:0,rotation:0,locked:false,groupId:null,color:'#ffe138',strokeWidth:12,opacity:.35,points:[[0,0,.5],[100,30,.5]],...(pdfScope?{pdfScope}:{})});
function setup(){
  mock.pages=2;mock.destroy.mockResolvedValue(undefined);
  mock.getPage.mockImplementation(async()=>({getViewport:({scale}:any)=>({width:600*scale,height:800*scale}),render:()=>({promise:Promise.resolve(),cancel:vi.fn()}),cleanup:vi.fn()}));
  mock.file.mockImplementation(async(_sync,id)=>new Blob(['bytes'],{type:id===1?'image/png':'application/pdf'}));
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({} as any);vi.spyOn(HTMLCanvasElement.prototype,'toDataURL').mockReturnValue('data:image/png;base64,AAAA');
}
afterEach(()=>{vi.restoreAllMocks();vi.clearAllMocks();});
describe('complete notebook page preparation',()=>{
  it('includes typed content, images, offscreen PDF pages, scoped ink and ordinary drawing while chips stay chips',async()=>{
    setup();const page:any={title:'<script>Title</script>',revision:4,updatedAt:'now',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Build notes'}]},file(1,'image','image/png'),file(2,'pdf','application/pdf'),file(3,'chip','application/pdf')]},canvas:{version:1,objects:[stroke('ordinary'),stroke('annotation','file-2-pdf-1')]}};
    const html=await prepareNotebookPrint({pageId:1} as any,page,new AbortController().signal,vi.fn());
    const host=document.createElement('div');host.innerHTML=html;
    expect(host.querySelector('script')).toBeNull();expect(host.querySelector('h1')!.textContent).toBe('<script>Title</script>');expect(host.textContent).toContain('Build notes');
    expect(host.querySelectorAll('.pdf-sheet')).toHaveLength(2);expect(host.querySelectorAll('svg')).toHaveLength(2);expect(host.querySelectorAll('img')).toHaveLength(3);
    expect(mock.file.mock.calls.map(call=>call[1])).toEqual([1,2]);expect(mock.getPage.mock.calls.map(call=>call[0])).toEqual([1,2]);expect(mock.destroy).toHaveBeenCalledOnce();
    expect(host.querySelectorAll('svg')[0].style.zIndex).toBe('3');
  });
  it('refuses oversized PDFs without partial output and releases its worker',async()=>{
    setup();mock.pages=51;
    const page:any={title:'Large',revision:1,updatedAt:'now',content:{type:'doc',content:[file(2,'pdf','application/pdf')]},canvas:{}};
    await expect(prepareNotebookPrint({pageId:1} as any,page,new AbortController().signal,vi.fn())).rejects.toThrow('50 PDF pages');
    expect(mock.getPage).not.toHaveBeenCalled();expect(mock.destroy).toHaveBeenCalledOnce();
  });
  it('aborts attachment preparation before opening a PDF worker',async()=>{
    setup();const abort=new AbortController();mock.file.mockImplementation(async()=>{abort.abort();return new Blob(['bytes'],{type:'application/pdf'});});
    const page:any={title:'Cancelled',revision:1,updatedAt:'now',content:{type:'doc',content:[file(2,'pdf','application/pdf')]},canvas:{}};
    await expect(prepareNotebookPrint({pageId:1} as any,page,abort.signal,vi.fn())).rejects.toThrow();expect(mock.getPage).not.toHaveBeenCalled();
  });
});
