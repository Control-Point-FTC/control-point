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
  for(const figure of stage.querySelectorAll<HTMLElement>('figure.nb-attachment[data-id]')){
    const id=figure.dataset.id;if(!id)continue;const bounds=figure.getBoundingClientRect();
    const image=figure.querySelector(':scope > img');
    attachments[id]={rect:rect(figure),image:image?rect(image,bounds):undefined,pages:Array.from(figure.querySelectorAll(':scope > .nb-pdf-printout > .nb-pdf-page > div')).map(element=>rect(element,bounds))};
  }
  return {blocks,attachments};
}
