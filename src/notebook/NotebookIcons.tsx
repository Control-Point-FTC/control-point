import React from 'react';

/** Original vector glyphs; notebook colors belong to each team's organization. */
export function NotebookGlyph({ color }: { color: string }) {
  return <svg aria-hidden="true" width="24" height="28" viewBox="0 0 24 28" fill="none"><rect x="4" y="2" width="15" height="24" rx="3" fill={color}/><path d="M7 2v24" stroke="#000" strokeOpacity=".25"/><rect x="10" y="7" width="6" height="3" rx="1" fill="#111" fillOpacity=".7"/><path d="M21 6v3m0 3v3m0 3v3" stroke={color} strokeWidth="2" strokeLinecap="round"/></svg>;
}
export function SectionGlyph({ color }: { color: string }) {
  return <svg aria-hidden="true" width="13" height="24" viewBox="0 0 13 24"><path d="M10 2H7a5 5 0 0 0-5 5v10a5 5 0 0 0 5 5h3V2Z" fill={color}/><path d="M10 2v20" stroke="#fff" strokeOpacity=".2"/></svg>;
}

const commandPaths: Record<string, string> = {
  type: 'M4 5h16M12 5v15M8 20h8',
  select: 'm5 3 14 10-7 1-3 7-4-18Z',
  pen: 'm5 16 11-12 4 4-12 11-5 2 2-5Zm10-11 4 4',
  highlighter: 'm6 15 10-11 5 5-10 11-5-5Zm1 2-3 5h9',
  eraser: 'm3 14 10-11 8 8-10 10H8l-5-7Zm5-5 8 8M10 21h12',
  lasso: 'M8 19c-9-3-6-15 4-15s13 13 3 15C4 23 4 15 9 15c4 0 3 6 0 8',
  shape: 'M3 3h10v10H3V3Zm8 14a5 5 0 1 0 10 0 5 5 0 0 0-10 0Z',
  ruler: 'm3 15 12-12 6 6-12 12-6-6Zm4-4 3 3m1-7 3 3m1-7 3 3',
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
  Paste: 'M9 4h6v3H9V4Zm-3 1H5v16h6m4-14h4v4M11 11h9v10h-9V11Z',
  Cut: 'M6 7a3 3 0 1 0 0 .01M6 20a3 3 0 1 0 0 .01M8.5 8.5 20 19M8.5 18.5 20 5',
  Copy: 'M8 8h12v13H8V8Zm-4 9V3h12',
  'Format painter': 'M4 3h13v6H4V3Zm13 3h3v6h-9v3m-1 0h2v6h-2v-6Z',
  'Font color': 'm6 17 6-14 6 14M8.5 11h7',
  Subscript: 'm4 5 8 10m0-10L4 15m13 6h4c0-3-4-2-4-5 0-2 4-2 4 0',
  Superscript: 'm4 9 8 10m0-10L4 19m13-9h4c0-3-4-2-4-5 0-2 4-2 4 0',
  'Clear formatting': 'M6 4h13M12 4 8 20m-4 0h8m3-7 6 6m0-6-6 6',
  Tag: 'M3 4h8l10 10-7 7L4 11V4Zm4 3h.01',
  Styles: 'M4 19 11 3l7 16M7 13h8m-9 8h12',
  Spelling: 'M3 14 7 4l4 10M4.5 10h5M14 4v10m0-6c3-3 6-1 6 2s-3 5-6 2m-9 7 3 3 6-6',
  Find: 'M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm4.5 10.5L21 21',
  Discussion: 'M4 5h16v11H9l-5 4V5Z',
  Symbols: 'M17 4H7l6 8-6 8h10',
  Emoji: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM8 14c2 3 6 3 8 0M9 9h.01M15 9h.01',
  Shortcuts: 'M3 6h18v12H3V6Zm3 3h.01M10 9h.01M14 9h.01M18 9h.01M7 15h10',
  'Copy block link': 'm10 8 3-3a5 5 0 0 1 7 7l-3 3m-3 1-3 3a5 5 0 0 1-7-7l3-3',
  'Collapse ribbon': 'm6 15 6-6 6 6',
  'Expand ribbon': 'm6 9 6 6 6-6',
  Sticky: 'M5 4h14v10l-6 6H5V4Zm8 16v-6h6M8 8h8M8 11h5',
  SortAsc: 'M7 4v16M3 16l4 4 4-4M14 5h3M14 10h5M14 15h7',
  SortDesc: 'M7 4v16M3 16l4 4 4-4M14 5h7M14 10h5M14 15h3',
  Share: 'M12 3v12M7 8l5-5 5 5M5 13v7h14v-7',
  Background: 'M3 4h18v16H3V4Zm0 12 5-5 4 4 3-3 6 6M15 9h.01',
  Trash: 'M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v6m4-6v6',
  Recent: 'M12 4a8 8 0 1 0 8 8M12 8v4l3 2m5-10v4h-4',
  Author: 'M9 4a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM3 20c1-4 4-6 6-6s5 2 6 6m2-9h4m-2-2v4',
  Read: 'M4 5h10l4 4v10H4V5Zm10 0v4h4M7 14l2 2 5-5',
  Thesaurus: 'M4 4h7a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4V4Zm16 0h-5a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h5V4ZM6 8h4m-4 3h4m6-3h2m-2 3h2',
};
/** `accent` paints the swatch bar under color commands (current text color / highlight). */
export function notebookCommandGlyph(command: string): React.ComponentType<{ size?: number; accent?: string }> | undefined {
  const path = commandPaths[command];
  if (!path) return undefined;
  return function CommandGlyph({ size = 22, accent }) {
    const bar = command === 'Highlight' ? accent ?? '#ffe400' : command === 'Font color' ? accent ?? '#ef4444' : null;
    return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={command === 'Bold' ? 2.6 : 1.6} strokeLinecap="round" strokeLinejoin="round"><path d={path}/>{bar && <path d={command === 'Font color' ? 'M4 21.5h16' : 'M3 22h13'} stroke={bar} strokeWidth="3.5"/>}</svg>;
  };
}
