import { useState } from 'react';
import { Zap, Clock } from 'lucide-react';
import Markdown from 'react-markdown';
import { Card, Button } from '../ui';

interface TeamSummaryProps {
  summary?: string;
  insights: string | null;
  isAiLoading: boolean;
  ThinkingIndicator: any;
  onRefreshSummary: () => void;
  onRefreshInsights: () => void;
}

/**
 * Bruno's operational overview: a generated team summary plus
 * optional AI insights from attendance data. Refresh/generate on demand.
 */
export default function TeamSummary({
  summary,
  insights,
  isAiLoading,
  ThinkingIndicator,
  onRefreshSummary,
  onRefreshInsights,
}: TeamSummaryProps) {
  const [aiTab, setAiTab] = useState<'summary' | 'insights'>('summary');

  return (
    <Card title="AI team summary" subtitle="Today's operational overview" icon={Zap} className="xl:col-span-7 p-4 gap-2 xl:min-h-0 xl:overflow-hidden">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
          {(['summary', 'insights'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setAiTab(t)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                aiTab === t ? 'bg-accent text-accent-ink' : 'text-text-muted hover:text-white'
              }`}
            >
              {t === 'summary' ? 'Summary' : 'Insights'}
            </button>
          ))}
        </div>
        {aiTab === 'summary' ? (
          <Button variant="ghost" className="h-7 text-[11px] text-accent !px-3" onClick={onRefreshSummary} disabled={isAiLoading}>
            <Clock className="w-3 h-3 mr-1" /> Refresh
          </Button>
        ) : (
          <Button variant="ghost" onClick={onRefreshInsights} disabled={isAiLoading} className="text-[11px] h-7 !px-3">
            {insights ? 'Refresh' : 'Generate'}
          </Button>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 text-[13px] text-white/80 leading-relaxed prose prose-invert max-w-none">
        {aiTab === 'summary' ? (
          isAiLoading && !summary ? <ThinkingIndicator /> : <Markdown>{summary || 'No summary available yet.'}</Markdown>
        ) : (
          isAiLoading && !insights ? (
            <ThinkingIndicator />
          ) : insights ? (
            <Markdown>{insights}</Markdown>
          ) : (
            <p className="text-xs text-text-muted/70 italic">Generate AI insights from your attendance data.</p>
          )
        )}
      </div>
    </Card>
  );
}
