import { memo } from 'react';
import { format } from 'date-fns';

interface DashboardHeaderProps {
  userName?: string;
  teamName?: string;
  teamNumber?: string | number;
}

/**
 * Personalized greeting header. Answers "what is happening today?" at a glance:
 * who you are, which team you're looking at, and what day it is.
 */
function DashboardHeader({ userName, teamName, teamNumber }: DashboardHeaderProps) {
  const h = new Date().getHours();
  const greet =
    h >= 5 && h < 12 ? 'Good morning'
    : h >= 12 && h < 17 ? 'Good afternoon'
    : h >= 17 && h < 22 ? 'Good evening'
    : 'Hello';
  const first = String(userName || '').split(' ')[0];

  return (
    <div className="mb-1">
      <h2 className="text-lg font-display font-bold text-white tracking-tight">
        {first ? `${greet}, ${first}` : greet}
      </h2>
      <p className="text-xs text-text-muted mt-0.5">
        {teamName || 'Your team'}
        {teamNumber ? ` · Team ${teamNumber}` : ''}
        {' · '}
        {format(new Date(), 'EEE, MMM d, yyyy')}
      </p>
    </div>
  );
}

export default memo(DashboardHeader);
