import {describe,expect,it,vi} from 'vitest';
import {captureNotebookPrintLayout} from '../printLayout';
describe('print layout capture',()=>{
  it('captures unrotated image geometry inside a rotated canvas text box',()=>{
    const stage=document.createElement('div'),content=document.createElement('div');stage.append(content);
    stage.insertAdjacentHTML('beforeend','<div class="nb-canvas-text" style="transform:rotate(45deg)"><figure class="nb-attachment" data-id="rotated"><img></figure></div>');
    const box=stage.querySelector<HTMLElement>('.nb-canvas-text')!,figure=stage.querySelector<HTMLElement>('figure')!,image=stage.querySelector<HTMLElement>('img')!;
    const geometry=(node:HTMLElement,parent:HTMLElement|null,left:number,top:number,width:number,height:number)=>Object.defineProperties(node,{offsetParent:{value:parent},offsetLeft:{value:left},offsetTop:{value:top},offsetWidth:{value:width},offsetHeight:{value:height}});
    geometry(box,null,100,200,500,700);geometry(figure,box,10,20,400,600);geometry(image,figure,13,96,360,480);
    vi.spyOn(image,'getBoundingClientRect').mockReturnValue({left:200,top:300,width:594,height:594} as DOMRect);
    const measured=captureNotebookPrintLayout(stage,content).attachments.rotated;
    expect(measured.rect).toEqual({x:10,y:20,width:400,height:600});
    expect(measured.image).toEqual({x:13,y:96,width:360,height:480});
  });
  it('measures an enclosing quote rather than its nested attachment or table',()=>{
    const stage=document.createElement('div'),content=document.createElement('div');stage.append(content);
    content.innerHTML='<blockquote><p>Before attachment</p><figure class="nb-attachment" data-id="nested"><table></table></figure></blockquote>';
    const bounds=(left:number,top:number,width:number,height:number)=>({left,top,width,height} as DOMRect);
    Object.defineProperty(stage,'offsetWidth',{value:800});
    vi.spyOn(stage,'getBoundingClientRect').mockReturnValue(bounds(0,0,800,900));
    vi.spyOn(content.children[0],'getBoundingClientRect').mockReturnValue(bounds(20,40,760,500));
    vi.spyOn(content.querySelector('figure')!,'getBoundingClientRect').mockReturnValue(bounds(50,140,600,300));
    expect(captureNotebookPrintLayout(stage,content).blocks[0]).toEqual({x:20,y:40,width:760,height:500});
  });
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
