import React from 'react';
import { afterEach,describe,expect,it,vi } from 'vitest';
import { fireEvent,render,screen,act,cleanup } from '@testing-library/react';
import { useNotebookUpload,attachmentOwnsInput } from '../NotebookAttachments';
import { validatedNotebookDocument } from '../editorSchema';
import { notebookSchema } from '../editorSchema';
import {DOMParser,DOMSerializer} from '@tiptap/pm/model';
import {notebookAttachmentIds} from '../attachmentReferences';
let last:any;
class Upload {
  upload:any={};headers:any={};status=200;responseText='';onload:any;onerror:any;onabort:any;
  constructor(){last=this;}
  open=vi.fn();setRequestHeader=(key:string,value:string)=>{this.headers[key]=value;};send=vi.fn();abort=()=>this.onabort?.();
}
const sync:any={pageId:9,scope:{teamId:3},data:{editable:true},status:'saved'};
function Harness({editor}:any){const upload=useNotebookUpload(sync,editor);return <>{upload.controls}</>;}
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('notebook attachment upload',()=>{
  it('routes preview image gestures to drawing while controls and nested PDFs keep their input',()=>{
    const parent=vi.fn();render(<div onPointerDown={parent}><figure onPointerDown={event=>{if(attachmentOwnsInput(event.target))event.stopPropagation();}}><img alt="Image preview"/><button>Download file</button><label>Image width<input aria-label="Resize image"/></label><div className="nb-pdf-printout"><canvas data-testid="pdf-page"/></div></figure></div>);
    fireEvent.pointerDown(screen.getByAltText('Image preview'));expect(parent).toHaveBeenCalledOnce();
    fireEvent.pointerDown(screen.getByText('Download file'));fireEvent.pointerDown(screen.getByLabelText('Resize image'));fireEvent.pointerDown(screen.getByTestId('pdf-page'));
    expect(parent).toHaveBeenCalledOnce();
  });
  it('retains a successful upload and retries insertion without another upload',()=>{
    vi.stubGlobal('XMLHttpRequest',Upload);const run=vi.fn(()=>false),chain:any={focus:()=>chain,insertContent:()=>chain,run};
    render(<Harness editor={{chain:()=>chain,isDestroyed:false}}/>);
    fireEvent.change(document.querySelector('input[type=file]')!,{target:{files:[new File(['abc'],'part.pdf')]}});
    const request=last;request.responseText=JSON.stringify({id:17,name:'part.pdf',mimeType:'application/pdf',size:3});act(()=>request.onload());
    run.mockReturnValue(true);fireEvent.click(screen.getByText('Retry upload'));
    expect(last).toBe(request);expect(request.send).toHaveBeenCalledOnce();expect(run).toHaveBeenCalledTimes(2);expect(screen.queryByText('Retry upload')).toBeNull();
  });
  it('round-trips attachment numeric attributes through clipboard HTML and indexes deeply nested attachments',()=>{
    const json={type:'doc',content:[{type:'notebookFile',attrs:{fileId:17,name:'Part.pdf',mimeType:'application/pdf',size:3,display:'pdf',width:640}}]};
    const host=document.createElement('div');host.append(DOMSerializer.fromSchema(notebookSchema).serializeFragment(notebookSchema.nodeFromJSON(json).content));
    const parsed=DOMParser.fromSchema(notebookSchema).parse(host).toJSON();expect(()=>validatedNotebookDocument(parsed)).not.toThrow();
    expect(parsed.content[0].attrs).toMatchObject({fileId:17,size:3,width:640});
    let nested:any=json.content[0];for(let i=0;i<80;i++)nested={type:'blockquote',content:[nested]};
    const deeplyNested={type:'doc',content:[nested]};expect(()=>validatedNotebookDocument(deeplyNested)).not.toThrow();expect(notebookAttachmentIds(deeplyNested)).toEqual([17]);
  });
  it('shows progress, cancels and retries, and inserts only the authenticated response',()=>{
    vi.stubGlobal('XMLHttpRequest',Upload);const insert=vi.fn();const chain:any={focus:()=>chain,insertContent:(value:any)=>{insert(value);return chain;},run:()=>true};
    render(<Harness editor={{chain:()=>chain,isDestroyed:false}}/>);
    const input=document.querySelector('input[type=file]')!;
    fireEvent.change(input,{target:{files:[new File(['abc'],'drive.pdf')]}});
    expect(last.headers).toEqual({'X-CP-Client':'1','X-CP-Notebook-Team':'3'});
    act(()=>last.upload.onprogress({lengthComputable:true,loaded:2,total:4}));
    expect(screen.getByRole('progressbar')).toHaveAttribute('value','50');
    fireEvent.click(screen.getByText('Cancel upload'));expect(screen.getByRole('status')).toHaveTextContent('cancelled');expect(insert).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Retry upload'));
    last.responseText=JSON.stringify({id:17,name:'drive.pdf',mimeType:'application/pdf',size:3});act(()=>last.onload());
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({type:'notebookFile',attrs:expect.objectContaining({fileId:17,display:'chip'})}));
  });
  it('does not insert a finished upload after editing permission is revoked',()=>{
    vi.stubGlobal('XMLHttpRequest',Upload);const insert=vi.fn();render(<Harness editor={{chain:insert,isDestroyed:false}}/>);
    fireEvent.change(document.querySelector('input[type=file]')!,{target:{files:[new File(['abc'],'part.png')]}});
    sync.data.editable=false;
    try {last.responseText=JSON.stringify({id:17,name:'part.png',mimeType:'image/png',size:3});act(()=>last.onload());expect(insert).not.toHaveBeenCalled();expect(screen.getByRole('status')).toHaveTextContent('permission changed');}
    finally{sync.data.editable=true;}
  });
  it('rejects malformed attachment IDs and display sizes in shared documents',()=>{
    const document=(attrs:any)=>({type:'doc',content:[{type:'notebookFile',attrs:{fileId:1,name:'File',mimeType:'application/pdf',size:5,display:'chip',width:640,...attrs}}]});
    expect(()=>validatedNotebookDocument(document({}))).not.toThrow();
    expect(()=>validatedNotebookDocument(document({fileId:-2}))).toThrow();
    expect(()=>validatedNotebookDocument(document({width:100000}))).toThrow();
  });
});
