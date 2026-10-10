// Review → Thesaurus: senses and synonyms for the selected word (or the word
// at the cursor) from WordNet on Control Point's own server. No AI. Insert
// replaces the word looked up wherever it has moved to (edits around it,
// yours or a collaborator's, are fine) and refuses if the word itself changed;
// capitalization follows the original word.
import React, { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { X } from 'lucide-react';
import { absolutePositionToRelativePosition, relativePositionToAbsolutePosition, ySyncPluginKey } from '@tiptap/y-tiptap';
import { apiJson } from '../../services/api';

/** Keeps track of a text range while the page changes. In a shared page the
 *  ends are Yjs relative positions (remote syncs rewrite ProseMirror
 *  transactions wholesale, so plain mapping would lose them); otherwise the
 *  range is mapped through each transaction. */
export function anchorRange(editor: Editor, from: number, to: number): { resolve: () => { from: number; to: number } | null; dispose: () => void } {
  const ys = ySyncPluginKey.getState(editor.state) as any;
  if (ys?.binding) {
    // A relative position sticks to the character on its left. Anchor both ends
    // to characters inside the range (after its first and after its last), so
    // text typed right before or after the range stays outside it.
    const ends = [absolutePositionToRelativePosition(Math.min(from + 1, to), ys.type, ys.binding.mapping), absolutePositionToRelativePosition(to, ys.type, ys.binding.mapping)];
    return {
      resolve: () => {
        const now = ySyncPluginKey.getState(editor.state) as any;
        if (!now?.binding) return null;
        const [first, b] = ends.map(rel => relativePositionToAbsolutePosition(now.doc, now.type, rel, now.binding.mapping));
        const a = first == null ? null : to > from ? first - 1 : first;
        return a == null || b == null || b < a ? null : { from: a, to: b };
      },
      dispose: () => {},
    };
  }
  let range: { from: number; to: number } | null = { from, to };
  const follow = ({ transaction }: { transaction: Editor['state']['tr'] }) => {
    if (!range || !transaction.docChanged) return;
    const a = transaction.mapping.mapResult(range.from, 1), b = transaction.mapping.mapResult(range.to, -1);
    range = a.deleted || b.deleted || b.pos < a.pos ? null : { from: a.pos, to: b.pos };
  };
  editor.on('transaction', follow);
  return { resolve: () => range, dispose: () => { editor.off('transaction', follow); } };
}

type Sense = { partOfSpeech: string; definition: string; synonyms: string[] };
type Result = { word: string; senses: Sense[] };
const WORD = /^[A-Za-z][A-Za-z' -]{0,48}$/;

export async function lookUp(word: string, signal?: AbortSignal): Promise<Result> {
  return apiJson<Result>(`/api/notebook/thesaurus?word=${encodeURIComponent(word.trim())}`, { signal });
}

/** The selected word, or the word around the cursor, with its range. */
export function wordAtSelection(editor: Editor): { word: string; from: number; to: number } | null {
  const { from, to, empty, $from } = editor.state.selection;
  if (!empty) {
    const raw = editor.state.doc.textBetween(from, to), text = raw.trim();
    // A word or a short phrase ("ice cream"), not a sentence. The range drops
    // surrounding spaces (a double-click often selects the trailing one).
    const lead = raw.length - raw.trimStart().length;
    return WORD.test(text) && text.split(' ').length <= 3 ? { word: text, from: from + lead, to: from + lead + text.length } : null;
  }
  if (!$from.parent.isTextblock) return null;
  // Characters with their document positions: a line break (or any other
  // inline node) occupies a position but no word character, so offsets into
  // textContent would drift after it.
  const chars: string[] = [], positions: number[] = [];
  const blockStart = $from.start();
  $from.parent.descendants((child, offset) => {
    if (child.isText && child.text) { for (let i = 0; i < child.text.length; i++) { chars.push(child.text[i]); positions.push(blockStart + offset + i); } }
    else if (child.isInline) { chars.push('\n'); positions.push(blockStart + offset); }
  });
  let at = positions.findIndex(p => p >= from);
  if (at < 0) at = chars.length;
  let start = at, end = at;
  while (start > 0 && /[A-Za-z'-]/.test(chars[start - 1])) start--;
  while (end < chars.length && /[A-Za-z'-]/.test(chars[end])) end++;
  while (start < end && /['-]/.test(chars[start])) start++;
  while (end > start && /['-]/.test(chars[end - 1])) end--;
  const word = chars.slice(start, end).join('');
  if (!WORD.test(word)) return null;
  return { word, from: positions[start], to: positions[end - 1] + 1 };
}

const matchCase = (original: string, replacement: string) =>
  original === original.toUpperCase() && original.length > 1 ? replacement.toUpperCase()
    : original[0] === original[0].toUpperCase() ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;

export function Thesaurus({ editor, disabled, onClose }: { editor: Editor; disabled: boolean; onClose: () => void }) {
  // The word to replace stays tied to the editor it was found in (the page or
  // a canvas text box), even if another editor becomes active meanwhile.
  const target = useRef<{ word: string; editor: Editor; anchor: ReturnType<typeof anchorRange> } | null>(null);
  const aim = (on: Editor, word: string, from: number, to: number) => { target.current?.anchor.dispose(); target.current = { word, editor: on, anchor: anchorRange(on, from, to) }; };
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<Result | null | 'loading' | 'missing'>('loading');
  const [notice, setNotice] = useState('');
  const latest = useRef(0);
  const search = async (word: string) => {
    const ticket = ++latest.current;  // only the newest lookup may update the panel
    setQuery(word); setNotice('');
    if (!WORD.test(word.trim())) { setResult('missing'); return; }
    setResult('loading');
    try { const found = await lookUp(word); if (ticket === latest.current) setResult(found.senses.length ? found : 'missing'); }
    catch { if (ticket === latest.current) { setResult('missing'); setNotice('The thesaurus needs a connection to Control Point. Try again when you are online.'); } }
  };
  useEffect(() => {
    const at = wordAtSelection(editor);
    if (at) { aim(editor, at.word, at.from, at.to); void search(at.word); } else { target.current?.anchor.dispose(); target.current = null; setResult(null); setNotice('Select a word, or type one to look it up.'); }
    // Selecting a word in the page while the panel is open makes it the new
    // target (also how the person recovers after "the word changed"). Plain
    // cursor moves while typing don't trigger lookups, and neither does a
    // selection that only moved because the document changed (someone typed
    // inside the word): that must keep the refusal, not adopt the new word.
    const follow = ({ transaction }: { transaction: Editor['state']['tr'] }) => {
      if (transaction.docChanged || editor.state.selection.empty) return;
      const next = wordAtSelection(editor);
      if (!next) return;
      const current = target.current?.anchor.resolve();
      if (target.current?.editor === editor && target.current.word === next.word && current?.from === next.from && current?.to === next.to) return;
      aim(editor, next.word, next.from, next.to); void search(next.word);
    };
    editor.on('selectionUpdate', follow);
    return () => { editor.off('selectionUpdate', follow); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);
  useEffect(() => () => { target.current?.anchor.dispose(); }, []);
  const insert = (synonym: string) => {
    const t = target.current, range = t?.anchor.resolve();
    if (!t || t.editor.isDestroyed) { setNotice('Select the word in the page that you want to replace.'); return; }
    if (disabled || !t.editor.isEditable) { setNotice('This page is read only right now.'); return; }
    // The word must still be there, unchanged, wherever it has moved to.
    if (!range || t.editor.state.doc.textBetween(range.from, range.to) !== t.word) { setNotice('The word changed. Select it again to replace it.'); return; }
    const text = matchCase(t.word, synonym);
    t.editor.chain().focus().insertContentAt(range, text).run();
    aim(t.editor, text, range.from, range.from + text.length);
    setNotice(`Replaced “${t.word}” with “${text}”.`);
  };
  return <aside className="nb-thesaurus" role="complementary" aria-label="Thesaurus">
    <header><h2>Thesaurus</h2><button type="button" aria-label="Close thesaurus" onClick={onClose}><X size={16} /></button></header>
    <form role="search" onSubmit={e => { e.preventDefault(); void search(query); }}>
      <input aria-label="Word to look up" value={query} onChange={e => setQuery(e.target.value)} placeholder="Look up a word" />
    </form>
    {result === 'loading' && <p role="status" className="nb-small">Looking up…</p>}
    {result === 'missing' && <p role="status" className="nb-small">No synonyms for “{query}”. Check the spelling or try another form of the word.</p>}
    {result && result !== 'loading' && result !== 'missing' && result.senses.map((sense, i) => <section key={i} aria-label={`${sense.partOfSpeech}: ${sense.definition}`}>
      <h3>{sense.partOfSpeech} · <span>{sense.definition}</span></h3>
      <ul>{sense.synonyms.map(w => <li key={w}>
        <button type="button" className="nb-syn-word" title={`Look up “${w}”`} onClick={() => { void search(w); }}>{w}</button>
        {target.current && <button type="button" className="nb-syn-insert" aria-label={`Insert “${w}”`} disabled={disabled} onMouseDown={e => e.preventDefault()} onClick={() => insert(w)}>Insert</button>}
      </li>)}</ul>
    </section>)}
    {notice && <p role="status" className="nb-small">{notice}</p>}
  </aside>;
}
