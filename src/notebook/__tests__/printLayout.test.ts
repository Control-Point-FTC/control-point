import {describe,expect,it,vi} from 'vitest';
import {captureNotebookPrintLayout} from '../printLayout';
describe('print layout capture',()=>{
  it('uses logical page coordinates through display zoom and includes attachment controls spacing',()=>{
    const stage=document.createElement('div'),content=document.createElement('div');stage.append(content);
    content.innerHTML='<figure class="nb-attachment" data-id="image"><div>File controls</div><img alt="Robot"></figure><p>Following text</p>';
    Object.defineProperty(stage,'offsetWidth',{value:800});
    const bounds=(x:number,y:number,width:number,height:number)=>({left:x,top:y,width,height,right:x+width,bottom:y+height,x,y,toJSON(){}} as DOMRect);
    vi.spyOn(stage,'getBoundingClientRect').mockReturnValue(bounds(100,200,1600,1600));
    vi.spyOn(content.children[0],'getBoundingClientRect').mockReturnValue(bounds(100,280,1600,1140));
    vi.spyOn(content.querySelector('img')!,'getBoundingClientRect').mockReturnValue(bounds(126,472,1280,852));
    vi.spyOn(content.children[1],'getBoundingClientRect').mockReturnValue(bounds(100,1460,1600,80));
    const layout=captureNotebookPrintLayout(stage,content);
    expect(layout.blocks[1]).toEqual({x:0,y:630,width:800,height:40});
    expect(layout.attachments.image.image).toEqual({x:13,y:96,width:640,height:426});
    expect(layout.attachments.image.rect.height).toBe(570);
  });
});
