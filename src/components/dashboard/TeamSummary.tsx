import { useState, memo } from 'react';
import { Zap, Clock } from 'lucide-react';
import Markdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import '../../i18n';
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
function TeamSummary({
  summary,
  insights,
  isAiLoading,
  ThinkingIndicator,
  onRefreshSummary,
  onRefreshInsights,
}: TeamSummaryProps) {
  const { t } = useTranslation();
  const [aiTab, setAiTab] = useState<'summary' | 'insights'>('summary');

  return (
    <Card title={t('dashboard.aiTeamSummary')} subtitle={t('dashboard.operationalOverview')} icon={Zap} className="xl:col-span-7 p-5 gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1 bg-text-base/5 rounded-lg p-0.5">
          {(['summary', 'insights'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setAiTab(tab)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                aiTab === tab ? 'bg-accent text-accent-ink' : 'text-text-muted hover:text-text-base'
              }`}
            >
              {tab === 'summary' ? t('dashboard.summaryTab') : t('dashboard.insightsTab')}
            </button>
          ))}
        </div>
        {aiTab === 'summary' ? (
          <Button variant="ghost" className="h-7 text-[11px] text-accent !px-3" onClick={onRefreshSummary} disabled={isAiLoading}>
            <Clock className="w-3 h-3 mr-1" /> {t('dashboard.refresh')}
          </Button>
        ) : (
          <Button variant="ghost" onClick={onRefreshInsights} disabled={isAiLoading} className="text-[11px] h-7 !px-3">
            {insights ? t('dashboard.refresh') : t('dashboard.generate')}
          </Button>
        )}
      </div>
      <div className="max-h-72 min-h-[120px] overflow-y-auto custom-scrollbar pr-1 text-sm text-text-base/80 leading-relaxed prose prose-invert max-w-none">
        {aiTab === 'summary' ? (
          isAiLoading && !summary ? <ThinkingIndicator /> : <Markdown>{summary || t('dashboard.noSummary')}</Markdown>
        ) : (
          isAiLoading && !insights ? (
            <ThinkingIndicator />
          ) : insights ? (
            <Markdown>{insights}</Markdown>
          ) : (
            <p className="text-xs text-text-muted/70 italic">{t('dashboard.generateInsightsPrompt')}</p>
          )
        )}
      </div>
    </Card>
  );
}

export default memo(TeamSummary);
