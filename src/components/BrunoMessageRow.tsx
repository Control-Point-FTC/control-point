import { memo, useMemo } from 'react';
import { BrunoMarkdown } from './BrunoMarkdown';
import { stripEventBlocks, stripSwitchBlock, extractActionProposals, type ActionProposal } from '../services/aiService';
import ActionProposalCard, { type ProposalStatus } from './ActionProposalCard';

interface BrunoMessageRowProps {
  text: string;
  index: number;
  isLastModel: boolean;
  busy: boolean;
  proposal: { status: ProposalStatus; error?: string } | undefined;
  switchDismissed: boolean;
  onConfirmProposals: (index: number, proposals: ActionProposal[]) => void;
  onDismissProposal: (index: number) => void;
  onSwitchToBruno: () => void;
  onDismissSwitch: (index: number) => void;
}

/**
 * One model message bubble. Memoized so a chat re-render (e.g. the batched
 * streaming text updating, or a proposal confirm on another row) does not
 * re-run Markdown rendering, action-proposal parsing, or switch-block
 * detection for messages whose text hasn't changed.
 */
export const BrunoMessageRow = memo(function BrunoMessageRow({
  text,
  index,
  isLastModel,
  busy,
  proposal,
  switchDismissed,
  onConfirmProposals,
  onDismissProposal,
  onSwitchToBruno,
  onDismissSwitch,
}: BrunoMessageRowProps) {
  // The streaming message lives outside the messages array now, so every
  // message here is complete: parsing runs once per distinct text.
  const proposals = useMemo(() => (text ? extractActionProposals(text) : []), [text]);
  const switchTo = useMemo(() => (text ? stripSwitchBlock(text).switchTo : null), [text]);

  const proposalStatus = proposal?.status || 'pending';
  const showProposals = text.length > 0 && proposals.length > 0 && proposalStatus !== 'dismissed';
  const showSwitchPrompt = isLastModel && switchTo === 'bruno' && !switchDismissed && !busy;

  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-text-base/[0.05] border border-text-base/[0.07] px-4 py-2.5 text-sm text-text-base/85 leading-relaxed">
        {text ? (
          <BrunoMarkdown>{stripEventBlocks(text)}</BrunoMarkdown>
        ) : (
          <span className="flex gap-1 items-center text-text-muted py-1">
            {[0, 1, 2].map((d) => (
              <span key={d} className="w-1.5 h-1.5 rounded-full bg-accent/70 animate-bounce" style={{ animationDelay: `${d * 0.15}s` }} />
            ))}
          </span>
        )}
        {showProposals && (
          <ActionProposalCard
            proposals={proposals}
            status={proposalStatus}
            error={proposal?.error}
            onConfirm={() => onConfirmProposals(index, proposals)}
            onDismiss={() => onDismissProposal(index)}
          />
        )}
        {showSwitchPrompt && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={onSwitchToBruno}
              className="rounded-xl bg-accent text-accent-ink text-[13px] font-bold px-4 py-2 hover:brightness-110 active:scale-[0.98] transition"
            >
              Yes, switch to Bruno
            </button>
            <button
              onClick={() => onDismissSwitch(index)}
              className="rounded-xl border border-text-base/15 text-text-muted hover:text-text-base text-[13px] font-semibold px-4 py-2 transition-colors"
            >
              Nah, stay here
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
