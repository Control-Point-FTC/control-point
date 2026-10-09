export function notebookPageLink(pageId: number, blockId?: string | null) {
  return `/notebook?page=${pageId}${blockId ? `&block=${encodeURIComponent(blockId)}` : ''}`;
}
export function parseNotebookPageLink(value: unknown): { pageId: number; blockId: string } | null {
  if (typeof value !== 'string' || !value.startsWith('/notebook?')) return null;
  try {
    const url = new URL(value, 'https://control-point.invalid');
    const pageId = Number(url.searchParams.get('page'));
    const blockId = url.searchParams.get('block') ?? '';
    return Number.isSafeInteger(pageId) && pageId > 0 && blockId.length <= 100 && /^[\w-]*$/.test(blockId) ? { pageId, blockId } : null;
  } catch { return null; }
}
/** Only explicitly authored internal link marks become graph edges. */
export function notebookPageReferences(content: unknown) {
  const links = new Map<string, { pageId: number; blockId: string }>();
  const walk = (node: any, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 60 || links.size >= 500) return;
    if (Array.isArray(node)) { node.forEach(n => walk(n, depth + 1)); return; }
    for (const mark of Array.isArray(node.marks) ? node.marks : []) {
      const link = mark.type === 'link' ? parseNotebookPageLink(mark.attrs?.href) : null;
      if (link) links.set(`${link.pageId}:${link.blockId}`, link);
    }
    if (Array.isArray(node.content)) node.content.forEach((n: unknown) => walk(n, depth + 1));
  };
  walk(content, 0); return [...links.values()];
}
