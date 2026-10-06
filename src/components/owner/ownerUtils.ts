// Owner portal helpers shared by Legacy OwnerView and the Modern owner console.
export function fmtTokens(n: any): string {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return `${v}`;
}

export function aiStatusOf(u: any) {
  if (!u) return { label: '—', cls: 'bg-text-base/5 text-text-muted' };
  if (u.ai_disabled === 1) return { label: 'AI disabled', cls: 'bg-rose-500/15 text-rose-400' };
  if (u.ai_timeout_until && new Date(String(u.ai_timeout_until).replace(' ', 'T') + 'Z').getTime() > Date.now())
    return { label: 'Timed out', cls: 'bg-amber-500/15 text-amber-400' };
  if (u.ai_daily_token_limit) return { label: `${fmtTokens(u.ai_daily_token_limit)}/day`, cls: 'bg-sky-500/15 text-sky-400' };
  return { label: 'AI ok', cls: 'bg-emerald-500/15 text-emerald-400' };
}

export function loginChips(u: any) {
  const chips: string[] = [];
  if (u.google_id) chips.push('Google');
  if (u.discord_id) chips.push('Discord');
  if (u.github_id) chips.push('GitHub');
  return chips;
}

export const FLAG_REASONS: Record<string, { label: string; cls: string }> = {
  'homework': { label: 'Homework-like', cls: 'bg-amber-500/15 text-amber-400' },
  'spam': { label: 'Spam burst', cls: 'bg-rose-500/15 text-rose-400' },
  'excessive-use': { label: 'Excessive use', cls: 'bg-orange-500/15 text-orange-400' },
};

export const FLAG_STATUSES: Record<string, { label: string; cls: string }> = {
  'open': { label: 'Open', cls: 'bg-rose-500/15 text-rose-400' },
  'dismissed': { label: 'Dismissed', cls: 'bg-text-base/5 text-text-muted' },
  'warned': { label: 'Warned', cls: 'bg-amber-500/15 text-amber-400' },
  'timed_out': { label: 'Timed out', cls: 'bg-orange-500/15 text-orange-400' },
  'ai_disabled': { label: 'AI disabled', cls: 'bg-rose-500/20 text-rose-300' },
};
