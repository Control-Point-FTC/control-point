// Modern Attendance (phase 4c). Rebuilt on the shadcn kit over the shared
// useAttendanceController (same endpoints, optimistic saves and meeting-day
// rules as Legacy). Admins (`attendance` scope): Today (QR session + roll
// call), Grid (popover status picker, keyboard entry, meeting days), History
// (per-day sheet) and Insights (trend, Bruno analysis, per-member rates).
// Everyone else gets the personal check-in view.
import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { motion } from 'motion/react';
import { CalendarDays, ChevronRight, Download, LayoutGrid, LineChart, ListChecks, RefreshCw, Sparkles, Sun } from 'lucide-react';
import { datedName, downloadCsv } from '../../../utils/csv';
import { cn } from '../../../components/cn';
import {
  Badge, Button, Progress, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Skeleton,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tabs, TabsContent, TabsList, TabsTrigger,
} from '../../../components/ui-kit';
import { useIsNarrow } from '../../../components/scout/ScoutUi';
import { BrunoMarkdown } from '../../../components/BrunoMarkdown';
import { useTheme } from '../../../hooks/useTheme';
import { parseLocalDate, useAttendanceController } from '../../../components/attendance/useAttendanceController';
import { Page, PageHeader, Section, EmptyState } from '../../ui/page';
import { Stagger, StaggerItem } from '../../ui/motion';
import { AttendanceArea } from '../../ui/AttendanceArea';
import { AnimatedValue } from '../../AnimatedValue';
import { MemberAvatar } from '../tasks/AssigneePicker';
import { QrCard } from './QrCard';
import { AttendanceGrid } from './AttendanceGrid';
import { StudentAttendance } from './StudentAttendance';
import { StatusPicker, statusLabel, statusStyle } from './status';

type Ctl = ReturnType<typeof useAttendanceController>;

export function AttendancePage(props: any) {
  const { members = [], attendance = [], events = [], refresh, hasScope, currentUser, onRefresh } = props;
  const ctl = useAttendanceController({ attendance, refresh, hasScope });
  const [tab, setTab] = useState('today');
  if (!ctl.isAdmin) return <StudentAttendance attendance={attendance} currentUser={currentUser} refresh={refresh} onRefresh={onRefresh} />;

  const today = format(new Date(), 'yyyy-MM-dd');
  const hereToday = members.filter((m: any) => ['P', 'L'].includes(ctl.getStatus(m.id, today))).length;

  return (
    <Page>
      <PageHeader
        eyebrow={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        title="Attendance"
        description={members.length ? `${hereToday} of ${members.length} here today` : 'Take attendance and run QR check-in.'}
      >
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="max-sm:w-full">
            <TabsTrigger value="today" className="max-sm:h-10 max-sm:flex-1 max-sm:px-1.5 max-sm:[&>svg]:hidden"><Sun /> Today</TabsTrigger>
            <TabsTrigger value="grid" className="max-sm:h-10 max-sm:flex-1 max-sm:px-1.5 max-sm:[&>svg]:hidden"><LayoutGrid /> Grid</TabsTrigger>
            <TabsTrigger value="history" className="max-sm:h-10 max-sm:flex-1 max-sm:px-1.5 max-sm:[&>svg]:hidden"><CalendarDays /> History</TabsTrigger>
            <TabsTrigger value="insights" className="max-sm:h-10 max-sm:flex-1 max-sm:px-1.5 max-sm:[&>svg]:hidden"><LineChart /> Insights</TabsTrigger>
          </TabsList>
        </Tabs>
      </PageHeader>

      <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        {tab === 'today' && <TodayTab ctl={ctl} members={members} teamName={props.activeTeamName || 'Your team'} today={today} hereToday={hereToday} />}
        {tab === 'grid' && <AttendanceGrid ctl={ctl} members={members} />}
        {tab === 'history' && <HistoryTab ctl={ctl} members={members} attendance={attendance} />}
        {tab === 'insights' && <InsightsTab ctl={ctl} {...props} members={members} attendance={attendance} events={events} />}
      </motion.div>
    </Page>
  );
}

function TodayTab({ ctl, members, teamName, today, hereToday }: { ctl: Ctl; members: any[]; teamName: string; today: string; hereToday: number }) {
  const counts = useMemo(() => {
    const c: Record<string, number> = { P: 0, L: 0, E: 0, U: 0, S: 0, '-': 0 };
    for (const m of members) c[ctl.getStatus(m.id, today)] = (c[ctl.getStatus(m.id, today)] || 0) + 1;
    return c;
  }, [members, ctl, today]);
  const notMeetingDay = ctl.hiddenDates.includes(today);
  const pct = members.length ? Math.round((hereToday / members.length) * 100) : 0;
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Section
        title="Roll call"
        description={notMeetingDay ? 'Today isn’t a meeting day, but you can still mark it.' : 'Tap a status; tap it again to clear.'}
        action={<span className="text-sm tabular-nums text-muted-foreground">{counts['-']} unmarked</span>}
      >
        {members.length === 0 ? (
          <EmptyState icon={ListChecks} title="No members yet" description="Invite your team to start taking attendance." />
        ) : (
          <Stagger className="divide-y divide-border rounded-xl border border-border bg-card">
            {members.map((m: any) => {
              const st = ctl.getStatus(m.id, today);
              return (
                <StaggerItem key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                  <span className="flex min-w-0 items-center gap-3">
                    <MemberAvatar member={m} className="size-8 border-0" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{m.name}</span>
                      <span className="block text-xs text-muted-foreground">{statusLabel(st)}</span>
                    </span>
                  </span>
                  <StatusPicker value={st} size="sm" onPick={(s) => void ctl.setStatus(m.id, today, s)} />
                </StaggerItem>
              );
            })}
          </Stagger>
        )}
      </Section>
      <div className="space-y-6">
        <QrCard teamName={teamName} />
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Here today</p>
              <p className="font-display text-3xl font-semibold tabular-nums"><AnimatedValue value={hereToday} /><span className="text-base text-muted-foreground">/{members.length}</span></p>
            </div>
            <span className="text-sm tabular-nums text-muted-foreground">{pct}%</span>
          </div>
          <Progress value={pct} className="mt-3" aria-label="Share of members here today" />
          <div className="mt-4 grid grid-cols-5 gap-2 text-center">
            {(['P', 'L', 'E', 'U', 'S'] as const).map((s) => (
              <div key={s} className="rounded-lg bg-muted/40 py-2">
                <span className={cn('mx-auto mb-1 block size-1.5 rounded-full', statusStyle(s).dot)} />
                <p className="text-sm font-semibold tabular-nums">{counts[s]}</p>
                <p className="text-[10px] text-muted-foreground">{s}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryTab({ ctl, members, attendance }: { ctl: Ctl; members: any[]; attendance: any[] }) {
  const [day, setDay] = useState<string | null>(null);
  const narrow = useIsNarrow();
  const rows = useMemo(() => ctl.sessions.map((date) => {
    const recs = attendance.filter((r: any) => r.date === date);
    const present = recs.filter((r: any) => r.status === 'P').length;
    const late = recs.filter((r: any) => r.status === 'L').length;
    return { date, present, late, marked: recs.length };
  }), [ctl.sessions, attendance]);
  const total = Math.max(1, members.length);
  if (!rows.length) return <EmptyState icon={CalendarDays} title="No attendance history yet" description="Days you take attendance will show up here." />;
  const exportCsv = () => {
    const names = new Map(members.map((m: any) => [m.id, m.name]));
    const label: Record<string, string> = { P: 'Present', L: 'Late', E: 'Excused', A: 'Absent' };
    const recs = [...attendance].sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)));
    downloadCsv(datedName('attendance'), recs, [
      { header: 'Date', value: (r: any) => r.date },
      { header: 'Member', value: (r: any) => names.get(r.member_id) ?? `#${r.member_id}` },
      { header: 'Status', value: (r: any) => label[r.status] ?? r.status },
    ]);
  };
  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button variant="outline" size="sm" className="max-sm:h-11" onClick={exportCsv}><Download /> Export CSV</Button>
      </div>
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {rows.map((r) => {
          const dt = parseLocalDate(r.date);
          return (
            <li key={r.date}>
              <button type="button" onClick={() => setDay(r.date)} className="flex min-h-14 w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none">
                <span className="w-12 shrink-0 text-center">
                  <span className="block text-[10px] uppercase text-muted-foreground">{dt.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                  <span className="block text-lg font-semibold tabular-nums leading-tight">{dt.getDate()}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{dt.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
                  <span className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-muted">
                    <span className="bg-success" style={{ width: `${(r.present / total) * 100}%` }} />
                    <span className="bg-warning" style={{ width: `${(r.late / total) * 100}%` }} />
                  </span>
                </span>
                <span className="shrink-0 text-right text-sm tabular-nums">
                  <span className="font-semibold">{r.present}</span><span className="text-muted-foreground"> present</span>
                  {r.late > 0 && <span className="block text-xs text-muted-foreground">{r.late} late</span>}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          );
        })}
      </ul>
      <Sheet open={!!day} onOpenChange={(o) => { if (!o) setDay(null); }}>
        <SheetContent side={narrow ? 'bottom' : 'right'} className={cn('gap-0 p-0', !narrow && 'sm:max-w-md')}>
          {day && (
            <>
              <SheetHeader className="border-b border-border px-6 py-5 pr-12">
                <SheetTitle>{parseLocalDate(day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</SheetTitle>
                <SheetDescription>Change anyone’s status for this day.</SheetDescription>
              </SheetHeader>
              <ul className="flex-1 divide-y divide-border overflow-y-auto px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
                {members.map((m: any) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                    <span className="flex min-w-0 items-center gap-2.5"><MemberAvatar member={m} className="size-7 border-0" /><span className="truncate text-sm">{m.name}</span></span>
                    <StatusPicker value={ctl.getStatus(m.id, day)} size="sm" date={day} onPick={(s) => void ctl.setStatus(m.id, day, s)} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function InsightsTab({ ctl, members, attendance, events, insights, updateInsights, isAiLoading }: any) {
  const { theme } = useTheme();
  const prose = cn('prose prose-sm max-w-none text-sm text-foreground/90', theme !== 'light' && 'prose-invert');
  const rows = useMemo(() => (ctl as Ctl).summary.map((m: any) => {
    const rate = m.total > 0 ? Math.round((m.present / m.total) * 100) : 0;
    const last5 = attendance.filter((r: any) => r.member_id === m.member_id).sort((a: any, b: any) => b.date.localeCompare(a.date)).slice(0, 5).reverse();
    return { ...m, rate, last5, member: members.find((x: any) => x.id === m.member_id) };
  }).sort((a: any, b: any) => b.rate - a.rate), [ctl, attendance, members]);
  const avg = rows.length ? Math.round(rows.reduce((s: number, r: any) => s + r.rate, 0) / rows.length) : 0;
  const low = rows.filter((r: any) => r.total > 0 && r.rate < 60).length;
  return (
    <div className="space-y-2">
      <Section title="Check-ins" description={ctl.hiddenDates.length ? 'Present check-ins over the last 14 meeting days' : 'Present check-ins over the last 14 days'}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px]">
          <AttendanceArea attendance={attendance} hiddenDates={ctl.hiddenDates} events={events} id="att-insights" className="h-56" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <div className="rounded-xl border border-border p-4">
              <p className="text-xs text-muted-foreground">Average rate</p>
              <p className="font-display text-2xl font-semibold tabular-nums"><AnimatedValue value={`${avg}%`} /></p>
            </div>
            <div className="rounded-xl border border-border p-4">
              <p className="text-xs text-muted-foreground">Below 60%</p>
              <p className={cn('font-display text-2xl font-semibold tabular-nums', low > 0 && 'text-warning')}><AnimatedValue value={low} /></p>
            </div>
          </div>
        </div>
      </Section>

      <Section
        title={<span className="flex items-center gap-2"><Sparkles className="size-4 text-accent" /> Bruno’s analysis</span>}
        description="Trends, who’s slipping, and engagement."
        action={<Button variant="outline" size="sm" onClick={() => updateInsights?.()} disabled={isAiLoading}><RefreshCw className={cn(isAiLoading && 'animate-spin')} /> {insights ? 'Refresh' : 'Generate'}</Button>}
      >
        {isAiLoading && !insights ? (
          <div className="space-y-2" role="status">
            <p className="cp-shimmer-text text-sm">Bruno is reading the attendance…</p>
            <Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-4 w-2/3" />
          </div>
        ) : insights ? (
          <div className={prose}><BrunoMarkdown>{insights}</BrunoMarkdown></div>
        ) : (
          <p className="text-sm text-muted-foreground">Generate an analysis to see patterns across the season.</p>
        )}
      </Section>

      <Section title="By member">
        {rows.length === 0 ? (
          <EmptyState title="No attendance data yet" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead className="w-48">Rate</TableHead>
                  <TableHead>P · A · L · E</TableHead>
                  <TableHead>Last 5</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r: any) => (
                  <TableRow key={r.member_id}>
                    <TableCell>
                      <span className="flex items-center gap-2.5">
                        <MemberAvatar member={r.member || { name: r.name }} className="size-7 border-0" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{r.name}</span>
                          {r.member?.role && <span className="block text-xs text-muted-foreground">{r.member.role}</span>}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-3">
                        <Progress value={r.rate} className="h-1.5 w-24" indicatorClassName={r.rate < 60 ? 'bg-warning' : undefined} aria-label={`${r.name} attendance rate`} />
                        <span className="w-10 text-sm font-medium tabular-nums">{r.rate}%</span>
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm tabular-nums">
                      <span className="text-success">{r.present}</span> · <span className="text-destructive">{r.absent}</span> · <span className="text-warning">{r.late}</span> · <span className="text-info">{r.excused}</span>
                    </TableCell>
                    <TableCell>
                      <span className="flex gap-1">
                        {r.last5.length ? r.last5.map((x: any, i: number) => <span key={i} title={`${x.date}: ${x.status}`} className={cn('size-2 rounded-full', statusStyle(x.status).dot)} />)
                          : <Badge variant="outline">No data</Badge>}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>
    </div>
  );
}
