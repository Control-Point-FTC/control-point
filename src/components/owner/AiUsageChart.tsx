import {
  BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useTheme } from '../../hooks/useTheme';

function getCSSVariable(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '';
}

function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${Number(m[2])}/${Number(m[3])}` : iso;
}

/** 14-day AI usage chart for the Owner Portal AI Control tab. Lazy-loaded so
 *  recharts stays out of the initial bundle — only fetched when the owner
 *  opens Owner Portal. Zero-use days still appear on the axis. */
export default function AiUsageChart({ daily }: { daily: Array<{ date: string; messages: number; tokens: number; users: number }> }) {
  const { theme } = useTheme();
  const accent = getCSSVariable('--color-accent') || '#FFC700';
  const grid = theme === 'light' ? 'rgba(9,9,11,0.1)' : 'rgba(255,255,255,0.08)';
  const axis = theme === 'light' ? '#71717a' : '#94a3b8';
  const tooltipBg = theme === 'light' ? '#ffffff' : '#1A1A1A';
  const tooltipText = theme === 'light' ? '#09090B' : '#fff';
  const data = (daily || []).map((d) => ({ ...d, label: shortDate(d.date) }));
  return (
    <div className="h-64 min-h-[250px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
          <XAxis dataKey="label" stroke={axis} fontSize={11} tickLine={false} minTickGap={12} />
          <YAxis yAxisId="msgs" stroke={axis} fontSize={11} tickLine={false} allowDecimals={false} />
          <YAxis yAxisId="tokens" orientation="right" stroke={axis} fontSize={11} tickLine={false} hide />
          <Tooltip
            contentStyle={{ backgroundColor: tooltipBg, border: 'none', borderRadius: '10px', color: tooltipText, fontSize: 12 }}
            labelFormatter={(label: string) => {
              const d = data.find((x) => x.label === label);
              return d ? d.date : label;
            }}
            formatter={(value: any, name: string) => {
              if (name === 'messages') return [value, 'Messages'];
              if (name === 'tokens') return [Number(value).toLocaleString(), 'Tokens'];
              return [value, name];
            }}
          />
          <Bar yAxisId="msgs" dataKey="messages" fill={accent} radius={[4, 4, 0, 0]} maxBarSize={26} />
          <Line yAxisId="tokens" type="monotone" dataKey="tokens" stroke="#60a5fa" strokeWidth={2} dot={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
