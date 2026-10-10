import React,{useEffect,useState} from 'react';

export type PaperView={pattern:'blank'|'ruled'|'grid';spacing:number;lineColor:string;background:string;showTitle:boolean};
export const DEFAULT_PAPER_VIEW:PaperView={pattern:'blank',spacing:32,lineColor:'#dbe6f4',background:'#ffffff',showTitle:true};
const backgrounds=[['#ffffff','White'],['#fff8e5','Warm'],['#edf7ff','Sky'],['#eefaf1','Mint']];
const lines=[['#dbe6f4','Soft blue'],['#d6dadd','Gray'],['#b8dfe5','Cyan']];
function read(key?:string):PaperView{
  if(!key)return {...DEFAULT_PAPER_VIEW};
  try{
    const value=JSON.parse(localStorage.getItem(key)??'null');
    if(!value||!['blank','ruled','grid'].includes(value.pattern)||![24,32,40].includes(value.spacing)||!lines.some(([color])=>color===value.lineColor)||!backgrounds.some(([color])=>color===value.background)||typeof value.showTitle!=='boolean')return {...DEFAULT_PAPER_VIEW};
    return {pattern:value.pattern,spacing:value.spacing,lineColor:value.lineColor,background:value.background,showTitle:value.showTitle};
  }catch{return {...DEFAULT_PAPER_VIEW};}
}
export function useNotebookPaperView(key?:string){
  const [state,setState]=useState(()=>({key,value:read(key)}));
  const value=state.key===key?state.value:read(key);
  useEffect(()=>{setState(previous=>previous.key===key?previous:{key,value:read(key)});},[key]);
  const change=(next:PaperView)=>{setState({key,value:next});if(key)try{localStorage.setItem(key,JSON.stringify(next));}catch{/* Device preferences remain usable without storage. */}};
  return [value,change] as const;
}
export function paperViewStyle(view:PaperView):React.CSSProperties{
  const {spacing,lineColor,pattern}=view;
  return {backgroundColor:view.background,backgroundImage:pattern==='blank'?'none':pattern==='ruled'?`repeating-linear-gradient(to bottom,transparent 0,transparent ${spacing-1}px,${lineColor} ${spacing-1}px,${lineColor} ${spacing}px)`:`linear-gradient(to right,${lineColor} 1px,transparent 1px),linear-gradient(to bottom,${lineColor} 1px,transparent 1px)`,backgroundSize:pattern==='grid'?`${spacing}px ${spacing}px`:undefined};
}
export function NotebookPaperControls({value,onChange}:{value:PaperView;onChange:(value:PaperView)=>void}){
  const update=(patch:Partial<PaperView>)=>onChange({...value,...patch});
  return <div className="nb-paper-controls" role="group" aria-label="Page appearance">
    <label>Paper <select aria-label="Paper pattern" value={value.pattern} onChange={event=>update({pattern:event.target.value as PaperView['pattern']})}><option value="blank">Blank</option><option value="ruled">Ruled</option><option value="grid">Grid</option></select></label>
    <button className="nb-tool" aria-pressed={value.pattern==='ruled'} onClick={()=>update({pattern:value.pattern==='ruled'?'blank':'ruled'})}>Rule lines</button>
    <label>Spacing <select aria-label="Paper line spacing" disabled={value.pattern==='blank'} value={value.spacing} onChange={event=>update({spacing:Number(event.target.value)})}>{[24,32,40].map(size=><option key={size} value={size}>{size} px</option>)}</select></label>
    <label>Lines <select aria-label="Paper line color" disabled={value.pattern==='blank'} value={value.lineColor} onChange={event=>update({lineColor:event.target.value})}>{lines.map(([color,name])=><option key={color} value={color}>{name}</option>)}</select></label>
    <label>Page color <select aria-label="Page color" value={value.background} onChange={event=>update({background:event.target.value})}>{backgrounds.map(([color,name])=><option key={color} value={color}>{name}</option>)}</select></label>
    <button className="nb-tool" aria-pressed={!value.showTitle} onClick={()=>update({showTitle:!value.showTitle})}>{value.showTitle?'Hide page title':'Show page title'}</button>
    <button className="nb-tool" onClick={()=>onChange({...DEFAULT_PAPER_VIEW})}>Reset page appearance</button>
  </div>;
}
