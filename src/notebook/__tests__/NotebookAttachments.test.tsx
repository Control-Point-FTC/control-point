import React from 'react';
import { afterEach,describe,expect,it,vi } from 'vitest';
import { fireEvent,render,screen,act,cleanup } from '@testing-library/react';
import { useNotebookUpload } from '../NotebookAttachments';
import { validatedNotebookDocument } from '../editorSchema';
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
