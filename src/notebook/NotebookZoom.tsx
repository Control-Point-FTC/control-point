import React,{useEffect,useId,useState} from 'react';
import {Minus,Plus,ScanLine} from 'lucide-react';

export function NotebookZoom({value,onChange,onFit}:{value:number;onChange:(value:number)=>void;onFit:()=>void}){
  const [draft,setDraft]=useState(String(value)),[error,setError]=useState('');
  const errorId=useId();
  const change=(next:number)=>{setDraft(String(next));setError('');onChange(next);};
  useEffect(()=>{setDraft(String(value));setError('');},[value]);
  const apply=()=>{
    const next=Number(draft);
    if(!draft.trim()||!Number.isInteger(next)||next<50||next>300){setError('Enter a whole percentage from 50 to 300.');return;}
    change(next);
  };
  return <div className="nb-zoom-controls" role="group" aria-label="Page zoom controls">
    <button className="nb-tool" aria-label="Zoom out" disabled={value<=50} onClick={()=>change(Math.max(50,value-25))}><Minus size={16}/></button>
    <label>Zoom <input aria-label="Page zoom percentage" inputMode="numeric" value={draft} aria-invalid={!!error} aria-describedby={error?errorId:undefined} onChange={event=>setDraft(event.target.value)} onBlur={apply} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();apply();}if(event.key==='Escape'){event.preventDefault();setDraft(String(value));setError('');}}}/>%</label>
    <button className="nb-tool" aria-label="Zoom in" disabled={value>=300} onClick={()=>change(Math.min(300,value+25))}><Plus size={16}/></button>
    <button className="nb-tool" onClick={()=>change(100)}>Reset to 100%</button><button className="nb-tool" onClick={()=>{setDraft(String(value));setError('');onFit();}}><ScanLine size={16}/> Fit width</button>
    {error&&<span id={errorId} role="alert">{error}</span>}
  </div>;
}
