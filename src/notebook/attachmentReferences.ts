/** Authored attachment IDs only; neither URLs nor arbitrary metadata grant access. */
export function notebookAttachmentIds(...documents: unknown[]): number[] {
  const ids = new Set<number>();
  const pending:any[]=[...documents];
  while(pending.length){
    const node=pending.pop();
    if (!node || typeof node !== 'object') continue;
    if (Array.isArray(node)) { for(const child of node)pending.push(child); continue; }
    if (['notebookFile','image','pdf'].includes(node.type)) {
      const value = node.type === 'notebookFile' ? node.attrs?.fileId : node.fileId ?? node.attrs?.fileId;
      if (value !== undefined) {
        if (!Number.isSafeInteger(value) || value < 1) throw new Error('Invalid notebook attachment reference');
        ids.add(value);
        if (ids.size > 500) throw new Error('A page can reference at most 500 attachments');
      }
    }
    for (const key of ['content','objects']) if (Array.isArray(node[key])) for(const child of node[key])pending.push(child);
  }
  return [...ids];
}
