// Type "@" to mention a teammate: a list of the members who can open this
// page, filtered as you type; Enter or Tab writes "@Name" and pings them (a
// notification that opens the page). Escape closes it until that "@" is gone.
// "@Name" for a current member is highlighted on the page. Not in code.
import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';

export type MentionMember = { id: number; name: string };
/** localStorage prefix for pings waiting to be sent (offline); cleared when the session ends. */
export const PENDING_MENTIONS_PREFIX = 'cp-nb-pending-mentions:';
export type MentionState = { active: boolean; from: number; to: number; query: string; index: number; dismissed: number | null };
export const mentionKey = new PluginKey<MentionState>('notebookMention');
const idle: MentionState = { active: false, from: 0, to: 0, query: '', index: 0, dismissed: null };
const MAX_RESULTS = 8;

/** Members matching what's typed after "@": names starting with it first, then any word of the name. */
export function memberMatches(members: MentionMember[], query: string, selfId?: number): MentionMember[] {
  const q = query.trim().toLowerCase();
  const scored = members.filter(m => m.id !== selfId && m.name).map(m => ({ m, name: m.name.toLowerCase() }))
    .filter(x => !q || x.name.startsWith(q) || x.name.split(/\s+/).some(w => w.startsWith(q)))
    .sort((a, b) => (q ? Number(!a.name.startsWith(q)) - Number(!b.name.startsWith(q)) : 0) || a.name.localeCompare(b.name));
  return scored.slice(0, MAX_RESULTS).map(x => x.m);
}

export type MentionOptions = {
  members: () => MentionMember[];
  selfId: () => number | undefined;
  enabled: () => boolean;
  /** Called after "@Name" is written: send the ping. */
  onMention: (member: MentionMember) => void;
};

export function insertMention(editor: Editor, range: { from: number; to: number }, member: MentionMember, onMention: (m: MentionMember) => void) {
  // Editing may have stopped (conflict, permission change) since the list opened.
  if (!editor.isEditable) return;
  editor.chain().focus().deleteRange(range).insertContent([{ type: 'text', text: `@${member.name}` }, { type: 'text', text: ' ' }]).run();
  // The finished "@Jenny Park " would still match: close the list so the next Enter is a new line.
  editor.view.dispatch(editor.state.tr.setMeta(mentionKey, { dismissed: range.from }));
  onMention(member);
}

/** Highlights "@Name" for each current member (longest names first, so "@Ana Lee" beats "@Ana"). */
export function mentionDecorations(doc: PMNode, members: MentionMember[]): DecorationSet {
  const names = [...new Set(members.map(m => m.name).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!names.length) return DecorationSet.empty;
  const found: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    if (node.type.spec.code) return false;
    // The block's text as one string, so "@Jenny **Park**" still matches. Each character is one
    // document position; inline code and non-text nodes become \0 so nothing matches there.
    let text = '';
    node.forEach(child => {
      text += child.isText && !child.marks.some(m => m.type.spec.code) ? child.text ?? '' : '\0'.repeat(child.nodeSize);
    });
    if (!text.includes('@')) return false;
    for (let i = text.indexOf('@'); i !== -1; i = text.indexOf('@', i + 1)) {
      if (i > 0 && /[\w@.+-]/.test(text[i - 1])) continue; // an email address, not a mention
      const rest = text.slice(i + 1);
      const name = names.find(n => rest.startsWith(n) && !/[\p{L}\p{N}_]/u.test(rest[n.length] ?? ''));
      if (name) { found.push(Decoration.inline(pos + 1 + i, pos + 2 + i + name.length, { class: 'nb-mention' })); i += name.length; }
    }
    return false;
  });
  return DecorationSet.create(doc, found);
}

export const MemberMention = Extension.create<MentionOptions>({
  name: 'notebookMemberMention',
  addOptions() { return { members: () => [], selfId: () => undefined, enabled: () => true, onMention: () => {} }; },
  addProseMirrorPlugins() {
    const editor = this.editor, options = this.options;
    const results = (state: MentionState) => memberMatches(options.members(), state.query, options.selfId());
    let decorations: { doc: PMNode | null; members: MentionMember[]; set: DecorationSet } = { doc: null, members: [], set: DecorationSet.empty };
    return [new Plugin<MentionState>({
      key: mentionKey,
      state: {
        init: () => idle,
        apply(tr, prev, _old, next) {
          const meta = tr.getMeta(mentionKey) as Partial<MentionState> | undefined;
          let dismissed = meta?.dismissed !== undefined ? meta.dismissed : prev.dismissed !== null ? tr.mapping.map(prev.dismissed) : null;
          if (dismissed !== null && (dismissed + 1 > next.doc.content.size || next.doc.textBetween(dismissed, dismissed + 1) !== '@')) dismissed = null;
          const { selection } = next, $from = selection.$from, parent = $from.parent;
          if (!selection.empty || !parent.isTextblock || parent.type.spec.code || !options.enabled() || !editor.isEditable) return { ...idle, dismissed };
          if ($from.marks().some(m => m.type.spec.code)) return { ...idle, dismissed };
          const before = parent.textBetween(Math.max(0, $from.parentOffset - 40), $from.parentOffset, '\0', '\0');
          // "@" at the start or after a space or bracket, so "name@example.com" doesn't open the list.
          // Full names too ("@Jenny Pa"): up to three words; the list closes once nothing matches.
          const match = /(?:^|[\s(\[{"'“])@([^\s@\0]{0,30}(?: [^\s@\0]{0,30}){0,2})$/.exec(before);
          if (!match) return { ...idle, dismissed };
          const from = $from.pos - match[1].length - 1;
          if (dismissed === from) return { ...idle, dismissed };
          const query = match[1];
          const index = meta?.index !== undefined ? meta.index : prev.active && prev.query === query ? prev.index : 0;
          const count = results({ ...idle, query }).length;
          return { active: count > 0, from, to: $from.pos, query, index: Math.max(0, Math.min(count - 1, index)), dismissed };
        },
      },
      props: {
        decorations(state) {
          const members = options.members();
          if (decorations.doc !== state.doc || decorations.members !== members) decorations = { doc: state.doc, members, set: mentionDecorations(state.doc, members) };
          return decorations.set;
        },
        handleKeyDown(view, event) {
          const state = mentionKey.getState(view.state);
          if (!state?.active || !options.enabled() || !editor.isEditable) return false;
          const items = results(state);
          if (!items.length) return false;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            view.dispatch(view.state.tr.setMeta(mentionKey, { index: (state.index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length }));
            return true;
          }
          if (event.key === 'Enter' || event.key === 'Tab') { insertMention(editor, state, items[Math.min(state.index, items.length - 1)], options.onMention); return true; }
          if (event.key === 'Escape') { view.dispatch(view.state.tr.setMeta(mentionKey, { dismissed: state.from })); return true; }
          return false;
        },
      },
    })];
  },
});
