import {describe,expect,it} from 'vitest';
import {changedText,compareNotebookRevisions} from '../revisionDiff';
const paragraph=(id:string,text:string,marks:any[]=[])=>({type:'paragraph',attrs:{id},content:[{type:'text',text,marks}]});
const page=(content:any[],objects:any[]=[])=>({title:'Build journal',content:{type:'doc',content:content.length?content:[{type:'paragraph'}]},canvas:{version:1,objects}});
const shape={id:'shape',type:'shape',shape:'rectangle',x:10,y:20,width:200,height:100,z:0,rotation:0,locked:false,groupId:null,color:'#112233',fill:null,strokeWidth:2};
describe('retained revision comparisons',()=>{
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
