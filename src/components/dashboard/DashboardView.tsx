import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { SetupChecklist, shouldShowChecklist } from '../onboarding';
import DashboardHeader from './DashboardHeader';
import DashboardMetricRow from './DashboardMetricRow';
import MyStatusStrip from './MyStatusStrip';
import BrunoBar from './BrunoBar';
import AttendanceTrend from './AttendanceTrend';
import TeamActivity from './TeamActivity';
import UpcomingTimeline from './UpcomingTimeline';
import TeamSummary from './TeamSummary';
import TeamPerformance from './TeamPerformance';
import AccessCodeCard from './AccessCodeCard';
import { useDashboardData, type DashboardData, type DashboardTeam } from './dashboardSelectors';

interface DashboardViewProps {
  data: any;
  currentUser: any;
  onRefresh: () => void;
  setLoading: (v: boolean) => void;
  insights: string | null;
  updateInsights: () => void;
  isAiLoading: boolean;
  ThinkingIndicator: any;
  updateSummary: (force?: boolean) => void;
  teams: any[];
  onboardingState: any;
  onContinueSetup: () => void;
  onDismissChecklist: () => void;
  inventory: any[];
  setTasks?: (fn: any) => void;
  hiddenDates?: string[];
}

/** Stable empty refs so memoized children don't see a fresh `[]` each render. */
const EMPTY_MEMBERS: DashboardData['members'] = [];
const EMPTY_ATTENDANCE: DashboardData['attendance'] = [];
const EMPTY_TASKS: DashboardData['tasks'] = [];
const EMPTY_EVENTS: DashboardData['events'] = [];
const EMPTY_BUDGET: DashboardData['budget'] = [];
const EMPTY_TEAMS: DashboardTeam[] = [];

/**
 * The full team dashboard, in the classic rich layout with the current
 * visual system:
 *
 *   <DashboardHeader />     — who / which team / what day
 *   <DashboardMetricRow />  — attendance, open tasks, up next, budget
 *   <MyStatusStrip />       — your own check-in for today
 *   <AttendanceTrend />     — present check-ins, last 14 days (clickable)
 *   <UpcomingTimeline />    — what's coming, grouped by day
 *   <TeamActivity />        — what the team has been up to (clickable rows)
 *   <TeamPerformance />     — FTC OPR detail with season switcher
 *   <TeamSummary />         — Bruno's summary / insights tabs
 *   <AccessCodeCard />      — team join code, copy + regenerate
 *
 * Every card leads somewhere: click a widget to open its full view.
 *
 * Natural page flow: the page scrolls and every card shows its data —
 * nothing important hides behind an interaction.
 *
 * Performance: all derived data (member lookups, filters, next event,
 * activity feed) comes from memoized selectors in dashboardSelectors.ts, so
 * re-renders are cheap until the underlying arrays actually change.
 */
export default function DashboardView({
  data,
  currentUser,
  onRefresh,
  setLoading,
  insights,
  updateInsights,
  isAiLoading,
  ThinkingIndicator,
  updateSummary,
  teams,
  onboardingState,
  onContinueSetup,
  onDismissChecklist,
  hiddenDates,
}: DashboardViewProps) {
  const navigate = useNavigate();
  // Stable string dep for the memo below; the feed window uses Date.now()
  // inside the selector so tests can pin it.
  const today = format(new Date(), 'yyyy-MM-dd');

  const attendance = data.attendance ?? EMPTY_ATTENDANCE;
  const events = data.events ?? EMPTY_EVENTS;

  const derived = useDashboardData(
    data,
    (teams ?? EMPTY_TEAMS) as DashboardTeam[],
    currentUser?.team_id,
    today,
  );

  // Stable callbacks for memoized children. (They still change when App
  // recreates updateSummary/updateInsights each render — fully stabilizing
  // those is part of the App.tsx split.)
  const onRefreshSummary = useCallback(() => updateSummary(true), [updateSummary]);
  const onRefreshInsights = useCallback(() => updateInsights(), [updateInsights]);

  // Keep referential stability for props the selectors don't already memoize.
  const summary = data.summary ?? null;

  return (
    <>
      {onboardingState && shouldShowChecklist(onboardingState) && (
        <div className="mb-3">
          <SetupChecklist
            state={onboardingState}
            onContinue={onContinueSetup}
            onDismiss={onDismissChecklist}
          />
        </div>
      )}

      <DashboardHeader
        userName={currentUser?.name}
        teamName={derived.myTeam?.name}
        teamNumber={derived.myTeam?.number}
      />

      <DashboardMetricRow
        presentCount={derived.presentCount}
        memberCount={(data.members ?? EMPTY_MEMBERS).length}
        hasSessionToday={derived.todayAttendance.length > 0}
        activeTaskCount={derived.activeTasks.length}
        overdueCount={derived.overdueCount}
        nextEvent={derived.nextEventLabel}
        totalBudget={derived.totalBudget}
        onNavigate={navigate}
      />

      <MyStatusStrip
        currentUser={currentUser}
        attendance={attendance}
        isLoading={false}
        setLoading={setLoading}
        isAiLoading={isAiLoading}
        ThinkingIndicator={ThinkingIndicator}
        onRefresh={onRefresh}
      />

      <BrunoBar />

      {/* Natural page flow — the page scrolls, every card shows its data. */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3 sm:gap-4 mt-3 sm:mt-4">
        <AttendanceTrend attendance={attendance} onNavigate={navigate} hiddenDates={hiddenDates} />
        <UpcomingTimeline events={events} onNavigate={navigate} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3 sm:gap-4 mt-3 sm:mt-4">
        <TeamActivity items={derived.activityItems} onNavigate={navigate} />
        <TeamPerformance onNavigate={navigate} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3 sm:gap-4 mt-3 sm:mt-4">
        <TeamSummary
          summary={summary}
          insights={insights}
          isAiLoading={isAiLoading}
          ThinkingIndicator={ThinkingIndicator}
          onRefreshSummary={onRefreshSummary}
          onRefreshInsights={onRefreshInsights}
        />
        <AccessCodeCard team={derived.myTeam} setLoading={setLoading} onRefresh={onRefresh} />
      </div>
    </>
  );
}

// Re-exported for tests and future consumers.
export { useDashboardData };
export type { DashboardData };
