import React,{useEffect,useRef,useState} from 'react';
import {Columns2,ArrowLeftRight,X} from 'lucide-react';
import {NotebookEditor,type EditorProps} from './NotebookEditor';
import {NotebookSync} from './NotebookSync';
import {findNotebookSession} from './notebookRuntime';
import {useBrunoNotebookPage} from './brunoScreen';
import './split.css';

/** Editors stay mounted while focus, ribbon ownership and pane positions change. */
export function NotebookSplitView(props:EditorProps&{mobile:boolean;onOtherChanged?:(id:number,title:string)=>void}){
  const {sync,pages,mobile}=props;
  const [other,setOther]=useState<NotebookSync|null>(null),[active,setActive]=useState<'main'|'other'>('main');
  const [block,setBlock]=useState<string|null>(null),[reversed,setReversed]=useState(false),[ratio,setRatio]=useState(50),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const otherRef=useRef<NotebookSync|null>(null),primaryRef=useRef(sync),alive=useRef(true),changing=useRef(false),container=useRef<HTMLDivElement|null>(null),mainPane=useRef<HTMLElement|null>(null);
  const pagesRef=useRef(pages);pagesRef.current=pages;
  primaryRef.current=sync;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;const current=otherRef.current;if(current&&current!==primaryRef.current)void current.release();otherRef.current=null;};},[]);
  useEffect(()=>{
    const current=otherRef.current;
    if(current?.pageId===sync.pageId){otherRef.current=null;setOther(null);setActive('main');setBlock(null);}
    else if(current&&!pages.some(page=>page.id===current.pageId)){otherRef.current=null;setOther(null);setActive('main');setBlock(null);void current.discardRecovery();setError('The other page is no longer available.');}
  },[sync,pages]);
  useEffect(()=>{if(mobile)setActive('main');},[mobile]);
  const leaveOther=async()=>{
    const current=otherRef.current;
    if(current?.pending&&!await current.flush()&&!await current.persist()){setError('Save or download changes in the other page before closing or replacing it.');return false;}
    return true;
  };
  const openOther=async(id:number,target?:string)=>{
    if(changing.current||mobile)return;
    if(id===sync.pageId){setActive('main');props.onNavigate(id,target);mainPane.current?.focus();return;}
    if(!pages.some(page=>page.id===id)){setError('This page is no longer available.');return;}
    if(otherRef.current?.pageId===id){setBlock(target??null);setActive('other');return;}
    changing.current=true;setBusy(true);
    try{
      if(!await leaveOther()||!alive.current)return;
      if(id===primaryRef.current.pageId){setActive('main');return;}
      if(!pagesRef.current.some(page=>page.id===id)){setError('This page is no longer available.');return;}
      const previous=otherRef.current;if(previous)void previous.release();
      const retained=findNotebookSession(id,sync.scope),next=retained??new NotebookSync(id,sync.scope);
      otherRef.current=next;setOther(next);setBlock(target??null);setActive('other');setError('');
      if(retained)retained.resume();else void next.start();
    }finally{changing.current=false;if(alive.current)setBusy(false);}
  };
  const closeOther=async()=>{
    if(changing.current)return;changing.current=true;setBusy(true);
    try{if(!await leaveOther()||!alive.current)return;const previous=otherRef.current;otherRef.current=null;setOther(null);setBlock(null);setActive('main');setError('');if(previous)void previous.release();mainPane.current?.focus();}
    finally{changing.current=false;if(alive.current)setBusy(false);}
  };
  const split=!!other&&!mobile;
  // Bruno follows the active pane, including after the other pane closes.
  const activePage=pages.find(page=>page.id===(split&&active==='other'?other!.pageId:sync.pageId));
  useBrunoNotebookPage(activePage?.id??null,!!activePage?.protected);
  const primary=<NotebookEditor key={sync.pageId} {...props} toolbarVisible={!split||active==='main'} onOpenOther={mobile?undefined:openOther}/>;
  return <div className="nb-split-workspace">
    {!mobile&&<div className="nb-split-controls"><button disabled={busy||(!other&&!pages.some(page=>page.id!==sync.pageId))} onClick={()=>other?void closeOther():void openOther(pages.find(page=>page.id!==sync.pageId)!.id)}><Columns2 size={15}/>{other?'Close split view':'Split view'}</button>
      {other&&<><label>Other page <select aria-label="Page in other pane" disabled={busy} value={other.pageId} onChange={event=>void openOther(Number(event.target.value))}>{pages.filter(page=>page.id!==sync.pageId).map(page=><option key={page.id} value={page.id}>{page.title}</option>)}</select></label><button onClick={()=>setReversed(value=>!value)}><ArrowLeftRight size={15}/> Swap panes</button><span>Alt-click a page link to open it in the other pane.</span></>}
    </div>}
    {error&&<div role="alert" className="nb-alert">{error}</div>}
    <div ref={container} className={`nb-split-panes ${split?'is-split':''} ${reversed?'is-reversed':''}`}>
      <section ref={mainPane} tabIndex={-1} aria-label="Main notebook page" className={`nb-split-pane ${active==='main'?'is-active':''}`} style={split?{flexBasis:`${ratio}%`}:undefined} onFocusCapture={()=>setActive('main')} onPointerDownCapture={()=>setActive('main')}>
        {split&&<div className="nb-pane-heading"><button aria-pressed={active==='main'} onClick={()=>{setActive('main');mainPane.current?.focus();}}>Main page · {pages.find(page=>page.id===sync.pageId)?.title}</button></div>}{primary}
      </section>
      {split&&<><div className="nb-pane-divider" role="separator" aria-label="Resize notebook panes" tabIndex={0} aria-orientation="vertical" aria-valuemin={25} aria-valuemax={75} aria-valuenow={ratio} onKeyDown={event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();setRatio(value=>event.key==='Home'?25:event.key==='End'?75:Math.max(25,Math.min(75,value+(event.key==='ArrowRight'?5:-5)*(reversed?-1:1))));}}} onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId);}} onPointerMove={event=>{if(!event.currentTarget.hasPointerCapture(event.pointerId)||!container.current)return;const bounds=container.current.getBoundingClientRect();if(bounds.width>0){const position=(event.clientX-bounds.left)/bounds.width*100;setRatio(Math.max(25,Math.min(75,reversed?100-position:position)));}}} onPointerUp={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}/>
      <section tabIndex={-1} aria-label="Other notebook page" className={`nb-split-pane ${active==='other'?'is-active':''}`} onFocusCapture={()=>setActive('other')} onPointerDownCapture={()=>setActive('other')}>
        <div className="nb-pane-heading"><button aria-pressed={active==='other'} onClick={()=>setActive('other')}>Other page · {pages.find(page=>page.id===other.pageId)?.title}</button><button aria-label="Close other page" disabled={busy} onClick={()=>void closeOther()}><X size={16}/></button></div>
        <NotebookEditor key={other.pageId} sync={other} pages={pages} toolbarHost={props.toolbarHost} toolbarVisible={active==='other'} blockTarget={block} threadTarget={null} onOpenOther={(id,target)=>{setActive('main');props.onNavigate(id,target);}} onChanged={title=>props.onOtherChanged?.(other.pageId,title)} onNavigate={(id,target)=>void openOther(id,target)} onRejoin={()=>{const next=new NotebookSync(other.pageId,sync.scope);otherRef.current=next;setOther(next);void next.start();}}/>
      </section></>}
    </div>
  </div>;
}
