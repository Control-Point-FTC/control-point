import {notebookSchema,validatedNotebookDocument} from './editorSchema';
import {validatedCanvas,type CanvasItem} from './canvasModel';

export type RevisionDocument={title:string;content:unknown;canvas:unknown};
export type RevisionChange={id:string;label:string;kind:'added'|'removed'|'changed';changes:string[];before:string;after:string};
type Block={id:string;label:string;text:string;format:string;structure:string;path:string};
// Canonical serialization avoids reporting a change just because JSON keys differ.
function stable(value:unknown):string{
  if(Array.isArray(value))return `[${value.map(stable).join(',')}]`;
  if(value && typeof value==='object')return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  return JSON.stringify(value)??'null';
}
function blocks(value:unknown):Map<string,Block>{
  const document=notebookSchema.nodeFromJSON(validatedNotebookDocument(value)).toJSON(),result=new Map<string,Block>();
  const textContainers=new Set(['doc','table','tableCell','tableHeader','bulletList','orderedList','taskList','listItem','taskItem','blockquote']);
  const text=(node:any):string=>node.type==='text'?node.text||'':node.type==='hardBreak'?'\n':(node.content||[]).map(text).join(node.type==='tableRow'?' | ':textContainers.has(node.type)?'\n':'');
  const attributes=(node:any)=>Object.fromEntries(Object.entries(node.attrs||{}).filter(([key])=>key!=='id'));
  const formatting=(node:any,leaf:boolean):unknown=>{
    const runs:{marks:string;length:number}[]=[];
    const collect=(child:any)=>{if(child.type==='text'||child.type==='hardBreak'){const marks=stable(child.marks||[]),length=child.type==='hardBreak'?1:(child.text||'').length;const last=runs.at(-1);if(last?.marks===marks)last.length+=length;else runs.push({marks,length});}else(child.content||[]).forEach(collect);};
    if(leaf)collect(node);
    // Adjacent text-node splits are editor details, not block structure changes.
    const blockAttributes=(block:any):unknown=>({type:block.type,attrs:attributes(block),children:(block.content||[]).filter((child:any)=>child.type!=='text'&&child.type!=='hardBreak').map(blockAttributes)});
    return {type:node.type,attrs:attributes(node),runs:runs.some(run=>run.marks!=='[]')?runs:[],childBlocks:leaf?(node.content||[]).filter((child:any)=>child.type!=='text'&&child.type!=='hardBreak').map(blockAttributes):[]};
  };
  const structure=(node:any):unknown=>({type:node.type,children:(node.content||[]).filter((child:any)=>child.type!=='text'&&child.type!=='hardBreak').map(structure)});
  const visit=(node:any,path:string,owner:string)=>{
    if(node.type==='text'||node.type==='hardBreak')return;
    const base=typeof node.attrs?.id==='string'?`id:${node.attrs.id}`:`${owner}/${path}:${node.type}`;
    let id=base,duplicate=0;while(result.has(id))id=`${base}#${++duplicate}`;
    const label=node.type==='tableCell'||node.type==='tableHeader'?`Table cell ${path.split('.').slice(-2).map(n=>Number(n)+1).join(', ')}`:node.type.replace(/([a-z])([A-Z])/g,'$1 $2');
    const cell=node.type==='tableCell'||node.type==='tableHeader',leaf=cell||!(node.content||[]).some((child:any)=>child.type!=='text'&&child.type!=='hardBreak');
    result.set(id,{id,label,text:leaf?text(node):'',format:stable(formatting(node,leaf)),structure:stable(structure(node)),path});
    if(!cell)(node.content||[]).forEach((child:any,index:number)=>visit(child,`${path}.${index}`,node.attrs?.id?base:owner));
  };
  (document.content||[]).forEach((node,index)=>visit(node,String(index),'page'));
  return result;
}
function compareBlocks(before:unknown,after:unknown):RevisionChange[]{
  const a=blocks(before),b=blocks(after),changes:RevisionChange[]=[];
  for(const id of new Set([...a.keys(),...b.keys()])){
    const old=a.get(id),next=b.get(id);
    if(!old||!next){const item=old||next!;changes.push({id,label:item.label,kind:old?'removed':'added',changes:[],before:old?.text||'',after:next?.text||''});continue;}
    const flags:string[]=[];
    if(old.text!==next.text)flags.push('Text');
    if(old.structure!==next.structure)flags.push('Structure');
    // Formatting includes attributes/marks but excludes text and stable IDs.
    if(old.format!==next.format)flags.push('Formatting');
    if(old.path!==next.path && id.startsWith('id:'))flags.push('Moved');
    if(flags.length)changes.push({id,label:next.label,kind:'changed',changes:flags,before:old.text,after:next.text});
  }
  return changes;
}
function canvasLabel(item:CanvasItem){return `${item.pdfScope?'PDF annotation · ':''}${item.type==='stroke'?item.tool:item.type==='shape'?item.shape:'Text box'}`;}
function canvasText(item:CanvasItem):string{return item.type==='text'?Array.from(blocks(item.content).values()).map(block=>block.text).filter(Boolean).join('\n'):'';}
function compareCanvas(before:unknown,after:unknown):RevisionChange[]{
  const a=new Map(validatedCanvas(before).objects.map(item=>[item.id,item])),b=new Map(validatedCanvas(after).objects.map(item=>[item.id,item]));
  const result:RevisionChange[]=[];
  for(const id of new Set([...a.keys(),...b.keys()])){
    const old=a.get(id),next=b.get(id);
    if(!old||!next){const item=old||next!;result.push({id:`canvas:${id}`,label:canvasLabel(item),kind:old?'removed':'added',changes:[],before:old?canvasText(old):'',after:next?canvasText(next):''});continue;}
    if(stable(old)===stable(next))continue;
    const flags:string[]=[];
    if(old.x!==next.x||old.y!==next.y||old.rotation!==next.rotation)flags.push('Moved');
    if(old.width!==next.width||old.height!==next.height)flags.push('Resized');
    if(old.pdfScope!==next.pdfScope)flags.push('PDF page');
    if(old.z!==next.z)flags.push('Layer');
    if(old.locked!==next.locked||old.groupId!==next.groupId)flags.push('Lock/group');
    if(old.type!==next.type)flags.push('Object type');
    const o=old as any,n=next as any;
    if(o.color!==n.color||o.fill!==n.fill||o.opacity!==n.opacity)flags.push('Color');
    if(stable(o.points)!==stable(n.points)||o.strokeWidth!==n.strokeWidth||o.tool!==n.tool||o.shape!==n.shape)flags.push('Ink/shape');
    if(stable(o.content)!==stable(n.content))flags.push('Text/formatting');
    result.push({id:`canvas:${id}`,label:canvasLabel(next),kind:'changed',changes:flags,before:canvasText(old),after:canvasText(next)});
  }
  return result;
}
export function compareNotebookRevisions(before:RevisionDocument,after:RevisionDocument){
  const changes:RevisionChange[]=before.title===after.title?[]:[{id:'title',label:'Page title',kind:'changed',changes:['Text'],before:before.title,after:after.title}];
  changes.push(...compareBlocks(before.content,after.content),...compareCanvas(before.canvas,after.canvas));
  return changes;
}

/** Minimal changed span for readable inline comparisons without quadratic diffs. */
export function changedText(before:string,after:string){
  let start=0,end=0;
  while(start<Math.min(before.length,after.length)&&before[start]===after[start])start++;
  while(end<Math.min(before.length,after.length)-start&&before[before.length-end-1]===after[after.length-end-1])end++;
  return {prefix:before.slice(0,start),removed:before.slice(start,before.length-end),added:after.slice(start,after.length-end),suffix:end?before.slice(-end):''};
}
