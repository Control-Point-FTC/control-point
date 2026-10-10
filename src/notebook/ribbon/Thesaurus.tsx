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
    const ends = [absolutePositionToRelativePosition(from, ys.type, ys.binding.mapping), absolutePositionToRelativePosition(to, ys.type, ys.binding.mapping)];
    return {
      resolve: () => {
        const now = ySyncPluginKey.getState(editor.state) as any;
        if (!now?.binding) return null;
        const [a, b] = ends.map(rel => relativePositionToAbsolutePosition(now.doc, now.type, rel, now.binding.mapping));
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
  const text = $from.parent.textContent, offset = $from.parentOffset;
  let start = offset, end = offset;
  while (start > 0 && /[A-Za-z'-]/.test(text[start - 1])) start--;
  while (end < text.length && /[A-Za-z'-]/.test(text[end])) end++;
  const word = text.slice(start, end).replace(/^['-]+|['-]+$/g, '');
  if (!WORD.test(word)) return null;
  const lead = text.slice(start, end).indexOf(word);
  const base = from - offset + start + lead;
  return { word, from: base, to: base + word.length };
}

const matchCase = (original: string, replacement: string) =>
  original === original.toUpperCase() && original.length > 1 ? replacement.toUpperCase()
    : original[0] === original[0].toUpperCase() ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;

export function Thesaurus({ editor, disabled, onClose }: { editor: Editor; disabled: boolean; onClose: () => void }) {
  const target = useRef<{ word: string; anchor: ReturnType<typeof anchorRange> } | null>(null);
  const aim = (word: string, from: number, to: number) => { target.current?.anchor.dispose(); target.current = { word, anchor: anchorRange(editor, from, to) }; };
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<Result | null | 'loading' | 'missing'>('loading');
  const [notice, setNotice] = useState('');
  const search = async (word: string) => {
    setQuery(word); setNotice('');
    if (!WORD.test(word.trim())) { setResult('missing'); return; }
    setResult('loading');
    try { const found = await lookUp(word); setResult(found.senses.length ? found : 'missing'); } catch { setResult('missing'); setNotice('The thesaurus needs a connection to Control Point. Try again when you are online.'); }
  };
  useEffect(() => {
    const at = wordAtSelection(editor);
    if (at) { aim(at.word, at.from, at.to); void search(at.word); } else { setResult(null); setNotice('Select a word, or type one to look it up.'); }
    return () => { target.current?.anchor.dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const insert = (synonym: string) => {
    const t = target.current, range = t?.anchor.resolve();
    if (disabled || !editor.isEditable) { setNotice('This page is read only right now.'); return; }
    // The word must still be there, unchanged, wherever it has moved to.
    if (!t || !range || editor.state.doc.textBetween(range.from, range.to) !== t.word) { setNotice('The word changed. Select it again to replace it.'); return; }
    const text = matchCase(t.word, synonym);
    editor.chain().focus().insertContentAt(range, text).run();
    aim(text, range.from, range.from + text.length);
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
