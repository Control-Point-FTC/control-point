import React,{useEffect,useRef,useState} from 'react';
import {apiJson} from '../services/api';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '../components/ui-kit';
import {confirmDialog} from '../components/dialog';
import type {NotebookSync} from './NotebookSync';
import type {NotebookPageData} from './types';
import {changedText,compareNotebookRevisions,type RevisionChange,type RevisionDocument} from './revisionDiff';
import {revisionPreview} from './revisionPreview';
import './history.css';

type Version={id:number;revision:number;authorId:number|null;authorName?:string;savedAt:string};
type Snapshot=RevisionDocument & {revision:number;authorName?:string;savedAt?:string};
type Inspection={before:Snapshot;after?:Snapshot;changes?:RevisionChange[]};
function relativeTime(iso:string){
  const seconds=(new Date(iso).getTime()-Date.now())/1000;
  if(!Number.isFinite(seconds))return 'Unknown time';
  const formatter=new Intl.RelativeTimeFormat(undefined,{numeric:'auto'});
  if(Math.abs(seconds)<60)return formatter.format(Math.round(seconds),'second');
  if(Math.abs(seconds)<3600)return formatter.format(Math.round(seconds/60),'minute');
  if(Math.abs(seconds)<86400)return formatter.format(Math.round(seconds/3600),'hour');
  return formatter.format(Math.round(seconds/86400),'day');
}
function ReadOnlyRevision({snapshot,label}:{snapshot:Snapshot;label:string}){
  try{return <section className="nb-revision-pane" aria-label={label}><h3>{label} · Revision {snapshot.revision}</h3><h4>{snapshot.title}</h4><div dangerouslySetInnerHTML={{__html:revisionPreview(snapshot)}} /></section>;}
  catch(e){return <section className="nb-revision-pane"><h3>{label}</h3><p role="alert">{e instanceof Error?e.message:'This revision needs a compatible viewer.'}</p></section>;}
}
/** Explicit history reads remain under the fresh server team/protection guard. */
export function NotebookHistory({sync,onRejoin}:{sync:NotebookSync;onRejoin?:()=>void}){
  const [versions,setVersions]=useState<Version[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const [left,setLeft]=useState(''),[right,setRight]=useState('current'),[busy,setBusy]=useState(false),[inspection,setInspection]=useState<Inspection|null>(null);
  const request=useRef<AbortController|null>(null);
  const headers=()=>sync.scope?{'X-CP-Notebook-Team':String(sync.scope.teamId)}:undefined;
  const endpoint=`/api/notebook/pages/${sync.pageId}`;
  useEffect(()=>{
    const abort=new AbortController();setLoading(true);setVersions([]);setInspection(null);setError('');
    void apiJson<Version[]>(`${endpoint}/versions`,{headers:headers(),cache:'no-store',signal:abort.signal}).then(items=>{if(abort.signal.aborted)return;setVersions(items);setLeft(items[0]?String(items[0].id):'');}).catch(e=>{if(!abort.signal.aborted){setVersions([]);setError(e.message);}}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
    return ()=>{abort.abort();request.current?.abort();};
  },[sync]);
  const read=(choice:string,signal:AbortSignal)=>apiJson<Snapshot>(choice==='current'?endpoint:`${endpoint}/versions/${Number(choice)}`,{headers:headers(),cache:'no-store',signal});
  const inspect=async(compare:boolean)=>{
    if(busy||!left)return;request.current?.abort();const abort=new AbortController();request.current=abort;setBusy(true);setError('');
    try{
      if(compare&&right==='current'&&sync.pending&&!await sync.flush())throw new Error('Save or recover your pending changes before comparing.');
      const [before,after]=await Promise.all([read(left,abort.signal),compare?read(right,abort.signal):Promise.resolve(undefined)]);
      abort.signal.throwIfAborted();setInspection({before,after,changes:after?compareNotebookRevisions(before,after):undefined});
    }catch(e){if(!abort.signal.aborted){setInspection(null);setError(e instanceof Error?e.message:'Cannot read revisions.');}}
    finally{if(!abort.signal.aborted)setBusy(false);}
  };
  const restore=async()=>{
    if(busy||!left||!onRejoin)return;setBusy(true);setError('');const abort=new AbortController();request.current=abort;
    try{
      if(sync.pending&&!await sync.flush())throw new Error('Save or recover your pending changes before restoring.');
      const current=await apiJson<NotebookPageData>(endpoint,{headers:headers(),cache:'no-store',signal:abort.signal});
      const selected=versions.find(version=>String(version.id)===left);
      if(!await confirmDialog({title:`Restore revision ${selected?.revision}?`,message:'The current page will be saved as a revision before replacement. Page protection stays in place. Other connected editors will need to rejoin.',confirmLabel:'Restore revision'}))return;
      abort.signal.throwIfAborted();await apiJson(`${endpoint}/versions/${Number(left)}/restore`,{method:'POST',headers:headers(),body:JSON.stringify({baseRevision:current.revision}),signal:abort.signal});
      abort.signal.throwIfAborted();setInspection(null);onRejoin();
    }catch(e){if(!abort.signal.aborted)setError(e instanceof Error?e.message:'Cannot restore this revision.');}
    finally{if(!abort.signal.aborted)setBusy(false);}
  };
  return <div className="nb-history-list" aria-label="Page revision history">
    {loading?<span role="status">Loading revisions…</span>:!versions.length?<span>No earlier revisions yet. Changes are saved automatically.</span>:<>
      <label>Earlier revision <select aria-label="Earlier revision" value={left} disabled={busy} onChange={event=>setLeft(event.target.value)}>{versions.map(version=><option key={version.id} value={version.id}>Revision {version.revision} · {version.authorName||'Team member'}</option>)}</select></label>
      <label>Compare with <select aria-label="Compare with revision" value={right} disabled={busy} onChange={event=>setRight(event.target.value)}><option value="current">Current saved page</option>{versions.map(version=><option key={version.id} value={version.id}>Revision {version.revision}</option>)}</select></label>
      <button className="nb-tool" disabled={busy} onClick={()=>void inspect(false)}>Preview revision</button><button className="nb-tool" disabled={busy||left===right} onClick={()=>void inspect(true)}>Compare revisions</button>
      {sync.data?.editable&&onRejoin&&<button className="nb-tool" disabled={busy} onClick={()=>void restore()}>Restore revision</button>}
      <details><summary>Saved revisions ({versions.length})</summary><p>Up to 50 retained revisions. Restoration saves the current revision first. PDF and image originals remain attached; this viewer does not open them automatically.</p>{versions.map(version=><div className="nb-history-row" key={version.id}><strong>Revision {version.revision}</strong><span>{version.authorName||'Team member'}</span><time dateTime={version.savedAt} title={new Date(version.savedAt).toLocaleString()}>{relativeTime(version.savedAt)} · {new Date(version.savedAt).toLocaleString()}</time></div>)}</details>
    </>}
    {busy&&<span role="status">Working with revisions…</span>}{error&&<span role="alert">{error}</span>}
    <Dialog open={!!inspection} onOpenChange={open=>{if(!open)setInspection(null);}}><DialogContent className="nb-history-dialog"><DialogHeader><DialogTitle>{inspection?.after?'Compare revisions':'Read-only revision'}</DialogTitle><DialogDescription>Historical content is read only. Files are identified without automatic document analysis.</DialogDescription></DialogHeader>
      {inspection&&<><div className="nb-revision-panes"><ReadOnlyRevision snapshot={inspection.before} label="Earlier" />{inspection.after&&<ReadOnlyRevision snapshot={inspection.after} label="Later" />}</div>{inspection.changes&&<section className="nb-revision-changes" aria-label="Revision differences"><h3>{inspection.changes.length} changed items</h3>{!inspection.changes.length&&<p>No content or drawing differences.</p>}{inspection.changes.map(change=>{const text=changedText(change.before,change.after);return <div key={change.id} className={`nb-revision-change ${change.kind}`}><strong>{change.label} · {change.kind}</strong><span>{change.changes.join(' · ')}</span>{(change.before||change.after)&&<p>{text.prefix}<del>{text.removed}</del><ins>{text.added}</ins>{text.suffix}</p>}</div>;})}</section>}</>}
    </DialogContent></Dialog>
  </div>;
}
