import {afterEach,describe,expect,it,vi} from 'vitest';
import {prepareAnnotatedPdf,showAnnotatedPdfPrint} from '../pdfPrint';
import type {CanvasItem} from '../canvasModel';
// Vitest disables CSS transforms; load the real shared print/editor stylesheet.
vi.mock('../prose.css?raw',async()=>{const {readFileSync}=await import('node:fs');return{default:readFileSync('src/notebook/prose.css','utf8')};});
afterEach(()=>vi.restoreAllMocks());
const shape=(scope:string):CanvasItem=>({id:scope,x:10,y:20,width:100,height:50,z:0,rotation:30,locked:false,groupId:null,pdfScope:scope,type:'shape',shape:'arrow',color:'#111111',fill:null,strokeWidth:2});
function fixture(){
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({} as any);
  vi.spyOn(HTMLCanvasElement.prototype,'toDataURL').mockReturnValue('data:image/png;base64,AAAA');
  const cleanup=vi.fn(),render=vi.fn(()=>({promise:Promise.resolve(),cancel:vi.fn()}));
  const getPage=vi.fn(async(number:number)=>({getViewport:({scale}:any)=>({width:600*scale,height:(number===2?600:900)*scale}),render,cleanup}));
  return {pdf:{numPages:3,getPage} as any,getPage,render,cleanup};
}
describe('annotated PDF print preparation',()=>{
  it('prints multiline and list annotations with the editor paragraph spacing and indentation',async()=>{
    const {pdf}=fixture();
    const text:CanvasItem={id:'text',type:'text',x:20,y:50,width:150,height:80,z:1,rotation:0,locked:false,groupId:null,pdfScope:'block-pdf-1',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'First line'},{type:'hardBreak'},{type:'text',text:'Second line'}]},{type:'bulletList',content:[{type:'listItem',content:[{type:'paragraph',content:[{type:'text',text:'Aligned list item'}]}]}]}]}};
    const html=await prepareAnnotatedPdf(pdf,'block',[text],1,1,new AbortController().signal,vi.fn());
    const original=Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype,'showModal');
    Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:()=>{}});
    let close:(()=>void)|undefined;const rendered=document.createElement('div'),style=document.createElement('style');
    try{
      close=showAnnotatedPdfPrint(html);
      const source=document.querySelector('iframe')!.getAttribute('srcdoc')!,parsed=new DOMParser().parseFromString(source,'text/html');
      style.textContent=parsed.querySelector('style')!.textContent;rendered.innerHTML=parsed.body.innerHTML;document.head.append(style);document.body.append(rendered);
      expect(getComputedStyle(rendered.querySelector('.nb-prose')!).lineHeight).toBe('1.65');
      expect(getComputedStyle(rendered.querySelector('p')!).marginTop).toBe('8px');
      expect(getComputedStyle(rendered.querySelector('ul')!).paddingInlineStart).toBe('24px');
      expect(rendered.querySelector('br')).not.toBeNull();expect(rendered.querySelector('li')!.textContent).toBe('Aligned list item');
    }finally{close?.();rendered.remove();style.remove();if(original)Object.defineProperty(HTMLDialogElement.prototype,'showModal',original);else delete (HTMLDialogElement.prototype as any).showModal;}
  });
  it('prepares every requested page sequentially with only its scoped annotations and correctly sized sheets',async()=>{
    const {pdf,getPage,render,cleanup}=fixture(),progress=vi.fn();
    const text:CanvasItem={id:'text',type:'text',x:20,y:50,width:150,height:80,z:1,rotation:0,locked:false,groupId:null,pdfScope:'block-pdf-2',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'<script>alert(1)</script> ✓'}]}]}};
    const html=await prepareAnnotatedPdf(pdf,'block',[shape('block-pdf-1'),shape('other-pdf-1'),text],1,3,new AbortController().signal,progress);
    const host=document.createElement('div');host.innerHTML=html;
    expect(host.querySelectorAll('.pdf-sheet')).toHaveLength(3);expect(getPage.mock.calls.map(call=>call[0])).toEqual([1,2,3]);
    expect(render).toHaveBeenCalledTimes(3);expect(cleanup).toHaveBeenCalledTimes(3);expect(progress.mock.calls.map(call=>call[0])).toEqual([1,2,3]);
    expect(host.querySelectorAll('svg')).toHaveLength(1);expect(host.querySelector('script')).toBeNull();expect(host.textContent).toContain('<script>alert(1)</script> ✓');
    expect(host.querySelectorAll('section')[1].style.height).toBe('800px');expect(html).toContain('@page nbpdf2{size:800px 800px;');
  });
  it('rejects oversized ranges before fetching pages and releases a rendered page on cancellation',async()=>{
    const {pdf,getPage,render,cleanup}=fixture();pdf.numPages=100;
    await expect(prepareAnnotatedPdf(pdf,undefined,[],1,51,new AbortController().signal,vi.fn())).rejects.toThrow('50 PDF pages');expect(getPage).not.toHaveBeenCalled();
    const abort=new AbortController();render.mockImplementation(()=>{abort.abort();return{promise:Promise.resolve(),cancel:vi.fn()};});
    await expect(prepareAnnotatedPdf(pdf,undefined,[],1,2,abort.signal,vi.fn())).rejects.toThrow();expect(cleanup).toHaveBeenCalledOnce();expect(getPage).toHaveBeenCalledTimes(1);
  });
});
