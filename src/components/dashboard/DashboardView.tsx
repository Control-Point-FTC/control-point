import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { apiFetch } from '../../services/api';
import { SetupChecklist, shouldShowChecklist } from '../onboarding';
import DashboardHeader from './DashboardHeader';
import DashboardMetricRow from './DashboardMetricRow';
import NeedsAttention from './NeedsAttention';
import UpcomingTimeline from './UpcomingTimeline';
import TeamActivity from './TeamActivity';
import MyStatusCard from './MyStatusCard';
import TeamSummary from './TeamSummary';
import CompetitionSnapshot from './CompetitionSnapshot';

interface DashboardViewProps {
  data: any;
  currentUser: any;
  onRefresh: () => void;
  setLoading: (v: boolean) => void;
  insights: string | null;
  updateInsights: () => void;
  isAiLoading: boolean;
  ThinkingIndicator: any;
  updateSummary: () => void;
  teams: any[];
  onboardingState: any;
  onContinueSetup: () => void;
  onDismissChecklist: () => void;
  inventory: any[];
  setTasks?: (fn: any) => void;
}

/**
 * The admin dashboard, composed from focused components:
 *
 *   <DashboardHeader />        — who / which team / what day
 *   <DashboardMetricRow />     — attendance, open tasks, up next, needs action
 *   <NeedsAttention />         — what needs a decision right now
 *   <UpcomingTimeline />       — what's coming, grouped by day
 *   <TeamActivity />           — what the team did this week
 *   <MyStatusCard />           — your own check-in
 *   <TeamSummary />            — Bruno's operational overview
 *   <CompetitionSnapshot />    — compact FTC headline numbers
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
  inventory,
  setTasks,
}: DashboardViewProps) {
  const navigate = useNavigate();
  const today = format(new Date(), 'yyyy-MM-dd');

  // ── operational data ──────────────────────────────────────
  const members = data.members || [];
  const tasks = data.tasks || [];
  const events = data.events || [];
  const stock = inventory || [];

  const todayAttendance = data.attendance?.filter((r: any) => r.date === today) || [];
  const presentCount = todayAttendance.filter((r: any) => r.status === 'P' || r.status === 'L').length;

  const activeTasks = tasks.filter((t: any) => t.status !== 'done');
  const overdueTasks = activeTasks
    .filter((t: any) => t.due_date && t.due_date < today)
    .sort((a: any, b: any) => String(a.due_date).localeCompare(String(b.due_date)));

  const lowStock = stock
    .filter((i: any) => (i.quantity ?? 0) <= 2)
    .sort((a: any, b: any) => (a.quantity ?? 0) - (b.quantity ?? 0))
    .slice(0, 4);

  const missingCheckin = todayAttendance.length > 0
    ? members.filter((m: any) => !todayAttendance.some((r: any) => r.member_id === m.id) && m.id !== currentUser?.id)
    : [];

  const threeDays = format(new Date(Date.now() + 3 * 864e5), 'yyyy-MM-dd');
  const deadlinesSoon = activeTasks
    .filter((t: any) => t.due_date && t.due_date >= today && t.due_date <= threeDays)
    .sort((a: any, b: any) => String(a.due_date).localeCompare(String(b.due_date)))
    .slice(0, 4);

  const attentionCount =
    overdueTasks.length + lowStock.length + deadlinesSoon.length + (missingCheckin.length > 0 ? 1 : 0);

  const nextEvent = (events || [])
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

  // Recent team activity, derived client-side from the last 7 days.
  const weekAgoMs = Date.now() - 7 * 864e5;
  const activityItems: any[] = [];
  tasks.forEach((t: any) => {
    if (t.completed_at && new Date(t.completed_at).getTime() >= weekAgoMs) {
      activityItems.push({ kind: 'task', ts: t.completed_at, title: `Completed "${t.title}"`, when: format(new Date(t.completed_at), 'MMM d') });
    } else if (t.created_at && new Date(t.created_at).getTime() >= weekAgoMs) {
      activityItems.push({ kind: 'task', ts: t.created_at, title: `New task: "${t.title}"`, when: format(new Date(t.created_at), 'MMM d') });
    }
  });
  stock.forEach((i: any) => {
    if (i.date_added && new Date(i.date_added).getTime() >= weekAgoMs) {
      activityItems.push({ kind: 'inventory', ts: i.date_added, title: `Stocked ${i.name} ×${i.quantity ?? 0}`, when: format(new Date(i.date_added), 'MMM d') });
    }
  });
  members.forEach((m: any) => {
    if (m.created_at && new Date(m.created_at).getTime() >= weekAgoMs) {
      activityItems.push({ kind: 'member', ts: m.created_at, title: `${m.name} joined the team`, when: format(new Date(m.created_at), 'MMM d') });
    }
  });
  events.forEach((e: any) => {
    if (e.created_at && new Date(e.created_at).getTime() >= weekAgoMs) {
      activityItems.push({ kind: 'event', ts: e.created_at, title: `Event created: ${e.title}`, when: format(new Date(e.created_at), 'MMM d') });
    }
  });
  activityItems.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  const recentActivity = activityItems.slice(0, 8);

  // ── actions ───────────────────────────────────────────────
  const markTaskDone = async (task: any) => {
    if (!setTasks) { navigate('/tasks'); return; }
    const prev = tasks;
    setTasks((ts: any[]) => ts.map((t: any) =>
      t.id === task.id ? { ...t, status: 'done', completed_at: new Date().toISOString() } : t));
    try {
      const res = await apiFetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      });
      if (!res.ok) setTasks(prev);
      else onRefresh();
    } catch {
      setTasks(prev);
    }
  };

  const scrollToNeeds = () => {
    document.getElementById('needs-attention')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const myTeam = (teams || []).find((t: any) => t.id === currentUser?.team_id);

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
        overdueCount={overdueTasks.length}
        nextEvent={nextEventLabel}
        attentionCount={attentionCount}
        onNavigate={navigate}
        onNeedsAction={scrollToNeeds}
      />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 sm:gap-4">
        <NeedsAttention
          overdueTasks={overdueTasks.slice(0, 4)}
          lowStock={lowStock}
          missingCheckin={missingCheckin.slice(0, 4)}
          deadlinesSoon={deadlinesSoon}
          attentionCount={attentionCount}
          onMarkTaskDone={markTaskDone}
          onNavigate={navigate}
        />
        <UpcomingTimeline events={events} onNavigate={navigate} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 sm:gap-4 mt-3 sm:mt-4">
        <TeamActivity items={recentActivity} />
        <div className="xl:col-span-5 flex flex-col gap-3 sm:gap-4">
          <MyStatusCard
            currentUser={currentUser}
            attendance={data.attendance || []}
            isLoading={false}
            setLoading={setLoading}
            isAiLoading={isAiLoading}
            ThinkingIndicator={ThinkingIndicator}
            onRefresh={onRefresh}
          />
          <TeamSummary
            summary={data.summary}
            insights={insights}
            isAiLoading={isAiLoading}
            ThinkingIndicator={ThinkingIndicator}
            onRefreshSummary={() => updateSummary()}
            onRefreshInsights={() => updateInsights()}
          />
        </div>
      </div>

      <CompetitionSnapshot />
    </>
  );
}
