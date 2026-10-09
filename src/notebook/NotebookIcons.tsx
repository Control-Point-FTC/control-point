import React from 'react';

/** Original vector glyphs; notebook colors belong to each team's organization. */
export function NotebookGlyph({ color }: { color: string }) {
  return <svg aria-hidden="true" width="24" height="28" viewBox="0 0 24 28" fill="none"><rect x="4" y="2" width="15" height="24" rx="3" fill={color}/><path d="M7 2v24" stroke="#000" strokeOpacity=".25"/><rect x="10" y="7" width="6" height="3" rx="1" fill="#111" fillOpacity=".7"/><path d="M21 6v3m0 3v3m0 3v3" stroke={color} strokeWidth="2" strokeLinecap="round"/></svg>;
}
export function SectionGlyph({ color }: { color: string }) {
  return <svg aria-hidden="true" width="13" height="24" viewBox="0 0 13 24"><path d="M10 2H7a5 5 0 0 0-5 5v10a5 5 0 0 0 5 5h3V2Z" fill={color}/><path d="M10 2v20" stroke="#fff" strokeOpacity=".2"/></svg>;
}

const commandPaths: Record<string, string> = {
  Undo: 'M8 6 3 11l5 5M3 11h10a7 7 0 0 1 7 7',
  Redo: 'm16 6 5 5-5 5m5-5H11a7 7 0 0 0-7 7',
  Bold: 'M7 4h6a4 4 0 0 1 0 8H7V4Zm0 8h7a4 4 0 0 1 0 8H7v-8Z',
  Italic: 'M10 4h9M5 20h9M15 4 9 20',
  Underline: 'M6 4v8a6 6 0 0 0 12 0V4M5 22h14',
  Strike: 'M18 6c-2-3-10-3-11 1-1 5 10 4 10 9 0 4-9 5-12 1M3 12h18',
  Highlight: 'm8 16 9-12 4 3-9 12-5 1 1-4Zm0 0 4 3M3 22h13',
  Checklist: 'm3 6 2 2 3-4m-5 9 2 2 3-4M12 6h9m-9 7h9M3 21h18',
  Bullets: 'M3 5h1m-1 7h1m-1 7h1M9 5h12M9 12h12M9 19h12',
  Numbered: 'M3 3h1v5M2 8h4m-4 4c4-3 5 1 1 3h3M9 5h12M9 12h12M9 19h12',
  Link: 'm10 8 3-3a5 5 0 0 1 7 7l-3 3m-3 1-3 3a5 5 0 0 1-7-7l3-3m1 7 8-8',
  Table: 'M3 4h18v16H3V4Zm0 5h18M3 15h18M9 4v16m6-16v16',
  Quote: 'M4 5h6v7H5c0 3 2 5 4 6M14 5h6v7h-5c0 3 2 5 4 6',
  Code: 'm7 6-5 6 5 6m10-12 5 6-5 6M14 3l-4 18',
  Divider: 'M3 12h18',
  left: 'M3 5h18M3 10h12M3 15h18M3 20h12',
  center: 'M3 5h18M6 10h12M3 15h18M6 20h12',
  right: 'M3 5h18M9 10h12M3 15h18M9 20h12',
  justify: 'M3 5h18M3 10h18M3 15h18M3 20h18',
  Indent: 'M10 5h11M10 10h11M10 15h11M10 20h11m-18-5 4-3-4-3',
  Outdent: 'M10 5h11M10 10h11M10 15h11M10 20h11m-4-5-4-3 4-3',
};
export function notebookCommandGlyph(command: string): React.ComponentType<{ size?: number }> | undefined {
  const path = commandPaths[command];
  if (!path) return undefined;
  return function CommandGlyph({ size = 22 }) {
    return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={command === 'Bold' ? 2.6 : 1.6} strokeLinecap="round" strokeLinejoin="round"><path d={path}/>{command === 'Highlight' && <path d="M3 22h13" stroke="#ffe400" strokeWidth="4"/>}</svg>;
  };
}
