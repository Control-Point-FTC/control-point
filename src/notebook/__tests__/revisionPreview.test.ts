import {describe,expect,it} from 'vitest';
import {revisionPreview} from '../revisionPreview';
describe('static revision preview',()=>{
  it('includes negative coordinates, rotation and stroke extents without mutating saved drawings',()=>{
    const object={id:'shape',type:'shape',shape:'rectangle',x:-200,y:-100,width:100,height:300,z:0,rotation:45,locked:false,groupId:null,color:'#112233',fill:null,strokeWidth:20};
    const canvas={version:1,objects:[object]},saved=JSON.stringify(canvas);
    const host=document.createElement('div');host.innerHTML=revisionPreview({title:'Drawing',content:{type:'doc',content:[{type:'paragraph'}]},canvas});
    const stage=host.querySelector<HTMLElement>('.nb-revision-canvas')!,svg=host.querySelector('svg')!;
    expect(parseFloat(stage.style.width)).toBeGreaterThan(1100);expect(parseFloat(stage.style.height)).toBeGreaterThan(500);
    expect(svg.querySelector('g')!.getAttribute('transform')).toMatch(/translate\(123\./);
    expect(svg.style.overflow).toBe('visible');expect(JSON.stringify(canvas)).toBe(saved);
  });
  it('preserves rich formatting while removing active links, remote images and automatic file rendering',()=>{
    const html=revisionPreview({title:'Snapshot',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'<script>Hostile text</script>',marks:[{type:'bold'},{type:'link',attrs:{href:'https://example.com'}}]}]},{type:'notebookFile',attrs:{id:'file',fileId:2,name:'robot.pdf',mimeType:'application/pdf',size:5,display:'pdf',width:640}}]},canvas:{}});
    const host=document.createElement('div');host.innerHTML=html;
    expect(host.querySelector('script')).toBeNull();expect(host.querySelector('strong')!.textContent).toBe('<script>Hostile text</script>');
    expect(host.querySelector('a')?.hasAttribute('href')).toBe(false);
    expect(host.querySelector('canvas,img,iframe')).toBeNull();expect(host.textContent).toContain('Attachment: robot.pdf');
  });
});
