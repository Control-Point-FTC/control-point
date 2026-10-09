export type PrintRect={x:number;y:number;width:number;height:number};
export type AttachmentPrintLayout={rect:PrintRect;image?:PrintRect;pages:PrintRect[]};
export type NotebookPrintLayout={blocks:PrintRect[];attachments:Record<string,AttachmentPrintLayout>};
/** Capture CSS coordinates before removing interactive controls. Zoom is display-only. */
export function captureNotebookPrintLayout(stage:HTMLElement,content:HTMLElement):NotebookPrintLayout{
  const origin=stage.getBoundingClientRect(),logicalWidth=parseFloat(getComputedStyle(stage).width)||stage.offsetWidth,scale=origin.width/logicalWidth||1;
  const rect=(element:Element,relative:DOMRect=origin):PrintRect=>{
    const bounds=element.getBoundingClientRect();return {x:(bounds.left-relative.left)/scale,y:(bounds.top-relative.top)/scale,width:bounds.width/scale,height:bounds.height/scale};
  };
  const blocks=Array.from(content.children).map(element=>{
    // Only editor-owned wrappers stand in for their direct document node.
    const wrapper=element.matches('[data-node-view-wrapper],.tableWrapper');
    return rect(wrapper?element.querySelector(':scope > figure.nb-attachment,:scope > table')||element:element);
  });
  const attachments:Record<string,AttachmentPrintLayout>={};
  const localRect=(element:HTMLElement,relative:HTMLElement):PrintRect=>{
    const offset=(node:HTMLElement)=>{let x=0,y=0;for(let current:HTMLElement|null=node;current;current=current.offsetParent as HTMLElement|null){x+=current.offsetLeft;y+=current.offsetTop;}return {x,y};};
    const point=offset(element),origin=offset(relative);
    return {x:point.x-origin.x-relative.clientLeft,y:point.y-origin.y-relative.clientTop,width:element.offsetWidth,height:element.offsetHeight};
  };
  for(const figure of stage.querySelectorAll<HTMLElement>('figure.nb-attachment[data-id]')){
    const id=figure.dataset.id;if(!id)continue;const bounds=figure.getBoundingClientRect();
    const image=figure.querySelector<HTMLElement>(':scope > img'),textBox=figure.closest<HTMLElement>('.nb-canvas-text');
    const relativeRect=(element:HTMLElement)=>textBox?localRect(element,figure):rect(element,bounds);
    attachments[id]={rect:textBox?localRect(figure,textBox):rect(figure),image:image?relativeRect(image):undefined,pages:Array.from(figure.querySelectorAll<HTMLElement>(':scope > .nb-pdf-printout > .nb-pdf-page > div')).map(relativeRect)};
  }
  return {blocks,attachments};
}
