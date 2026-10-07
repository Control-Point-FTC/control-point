// Floating bug button (owner spec): always bottom-right. It sits above the
// phone tab bar and above an active call's dock (CSS variables set by those
// components), and toasts / banners stack above it, so nothing overlaps.
import { Bug } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui-kit';

export function BugButton({ onClick }: { onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label="Report a bug"
          className="cp-fab fixed z-[45] flex size-12 items-center justify-center rounded-full border border-line bg-secondary text-text-base shadow-lg transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <Bug className="size-5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">Report a bug</TooltipContent>
    </Tooltip>
  );
}
