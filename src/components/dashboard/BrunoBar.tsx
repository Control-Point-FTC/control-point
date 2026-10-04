import { useState } from 'react';
import { Send, Sparkles, ChevronUp, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import '../../i18n';
import { BrunoMarkdown } from '../BrunoMarkdown';
import BrunoIcon from '../BrunoIcon';
import ActionProposalCard, { type ProposalStatus } from '../ActionProposalCard';
import { useBatchedStream } from '../useBatchedStream';
import {
  streamBuildHelper,
  stripEventBlocks,
  extractActionProposals,
  applyActionProposals,
  notifyBrunoDataChanged,
  type BuildHelperMessage,
  type ActionProposal,
} from '../../services/aiService';

const SUGGESTION_KEYS = [
  'dashboard.suggestionWeek',
  'dashboard.suggestionAddEvent',
  'dashboard.suggestionSummarize',
] as const;

/**
 * Immersive Bruno bar on the dashboard, directly below My Status.
 * Type a request, Bruno streams the answer inline and any data actions
 * (calendar, outreach, tasks, budget, comms) get a confirm card right
 * there — no need to open the full chat. No chatId: nothing is saved to
 * chat history.
 */
export default function BrunoBar({ botName }: { botName?: string }) {
  const { t } = useTranslation();
  const name = botName || 'Bruno';
  const suggestions = SUGGESTION_KEYS.map((k) => t(k));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<BuildHelperMessage[]>([]);
  const [proposals, setProposals] = useState<ActionProposal[]>([]);
  const [proposalStatus, setProposalStatus] = useState<ProposalStatus>('pending');
  const [proposalError, setProposalError] = useState<string | undefined>();
  const stream = useBatchedStream(40);

  const confirmProposals = async () => {
    if (!proposals.length) return;
    setProposalStatus('confirming');
    try {
      const applied = await applyActionProposals(proposals);
      const types = Object.keys(applied).map((k) =>
        k === 'event' || k === 'delete-event' ? 'calendar' : k,
      );
      notifyBrunoDataChanged(types);
      setProposalStatus('done');
    } catch (e: any) {
      setProposalStatus('error');
      setProposalError(e?.message || 'Something went wrong');
    }
  };

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setInput('');
    setExpanded(true);
    setProposals([]);
    setProposalStatus('pending');
    setProposalError(undefined);
    const next: BuildHelperMessage[] = [...messages, { role: 'user', text: content }];
    setMessages(next);
    setBusy(true);
    stream.start();
    let agg = '';
    try {
      await streamBuildHelper(
        next,
        (chunk) => {
          agg += chunk;
          stream.push(chunk);
        },
        undefined,
        { persona: 'bruno' },
      );
      stream.finish();
      const finalText = agg.trim()
        ? agg
        : t('dashboard.brunoSnag', { name });
      setMessages([...next, { role: 'model', text: finalText }]);
      setProposals(extractActionProposals(agg));
    } catch (e: any) {
      stream.finish();
      const msg = e?.serverError || t('dashboard.brunoUnreachable', { name });
      setMessages([...next, { role: 'model', text: msg }]);
    } finally {
      setBusy(false);
    }
  };

  const collapse = () => {
    setExpanded(false);
    setMessages([]);
    setProposals([]);
    setProposalStatus('pending');
    setInput('');
  };

  const lastReply = [...messages].reverse().find((m) => m.role === 'model');
  const streamingText = stream.active ? stream.text : null;

  return (
    <div className="card-surface overflow-hidden mt-3 sm:mt-4">
      {/* The bar itself */}
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5">
        <span className="shrink-0 w-8 h-8 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center">
          <BrunoIcon className="w-5 h-5 text-accent" />
        </span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send();
          }}
          placeholder={t('dashboard.askBruno', { name })}
          aria-label={t('dashboard.askBruno', { name })}
          className="flex-1 min-w-0 bg-transparent text-sm text-text-base placeholder:text-text-base/35 focus:outline-none"
        />
        {busy ? (
          <Loader2 className="w-4 h-4 text-accent animate-spin shrink-0" />
        ) : (
          <button
            onClick={() => send()}
            disabled={!input.trim()}
            aria-label={t('dashboard.submit')}
            className="shrink-0 w-8 h-8 rounded-xl bg-accent text-accent-ink flex items-center justify-center hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100 transition"
          >
            <Send className="w-4 h-4" />
          </button>
        )}
        {expanded && (
          <button
            onClick={collapse}
            aria-label={t('dashboard.collapse')}
            className="shrink-0 p-1.5 rounded-lg text-text-base/40 hover:text-text-base hover:bg-text-base/10 transition"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Suggestion chips when idle */}
      {!expanded && (
        <div className="flex flex-wrap gap-1.5 px-3 sm:px-4 pb-3">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="text-xs text-text-base/55 border border-text-base/10 rounded-full px-3 py-1 hover:border-accent/50 hover:text-accent transition flex items-center gap-1"
            >
              <Sparkles className="w-3 h-3" />
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Immersive reply area */}
      {expanded && (
        <div className="border-t border-text-base/10 px-3 sm:px-4 py-3 max-h-[420px] overflow-y-auto">
          {streamingText !== null && (
            <div className="prose prose-sm prose-invert max-w-none text-text-base/85 [&_p]:my-1.5">
              <BrunoMarkdown>{stripEventBlocks(streamingText)}</BrunoMarkdown>
              <span className="inline-block w-2 h-4 bg-accent/70 animate-pulse rounded-[2px] ml-0.5 align-middle" />
            </div>
          )}
          {streamingText === null && lastReply && (
            <div className="prose prose-sm prose-invert max-w-none text-text-base/85 [&_p]:my-1.5">
              <BrunoMarkdown>{stripEventBlocks(lastReply.text)}</BrunoMarkdown>
            </div>
          )}
          {proposals.length > 0 && (
            <ActionProposalCard
              proposals={proposals}
              status={proposalStatus}
              error={proposalError}
              onConfirm={confirmProposals}
              onDismiss={() => setProposals([])}
            />
          )}
          {!busy && streamingText === null && !lastReply && (
            <p className="text-sm text-text-base/40">{t('dashboard.brunoHint', { name })}</p>
          )}
        </div>
      )}
    </div>
  );
}
