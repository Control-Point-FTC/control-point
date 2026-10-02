import { TrendingUp, Users } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar
} from 'recharts';
import { Card } from './ui';
import { useTheme } from '../hooks/useTheme';

function getCSSVariable(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '';
}

/** Task analytics panel (completion trend + member capacity). Lazy-loaded so
 *  recharts stays out of the initial bundle — only fetched when the user
 *  opens the Analytics view. */
export default function TaskAnalytics({ completionTrends, memberCapacity, avgCompletionTime, tasks }: any) {
  const secondaryColor = getCSSVariable('--color-secondary') || '#1A1A1A';
  const { theme: chartTheme } = useTheme();
  const chartGrid = chartTheme === 'light' ? 'rgba(9,9,11,0.1)' : 'rgba(255,255,255,0.1)';
  const chartAxis = chartTheme === 'light' ? '#71717a' : '#94a3b8';
  const chartTooltipText = chartTheme === 'light' ? '#09090B' : '#fff';

  return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <Card title="Completion Trend (Last 7 Days)" icon={TrendingUp}>
            <div className="h-64 min-h-[250px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={completionTrends}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                  <XAxis dataKey="date" stroke={chartAxis} fontSize={12} />
                  <YAxis stroke={chartAxis} fontSize={12} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: secondaryColor, border: 'none', borderRadius: '8px', color: chartTooltipText }}
                    itemStyle={{ color: '#10b981' }}
                  />
                  <Line type="monotone" dataKey="completed" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Member Capacity" icon={Users}>
            <div className="h-64 min-h-[250px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={memberCapacity} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                  <XAxis type="number" stroke={chartAxis} fontSize={12} />
                  <YAxis dataKey="name" type="category" stroke={chartAxis} fontSize={10} width={80} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: secondaryColor, border: 'none', borderRadius: '8px', color: chartTooltipText }}
                  />
                  <Bar dataKey="todo" stackId="a" fill="#64748b" />
                  <Bar dataKey="inProgress" stackId="a" fill="#60a5fa" />
                  <Bar dataKey="done" stackId="a" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="lg:col-span-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
              <div>
                <p className="text-xs text-text-muted uppercase font-bold mb-1">Avg. Completion Time</p>
                <p className="text-4xl font-display font-bold text-text-base">{avgCompletionTime} <span className="text-sm font-normal text-text-muted/70">days</span></p>
              </div>
              <div>
                <p className="text-xs text-text-muted uppercase font-bold mb-1">Active Tasks</p>
                <p className="text-4xl font-display font-bold text-blue-400">{tasks.filter(t => t.status !== 'done').length}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted uppercase font-bold mb-1">Success Rate</p>
                <p className="text-4xl font-display font-bold text-emerald-400">
                  {tasks.length > 0 ? Math.round((tasks.filter(t => t.status === 'done').length / tasks.length) * 100) : 0}%
                </p>
              </div>
            </div>
          </Card>
        </div>
  );
}
