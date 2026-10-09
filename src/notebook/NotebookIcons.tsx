import React from 'react';

/** Original vector glyphs; notebook colors belong to each team's organization. */
export function NotebookGlyph({ color }: { color: string }) {
  return <svg aria-hidden="true" width="24" height="28" viewBox="0 0 24 28" fill="none"><rect x="4" y="2" width="15" height="24" rx="3" fill={color}/><path d="M7 2v24" stroke="#000" strokeOpacity=".25"/><rect x="10" y="7" width="6" height="3" rx="1" fill="#111" fillOpacity=".7"/><path d="M21 6v3m0 3v3m0 3v3" stroke={color} strokeWidth="2" strokeLinecap="round"/></svg>;
}
export function SectionGlyph({ color }: { color: string }) {
  return <svg aria-hidden="true" width="13" height="24" viewBox="0 0 13 24"><path d="M10 2H7a5 5 0 0 0-5 5v10a5 5 0 0 0 5 5h3V2Z" fill={color}/><path d="M10 2v20" stroke="#fff" strokeOpacity=".2"/></svg>;
}
