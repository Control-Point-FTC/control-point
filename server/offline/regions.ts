// Readable names for FTC region codes ("USNJ" → "New Jersey").
const US_STATES: Record<string, string> = {
  AK: 'Alaska', AL: 'Alabama', AR: 'Arkansas', AZ: 'Arizona', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DC: 'Washington DC', DE: 'Delaware',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', IA: 'Iowa', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  MA: 'Massachusetts', MD: 'Maryland', ME: 'Maine', MI: 'Michigan', MN: 'Minnesota', MO: 'Missouri', MS: 'Mississippi', MT: 'Montana', NC: 'North Carolina',
  ND: 'North Dakota', NE: 'Nebraska', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NV: 'Nevada', NY: 'New York', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VA: 'Virginia',
  VT: 'Vermont', WA: 'Washington', WI: 'Wisconsin', WV: 'West Virginia', WY: 'Wyoming',
};
const SPECIAL: Record<string, string> = {
  USCALA: 'California – Los Angeles', USCANO: 'California – Northern', USCASD: 'California – San Diego',
  USCHS: 'Chesapeake', USNYEX: 'New York – Excelsior', USNYLI: 'New York – Long Island', USNYNY: 'New York – NYC',
  USTXCE: 'Texas – Central', USTXHO: 'Texas – Houston', USTXNO: 'Texas – North', USTXSO: 'Texas – South', USTXWP: 'Texas – West & Panhandle',
  CAAB: 'Alberta', CABC: 'British Columbia', CAON: 'Ontario', CAQC: 'Québec',
  AU: 'Australia', BR: 'Brazil', CN: 'China', CY: 'Cyprus', DE: 'Germany', EG: 'Egypt', ES: 'Spain', FR: 'France', GB: 'United Kingdom',
  IL: 'Israel', IN: 'India', JM: 'Jamaica', KR: 'South Korea', KZ: 'Kazakhstan', LY: 'Libya', MA: 'Morocco', MX: 'Mexico', NG: 'Nigeria',
  NL: 'Netherlands', NZ: 'New Zealand', PA: 'Panama', QA: 'Qatar', RO: 'Romania', RU: 'Russia', SA: 'Saudi Arabia', TH: 'Thailand',
  TW: 'Taiwan', VN: 'Vietnam', ZA: 'South Africa',
};

export function regionName(code: string): string {
  if (SPECIAL[code]) return SPECIAL[code];
  const us = /^US([A-Z]{2})$/.exec(code);
  if (us && US_STATES[us[1]]) return US_STATES[us[1]];
  return code;
}

/**
 * A region code from where a team is (state/province and country), for a
 * team that has played no stored event yet. Only codes in `known` (regions
 * that have had events) count: a state FTC splits into several regions
 * (California, Texas, New York) gives nothing rather than a wrong guess.
 */
export function regionFromLocation(state: string | null | undefined, country: string | null | undefined, known: Set<string>): string | null {
  const st = String(state || "").trim();
  const co = String(country || "").trim().toLowerCase();
  if (!st && !co) return null;
  const usa = !co || co === "usa" || co === "us" || co === "united states" || co === "united states of america";
  const canada = co === "canada" || co === "ca";
  const candidates: string[] = [];
  if (usa && st) {
    const ab = /^[A-Za-z]{2}$/.test(st) ? st.toUpperCase() : Object.entries(US_STATES).find(([, n]) => n.toLowerCase() === st.toLowerCase())?.[0];
    if (ab) candidates.push(`US${ab}`);
  } else if (canada && st) {
    const ab = /^[A-Za-z]{2}$/.test(st) ? st.toUpperCase() : Object.entries(SPECIAL).find(([c, n]) => c.startsWith("CA") && c.length === 4 && n.toLowerCase() === st.toLowerCase())?.[0]?.slice(2);
    if (ab) candidates.push(`CA${ab}`);
  } else if (co) {
    const byName = Object.entries(SPECIAL).find(([c, n]) => c.length === 2 && n.toLowerCase() === co)?.[0];
    candidates.push(...[byName, /^[a-z]{2}$/.test(co) ? co.toUpperCase() : null].filter((c): c is string => !!c));
  }
  return candidates.find((c) => known.has(c)) ?? null;
}
