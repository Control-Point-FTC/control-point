import {describe,expect,it} from 'vitest';
import {revisionPreview} from '../revisionPreview';
describe('static revision preview',()=>{
  it('preserves rich formatting while removing active links, remote images and automatic file rendering',()=>{
    const html=revisionPreview({title:'Snapshot',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'<script>Hostile text</script>',marks:[{type:'bold'},{type:'link',attrs:{href:'https://example.com'}}]}]},{type:'notebookFile',attrs:{id:'file',fileId:2,name:'robot.pdf',mimeType:'application/pdf',size:5,display:'pdf',width:640}}]},canvas:{}});
    const host=document.createElement('div');host.innerHTML=html;
    expect(host.querySelector('script')).toBeNull();expect(host.querySelector('strong')!.textContent).toBe('<script>Hostile text</script>');
    expect(host.querySelector('a')?.hasAttribute('href')).toBe(false);
    expect(host.querySelector('canvas,img,iframe')).toBeNull();expect(host.textContent).toContain('Attachment: robot.pdf');
  });
});
