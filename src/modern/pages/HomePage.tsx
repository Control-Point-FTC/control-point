// Modern Home (phase 3). Rebuilt from scratch on the shadcn kit; reuses the
// same data, selectors and handlers as the Legacy dashboards:
//   useDashboardData (selectors), useSelfReport (check-in), useMyWork (my tasks
//   + attendance), buildAttendanceSeries (pulse chart), useFtcTeam (season),
//   updateSummary / updateInsights (briefing), openBruno (Ask Bruno).
// Admin and member dashboards are one layout; admin-only sections are gated
// exactly like the Legacy split (isAdmin).
import { useMemo, useState } from 'react';
import { attendanceInsight } from '../../components/dashboard/attendanceInsight';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import {
  AtSign, CalendarDays, CheckCircle2, CircleDot, Clock, ListTodo, LogOut, MapPin, RefreshCw, Sparkles,
  Trophy, UserCheck, Wallet, Users, ArrowUpRight, Compass, ChevronRight, CalendarCheck, PartyPopper, Plus,
} from 'lucide-react';
import { cn } from '../../components/cn';
import {
  Badge, Button, Checkbox, Dialog, DialogContent,
  DialogDescription, DialogFooter, DialogHeader, DialogTitle, Label, Textarea, ToggleGroup, ToggleGroupItem,
  Accordion, AccordionContent, AccordionItem, AccordionTrigger, Skeleton,
} from '../../components/ui-kit';
import { BrunoMarkdown } from '../../components/BrunoMarkdown';
import { useDashboardData, type DashboardTeam } from '../../components/dashboard/dashboardSelectors';
import { activityWhen, type ActivityItem } from '../../components/dashboard/TeamActivity';
import { useSelfReport } from '../../components/dashboard/useSelfReport';
import { useMyWork } from '../../components/dashboard/useMyWork';
import { checklistItems, shouldShowChecklist } from '../../components/onboarding/onboardingState';
import { useFtcTeam } from '../../components/FtcStats';
import { openBruno } from '../../services/brunoContext';
import { notifMeta } from '../notifications';
import { AnimatedValue } from '../AnimatedValue';
import { useDraft } from '../drafts';
import { Page, PageHeader, Section, EmptyState } from '../ui/page';
import { AttendanceArea } from '../ui/AttendanceArea';
import { Stagger, StaggerItem, Reveal } from '../ui/motion';
import { useTheme } from '../../hooks/useTheme';
import { Countdown, useHalfMinuteTick, useNow } from '../ui/Countdown';
import { dueMoment } from '../../utils/countdown';

const ACTIVITY_ROUTE: Record<ActivityItem['kind'], string> = {
  task: '/tasks', event: '/calendar', attendance: '/attendance', member: '/teams', budget: '/budget',
};
const ACTIVITY_ICON: Record<ActivityItem['kind'], typeof ListTodo> = {
  task: ListTodo, event: CalendarDays, attendance: UserCheck, member: Users, budget: Wallet,
};

export interface HomePageProps {
  [k: string]: any;
  notifications: any[];
  unreadMentions: number;
}

export function HomePage(props: HomePageProps) {
  const {
    teams, members, attendance, tasks, setTasks, events, budget, currentUser, isAdmin, hiddenDates,
    setAttendance, setLoading, onRefresh, onRequestComplete, summary, insights, isAiLoading,
    updateSummary, updateInsights, onboardingState, onContinueSetup, onDismissChecklist, notifications,
    activeChannelId, hasScope,
  } = props;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const today = format(new Date(), 'yyyy-MM-dd');

  const derived = useDashboardData(
    { members: members ?? [], attendance: attendance ?? [], tasks: tasks ?? [], events: events ?? [], budget: budget ?? [], summary },
    (teams ?? []) as DashboardTeam[],
    currentUser?.team_id,
    today,
  );
  // Overdue counts use the full deadline (date + time): re-check every 30 s.
  useHalfMinuteTick();
  const mine = useMyWork({ tasks: tasks ?? [], setTasks, attendance: attendance ?? [], events: events ?? [], currentUser, onRequestComplete });
  const self = useSelfReport({
    currentUser, attendance: attendance ?? [], setAttendance, setLoading, onRefresh,
    absenceLoggedMessage: t('dashboard.absenceLogged'),
  });

  const h = new Date().getHours();
  const greet = h >= 5 && h < 12 ? t('dashboard.greetMorning') : h >= 12 && h < 17 ? t('dashboard.greetAfternoon') : h >= 17 && h < 22 ? t('dashboard.greetEvening') : t('dashboard.greetHello');
  const first = String(currentUser?.name || '').split(' ')[0];
  const teamName = derived.myTeam?.name || t('dashboard.yourTeam');

  return (
    <Page>
      <PageHeader
        eyebrow={format(new Date(), 'EEEE, MMMM d')}
        title={first ? `${greet}, ${first}` : greet}
        description={`${teamName}${derived.myTeam?.number ? ` · Team ${derived.myTeam.number}` : ''}`}
        actions={
          <>
            <CheckInControl self={self} />
            {/* Always here (audit V3-M2): a fixed way to add a task, never a rotating suggestion. */}
            {hasScope?.('tasks') && (
              <Button variant="outline" onClick={() => navigate('/tasks?new=1')}>
                <Plus /> New task
              </Button>
            )}
            {/* The Dashboard's one primary action (audit UX-7). */}
            <Button onClick={() => openBruno()} className="hidden sm:inline-flex">
              <Sparkles /> Ask Bruno <kbd className="ml-1 rounded border border-current/30 px-1 text-[11px] font-medium opacity-70">⌘J</kbd>
            </Button>
          </>
        }
      />

      <div className="grid gap-x-12 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <NeedsAttention
            overdue={mine.overdueMine}
            notifications={notifications}
            activeChannelId={activeChannelId}
            checkedIn={!!self.myStatus}
            checklist={onboardingState && shouldShowChecklist(onboardingState) ? checklistItems(onboardingState) : []}
            onContinueSetup={onContinueSetup}
            onDismissChecklist={onDismissChecklist}
          />

          {isAdmin ? (
            <Section title="Team pulse" description="Today at a glance" delay={0.08}
              action={<Button variant="ghost" size="sm" onClick={() => navigate('/attendance')}>Attendance <ArrowUpRight /></Button>}>
              <PulseStats
                present={derived.presentCount}
                memberCount={(members ?? []).length}
                hasSession={derived.todayAttendance.length > 0}
                openTasks={derived.activeTasks.length}
                overdue={derived.overdueCount}
                budget={derived.totalBudget}
                onNavigate={navigate}
              />
              <PulseChart attendance={attendance ?? []} hiddenDates={hiddenDates} events={events ?? []} />
              <AttendanceInsightCard attendance={attendance ?? []} members={members ?? []} hiddenDates={hiddenDates ?? []} today={mine.today} onNavigate={navigate} />
            </Section>
          ) : (
            <MyWork mine={mine} onNavigate={navigate} />
          )}

          <Section title="Activity" description="What the team has been up to" delay={0.12}>
            {derived.activityItems.length === 0 ? (
              <EmptyState icon={Compass} title="Nothing yet" description="New tasks, events and check-ins will show up here." />
            ) : (
              <Stagger as="ol" className="relative ml-3 border-l border-border">
                {derived.activityItems.slice(0, 8).map((item, i) => {
                  const Icon = ACTIVITY_ICON[item.kind];
                  return (
                    <StaggerItem as="li" key={i} className="relative pb-5 pl-6 last:pb-0">
                      <span className="absolute -left-[13px] top-0 flex size-6 items-center justify-center rounded-full border border-border bg-background">
                        <Icon className="size-3 text-muted-foreground" />
                      </span>
                      <button
                        type="button"
                        onClick={() => navigate(ACTIVITY_ROUTE[item.kind])}
                        className="group block w-full rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                      >
                        <p className="text-sm text-foreground">
                          {item.title}{item.detail && <span className="font-medium"> {item.detail}</span>}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          {activityWhen(item, t)}
                          <ChevronRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
                        </p>
                      </button>
                    </StaggerItem>
                  );
                })}
              </Stagger>
            )}
          </Section>
        </div>

        <aside className="min-w-0">
          <ThisWeek events={mine.upcomingEvents} allEvents={events ?? []} dayLabel={mine.dayLabel} onNavigate={navigate} />
          <Season onNavigate={navigate} isAdmin={isAdmin} />
          {isAdmin && (
            <Briefing
              summary={summary}
              insights={insights}
              isAiLoading={isAiLoading}
              onRefreshSummary={() => updateSummary?.()}
              onRefreshInsights={() => updateInsights?.()}
            />
          )}
        </aside>
      </div>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Check-in (header control)
// ---------------------------------------------------------------------------

function CheckInControl({ self }: { self: ReturnType<typeof useSelfReport> }) {
  const { t } = useTranslation();
  const [outOpen, setOutOpen] = useState(false);
  // Unsent absence reason survives a mode switch (shared draft store).
  const [reason, setReason] = useDraft<string>('home:absence-reason', '');
  const status = self.myStatus?.status as string | undefined;
  const value = status === 'P' ? 'P' : status === 'L' ? 'L' : status === 'U' || status === 'A' || status === 'E' ? 'O' : '';

  if (status && status !== '-') {
    const label = status === 'P' ? t('dashboard.statusPresent') : status === 'L' ? t('dashboard.statusLate')
      : status === 'E' ? t('dashboard.statusExcused') : status === 'A' ? t('dashboard.statusAbsent') : t('dashboard.statusOther');
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border px-2.5 h-9">
        <span className={cn('size-2 rounded-full', status === 'P' ? 'bg-success' : status === 'L' ? 'bg-warning' : 'bg-destructive')} />
        <span className="text-sm font-medium">{label}</span>
        <Button variant="ghost" size="sm" className="-mr-1 h-7 px-2 text-muted-foreground" onClick={() => void self.report('-')} disabled={self.saving}>
          Undo
        </Button>
      </div>
    );
  }

  return (
    <>
      <ToggleGroup
        type="single"
        value={value}
        aria-label="Check in for today"
        onValueChange={(v) => {
          if (!v) return;
          if (v === 'O') setOutOpen(true);
          else void self.report(v);
        }}
        className="h-9"
      >
        <ToggleGroupItem value="P" disabled={self.saving} aria-label={t('dashboard.imHere')}><CheckCircle2 /> <span className="hidden sm:inline">{t('dashboard.imHere')}</span></ToggleGroupItem>
        <ToggleGroupItem value="L" disabled={self.saving} aria-label={t('dashboard.statusLate')}><Clock /> <span className="hidden sm:inline">{t('dashboard.statusLate')}</span></ToggleGroupItem>
        <ToggleGroupItem value="O" disabled={self.saving} aria-label={t('dashboard.out')}><LogOut /> <span className="hidden sm:inline">{t('dashboard.out')}</span></ToggleGroupItem>
      </ToggleGroup>
      <Dialog open={outOpen} onOpenChange={setOutOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dashboard.logAbsence')}</DialogTitle>
            <DialogDescription>{t('dashboard.absenceWhy')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="absence-reason">Reason</Label>
            <Textarea id="absence-reason" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('dashboard.absenceReasonPlaceholder')} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOutOpen(false)}>{t('common.cancel')}</Button>
            <Button
              disabled={!reason.trim() || self.saving}
              onClick={async () => { const ok = await self.report('O', reason); if (ok) { setOutOpen(false); setReason(''); } }}
            >
              {t('dashboard.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Needs attention
// ---------------------------------------------------------------------------

function NeedsAttention({ overdue, notifications, activeChannelId, checkedIn, checklist, onContinueSetup, onDismissChecklist }: {
  overdue: any[];
  notifications: any[];
  activeChannelId: number | null;
  checkedIn: boolean;
  checklist: { id: string; title: string; description: string; status: string }[];
  onContinueSetup?: () => void;
  onDismissChecklist?: () => void;
}) {
  const navigate = useNavigate();
  const mentions = (notifications || []).filter((n) => !n.is_read && n.type === 'mention' && Number(notifMeta(n).channel_id) !== Number(activeChannelId));
  const setupLeft = checklist.filter((c) => c.status !== 'done');
  const rows: { key: string; icon: typeof ListTodo; tone?: 'bad' | 'accent'; title: string; detail?: string; action: string; onAction: () => void }[] = [];
  if (!checkedIn) rows.push({ key: 'checkin', icon: CalendarCheck, tone: 'accent', title: "You haven't checked in today", detail: 'Use the check-in control above, or scan the QR code.', action: 'Open attendance', onAction: () => navigate('/attendance') });
  for (const tk of overdue.slice(0, 4)) rows.push({ key: `t${tk.id}`, icon: ListTodo, tone: 'bad', title: tk.title, detail: `Overdue · due ${format(new Date(String(tk.due_date).slice(0, 10) + 'T12:00:00'), 'MMM d')}`, action: 'Open', onAction: () => navigate('/tasks') });
  if (overdue.length > 4) rows.push({ key: 'more', icon: ListTodo, tone: 'bad', title: `${overdue.length - 4} more overdue tasks`, action: 'View all', onAction: () => navigate('/tasks') });
  if (mentions.length) rows.push({ key: 'mentions', icon: AtSign, tone: 'accent', title: `${mentions.length} unread mention${mentions.length === 1 ? '' : 's'}`, detail: mentions[0]?.content, action: 'Open inbox', onAction: () => navigate('/inbox') });
  if (setupLeft.length) rows.push({ key: 'setup', icon: Compass, title: 'Finish setting up', detail: setupLeft.map((c) => c.title).join(' · '), action: 'Continue', onAction: () => onContinueSetup?.() });

  return (
    <Section title="Needs attention" delay={0.04}
      action={setupLeft.length && onDismissChecklist ? <Button variant="ghost" size="sm" onClick={onDismissChecklist}>Hide setup</Button> : undefined}>
      {rows.length === 0 ? (
        <Reveal>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5">
            <PartyPopper className="size-5 text-success" />
            <div>
              <p className="text-sm font-medium">You're all caught up</p>
              <p className="text-xs text-muted-foreground">No overdue tasks, mentions or setup steps.</p>
            </div>
          </div>
        </Reveal>
      ) : (
        <Stagger as="ul" className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {rows.map((r) => (
            <StaggerItem as="li" key={r.key}>
              {/* The whole row is the action: a full-width touch target. */}
              <button
                type="button"
                onClick={r.onAction}
                className="group flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted/60"
              >
                <span className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full',
                  r.tone === 'bad' ? 'bg-destructive/10 text-destructive' : r.tone === 'accent' ? 'bg-accent/15 text-accent' : 'bg-muted text-muted-foreground',
                )}>
                  <r.icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{r.title}</span>
                  {r.detail && <span className="block truncate text-xs text-muted-foreground">{r.detail}</span>}
                </span>
                <span className="hidden shrink-0 items-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors group-hover:border-foreground/20 sm:inline-flex">{r.action}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground sm:hidden" aria-hidden="true" />
              </button>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Team pulse (admins)
// ---------------------------------------------------------------------------

function PulseStats({ present, memberCount, hasSession, openTasks, overdue, budget, onNavigate }: {
  present: number; memberCount: number; hasSession: boolean; openTasks: number; overdue: number; budget: number;
  onNavigate: (p: string) => void;
}) {
  const fmtMoney = (n: number) => `$${(Math.round(n * 100) / 100).toLocaleString()}`;
  const items = [
    { label: 'Checked in', value: hasSession ? `${present}/${memberCount}` : '0', to: hasSession ? undefined : 0, hint: hasSession ? 'present or late today' : `${memberCount} ${memberCount === 1 ? 'member' : 'members'} · no session yet`, path: '/attendance' },
    { label: 'Open tasks', value: String(openTasks), hint: overdue ? `${overdue} overdue` : 'all on track', tone: overdue ? 'bad' : undefined, path: '/tasks' },
    { label: 'Budget', value: fmtMoney(budget), to: budget, format: fmtMoney, hint: 'net balance', tone: budget < 0 ? 'bad' : 'good', path: '/budget' },
  ] as const;
  return (
    <div className="grid grid-cols-3 divide-x divide-border">
      {items.map((it, i) => (
        <button
          key={it.label}
          type="button"
          onClick={() => onNavigate(it.path)}
          className={cn('group min-w-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60 rounded-sm', i === 0 ? 'pr-4' : 'px-4')}
        >
          <p className="text-sm text-muted-foreground transition-colors group-hover:text-foreground">{it.label}</p>
          <p className={cn('mt-1 font-display text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl',
            'tone' in it && it.tone === 'bad' ? 'text-destructive' : 'tone' in it && it.tone === 'good' ? 'text-success' : 'text-foreground')}>
            <AnimatedValue value={it.value} to={'to' in it ? it.to : undefined} format={'format' in it ? it.format : undefined} />
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{it.hint}</p>
        </button>
      ))}
    </div>
  );
}

function PulseChart(props: { attendance: any[]; hiddenDates?: string[]; events: any[] }) {
  return (
    <div className="mt-6">
      <p className="mb-2 text-xs text-muted-foreground">Check-ins over the last 14 meeting days</p>
      <AttendanceArea {...props} id="home-pulse" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// My work (members)
// ---------------------------------------------------------------------------

function MyWork({ mine, onNavigate }: { mine: ReturnType<typeof useMyWork>; onNavigate: (p: string) => void }) {
  return (
    <Section title="My work" description="Tasks assigned to you" delay={0.08}
      action={<Button variant="ghost" size="sm" onClick={() => onNavigate('/tasks')}>All tasks <ArrowUpRight /></Button>}>
      <div className="mb-5 grid grid-cols-3 divide-x divide-border">
        <div className="pr-4"><p className="text-sm text-muted-foreground">Open</p><p className="mt-1 font-display text-3xl font-semibold tabular-nums"><AnimatedValue value={String(mine.openTasks.length)} /></p></div>
        <div className="px-4"><p className="text-sm text-muted-foreground">Overdue</p><p className={cn('mt-1 font-display text-3xl font-semibold tabular-nums', mine.overdueMine.length && 'text-destructive')}><AnimatedValue value={String(mine.overdueMine.length)} /></p></div>
        <div className="px-4"><p className="text-sm text-muted-foreground">Attendance</p><p className="mt-1 font-display text-3xl font-semibold tabular-nums">{mine.attendanceRate == null ? '—' : <AnimatedValue value={`${mine.attendanceRate}%`} />}</p></div>
      </div>
      {mine.openTasks.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="Nothing assigned to you" description="When someone assigns you a task it shows up here." />
      ) : (
        <Stagger as="ul" className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {mine.openTasks.slice(0, 6).map((tk: any) => (
            <StaggerItem as="li" key={tk.id} className="flex items-center gap-3 px-4 py-3">
              <Checkbox
                checked={tk.status === 'done'}
                onCheckedChange={() => void mine.toggleTask(tk)}
                aria-label={`Mark "${tk.title}" done`}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">{tk.title}</p>
                {tk.due_date && <DueLine date={tk.due_date} time={tk.due_time} />}
              </div>
              <Badge variant={tk.status === 'in-progress' ? 'soft' : 'secondary'}>{tk.status === 'in-progress' ? 'In progress' : 'To do'}</Badge>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Right rail: this week, season, briefing
// ---------------------------------------------------------------------------

/** "Due Oct 9, 3:30 PM · in 1d 04:12:09" — ticks every second (owner spec). */
function DueLine({ date, time }: { date: string; time?: string | null }) {
  const at = dueMoment(date, time);
  if (!at) return null;
  const label = format(at, time ? 'MMM d, h:mm a' : 'MMM d');
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
      <span>Due {label}</span><span aria-hidden="true">·</span><Countdown to={at} />
    </p>
  );
}

/** The next event that hasn't started yet, with a live countdown. */
function NextEvent({ events }: { events: any[] }) {
  const now = useNow();
  const next = events
    .map((e) => ({ e, at: dueMoment(e.date, e.start_time || e.time || '00:00') }))
    .filter((x): x is { e: any; at: Date } => !!x.at && x.at.getTime() > now)
    .sort((a, b) => a.at.getTime() - b.at.getTime())[0];
  if (!next) return null;
  return (
    <p className="mb-3 flex flex-wrap items-baseline gap-x-1.5 rounded-lg bg-muted/50 px-3 py-2 text-sm">
      <span className="text-muted-foreground">Next:</span>
      <span className="min-w-0 truncate font-medium">{next.e.title}</span>
      <Countdown to={next.at} className="text-accent" />
    </p>
  );
}

/** Turnout trend, who's missed meetings in a row, best streak (admins). */
function AttendanceInsightCard({ attendance, members, hiddenDates, today, onNavigate }: {
  attendance: any[]; members: any[]; hiddenDates: string[]; today: string; onNavigate: (p: string) => void;
}) {
  const ins = useMemo(() => attendanceInsight(attendance, members, hiddenDates, today), [attendance, members, hiddenDates, today]);
  if (ins.thisWeekRate == null && !ins.missingInARow.length && !ins.bestStreak) return null;
  const delta = ins.thisWeekRate != null && ins.lastWeekRate != null ? ins.thisWeekRate - ins.lastWeekRate : null;
  return (
    <section aria-label="Attendance insight" className="mt-4 grid gap-2 rounded-xl border border-border bg-muted/30 p-3 text-sm">
      {ins.thisWeekRate != null && (
        <p>
          <span className="font-semibold">{ins.thisWeekRate}%</span> turnout this week
          {delta != null && delta !== 0 && (
            <span className={cn('ml-1.5 text-xs', delta > 0 ? 'text-success' : 'text-destructive')}>
              {delta > 0 ? '▲' : '▼'} {Math.abs(delta)} pts vs last week
            </span>
          )}
        </p>
      )}
      {ins.missingInARow.length > 0 && (
        <p className="text-muted-foreground">
          Check in on{' '}
          {ins.missingInARow.slice(0, 3).map((m, i) => (
            <span key={m.id}>{i > 0 && ', '}<span className="font-medium text-foreground">{m.name}</span> ({m.misses} missed)</span>
          ))}
          {ins.missingInARow.length > 3 && ` and ${ins.missingInARow.length - 3} more`}
          {' '}<button type="button" className="text-xs font-medium text-foreground underline underline-offset-4" onClick={() => onNavigate('/attendance')}>See attendance</button>
        </p>
      )}
      {ins.bestStreak && (
        <p className="text-muted-foreground">Best streak: <span className="font-medium text-foreground">{ins.bestStreak.name}</span>, {ins.bestStreak.days} meetings in a row</p>
      )}
    </section>
  );
}

function ThisWeek({ events, allEvents, dayLabel, onNavigate }: { events: any[]; allEvents: any[]; dayLabel: (d: string) => string; onNavigate: (p: string) => void }) {
  return (
    <Section title="This week" delay={0.06}
      action={<Button variant="ghost" size="sm" onClick={() => onNavigate('/calendar')} aria-label="Open calendar"><CalendarDays /></Button>}>
      {/* From the whole schedule: the listed five may all have started already. */}
      <NextEvent events={allEvents} />
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing scheduled.</p>
      ) : (
        <Stagger as="ul" className="space-y-3">
          {events.map((e: any) => (
            <StaggerItem as="li" key={e.id}>
              <button type="button" onClick={() => onNavigate('/calendar')} className="group flex w-full gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
                <span className="flex w-11 shrink-0 flex-col items-center rounded-lg border border-border py-1">
                  <span className="text-[11px] font-medium uppercase leading-none text-accent">{format(new Date(e.date + 'T12:00:00'), 'MMM')}</span>
                  <span className="mt-0.5 font-display text-lg font-semibold leading-none">{format(new Date(e.date + 'T12:00:00'), 'd')}</span>
                </span>
                <span className="min-w-0 pt-0.5">
                  <span className="block truncate text-sm font-medium text-foreground group-hover:underline">{e.title}</span>
                  <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    {dayLabel(e.date)}{e.time ? ` · ${e.time}` : ''}
                    {e.location && <><MapPin className="ml-1 size-3" />{e.location}</>}
                  </span>
                </span>
              </button>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </Section>
  );
}

function Season({ onNavigate, isAdmin }: { onNavigate: (p: string) => void; isAdmin: boolean }) {
  const ftc = useFtcTeam();
  return (
    <Section title="Season" delay={0.1}>
      {ftc.loading ? (
        <div className="space-y-2"><Skeleton className="h-5 w-40" /><Skeleton className="h-16" /></div>
      ) : ftc.notConnected ? (
        <div className="text-sm text-muted-foreground">
          {isAdmin ? 'Connect your FTC team to see season stats.' : 'Your admin hasn’t connected an FTC team yet.'}
          {isAdmin && <Button variant="link" className="ml-1 h-auto p-0" onClick={() => onNavigate('/settings?section=workspace')}>Connect</Button>}
        </div>
      ) : ftc.data ? (
        <div>
          <p className="flex items-center gap-2 text-sm">
            <Trophy className="size-4 text-accent" />
            <span className="font-medium">#{ftc.data.number}</span>
            <span className="truncate text-muted-foreground">{ftc.data.name}</span>
          </p>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
            {([['Total OPR', ftc.data.opr?.tot], ['Auto', ftc.data.opr?.auto], ['TeleOp', ftc.data.opr?.dc], ['Endgame', ftc.data.opr?.eg]] as const).map(([label, st]: any) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="font-display text-lg font-semibold tabular-nums">{st?.value ?? '—'} {st?.rank != null && <span className="text-xs font-normal text-muted-foreground">#{Number(st.rank).toLocaleString()}</span>}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Button size="sm" variant="outline" className="flex-1" onClick={() => onNavigate('/stats')}><Trophy /> Stats</Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={() => onNavigate('/predict')}><Sparkles /> Predict</Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{ftc.error || 'Stats unavailable.'} <Button variant="link" className="h-auto p-0" onClick={ftc.refresh}>Retry</Button></p>
      )}
    </Section>
  );
}

function Briefing({ summary, insights, isAiLoading, onRefreshSummary, onRefreshInsights }: {
  summary?: string; insights: string | null; isAiLoading: boolean; onRefreshSummary: () => void; onRefreshInsights: () => void;
}) {
  const { theme } = useTheme();
  const prose = cn('prose prose-sm max-w-none text-sm text-foreground/90', theme !== 'light' && 'prose-invert');
  return (
    <Section title="Briefing" description="Bruno's read on the team" delay={0.14}>
      <Accordion type="single" collapsible defaultValue={summary ? 'summary' : undefined}>
        <AccordionItem value="summary">
          <AccordionTrigger>Team summary</AccordionTrigger>
          <AccordionContent>
            {summary ? <div className={prose}><BrunoMarkdown>{summary}</BrunoMarkdown></div>
              : <p className="text-muted-foreground">No summary yet.</p>}
            <Button size="sm" variant="outline" className="mt-3" disabled={isAiLoading} onClick={onRefreshSummary}>
              <RefreshCw className={cn(isAiLoading && 'animate-spin')} /> {summary ? 'Refresh' : 'Generate'}
            </Button>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="insights">
          <AccordionTrigger>Attendance insights</AccordionTrigger>
          <AccordionContent>
            {insights ? <div className={prose}><BrunoMarkdown>{insights}</BrunoMarkdown></div>
              : <p className="text-muted-foreground">Ask Bruno to analyze recent attendance.</p>}
            <Button size="sm" variant="outline" className="mt-3" disabled={isAiLoading} onClick={onRefreshInsights}>
              <CircleDot /> {insights ? 'Refresh' : 'Analyze'}
            </Button>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Section>
  );
}
