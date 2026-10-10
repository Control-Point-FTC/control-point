import React,{createContext,useContext,useEffect,useRef,useState,lazy,Suspense} from 'react';
import { NodeViewWrapper,ReactNodeViewRenderer,type NodeViewProps,type Editor } from '@tiptap/react';
import { NotebookFile,validNotebookFile } from './fileNode';
import type { NotebookSync } from './NotebookSync';
import { apiFetch } from '../services/api';
import { notebookCommandGlyph } from './NotebookIcons';
import './attachments.css';
const NotebookPdf=lazy(()=>import('./NotebookPdf'));
export const NotebookFileContext=createContext<{sync:NotebookSync;mobile:boolean;editable:boolean;drawingScope:string|null;setDrawingScope:(id:string|null)=>void;onRibbon:(panel:React.ReactNode)=>void;onEditorFocus:(editor:Editor)=>void;onEditorRemoved:(editor:Editor)=>void;onSelectionChange:(id:string|null)=>void}|null>(null);
export const notebookFileURL=(pageId:number,fileId:number)=>`/api/notebook/pages/${pageId}/files/${fileId}`;
// Controls and nested PDF surfaces own their input; image backgrounds belong
// to the surrounding canvas so pen/eraser gestures can begin over a preview.
export function attachmentOwnsInput(target:EventTarget|null){
  return target instanceof Element && !!target.closest('button,input,select,textarea,label,a,.nb-file-chip,.nb-pdf-printout');
}
export async function fileBlob(sync:NotebookSync,fileId:number,signal?:AbortSignal){
  const response=await apiFetch(notebookFileURL(sync.pageId,fileId),{cache:'no-store',signal,headers:sync.scope?{'X-CP-Notebook-Team':String(sync.scope.teamId)}:undefined});
  if(!response.ok)throw new Error(response.status===404?'Attachment unavailable or permission changed.':'Cannot load this attachment. Try again.');
  return response.blob();
}
export function NotebookAttachment({node,updateAttributes}:NodeViewProps){
  const context=useContext(NotebookFileContext),[image,setImage]=useState(''),[error,setError]=useState('');
  const {fileId,name,size,mimeType,display,width}=node.attrs;
  useEffect(()=>{
    setImage('');setError('');if(!context || display!=='image')return;
    const abort=new AbortController();let url='';
    fileBlob(context.sync,fileId,abort.signal).then(blob=>{if(abort.signal.aborted)return;url=URL.createObjectURL(blob);setImage(url);}).catch(e=>{if(!abort.signal.aborted)setError(e.message);});
    return ()=>{abort.abort();if(url)URL.revokeObjectURL(url);};
  },[context?.sync,fileId,display]);
  const download=async()=>{if(!context)return;try{const blob=await fileBlob(context.sync,fileId);const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setError('');}catch(e){setError((e as Error).message);}};
  const open=()=>{if(!context)return;const link=document.createElement('a');link.href=notebookFileURL(context.sync.pageId,fileId);link.target='_blank';link.rel='noopener noreferrer';link.click();};
  return <NodeViewWrapper as="figure" className="nb-attachment" contentEditable={false} data-file-id={fileId} data-id={node.attrs.id} onPointerDown={e=>{if(attachmentOwnsInput(e.target))e.stopPropagation();}} onKeyDown={e=>{if(attachmentOwnsInput(e.target))e.stopPropagation();}}>
    <div className="nb-file-chip">{context && !context.mobile && context.editable && <span className="nb-file-drag" data-drag-handle draggable title="Drag to move within this page" aria-label="Move attachment"><svg aria-hidden="true" width="12" height="20" viewBox="0 0 12 20" fill="currentColor"><circle cx="3" cy="4" r="1.3"/><circle cx="9" cy="4" r="1.3"/><circle cx="3" cy="10" r="1.3"/><circle cx="9" cy="10" r="1.3"/><circle cx="3" cy="16" r="1.3"/><circle cx="9" cy="16" r="1.3"/></svg></span>}<svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"><path d="M5 3h9l5 5v13H5V3Zm9 0v5h5M8 13h8m-8 4h6"/></svg><span><strong>{name}</strong><small>{Math.max(1,Math.ceil(size/1024)).toLocaleString()} KB</small></span><button onClick={open}>Open</button><button onClick={download}>Download original</button></div>
    {display==='pdf' && context && <Suspense fallback={<p role="status">Loading PDF tools…</p>}><NotebookPdf sync={context.sync} fileId={fileId} width={width} blockId={node.attrs.id} context={context}/></Suspense>}
    {context && !context.mobile && context.editable && mimeType==='application/pdf' && <div><button onClick={()=>updateAttributes({display:display==='pdf'?'chip':'pdf'})}>{display==='pdf'?'Show attachment only':'Insert PDF printout'}</button>{display==='pdf' && <label>Printout width <input aria-label="PDF display width" type="range" min="240" max="1200" value={width||640} onChange={e=>updateAttributes({width:Number(e.target.value)})}/></label>}</div>}
    {display==='image' && (image?<img src={image} alt={name} style={{width:Math.min(1600,width||640)}} onError={()=>setError('This image could not be rendered. Download its original file.')}/>:<p role="status">Loading image…</p>)}
    {context && !context.mobile && context.editable && mimeType.startsWith('image/') && <label>Image width <input aria-label="Image display width" type="range" min="120" max="1200" value={width||640} onChange={e=>updateAttributes({display:'image',width:Number(e.target.value)})}/></label>}
    {error && <p role="alert">{error}</p>}
  </NodeViewWrapper>;
}
export const NotebookFileView=NotebookFile.extend({addNodeView(){return ReactNodeViewRenderer(NotebookAttachment);}});
/** How a chosen file goes in: as it is (images show, others are chips),
 *  as a picture, or as a PDF printout whose pages show (and take ink). */
export type UploadAs='auto'|'image'|'pdf';
export const PICTURE_TYPES=['image/png','image/jpeg','image/gif','image/webp'];
export function useNotebookUpload(sync:NotebookSync,editor:Editor|null){
  const [fileAs,setFileAs]=useState<UploadAs>('auto');
  const [file,setFile]=useState<File|null>(null),[status,setStatus]=useState(''),[progress,setProgress]=useState(0),[busy,setBusy]=useState(false);
  const request=useRef<XMLHttpRequest|null>(null),mounted=useRef(true);
  const retained=useRef<{file:File;metadata:any}|null>(null),latestEditor=useRef(editor);latestEditor.current=editor;
  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;request.current?.abort();};},[sync]);
  const upload=(chosen:File,as:UploadAs='auto')=>{
    if(busy)return;setFile(chosen);setFileAs(as);setProgress(0);
    if(as==='image'&&!PICTURE_TYPES.includes(chosen.type)){setStatus('Choose a picture: PNG, JPEG, GIF or WebP.');setFile(null);return;}
    if(as==='pdf'&&chosen.type!=='application/pdf'){setStatus('A file printout needs a PDF. Use Attach file for other files.');setFile(null);return;}
    if(chosen.size>25*1024*1024){setStatus('Files must be 25 MB or smaller.');return;}
    if(!chosen.size){setStatus('Choose a nonempty file.');return;}
    if(!editor || editor.isDestroyed || !sync.data?.editable || ['unavailable','conflict','error'].includes(sync.status)){setStatus('Editing is unavailable.');return;}
    const insert=(uploaded:any)=>{
      const target=latestEditor.current;
      if(!target || target.isDestroyed || !sync.data?.editable || ['unavailable','conflict','error'].includes(sync.status))throw new Error('The file uploaded, but editing permission changed. Reopen the page before inserting it.');
      const inserted=target.chain().focus().insertContent({type:'notebookFile',attrs:{fileId:uploaded.id,name:uploaded.name,mimeType:uploaded.mimeType,size:uploaded.size,display:as==='pdf'&&uploaded.mimeType==='application/pdf'?'pdf':uploaded.mimeType.startsWith('image/')?'image':'chip',width:640}}).run();
      if(!inserted)throw new Error('The file uploaded, but could not be inserted here. Choose a text position and retry.');
      setStatus(`${uploaded.name} inserted.`);setFile(null);retained.current=null;
    };
    if(retained.current?.file===chosen){try{insert(retained.current.metadata);}catch(e){setStatus((e as Error).message);}return;}
    retained.current=null;
    const xhr=new XMLHttpRequest();request.current=xhr;setBusy(true);setStatus(`Uploading ${chosen.name}…`);
    xhr.open('POST',`/api/notebook/pages/${sync.pageId}/files`);xhr.withCredentials=true;xhr.setRequestHeader('X-CP-Client','1');
    if(sync.scope)xhr.setRequestHeader('X-CP-Notebook-Team',String(sync.scope.teamId));
    xhr.upload.onprogress=e=>{if(mounted.current && e.lengthComputable)setProgress(Math.round(e.loaded/e.total*100));};
    xhr.onload=()=>{if(!mounted.current)return;setBusy(false);request.current=null;try{
      const uploaded=JSON.parse(xhr.responseText);if(xhr.status<200 || xhr.status>=300)throw new Error(uploaded.error||'Upload failed. Retry this file.');
      if(!validNotebookFile({fileId:uploaded.id,name:uploaded.name,mimeType:uploaded.mimeType,size:uploaded.size,display:'chip',width:640}))throw new Error('Invalid upload response. Retry this file.');
      retained.current={file:chosen,metadata:uploaded};insert(uploaded);
    }catch(e){setStatus((e as Error).message);}};
    xhr.onerror=()=>{if(mounted.current){setBusy(false);setStatus('Upload failed. Check your connection and retry.');}};
    xhr.onabort=()=>{if(mounted.current){setBusy(false);setStatus('Upload cancelled.');}};
    const form=new FormData();form.append('file',chosen);xhr.send(form);
  };
  const blocked=busy || !sync.data?.editable || ['unavailable','conflict','error'].includes(sync.status);
  const picker=(label:string,glyph:string,as:UploadAs,accept?:string)=>{const Glyph=notebookCommandGlyph(glyph);return <label className="nb-tool">{Glyph && <Glyph/>}{label}<input type="file" accept={accept} disabled={blocked} onChange={e=>{const next=e.target.files?.[0];if(next)upload(next,as);e.target.value='';}}/></label>;};
  const controls=<div className="nb-upload-controls">{picker('Attach file','Link','auto')}{picker('Pictures','Picture','image',PICTURE_TYPES.join(','))}{picker('File printout','Printout','pdf','application/pdf')}{busy?<><progress aria-label="File upload progress" value={progress} max={100}/><button onClick={()=>request.current?.abort()}>Cancel upload</button></>:file && <button onClick={()=>upload(file,fileAs)}>Retry upload</button>}{status && <span role="status">{status}</span>}</div>;
  return {upload,controls,busy};
}
