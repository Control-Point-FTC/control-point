/** "5m", "3h", "2d" since a chat was last updated. The server sends UTC as "YYYY-MM-DD HH:MM:SS" with no zone. */
export function chatTimeAgo(iso?: string, now: number = Date.now()) {
  if (!iso) return '';
  const t = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso.replace(' ', 'T') + 'Z').getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.max(1, Math.floor((now - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d` : new Date(t).toLocaleDateString();
}
