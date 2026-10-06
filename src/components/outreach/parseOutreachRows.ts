// Bulk outreach paste parser: turns pasted tables/text into outreach rows.
// Handles tab/pipe/comma-delimited rows with an optional header line
// (title, date, hours, location, attendees, funds_raised, description), or
// freeform lines where dates/hours/attendees/funds are sniffed out.
function normalizeBulkDate(cell: string): string | null {
  const t = cell.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
    return isNaN(d.getTime()) ? null : `${m[1]}-${m[2]}-${m[3]}`;
  }
  m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) {
    const nowY = new Date().getFullYear();
    let y = m[3] ? parseInt(m[3], 10) : nowY;
    if (y < 100) y += 2000;
    const mm = String(parseInt(m[1], 10)).padStart(2, '0');
    const dd = String(parseInt(m[2], 10)).padStart(2, '0');
    const d = new Date(`${y}-${mm}-${dd}T00:00:00`);
    return isNaN(d.getTime()) ? null : `${y}-${mm}-${dd}`;
  }
  m = t.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?$/i);
  if (m) {
    const months: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    const y = m[3] ? parseInt(m[3], 10) : new Date().getFullYear();
    const mm = String(months[m[1].toLowerCase()]).padStart(2, '0');
    const dd = String(parseInt(m[2], 10)).padStart(2, '0');
    const d = new Date(`${y}-${mm}-${dd}T00:00:00`);
    return isNaN(d.getTime()) ? null : `${y}-${mm}-${dd}`;
  }
  return null;
}

function sniffBulkCell(cell: string): { field: string; value: any } | null {
  const t = cell.trim();
  if (!t) return null;
  const date = normalizeBulkDate(t);
  if (date) return { field: 'date', value: date };
  const fundsInline = t.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
  if (fundsInline && /fund|rais|donat|\$/i.test(t)) {
    return { field: 'funds_raised', value: parseFloat(fundsInline[1].replace(/,/g, '')) || 0 };
  }
  let m = t.match(/^(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)$/i);
  if (m) return { field: 'hours', value: parseFloat(m[1]) };
  m = t.match(/(\d+)\s*(attendees|people|students|kids|participants)/i);
  if (m) return { field: 'attendees', value: parseInt(m[1], 10) };
  return { field: 'text', value: t };
}

export function parseOutreachRows(text: string): any[] {
  const lines = String(text || '').split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (!lines.length) return [];
  // Detect delimiter: tabs (spreadsheet paste) win, then pipes, then commas.
  let delim: string | null = null;
  const frac = (ch: string) => lines.filter(l => l.includes(ch)).length / lines.length;
  if (frac('\t') >= 0.5) delim = '\t';
  else if (frac('|') >= 0.5) delim = '|';
  else if (lines.length > 1 && frac(',') >= 0.5) delim = ',';

  const rows: any[] = [];
  let startIdx = 0;
  let colMap: Record<string, number> | null = null;
  if (delim) {
    const header = lines[0].split(delim).map(c => c.trim().toLowerCase());
    const looksHeader = header.some(c => /^(title|event|name)$/.test(c)) && header.some(c => /date/.test(c));
    if (looksHeader) {
      colMap = {};
      header.forEach((c, i) => {
        if (/^(title|event|name)$/.test(c)) colMap!['title'] = i;
        else if (/date/.test(c)) colMap!['date'] = i;
        else if (/hour/.test(c)) colMap!['hours'] = i;
        else if (/locat|venue|place/.test(c)) colMap!['location'] = i;
        else if (/attend/.test(c)) colMap!['attendees'] = i;
        else if (/fund|rais|donat|amount|\$/.test(c)) colMap!['funds_raised'] = i;
        else if (/desc|note/.test(c)) colMap!['description'] = i;
      });
      startIdx = 1;
    }
  }

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  for (let li = startIdx; li < lines.length && rows.length < 50; li++) {
    const cells = delim ? lines[li].split(delim).map(c => c.trim()) : [lines[li]];
    const row: any = { title: '', description: '', date: todayKey, hours: '', location: '', attendees: '', funds_raised: '' };
    if (colMap) {
      const at = (k: string) => (colMap![k] != null ? (cells[colMap![k]] || '') : '');
      row.title = at('title');
      const d = normalizeBulkDate(at('date'));
      if (d) row.date = d;
      const h = parseFloat(at('hours'));
      if (isFinite(h) && h >= 0) row.hours = String(h);
      row.location = at('location');
      const a = parseInt(at('attendees'), 10);
      if (isFinite(a) && a >= 0) row.attendees = String(a);
      const f = parseFloat(String(at('funds_raised')).replace(/[$,]/g, ''));
      if (isFinite(f) && f >= 0) row.funds_raised = String(f);
      row.description = at('description');
    } else {
      const texts: string[] = [];
      // Positional hint: in "title | date | hours | ..." layouts the 3rd cell
      // is often a bare hours number — claim it before text classification.
      let textCells = cells;
      if (cells.length >= 3 && /^\d+(\.\d+)?$/.test(cells[2].trim())) {
        const h = parseFloat(cells[2]);
        if (h >= 0 && h <= 24) {
          row.hours = String(h);
          textCells = cells.filter((_, i) => i !== 2);
        }
      }
      for (const cell of textCells) {
        const s = sniffBulkCell(cell);
        if (!s) continue;
        if (s.field === 'text') texts.push(s.value);
        else if (s.field === 'date') row.date = s.value;
        else if (s.field === 'hours' && !row.hours) row.hours = String(s.value);
        else if (s.field === 'attendees' && !row.attendees) row.attendees = String(s.value);
        else if (s.field === 'funds_raised' && !row.funds_raised) row.funds_raised = String(s.value);
      }
      if (texts.length > 0) row.title = texts[0];
      if (texts.length > 1) row.location = texts[1];
      if (texts.length > 2) row.description = texts.slice(2).join(' — ');
    }
    if (row.title) rows.push(row);
  }
  return rows;
}
