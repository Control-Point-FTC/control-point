import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { SetupChecklist, shouldShowChecklist } from '../onboarding';
import DashboardHeader from './DashboardHeader';
import DashboardMetricRow from './DashboardMetricRow';
import MyStatusStrip from './MyStatusStrip';
import AttendanceTrend from './AttendanceTrend';
import TeamActivity, { type ActivityItem } from './TeamActivity';
import UpcomingTimeline from './UpcomingTimeline';
import TeamSummary from './TeamSummary';
import TeamPerformance from './TeamPerformance';
import AccessCodeCard from './AccessCodeCard';

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
}

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
}: DashboardViewProps) {
  const navigate = useNavigate();
  const today = format(new Date(), 'yyyy-MM-dd');

  // ── operational data ──────────────────────────────────────
  const members = data.members || [];
  const tasks = data.tasks || [];
  const events = data.events || [];
  const budget = data.budget || [];
  const memberName = (id: any) => members.find((m: any) => m.id === id)?.name || 'Someone';

  const todayAttendance = data.attendance?.filter((r: any) => r.date === today) || [];
  const presentCount = todayAttendance.filter((r: any) => r.status === 'P' || r.status === 'L').length;

  const activeTasks = tasks.filter((t: any) => t.status !== 'done');
  const overdueCount = activeTasks.filter((t: any) => t.due_date && t.due_date < today).length;

  const nextEvent = events
    .filter((e: any) => e.date >= today)
    .sort((a: any, b: any) =>
      String(a.date).localeCompare(String(b.date)) ||
      String(a.start_time || '').localeCompare(String(b.start_time || '')))[0];

  const nextEventLabel = nextEvent
    ? {
        title: nextEvent.title,
        dateLabel:
          nextEvent.date === today
            ? `Today${nextEvent.start_time ? ` · ${nextEvent.start_time}` : ''}`
            : `${format(new Date(nextEvent.date + 'T12:00:00'), 'EEE, MMM d')}${nextEvent.start_time ? ` · ${nextEvent.start_time}` : ''}`,
      }
    : null;

  const totalBudget = budget.reduce((acc: number, item: any) =>
    item.type === 'income' ? acc + item.amount : acc - item.amount, 0) || 0;

  const myTeam = (teams || []).find((t: any) => t.id === currentUser?.team_id);

  // ── team activity feed (last 7 days) ──────────────────────
  const weekAgoMs = Date.now() - 7 * 864e5;
  const feed: ActivityItem[] = [];

  tasks.forEach((t: any) => {
    if (t.completed_at && new Date(t.completed_at).getTime() >= weekAgoMs) {
      feed.push({
        kind: 'task',
        title: `${memberName(t.assigned_to)} completed "${t.title}"`,
        ts: t.completed_at,
      });
    } else if (t.created_at && new Date(t.created_at).getTime() >= weekAgoMs) {
      feed.push({
        kind: 'task',
        title: `New task: "${t.title}"`,
        detail: t.assigned_to ? `Assigned to ${memberName(t.assigned_to)}` : undefined,
        ts: t.created_at,
      });
    }
  });

  events.forEach((e: any) => {
    if (e.created_at && new Date(e.created_at).getTime() >= weekAgoMs) {
      feed.push({
        kind: 'event',
        title: 'A new event was added:',
        detail: e.title,
        ts: e.created_at,
      });
    }
  });

  if (todayAttendance.length > 0) {
    feed.push({
      kind: 'attendance',
      title: "Attendance was recorded for today's session",
      detail: `${presentCount} of ${todayAttendance.length} ${todayAttendance.length === 1 ? 'member' : 'members'} present`,
      dateOnly: today,
    });
  }

  members.forEach((m: any) => {
    if (m.created_at && new Date(m.created_at).getTime() >= weekAgoMs) {
      feed.push({
        kind: 'member',
        title: `${m.name} joined the team workspace`,
        ts: m.created_at,
      });
    }
  });

  budget.forEach((b: any) => {
    if (b.date && b.date >= format(new Date(weekAgoMs), 'yyyy-MM-dd')) {
      feed.push({
        kind: 'budget',
        title: `Budget ${b.type === 'income' ? 'income' : 'transaction'} added:`,
        detail: `${b.description || b.category || 'Transaction'} · $${Number(b.amount || 0).toLocaleString()}`,
        dateOnly: b.date,
      });
    }
  });

  feed.sort((a, b) => {
    const ta = a.ts ? new Date(a.ts).getTime() : a.dateOnly ? new Date(a.dateOnly + 'T23:59:59').getTime() : 0;
    const tb = b.ts ? new Date(b.ts).getTime() : b.dateOnly ? new Date(b.dateOnly + 'T23:59:59').getTime() : 0;
    return tb - ta;
  });
  const activityItems = feed.slice(0, 12);

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
        teamName={myTeam?.name}
        teamNumber={myTeam?.number}
      />

      <DashboardMetricRow
        presentCount={presentCount}
        memberCount={members.length}
        hasSessionToday={todayAttendance.length > 0}
        activeTaskCount={activeTasks.length}
        overdueCount={overdueCount}
        nextEvent={nextEventLabel}
        totalBudget={totalBudget}
        onNavigate={navigate}
      />

      <MyStatusStrip
        currentUser={currentUser}
        attendance={data.attendance || []}
        isLoading={false}
        setLoading={setLoading}
        isAiLoading={isAiLoading}
        ThinkingIndicator={ThinkingIndicator}
        onRefresh={onRefresh}
      />

      {/* Natural page flow — the page scrolls, every card shows its data. */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3 sm:gap-4 mt-3 sm:mt-4">
        <AttendanceTrend attendance={data.attendance || []} onNavigate={navigate} />
        <UpcomingTimeline events={events} onNavigate={navigate} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3 sm:gap-4 mt-3 sm:mt-4">
        <TeamActivity items={activityItems} onNavigate={navigate} />
        <TeamPerformance onNavigate={navigate} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3 sm:gap-4 mt-3 sm:mt-4">
        <TeamSummary
          summary={data.summary}
          insights={insights}
          isAiLoading={isAiLoading}
          ThinkingIndicator={ThinkingIndicator}
          onRefreshSummary={() => updateSummary(true)}
          onRefreshInsights={() => updateInsights()}
        />
        <AccessCodeCard team={myTeam} setLoading={setLoading} onRefresh={onRefresh} />
      </div>
    </>
  );
}
