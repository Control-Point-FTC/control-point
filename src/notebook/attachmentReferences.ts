/** Authored attachment IDs only; neither URLs nor arbitrary metadata grant access. */
export function notebookAttachmentIds(...documents: unknown[]): number[] {
  const ids = new Set<number>();
  const walk = (node: any, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 60) return;
    if (Array.isArray(node)) { node.forEach(child => walk(child,depth+1)); return; }
    if (['notebookFile','image','pdf'].includes(node.type)) {
      const value = node.type === 'notebookFile' ? node.attrs?.fileId : node.fileId ?? node.attrs?.fileId;
      if (value !== undefined) {
        if (!Number.isSafeInteger(value) || value < 1) throw new Error('Invalid notebook attachment reference');
        ids.add(value);
        if (ids.size > 500) throw new Error('A page can reference at most 500 attachments');
      }
    }
    for (const key of ['content','objects']) if (Array.isArray(node[key])) node[key].forEach((child: unknown)=>walk(child,depth+1));
  };
  documents.forEach(document => walk(document,0)); return [...ids];
}
