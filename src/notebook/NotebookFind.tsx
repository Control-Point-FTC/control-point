import React, { useState } from 'react';
import type { Editor } from '@tiptap/core';
import { notebookMatches, replaceNotebookMatches } from './editorActions';
import { Button, Input } from '../components/ui-kit';
export function NotebookFind({ editor, disabled, onClose }: { editor: Editor; disabled: boolean; onClose: () => void }) {
  const [query, setQuery] = useState(''), [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false), [index, setIndex] = useState(-1);
  const [, redraw] = useState(0);
  const matches = notebookMatches(editor, query, caseSensitive);
  const select = (next: number) => {
    if (!matches.length) return;
    const position = ((next % matches.length) + matches.length) % matches.length;
    setIndex(position); editor.chain().setTextSelection(matches[position]).scrollIntoView().run();
  };
  const replace = (all: boolean) => {
    const active = Math.min(Math.max(index, 0), matches.length - 1);
    replaceNotebookMatches(editor, all ? matches : matches[active] ? [matches[active]] : [], replacement);
    setIndex(-1); redraw(v => v + 1);
  };
  return <div className="nb-find" role="search" aria-label="Find in page">
    <Input autoFocus aria-label="Find text" value={query} onChange={e => { setQuery(e.target.value); setIndex(-1); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); select(index + (e.shiftKey ? -1 : 1)); } if (e.key === 'Escape') onClose(); }} placeholder="Find in this page" />
    <span role="status">{matches.length ? `${index >= 0 ? index + 1 : '–'} / ${matches.length}` : 'No matches'}</span>
    <Button variant="ghost" onClick={() => select(index - 1)} disabled={!matches.length}>Previous</Button><Button variant="ghost" onClick={() => select(index + 1)} disabled={!matches.length}>Next</Button>
    <label><input type="checkbox" checked={caseSensitive} onChange={e => { setCaseSensitive(e.target.checked); setIndex(-1); }} /> Match case</label>
    <div className="nb-desktop nb-find-replace"><Input aria-label="Replace with" value={replacement} onChange={e => setReplacement(e.target.value)} disabled={disabled} placeholder="Replace with" /><Button variant="outline" disabled={disabled || !matches.length} onClick={() => replace(false)}>Replace</Button><Button variant="outline" disabled={disabled || !matches.length} onClick={() => replace(true)}>Replace all</Button></div>
    <Button variant="ghost" onClick={onClose}>Close find</Button>
  </div>;
}
