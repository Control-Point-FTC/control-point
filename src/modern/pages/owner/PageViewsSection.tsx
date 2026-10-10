// Owner → Overview: visits to the public pages from the site's own
// cookieless counter (daily totals only; nothing about visitors is kept).
import { useEffect, useState } from 'react';
import { apiFetch } from '../../../services/api';
import { Section } from '../../ui/page';

type Summary = { since: string; days: { day: string; path: string; views: number }[]; totals: Record<string, number> };
const LABELS: Record<string, string> = { '/': 'Home', '/privacy': 'Privacy', '/terms': 'Terms', '/predict/how-it-works': 'How Predict works' };

export function PageViewsSection({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<Summary | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setFailed(false);
    apiFetch('/api/owner/pageviews?days=30', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then((d: Summary) => { if (live) setData(d); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [refreshKey]);
  const total = data ? Object.values(data.totals).reduce((a, b) => a + b, 0) : 0;
  const today = new Date().toISOString().slice(0, 10);
  const todayViews = data?.days.filter(d => d.day === today).reduce((a, d) => a + d.views, 0) ?? 0;
  return <Section title="Public page views — last 30 days" description="From the site's own counter: no cookies, no IP addresses, nothing stored about visitors. Browsers asking not to be tracked aren't counted. Team pages are never counted.">
    {failed && <p className="text-sm text-text-muted" role="alert">Couldn't load page views. Try Refresh.</p>}
    {!data && !failed && <p className="text-sm text-text-muted" role="status">Loading…</p>}
    {data && <div className="grid gap-3">
      <p className="text-sm"><strong>{total.toLocaleString()}</strong> views in 30 days · <strong>{todayViews.toLocaleString()}</strong> today</p>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-text-muted"><th className="py-1 font-medium">Page</th><th className="py-1 font-medium text-right">Views</th></tr></thead>
        <tbody>{Object.keys(LABELS).map(path => <tr key={path} className="border-t border-border"><td className="py-1.5">{LABELS[path]} <span className="text-text-muted">{path}</span></td><td className="py-1.5 text-right tabular-nums">{(data.totals[path] ?? 0).toLocaleString()}</td></tr>)}</tbody>
      </table>
    </div>}
  </Section>;
}
