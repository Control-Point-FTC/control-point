import {describe,expect,it} from 'vitest';
import {changedText,compareNotebookRevisions} from '../revisionDiff';
const paragraph=(id:string,text:string,marks:any[]=[])=>({type:'paragraph',attrs:{id},content:[{type:'text',text,marks}]});
const page=(content:any[],objects:any[]=[])=>({title:'Build journal',content:{type:'doc',content:content.length?content:[{type:'paragraph'}]},canvas:{version:1,objects}});
const shape={id:'shape',type:'shape',shape:'rectangle',x:10,y:20,width:200,height:100,z:0,rotation:0,locked:false,groupId:null,color:'#112233',fill:null,strokeWidth:2};
describe('retained revision comparisons',()=>{
  it('does not label a table-cell paragraph-to-heading conversion as a text edit',()=>{
    const table=(type:string)=>({type:'table',attrs:{id:'type-table'},content:[{type:'tableRow',content:[{type:'tableCell',content:[{type,attrs:{id:'stable-block',...(type==='heading'?{level:2}:{})},content:[{type:'text',text:'Same words'}]}]}]}]});
    const changes=compareNotebookRevisions(page([table('paragraph')]),page([table('heading')]));
    expect(changes).toEqual(expect.arrayContaining([expect.objectContaining({changes:['Structure','Formatting'],before:'Same words',after:'Same words'})]));
    expect(changes.every(change=>!change.changes.includes('Text'))).toBe(true);
  });
  it('distinguishes authored hard breaks from list-item boundaries inside table cells',()=>{
    const table=(values:string[])=>({type:'table',attrs:{id:'break-list'},content:[{type:'tableRow',content:[{type:'tableCell',content:[{type:'bulletList',content:values.map((value,index)=>({type:'listItem',content:[{type:'paragraph',attrs:{id:`item-${index}`},content:value.split('\n').flatMap((text,part)=>[...(part?[{type:'hardBreak'}]:[]),{type:'text',text}])}]}))}]}]}]});
    expect(compareNotebookRevisions(page([table(['a\nb','c'])]),page([table(['a','b\nc'])]))).toEqual([expect.objectContaining({changes:['Text'],before:'a\nb\nc',after:'a\nb\nc'})]);
  });
  it('retains paragraph and list-item boundaries inside a table cell',()=>{
    const table=(values:string[])=>({type:'table',attrs:{id:'list-table'},content:[{type:'tableRow',content:[{type:'tableCell',content:[{type:'bulletList',content:values.map((text,index)=>({type:'listItem',content:[paragraph(`item-${index}`,text)]}))}]}]}]});
    expect(compareNotebookRevisions(page([table(['a','bc'])]),page([table(['ab','c'])]))).toEqual([expect.objectContaining({changes:['Text'],before:'a\nbc',after:'ab\nc'})]);
  });
  it('preserves nested paragraph alignment and heading level differences inside table cells',()=>{
    const table=(block:any)=>({type:'table',attrs:{id:'table-format'},content:[{type:'tableRow',content:[{type:'tableCell',content:[block]}]}]});
    const before={...paragraph('p','Same text'),attrs:{id:'p',textAlign:'left'}},after={...before,attrs:{id:'p',textAlign:'right'}};
    expect(compareNotebookRevisions(page([table(before)]),page([table(after)]))).toEqual([expect.objectContaining({changes:['Formatting']})]);
    const heading=(level:number)=>({type:'heading',attrs:{level},content:[{type:'text',text:'Same heading'}]});
    expect(compareNotebookRevisions(page([table(heading(2))]),page([table(heading(3))]))).toEqual([expect.objectContaining({changes:['Formatting']})]);
  });
  it('reports a moved hard line break as a visible text change',()=>{
    const broken=(first:string,last:string)=>({type:'paragraph',attrs:{id:'break'},content:[{type:'text',text:first},{type:'hardBreak'},{type:'text',text:last}]});
    expect(compareNotebookRevisions(page([broken('abc','def')]),page([broken('ab','cdef')]))).toEqual([expect.objectContaining({before:'abc\ndef',after:'ab\ncdef',changes:['Text']})]);
  });
  it('recognizes partial word formatting independently of text-node splits',()=>{
    const after={type:'paragraph',attrs:{id:'a'},content:[{type:'text',text:'Drive '},{type:'text',text:'ratio',marks:[{type:'bold'}]}]};
    expect(compareNotebookRevisions(page([paragraph('a','Drive ratio')]),page([after]))).toEqual([expect.objectContaining({changes:['Formatting']})]);
  });
  it('reports one text change for an edited table cell instead of repeating container text',()=>{
    const table=(value:string)=>({type:'table',attrs:{id:'t'},content:[{type:'tableRow',content:[{type:'tableCell',content:[paragraph('p',value)]}]}]});
    const changes=compareNotebookRevisions(page([table('3:1')]),page([table('4:1')]));
    expect(changes).toHaveLength(1);expect(changes[0]).toMatchObject({before:'3:1',after:'4:1',changes:['Text']});
  });
  it('distinguishes changed text, formatting, stable block moves and additions/removals',()=>{
    const before=page([paragraph('a','Old gearing'),paragraph('b','Same text'),paragraph('removed','Removed')]);
    const after=page([paragraph('b','Same text',[{type:'bold'}]),paragraph('a','New gearing'),paragraph('added','Added')]);
    const changes=compareNotebookRevisions(before,after);
    expect(changes.find(change=>change.id==='id:a')?.changes).toEqual(['Text','Moved']);
    expect(changes.find(change=>change.id==='id:b')?.changes).toEqual(['Formatting','Moved']);
    expect(changes.find(change=>change.id==='id:removed')?.kind).toBe('removed');
    expect(changes.find(change=>change.id==='id:added')?.kind).toBe('added');
  });
  it('reports table cell text and structure independently',()=>{
    const table=(rows:string[][])=>({type:'table',attrs:{id:'table'},content:rows.map(row=>({type:'tableRow',content:row.map(text=>({type:'tableCell',content:[paragraph('',text)]}))}))});
    const changes=compareNotebookRevisions(page([table([['Ratio','3:1']])]),page([table([['Ratio','4:1'],['RPM','100']])]));
    expect(changes.find(change=>change.id==='id:table')?.changes).toContain('Structure');
    expect(changes.some(change=>change.label.startsWith('Table cell')&&change.before==='3:1'&&change.after==='4:1')).toBe(true);
  });
  it('compares drawing geometry/color and PDF page scope without changing saved objects',()=>{
    const before=page([], [shape]),after=page([], [{...shape,x:70,width:250,color:'#abcdef',pdfScope:'block-pdf-2'}]);
    const serialized=JSON.stringify(before);
    expect(compareNotebookRevisions(before,after)[0]).toMatchObject({id:'canvas:shape',changes:['Moved','Resized','PDF page','Color']});
    expect(JSON.stringify(before)).toBe(serialized);
  });
  it('treats JSON property order as equal and keeps hostile text as text',()=>{
    const before=page([paragraph('a','<script>alert(1)</script>')]);
    const after=page([{content:[{text:'<script>alert(1)</script>',type:'text'}],attrs:{id:'a'},type:'paragraph'}]);
    expect(compareNotebookRevisions(before,after)).toEqual([]);
    expect(changedText('Drive 3:1 ratio','Drive 4:1 ratio')).toEqual({prefix:'Drive ',removed:'3',added:'4',suffix:':1 ratio'});
  });
  it('rejects unsupported canvas revisions instead of silently losing their differences',()=>{
    expect(()=>compareNotebookRevisions(page([]),{...page([]),canvas:{items:['legacy']}})).toThrow();
  });
});
