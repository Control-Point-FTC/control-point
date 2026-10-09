import type { NotebookTree } from './types';
export type NotebookKind = 'notebook' | 'section' | 'page';
export type NotebookDrag = { kind: NotebookKind; id: number };
export function notebookSiblings(tree: NotebookTree, item: NotebookDrag): number[] {
  if (item.kind === 'notebook') return tree.notebooks.map(n => n.id);
  if (item.kind === 'section') { const section = tree.sections.find(s => s.id === item.id); return tree.sections.filter(s => s.notebookId === section?.notebookId).map(s => s.id); }
  const page = tree.pages.find(p => p.id === item.id);
  return tree.pages.filter(p => p.sectionId === page?.sectionId && p.parentId === page.parentId).map(p => p.id);
}
export function notebookDrop(tree: NotebookTree, source: NotebookDrag, target: NotebookDrag, zone: 'before' | 'inside' | 'after') {
  if (source.kind === target.kind && source.id === target.id) throw new Error('Choose a different destination');
  if (source.kind === 'notebook' && target.kind === 'notebook' && zone !== 'inside') {
    const siblings = notebookSiblings(tree, source).filter(id => id !== source.id);
    return { to: {}, index: siblings.indexOf(target.id) + (zone === 'after' ? 1 : 0) };
  }
  if (source.kind === 'section') {
    if (target.kind === 'notebook' && zone === 'inside') return { to: { notebookId: target.id }, index: tree.sections.filter(s => s.notebookId === target.id && s.id !== source.id).length };
    if (target.kind === 'section' && zone !== 'inside') {
      const destination = tree.sections.find(s => s.id === target.id);
      if (!destination) throw new Error('Section unavailable');
      const siblings = tree.sections.filter(s => s.notebookId === destination.notebookId && s.id !== source.id).map(s => s.id);
      return { to: { notebookId: destination.notebookId }, index: siblings.indexOf(target.id) + (zone === 'after' ? 1 : 0) };
    }
  }
  if (source.kind === 'page') {
    if (target.kind === 'section' && zone === 'inside') return { to: { sectionId: target.id, parentId: null }, index: tree.pages.filter(p => p.sectionId === target.id && p.parentId === null && p.id !== source.id).length };
    if (target.kind === 'page') {
      const page = tree.pages.find(p => p.id === target.id);
      if (!page) throw new Error('Page unavailable');
      const visited = new Set<number>(); let ancestor = page;
      while (ancestor) {
        if (ancestor.id === source.id || visited.has(ancestor.id)) throw new Error('A page cannot move into its own descendants');
        visited.add(ancestor.id); ancestor = tree.pages.find(p => p.id === ancestor.parentId)!;
      }
      if (zone === 'inside') return { to: { sectionId: page.sectionId, parentId: page.id }, index: tree.pages.filter(p => p.parentId === page.id).length };
      const siblings = tree.pages.filter(p => p.sectionId === page.sectionId && p.parentId === page.parentId && p.id !== source.id).map(p => p.id);
      return { to: { sectionId: page.sectionId, parentId: page.parentId }, index: siblings.indexOf(page.id) + (zone === 'after' ? 1 : 0) };
    }
  }
  throw new Error('Drop pages in a section or beside another page; drop sections in a notebook');
}
