import React,{useEffect,useRef,useState} from 'react';
import { createPortal } from 'react-dom';
import type { NodeViewProps } from '@tiptap/react';
import { Copy, Crop, Download, ExternalLink, Link2, Maximize2, MoreHorizontal, Text, Trash2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../components/ui-kit';
import { FULL_CROP, MAX_ALT, cropText, parseCrop, type ImageCrop } from './fileNode';
import { notebookPageLink } from './pageLinks';
import type { NotebookFileContext } from './NotebookAttachments';

type FileContext=NonNullable<React.ContextType<typeof NotebookFileContext>>;
export const MIN_IMAGE_WIDTH=120,MAX_IMAGE_WIDTH=1600;
const clampWidth=(value:number)=>Math.round(Math.max(MIN_IMAGE_WIDTH,Math.min(MAX_IMAGE_WIDTH,value)));
const clamp01=(value:number)=>Math.max(0,Math.min(1,value));
/** One drag of a crop edge or the whole box, in fractions of the picture. Keeps at least 5% each way. */
export function dragCrop(start:ImageCrop,edge:string,dx:number,dy:number):ImageCrop{
  const min=0.05;let {x,y,w,h}=start;
  if(edge==='move'){x=clamp01(Math.min(1-w,x+dx));y=clamp01(Math.min(1-h,y+dy));return {x,y,w,h};}
  if(edge.includes('w')){const left=Math.max(0,Math.min(x+w-min,x+dx));w+=x-left;x=left;}
  if(edge.includes('e'))w=Math.max(min,Math.min(1-x,w+dx));
  if(edge.includes('n')){const top=Math.max(0,Math.min(y+h-min,y+dy));h+=y-top;y=top;}
  if(edge.includes('s'))h=Math.max(min,Math.min(1-y,h+dy));
  return {x,y,w,h};
}
const isFull=(crop:ImageCrop)=>crop.x<0.001&&crop.y<0.001&&crop.w>0.999&&crop.h>0.999;

/** A picture on the page, OneNote style: click to select, drag a corner to
 *  resize, crop in place, and right-click (or ⋯) for everything else. */
export function NotebookImage({node,updateAttributes,deleteNode,selected,context,image,error,onDownload,onOpen,onCopy,copied,onBroken}:Pick<NodeViewProps,'node'|'updateAttributes'|'deleteNode'|'selected'>&{context:FileContext|null;image:string;error:string;onDownload:()=>void;onOpen:()=>void;onCopy:()=>void;copied:string;onBroken:()=>void}){
  const {name,size,width,alt}=node.attrs;
  const crop=parseCrop(node.attrs.crop)??FULL_CROP;
  const editable=!!context?.editable&&!context.mobile;
  const [natural,setNatural]=useState<{w:number;h:number}|null>(null);
  const [draftWidth,setDraftWidth]=useState<number|null>(null);
  const [cropping,setCropping]=useState<ImageCrop|null>(null);
  const [altDraft,setAltDraft]=useState<string|null>(null);
  const [menu,setMenu]=useState<{x:number;y:number}|null>(null);
  const [focused,setFocused]=useState(false);
  const [linkCopied,setLinkCopied]=useState('');
  const frame=useRef<HTMLDivElement>(null),altField=useRef<HTMLInputElement>(null);
  useEffect(()=>{setNatural(null);},[image]);
  const shown=draftWidth??(width||640);
  const active=selected||focused||!!cropping;
  // Client pixels per CSS pixel: the page can be zoomed.
  const scale=()=>{const el=frame.current;return el&&el.offsetWidth?el.getBoundingClientRect().width/el.offsetWidth:1;};
  const resize=(corner:string)=>(event:React.PointerEvent)=>{
    event.preventDefault();event.stopPropagation();
    const el=event.currentTarget as HTMLElement,startX=event.clientX,start=frame.current?.offsetWidth||shown,ratio=scale(),sign=corner.includes('w')?-1:1;
    el.setPointerCapture?.(event.pointerId);let next=start;
    const move=(e:PointerEvent)=>{next=clampWidth(start+sign*(e.clientX-startX)/ratio);setDraftWidth(next);};
    const up=()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',up);setDraftWidth(null);if(next!==start)updateAttributes({display:'image',width:next});};
    el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);
  };
  const cropDrag=(edge:string)=>(event:React.PointerEvent)=>{
    if(!cropping)return;event.preventDefault();event.stopPropagation();
    const el=event.currentTarget as HTMLElement,box=frame.current?.getBoundingClientRect(),startX=event.clientX,startY=event.clientY,start=cropping;
    if(!box?.width||!box.height)return;el.setPointerCapture?.(event.pointerId);
    const move=(e:PointerEvent)=>setCropping(dragCrop(start,edge,(e.clientX-startX)/box.width,(e.clientY-startY)/box.height));
    const up=()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',up);};
    el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);
  };
  const startCrop=()=>{if(natural)setCropping(crop);};
  const finishCrop=()=>{
    if(!cropping)return;
    // The visible part keeps its on-page scale: a smaller crop takes less width.
    const full=(width||640)/crop.w;
    updateAttributes({display:'image',crop:isFull(cropping)?null:cropText(cropping),width:clampWidth(full*cropping.w)});setCropping(null);
  };
  const restore=()=>{if(natural)updateAttributes({display:'image',crop:null,width:clampWidth(natural.w)});};
  const copyLink=async()=>{
    try{if(!context||!node.attrs.id||!navigator.clipboard?.writeText)throw new Error('unavailable');await navigator.clipboard.writeText(new URL(notebookPageLink(context.sync.pageId,node.attrs.id),window.location.origin).href);setLinkCopied('Link copied.');}
    catch{setLinkCopied('Copying links isn’t available here.');}
  };
  const editAlt=()=>{setFocused(true);requestAnimationFrame(()=>altField.current?.focus());};
  const items=<>
    <DropdownMenuItem onSelect={onCopy}><Copy size={15} aria-hidden="true"/>Copy image</DropdownMenuItem>
    <DropdownMenuItem onSelect={onDownload}><Download size={15} aria-hidden="true"/>Save as…</DropdownMenuItem>
    <DropdownMenuItem onSelect={onOpen}><ExternalLink size={15} aria-hidden="true"/>Open in new tab</DropdownMenuItem>
    {node.attrs.id && <DropdownMenuItem onSelect={()=>{void copyLink();}}><Link2 size={15} aria-hidden="true"/>Copy link to picture</DropdownMenuItem>}
    {editable && <><DropdownMenuSeparator/>
      <DropdownMenuItem disabled={!natural} onSelect={startCrop}><Crop size={15} aria-hidden="true"/>Crop</DropdownMenuItem>
      <DropdownMenuItem disabled={!natural} onSelect={restore}><Maximize2 size={15} aria-hidden="true"/>Restore to original size</DropdownMenuItem>
      <DropdownMenuItem onSelect={editAlt}><Text size={15} aria-hidden="true"/>Alt text…</DropdownMenuItem>
      <DropdownMenuSeparator/>
      <DropdownMenuItem className="text-rose-500" onSelect={()=>deleteNode()}><Trash2 size={15} aria-hidden="true"/>Delete picture</DropdownMenuItem>
    </>}
  </>;
  const view=cropping??crop;
  // Cropped: the frame has the visible part's shape and the picture is
  // placed inside it. While cropping, the whole picture shows with the box.
  const framed=!!natural&&!isFull(view)&&!cropping;
  const frameStyle:React.CSSProperties={width:cropping?Math.min(MAX_IMAGE_WIDTH,shown/crop.w):shown,aspectRatio:natural?(framed?`${natural.w*view.w} / ${natural.h*view.h}`:`${natural.w} / ${natural.h}`):undefined};
  const imageStyle:React.CSSProperties=framed?{position:'absolute',width:`${100/view.w}%`,height:`${100/view.h}%`,left:`${-view.x/view.w*100}%`,top:`${-view.y/view.h*100}%`,maxWidth:'none'}:{};
  return <div className={`nb-image ${active?'is-active':''} ${cropping?'is-cropping':''}`} onFocus={()=>setFocused(true)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setFocused(false);}}
    onContextMenu={e=>{e.preventDefault();e.stopPropagation();setMenu({x:e.clientX,y:e.clientY});}}
    onKeyDown={e=>{if(cropping){if(e.key==='Enter'){e.preventDefault();finishCrop();}else if(e.key==='Escape'){e.preventDefault();setCropping(null);}}}}>
    <div ref={frame} className="nb-image-frame" style={frameStyle}>
      {image?<img src={image} alt={alt||name} draggable={false} style={imageStyle} onLoad={e=>setNatural({w:e.currentTarget.naturalWidth,h:e.currentTarget.naturalHeight})} onError={()=>{setNatural(null);onBroken();}}/>:!error&&<p role="status">Loading image…</p>}
      {cropping && <div className="nb-crop-box" style={{left:`${cropping.x*100}%`,top:`${cropping.y*100}%`,width:`${cropping.w*100}%`,height:`${cropping.h*100}%`}} onPointerDown={cropDrag('move')}>
        {['n','s','e','w','nw','ne','sw','se'].map(edge=><span key={edge} className={`nb-crop-handle is-${edge}`} onPointerDown={cropDrag(edge)}/>)}
      </div>}
      {editable && active && !cropping && image && ['nw','ne','sw','se'].map(corner=><span key={corner} className={`nb-image-handle is-${corner}`} aria-hidden="true" onPointerDown={resize(corner)}/>)}
      {draftWidth!=null && <span className="nb-image-size" role="status">{draftWidth} px</span>}
    </div>
    <div className="nb-image-caption">
      {editable && <span className="nb-file-drag" data-drag-handle draggable title="Drag to move within this page" aria-label="Move picture"><svg aria-hidden="true" width="10" height="16" viewBox="0 0 12 20" fill="currentColor"><circle cx="3" cy="4" r="1.3"/><circle cx="9" cy="4" r="1.3"/><circle cx="3" cy="10" r="1.3"/><circle cx="9" cy="10" r="1.3"/><circle cx="3" cy="16" r="1.3"/><circle cx="9" cy="16" r="1.3"/></svg></span>}
      <span className="nb-image-name">{name}<small> · {Math.max(1,Math.ceil(size/1024)).toLocaleString()} KB</small></span>
      {cropping?<span className="nb-image-actions"><button type="button" onClick={finishCrop}>Done</button><button type="button" onClick={()=>setCropping(FULL_CROP)}>Reset</button><button type="button" onClick={()=>setCropping(null)}>Cancel</button></span>
        :<span className="nb-image-actions">{editable && active && <button type="button" disabled={!natural} onClick={startCrop}><Crop size={13} aria-hidden="true"/>Crop</button>}
          <DropdownMenu modal={false}><DropdownMenuTrigger asChild><button type="button" className="nb-image-more" aria-label={`Picture actions for ${name}`} title="Picture actions"><MoreHorizontal size={15}/></button></DropdownMenuTrigger><DropdownMenuContent align="end">{items}</DropdownMenuContent></DropdownMenu></span>}
    </div>
    {editable && (active||altDraft!==null) && !cropping && <label className="nb-image-alt">Description (for screen readers and Bruno) <input ref={altField} aria-label="Image description (alt text)" maxLength={MAX_ALT} placeholder={name} value={altDraft??alt??''} onChange={e=>setAltDraft(e.target.value)} onBlur={()=>{if(altDraft===null)return;const value=altDraft.trim();setAltDraft(null);if((value||null)!==(alt??null))updateAttributes({alt:value||null});}}/></label>}
    {(copied||linkCopied) && <span role="status" className="nb-image-note">{linkCopied||copied}</span>}
    {menu && createPortal(<DropdownMenu modal={false} open onOpenChange={open=>{if(!open)setMenu(null);}}><DropdownMenuTrigger asChild><span aria-hidden="true" style={{position:'fixed',left:menu.x,top:menu.y,width:0,height:0}}/></DropdownMenuTrigger><DropdownMenuContent align="start" aria-label={`Picture actions for ${name}`}>{items}</DropdownMenuContent></DropdownMenu>,document.body)}
  </div>;
}
