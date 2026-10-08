// Modern Owner console (phase 9a), rebuilt on the shadcn kit over the shared
// useOwner hooks (same /api/owner/* endpoints and confirmations as Legacy).
// Tabs: Overview (what needs you, email health, workspaces), Users, AI
// control, Flags, Feedback, Errors and What's new; a user sheet holds the AI
// kill switch, timeouts, budgets, warnings, move and the danger zone.
import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts';
import {
  AlertTriangle, ArrowDown, ArrowUp, Ban, Bug, Building2, ChevronRight, Mail, RefreshCw, Sparkles, Clock, FileText, Flag, LayoutGrid, List, MessageSquare, MessageSquareHeart, Search, ShieldCheck, Timer, Trash2, UserCircle, UserX, Users, Zap,
} from 'lucide-react';
import { cn } from '../../../components/cn';
import {
  Badge, Button, ChartContainer, ChartTooltip, ChartTooltipContent, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Skeleton, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  Tabs, TabsContent, TabsList, TabsTrigger, ToggleGroup, ToggleGroupItem,
} from '../../../components/ui-kit';
import { useIsNarrow } from '../../../components/scout/ScoutUi';
import { FLAG_REASONS, FLAG_STATUSES, aiStatusOf, fmtTokens, loginChips } from '../../../components/owner/ownerUtils';
import { useFlagReview, useOwnerConsole, useOwnerUser, type OwnerTab } from '../../../components/owner/useOwner';
import { Page, PageHeader, Section, EmptyState, Stat } from '../../ui/page';
import { Reveal, Stagger, StaggerItem } from '../../ui/motion';
import { AnimatedValue } from '../../AnimatedValue';
import { MemberAvatar } from '../tasks/AssigneePicker';
import { apiFetch } from '../../../services/api';
import { notify, promptDialog } from '../../../components/dialog';
import { ChangelogTab } from './ChangelogTab';

type Ctl = ReturnType<typeof useOwnerConsole>;
// Legacy status classes are tuned for dark; Modern badges get their own tones.
const tone = (cls: string) => cls.includes('rose') ? 'border-rose-500/30 bg-rose-500/15 text-rose-600 dark:text-rose-300'
  : cls.includes('amber') ? 'border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-300'
    : cls.includes('orange') ? 'border-orange-500/30 bg-orange-500/15 text-orange-600 dark:text-orange-300'
      : cls.includes('sky') ? 'border-sky-500/30 bg-sky-500/15 text-sky-600 dark:text-sky-300'
        : cls.includes('emerald') ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
          : 'border-border bg-muted text-muted-foreground';

export function OwnerPage() {
  const ctl = useOwnerConsole();
  const [refreshing, setRefreshing] = useState(false);
  // Bumped by Refresh: the tabs that load their own data (errors, shared FTC numbers) reload too.
  const [refreshKey, setRefreshKey] = useState(0);
  // The button is disabled while a refresh runs; a delete may ask for one
  // regardless. The spinner stops only when every running refresh is done.
  const running = useRef(0);
  const refresh = async () => {
    running.current += 1;
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    try { await ctl.refresh(); } finally {
      running.current -= 1;
      if (running.current === 0) setRefreshing(false);
    }
  };
  return (
    <Page>
      <PageHeader
        eyebrow="Owner" title="Owner console" description="Every workspace, user, AI flag and feedback note — your private command center."
        actions={<Button variant="outline" onClick={() => void refresh()} disabled={refreshing} className="max-sm:h-11"><RefreshCw className={cn(refreshing && 'animate-spin')} /> Refresh</Button>}
      >
        <Tabs value={ctl.tab} onValueChange={(v) => ctl.setTab(v as OwnerTab)}>
          <TabsList aria-label="Owner sections" className="max-w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview" className="shrink-0 max-sm:h-11"><Building2 /> Overview</TabsTrigger>
            <TabsTrigger value="users" className="shrink-0 max-sm:h-11"><Users /> Users</TabsTrigger>
            <TabsTrigger value="ai" className="shrink-0 max-sm:h-11"><Zap /> AI control</TabsTrigger>
            <TabsTrigger value="flags" className="shrink-0 max-sm:h-11"><Flag /> Flags{ctl.openFlagCount > 0 && <Badge variant="destructive" className="ml-1">{ctl.openFlagCount}</Badge>}</TabsTrigger>
            <TabsTrigger value="feedback" className="shrink-0 max-sm:h-11"><MessageSquareHeart /> Feedback{ctl.totals.new_feedback > 0 && <Badge variant="soft" className="ml-1">{ctl.totals.new_feedback}</Badge>}</TabsTrigger>
            <TabsTrigger value="errors" className="shrink-0 max-sm:h-11"><Bug /> Errors</TabsTrigger>
            <TabsTrigger value="changelog" className="shrink-0 max-sm:h-11"><Sparkles /> What’s new</TabsTrigger>
          </TabsList>
        </Tabs>
      </PageHeader>
      {ctl.loading ? <div className="grid grid-cols-2 gap-6 lg:grid-cols-4" aria-busy="true">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div> : (
        <>
          {ctl.tab === 'overview' && <OverviewTab ctl={ctl} refreshKey={refreshKey} onRefresh={refresh} />}
          {ctl.tab === 'users' && <UsersTab ctl={ctl} />}
          {ctl.tab === 'ai' && <AiTab ctl={ctl} />}
          {ctl.tab === 'flags' && <FlagsTab ctl={ctl} />}
          {ctl.tab === 'feedback' && <FeedbackTab ctl={ctl} />}
          {ctl.tab === 'errors' && <ErrorsTab refreshKey={refreshKey} />}
          {ctl.tab === 'changelog' && <ChangelogTab />}
        </>
      )}
      {ctl.selectedId !== null && (
        <UserSheet key={ctl.selectedId} userId={ctl.selectedId} teams={ctl.overview?.teams || []} onClose={() => ctl.setSelectedId(null)} onChanged={ctl.reloadAfterChange} />
      )}
    </Page>
  );
}

const utc = (v: string | null | undefined) => (v ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : v.replace(' ', 'T') + 'Z') : null);
const when = (v: string | null | undefined, fmt = 'MMM d, h:mm a') => { const d = utc(v); return d && !Number.isNaN(d.getTime()) ? format(d, fmt) : ''; };

function StackBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="grid gap-1">
      <p className="text-muted-foreground">{label}</p>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-border bg-card p-2 font-mono text-[11px]">{text}</pre>
    </div>
  );
}

/**
 * Browser crash reports from the last 7 days, grouped by message + page.
 * A group opens to its latest individual reports: when, workspace, release,
 * browser and the stack.
 */
function ErrorsTab({ refreshKey = 0 }: { refreshKey?: number }) {
  const [data, setData] = useState<{ groups: any[]; recent: any[] } | null>(null);
  const [failed, setFailed] = useState(false);
  // The open group, by what it is (its row can move when the counts change).
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    apiFetch('/api/owner/client-errors')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (live) { setData(d); setFailed(false); } })
      .catch(() => { if (live && !data) setFailed(true); });
    return () => { live = false; };
    // Reloads on Refresh only.
  }, [refreshKey]);
  if (failed) return <EmptyState icon={AlertTriangle} title="Couldn't load error reports" description="Try again in a moment." />;
  if (!data) return <Skeleton className="h-40" />;
  if (!data.groups.length) return <EmptyState icon={Bug} title="No crashes reported this week" description="Render errors and failed page loads from users' browsers show up here." />;
  const total = data.groups.reduce((n, g) => n + Number(g.n || 0), 0);
  return (
    <Section title="Crashes this week" description={`${total} ${total === 1 ? 'report' : 'reports'} in ${data.groups.length} ${data.groups.length === 1 ? 'group' : 'groups'}, grouped by message and page. Open a group for its latest reports. Each report is also kept individually (newest 5,000).`}>
      <div className="overflow-x-auto rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow><TableHead>Error</TableHead><TableHead>Page</TableHead><TableHead className="text-right">Count</TableHead><TableHead>Last seen</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {data.groups.map((g) => {
              const reports = data.recent.filter((r) => r.message === g.message && (r.route || null) === (g.route || null) && r.kind === g.kind).slice(0, 5);
              const key = JSON.stringify([g.kind, g.route || null, g.message]);
              const isOpen = open === key;
              return (
                <Fragment key={key}>
                  <TableRow>
                    <TableCell className="max-w-md">
                      <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : key)} className="flex w-full items-start gap-1.5 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
                        <ChevronRight className={cn('mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-90')} aria-hidden="true" />
                        <span className="min-w-0"><span className="line-clamp-2 font-mono text-xs">{g.message}</span><span className="text-xs text-muted-foreground">{g.kind}</span></span>
                      </button>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{g.route || '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{g.n}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{when(g.last_seen)}</TableCell>
                  </TableRow>
                  {isOpen && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={4} className="bg-muted/30">
                        {reports.length ? (
                          <ul className="grid gap-3" aria-label="Latest reports">
                            {reports.map((r) => (
                              <li key={r.id} className="grid gap-1 text-xs">
                                <p className="text-muted-foreground">
                                  {[when(r.created_at), r.team_name, r.release && `release ${r.release}`].filter(Boolean).join(' · ')}
                                </p>
                                {r.user_agent && <p className="break-all text-muted-foreground">{r.user_agent}</p>}
                                {r.stack && <StackBlock label="JavaScript stack" text={r.stack} />}
                                {r.component_stack && <StackBlock label="React component stack" text={r.component_stack} />}
                              </li>
                            ))}
                          </ul>
                        ) : <p className="text-xs text-muted-foreground">No individual reports kept for this group (only the newest 200 are loaded).</p>}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Section>
  );
}

/**
 * Workspaces that share an FTC number from before the one-per-number rule.
 * Read-only: sorting them out (merge, rename, clear a number) is done by hand.
 */
function FtcDuplicates({ refreshKey = 0 }: { refreshKey?: number }) {
  const [groups, setGroups] = useState<{ ftc: number; teams: { id: number; name: string; members: number }[] }[] | null>(null);
  useEffect(() => {
    let live = true;
    apiFetch('/api/owner/ftc-duplicates')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (live) setGroups(Array.isArray(d) ? d : []); })
      .catch(() => { if (live) setGroups((g) => g ?? []); });
    return () => { live = false; };
  }, [refreshKey]);
  if (!groups?.length) return null;
  return (
    <Section title="Shared FTC numbers" description="These workspaces claimed the same FTC team before each number got one workspace. Nothing was changed — sort them out by hand.">
      <div className="grid gap-2">
        {groups.map((g) => (
          <div key={g.ftc} className="rounded-xl border border-warning/40 bg-warning/5 p-3 text-sm">
            <p className="mb-1 font-semibold">Team #{g.ftc}</p>
            <ul className="grid gap-0.5 text-muted-foreground">
              {g.teams.map((t) => <li key={t.id}>{t.name} <span className="text-xs">· id {t.id} · {t.members} {t.members === 1 ? 'member' : 'members'}</span></li>)}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

type SortDir = 'asc' | 'desc';
/** A column sort: click once for the natural order, again to flip it. */
function useSort<K extends string>(initial: K, initialDir: SortDir) {
  const [sort, setSort] = useState<{ key: K; dir: SortDir }>({ key: initial, dir: initialDir });
  const toggle = (key: K, natural: SortDir) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: natural }));
  return { sort, toggle };
}
const compare = (a: any, b: any, dir: SortDir) => {
  const empty = (v: any) => v === null || v === undefined || v === '';
  // Blanks always sort last, whichever way.
  if (empty(a) || empty(b)) return empty(a) === empty(b) ? 0 : empty(a) ? 1 : -1;
  const r = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  return dir === 'asc' ? r : -r;
};

function SortHead({ label, k, natural = 'desc', sort, onSort, className }: { label: string; k: string; natural?: SortDir; sort: { key: string; dir: SortDir }; onSort: (k: any, natural: SortDir) => void; className?: string }) {
  const active = sort.key === k;
  const Arrow = sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(k, natural)} className={cn('inline-flex items-center gap-1 rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60', active && 'text-foreground')}>
        {label}{active && <Arrow className="size-3" aria-hidden="true" />}
      </button>
    </TableHead>
  );
}

const emailFailing = (h?: { configured: boolean; lastOkAt: string | null; lastErrorAt: string | null } | null) =>
  !!h && (!h.configured || (!!h.lastErrorAt && (!h.lastOkAt || h.lastErrorAt > h.lastOkAt)));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What needs the owner now; each item opens the tab that deals with it. */
function Attention({ ctl }: { ctl: Ctl }) {
  const t = ctl.totals;
  const items = [
    ctl.openFlagCount > 0 && { key: 'flags', icon: Flag, label: plural(ctl.openFlagCount, 'open AI flag'), hint: 'Dismiss, warn, time out or disable', tab: 'flags' as OwnerTab, bad: true },
    t.new_feedback > 0 && { key: 'feedback', icon: MessageSquareHeart, label: plural(t.new_feedback, 'new feedback note'), hint: 'Read and resolve', tab: 'feedback' as OwnerTab },
    t.crashes_7d > 0 && { key: 'errors', icon: Bug, label: plural(t.crashes_7d, 'error report'), hint: 'From users\u2019 browsers this week', tab: 'errors' as OwnerTab },
    emailFailing(ctl.overview?.email) && { key: 'email', icon: Mail, label: 'Email is failing', hint: 'Signup codes may not arrive — details below', bad: true },
  ].filter(Boolean) as { key: string; icon: any; label: string; hint: string; tab?: OwnerTab; bad?: boolean }[];
  if (!items.length) {
    return (
      <p role="status" className="mb-8 flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm">
        <ShieldCheck className="size-4 text-success" aria-hidden="true" /> Nothing needs you right now.
      </p>
    );
  }
  return (
    <section aria-label="Needs your attention" className="mb-8">
      <h2 className="mb-3 text-sm font-semibold">Needs your attention</h2>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((it) => {
          const body = (
            <>
              <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', it.bad ? 'bg-destructive/15 text-destructive' : 'bg-muted text-foreground')}><it.icon className="size-4" /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{it.label}</span><span className="block text-xs text-muted-foreground">{it.hint}</span></span>
              {it.tab && <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
            </>
          );
          const cls = cn('flex h-full w-full items-center gap-3 rounded-xl border bg-card p-3 text-left', it.bad ? 'border-destructive/40' : 'border-border');
          return (
            <li key={it.key}>
              {it.tab
                ? <button type="button" onClick={() => ctl.setTab(it.tab!)} className={cn(cls, 'transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60')}>{body}</button>
                : <div className={cls}>{body}</div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

type WsKey = 'name' | 'member_count' | 'message_count' | 'task_count' | 'feedback_count' | 'last_message_at';

function OverviewTab({ ctl, refreshKey, onRefresh }: { ctl: Ctl; refreshKey?: number; onRefresh?: () => Promise<void> }) {
  const t = ctl.totals;
  const [query, setQuery] = useState('');
  const { sort, toggle } = useSort<WsKey>('member_count', 'desc');
  const all: any[] = ctl.overview?.teams || [];
  const teams = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = q ? all.filter((w) => [w.name, w.number, w.access_code].some((v) => v != null && String(v).toLowerCase().includes(q))) : all;
    return [...shown].sort((a, b) => compare(a[sort.key], b[sort.key], sort.dir) || b.id - a.id);
  }, [all, query, sort]);
  const showUsers = (w: any) => { ctl.setUserSearch(''); ctl.setTeamFilter(String(w.id)); ctl.setTab('users'); };
  const [deleting, setDeleting] = useState<number | null>(null);
  const deleteWorkspace = async (w: any) => {
    const ok = await promptDialog({
      title: `Delete ${w.name}?`,
      message: `This permanently deletes the workspace and everything in it: ${plural(Number(w.member_count) || 0, 'member')}, ${plural(Number(w.message_count) || 0, 'message')}, ${plural(Number(w.task_count) || 0, 'task')}, its calendar, budget, inventory, files and settings. Members are signed out of it. This can't be undone. Type the workspace's name to confirm.`,
      expected: String(w.name), placeholder: String(w.name), confirmLabel: 'Delete workspace', danger: true,
    });
    if (!ok) return;
    setDeleting(w.id);
    try {
      const r = await apiFetch(`/api/owner/teams/${w.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: w.name }) }).catch(() => null);
      const j = r ? await r.json().catch(() => ({})) : {};
      if (!r?.ok) { notify(j.error || 'Could not delete the workspace', 'error'); return; }
      notify(`${w.name} deleted.`, 'success');
      if (ctl.teamFilter === String(w.id)) ctl.setTeamFilter('all');
      // The whole page: shared FTC numbers and errors reload too.
      await (onRefresh ? onRefresh() : ctl.refresh());
    } finally {
      setDeleting(null);
    }
  };
  const head = { sort, onSort: toggle };
  return (
    <>
      <Reveal className="mb-8 grid grid-cols-2 gap-6 border-b border-border pb-6 lg:grid-cols-4">
        <Stat icon={Building2} label="Workspaces" value={<AnimatedValue value={t.teams || 0} />} />
        <Stat icon={UserCircle} label="Users" value={<AnimatedValue value={t.users || 0} />} onClick={() => ctl.setTab('users')} />
        <Stat icon={Zap} label="AI messages today" value={<AnimatedValue value={ctl.aiOverview?.today?.messages || 0} />} onClick={() => ctl.setTab('ai')} />
        <Stat icon={MessageSquareHeart} label="Feedback notes" value={<AnimatedValue value={t.feedback || 0} />} onClick={() => ctl.setTab('feedback')} />
      </Reveal>
      <Attention ctl={ctl} />
      <EmailHealth health={ctl.overview?.email} />
      <Section title={`Workspaces (${teams.length}${query.trim() ? ` of ${all.length}` : ''})`} description="Every team on Control Point and how active each one is. Sort by any column; Users opens that workspace's people, and the bin deletes the workspace.">
        {all.length > 0 && (
          <div className="relative mb-4 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, FTC number or code" aria-label="Search workspaces" className="pl-9 max-sm:h-11" />
          </div>
        )}
        {teams.length ? (
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead label="Workspace" k="name" natural="asc" {...head} />
                  <TableHead>Code</TableHead>
                  <SortHead label="Members" k="member_count" className="text-right" {...head} />
                  <SortHead label="Messages" k="message_count" className="text-right" {...head} />
                  <SortHead label="Tasks" k="task_count" className="text-right" {...head} />
                  <SortHead label="Feedback" k="feedback_count" className="text-right" {...head} />
                  <SortHead label="Last message" k="last_message_at" {...head} />
                  <TableHead><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teams.map((w: any) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium">{w.name}{w.number ? <span className="text-muted-foreground"> #{w.number}</span> : null}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{w.access_code}</TableCell>
                    <TableCell className="text-right tabular-nums">{w.member_count}</TableCell>
                    <TableCell className="text-right tabular-nums">{w.message_count}</TableCell>
                    <TableCell className="text-right tabular-nums">{w.task_count}</TableCell>
                    <TableCell className="text-right tabular-nums">{w.feedback_count}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{when(w.last_message_at, 'MMM d, yyyy') || 'Never'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button variant="outline" size="sm" onClick={() => showUsers(w)} aria-label={`Users in ${w.name}`} className="max-sm:h-11">Users</Button>
                        <Button variant="outline" size="icon-sm" disabled={deleting === w.id} onClick={() => void deleteWorkspace(w)} aria-label={`Delete ${w.name}`} className="text-destructive hover:text-destructive max-sm:size-11"><Trash2 /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : <EmptyState icon={Building2} title={all.length ? 'No workspaces match' : 'No workspaces yet'} />}
      </Section>
      <FtcDuplicates refreshKey={refreshKey} />
    </>
  );
}

/** Is signup email working? Configured key + the last send outcome since boot. */
function EmailHealth({ health }: { health?: { configured: boolean; lastOkAt: string | null; lastError: string | null; lastErrorAt: string | null } }) {
  if (!health) return null;
  const failing = emailFailing(health);
  const at = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : 'not since the last restart');
  return (
    <div role="status" className={cn('mb-8 rounded-xl border p-4 text-sm', failing ? 'border-destructive/40 bg-destructive/10' : 'border-border bg-card')}>
      <p className="font-medium">{!health.configured ? 'Email is not configured: signup codes are not being sent' : failing ? 'The last email failed to send' : 'Email is sending normally'}</p>
      <p className="mt-1 text-muted-foreground">Last delivered to the provider: {at(health.lastOkAt)}.{health.lastError ? ` Last error (${at(health.lastErrorAt)}): ${health.lastError}` : ''}</p>
    </div>
  );
}

function UserRow({ u, ctl, extra }: { u: any; ctl: Ctl; extra?: React.ReactNode }) {
  const st = aiStatusOf(u);
  return (
    <StaggerItem as="li" className="flex items-center gap-3 px-4 py-3">
      <MemberAvatar member={u} className="size-9 border-0" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 truncate text-sm font-medium">
          {u.name}
          {u.flags_open > 0 && <Badge variant="destructive">{u.flags_open} flag{u.flags_open > 1 ? 's' : ''}</Badge>}
          {u.warnings > 0 && <Badge variant="outline" className={tone('amber')}>{u.warnings} warn</Badge>}
        </p>
        <p className="truncate text-xs text-muted-foreground">{u.email}{u.team_name ? ` · ${u.team_name}` : ''}{u.account_type ? ` · ${u.account_type}` : ''}{u.tokens_7d > 0 ? ` · ${fmtTokens(u.tokens_7d)} tokens / 7d` : ''}{u.last_ai_use ? ` · last AI ${when(u.last_ai_use, 'MMM d')}` : ''}</p>
      </div>
      {extra}
      <Badge variant="outline" className={cn('max-sm:hidden', tone(st.cls))}>{st.label}</Badge>
      <Button variant="outline" size="sm" onClick={() => ctl.setSelectedId(u.id)} className="max-sm:h-11">Manage</Button>
    </StaggerItem>
  );
}

type UserStatus = 'all' | 'flagged' | 'warned' | 'restricted' | 'ai-7d' | 'no-ai';
type UserSort = 'newest' | 'name' | 'tokens' | 'last-ai';
const USER_STATUSES: Record<UserStatus, string> = {
  'all': 'Everyone', 'flagged': 'Open flags', 'warned': 'Warned', 'restricted': 'AI limited or off', 'ai-7d': 'Used AI this week', 'no-ai': 'No AI this week',
};
const USER_SORTS: Record<UserSort, string> = { 'newest': 'Newest first', 'name': 'Name', 'tokens': 'AI tokens (7 days)', 'last-ai': 'Last AI use' };
const userStatusMatch = (u: any, s: UserStatus) => {
  switch (s) {
    case 'flagged': return u.flags_open > 0;
    case 'warned': return u.warnings > 0;
    // Disabled, timed out or on a daily budget.
    case 'restricted': return aiStatusOf(u).label !== 'AI ok';
    case 'ai-7d': return Number(u.msgs_7d || 0) > 0;
    case 'no-ai': return !Number(u.msgs_7d || 0);
    default: return true;
  }
};

function UsersTab({ ctl }: { ctl: Ctl }) {
  const [status, setStatus] = useState<UserStatus>('all');
  const [sortBy, setSortBy] = useState<UserSort>('newest');
  const shown = useMemo(() => {
    const list = ctl.filteredUsers.filter((u) => userStatusMatch(u, status));
    if (sortBy === 'newest') return list; // the server's order
    const key = sortBy === 'name' ? 'name' : sortBy === 'tokens' ? 'tokens_7d' : 'last_ai_use';
    return [...list].sort((a, b) => compare(sortBy === 'tokens' ? Number(a[key] || 0) : a[key], sortBy === 'tokens' ? Number(b[key] || 0) : b[key], sortBy === 'name' ? 'asc' : 'desc') || b.id - a.id);
  }, [ctl.filteredUsers, status, sortBy]);
  const filtered = status !== 'all' || ctl.teamFilter !== 'all' || !!ctl.userSearch;
  // A workspace opened from Overview may have nobody in it yet: keep it choosable.
  const teamOptions = ctl.teamFilter === 'all' || ctl.teams.some((t) => String(t.id) === ctl.teamFilter) ? ctl.teams
    : [...ctl.teams, { id: Number(ctl.teamFilter), name: (ctl.overview?.teams || []).find((w: any) => String(w.id) === ctl.teamFilter)?.name || `Workspace #${ctl.teamFilter}` }];
  const clear = () => { setStatus('all'); ctl.setTeamFilter('all'); ctl.setUserSearch(''); };
  return (
    <Section title={`Users (${shown.length}${filtered ? ` of ${ctl.users.length}` : ''})`} description="Manage opens AI controls, warnings, moves and deletion.">
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={ctl.userSearch} onChange={(e) => ctl.setUserSearch(e.target.value)} placeholder="Search name or email" aria-label="Search users" className="pl-9 max-sm:h-11" />
        </div>
        <Select value={ctl.teamFilter} onValueChange={ctl.setTeamFilter}>
          <SelectTrigger className="w-48 max-sm:h-11 max-sm:w-full" aria-label="Filter by team"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All teams</SelectItem>
            {teamOptions.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as UserStatus)}>
          <SelectTrigger className="w-48 max-sm:h-11 max-sm:w-full" aria-label="Filter by status"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(USER_STATUSES) as UserStatus[]).map((k) => <SelectItem key={k} value={k}>{USER_STATUSES[k]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as UserSort)}>
          <SelectTrigger className="w-44 max-sm:h-11 max-sm:w-full" aria-label="Sort users"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(USER_SORTS) as UserSort[]).map((k) => <SelectItem key={k} value={k}>{USER_SORTS[k]}</SelectItem>)}
          </SelectContent>
        </Select>
        {filtered && <Button variant="ghost" onClick={clear} className="max-sm:h-11">Clear filters</Button>}
      </div>
      {shown.length ? (
        <Stagger as="ul" className="divide-y divide-border rounded-xl border border-border">
          {shown.map((u) => (
            <UserRow key={u.id} u={u} ctl={ctl} extra={<Button variant="ghost" size="icon-sm" aria-label={`Delete ${u.name}`} onClick={() => void ctl.quickDeleteUser(u)} className="text-destructive hover:text-destructive max-sm:size-11"><Trash2 /></Button>} />
          ))}
        </Stagger>
      ) : <EmptyState icon={Search} title="No users match" action={filtered ? <Button variant="outline" onClick={clear}>Clear filters</Button> : undefined} />}
    </Section>
  );
}

function AiTab({ ctl }: { ctl: Ctl }) {
  const ai = ctl.aiOverview;
  const daily = useMemo(() => (ai?.daily || []).map((d: any) => ({ ...d, label: String(d.date).slice(5) })), [ai]);
  return (
    <>
      <Reveal className="mb-6 grid grid-cols-2 gap-6 border-b border-border pb-6 lg:grid-cols-4">
        <Stat icon={Zap} label="AI messages today" value={<AnimatedValue value={ai?.today?.messages || 0} />} />
        <Stat icon={MessageSquare} label="Tokens today" value={<AnimatedValue value={fmtTokens(ai?.today?.tokens || 0)} />} />
        <Stat icon={Users} label="People used AI today" value={<AnimatedValue value={ai?.today?.users || 0} />} />
        <Stat icon={Flag} label="Open misuse flags" value={<AnimatedValue value={ctl.openFlagCount} />} tone={ctl.openFlagCount ? 'bad' : 'default'} />
      </Reveal>
      {(ai?.providers || []).length > 0 && <p className="mb-6 text-xs text-muted-foreground">Today's providers: {(ai.providers || []).map((p: any) => `${p.provider} · ${p.messages} msgs`).join('  |  ')}</p>}
      <Section title="Usage — last 14 days" description="Messages per day (bars) and tokens (line).">
        {daily.length ? (
          <ChartContainer config={{ messages: { label: 'Messages', color: 'var(--color-chart-1)' }, tokens: { label: 'Tokens', color: 'var(--color-chart-2)' } }} className="h-64 w-full">
            <ComposedChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis yAxisId="m" tickLine={false} axisLine={false} width={32} />
              <YAxis yAxisId="t" orientation="right" tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => fmtTokens(v)} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar yAxisId="m" dataKey="messages" fill="var(--color-messages)" radius={[4, 4, 0, 0]} animationDuration={700} />
              <Line yAxisId="t" dataKey="tokens" type="monotone" stroke="var(--color-tokens)" strokeWidth={2} dot={false} animationDuration={700} />
            </ComposedChart>
          </ChartContainer>
        ) : <EmptyState icon={Zap} title="No AI usage in the last 14 days" />}
      </Section>
      <Section title="Heaviest AI users" description="Last 7 days by tokens — spot runaway usage at a glance.">
        {(ai?.top || []).length ? (
          <ol className="divide-y divide-border rounded-xl border border-border">
            {(ai.top as any[]).map((t, i) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <span className="w-5 text-center text-xs font-medium text-muted-foreground">{i + 1}</span>
                <MemberAvatar member={t} className="size-8 border-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{t.email}{t.team_name ? ` · ${t.team_name}` : ''}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground"><p><span className="font-medium text-foreground">{fmtTokens(t.tokens)}</span> tokens</p><p>{t.messages} messages</p></div>
                <Button variant="outline" size="sm" onClick={() => ctl.setSelectedId(t.id)} className="max-sm:h-11">Manage</Button>
              </li>
            ))}
          </ol>
        ) : <EmptyState icon={Users} title="No AI usage in the last 7 days" />}
      </Section>
      <Section title="How flagging works">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li><span className="font-medium text-foreground">Homework-like</span> — messages matching homework / essay / quiz patterns get flagged for review.</li>
          <li><span className="font-medium text-foreground">Spam burst</span> — 12+ AI messages within 10 minutes.</li>
          <li><span className="font-medium text-foreground">Excessive use</span> — 80+ AI messages in a day.</li>
          <li>Flags never block anyone by themselves — you decide: dismiss, warn, time out, or disable AI.</li>
        </ul>
      </Section>
    </>
  );
}

function FlagsTab({ ctl }: { ctl: Ctl }) {
  return (
    <>
      <ToggleGroup type="single" aria-label="Flag filter" value={ctl.flagFilter} onValueChange={(v) => { if (v) ctl.chooseFlagFilter(v as 'open' | 'all'); }} className="mb-5">
        <ToggleGroupItem value="open">Open</ToggleGroupItem>
        <ToggleGroupItem value="all">All</ToggleGroupItem>
      </ToggleGroup>
      {ctl.flags.length ? (
        <Stagger className="grid gap-4 lg:grid-cols-2">
          {ctl.flags.map((f) => <StaggerItem key={f.id}><FlagReview flag={f} ctl={ctl} /></StaggerItem>)}
        </Stagger>
      ) : <EmptyState icon={ShieldCheck} title={`No ${ctl.flagFilter === 'open' ? 'open ' : ''}flags`} description="Quiet on the AI front." />}
    </>
  );
}

function FlagReview({ flag, ctl }: { flag: any; ctl: Ctl }) {
  const r = useFlagReview(flag, ctl.handleFlagAction);
  const reason = FLAG_REASONS[flag.reason] || { label: flag.reason, cls: '' };
  const status = FLAG_STATUSES[flag.status] || { label: flag.status, cls: '' };
  return (
    <article className="flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-4" aria-label={`Flag: ${reason.label} by ${flag.user_name || 'unknown user'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={tone(reason.cls)}>{reason.label}</Badge>
        <Badge variant="outline" className={tone(status.cls)}>{status.label}</Badge>
        <span className="ml-auto text-xs text-muted-foreground">{flag.created_at ? format(new Date(flag.created_at), 'MMM d, h:mm a') : ''}</span>
      </div>
      <button onClick={() => flag.member_id && ctl.setSelectedId(flag.member_id)} className="flex items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
        <MemberAvatar member={{ name: flag.user_name }} className="size-8 border-0" />
        <span className="min-w-0"><span className="block truncate text-sm font-medium hover:underline">{flag.user_name || 'Unknown user'}</span><span className="block truncate text-xs text-muted-foreground">{flag.user_email}{flag.team_name ? ` · ${flag.team_name}` : ''}</span></span>
      </button>
      <blockquote className="whitespace-pre-wrap rounded-lg border-l-2 border-accent/60 bg-muted/50 px-3 py-2 text-sm">{flag.excerpt}</blockquote>
      {flag.reviewer_note && <p className="text-xs text-muted-foreground">Your note: {flag.reviewer_note}</p>}
      {flag.status === 'open' && (
        <div className="mt-auto space-y-2">
          <Input value={r.note} onChange={(e) => r.setNote(e.target.value)} placeholder="Note (optional — recorded with warn / timeout / disable)" aria-label="Reviewer note" disabled={r.busy} className="max-sm:h-11" />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={r.busy} onClick={() => void r.run('dismiss')} className="max-sm:h-11">Dismiss</Button>
            <Button variant="outline" size="sm" disabled={r.busy} onClick={() => void r.run('warn')} className="text-amber-600 dark:text-amber-400 max-sm:h-11"><AlertTriangle /> Warn</Button>
            <Button variant="outline" size="sm" disabled={r.busy} onClick={() => void r.run('timeout', 24)} className="text-orange-600 dark:text-orange-400 max-sm:h-11"><Timer /> Timeout 24h</Button>
            <Button variant="outline" size="sm" disabled={r.busy} onClick={() => void r.run('disable')} className="text-destructive max-sm:h-11"><Ban /> Disable AI</Button>
          </div>
        </div>
      )}
    </article>
  );
}

function FeedbackMessage({ message }: { message: string }) {
  const id = useId();
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || expanded) return;
    const measure = () => setOverflow(element.scrollHeight > element.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [message, expanded]);
  return (
    <>
      <p ref={ref} id={id} className={cn('whitespace-pre-wrap break-words text-sm', !expanded && 'line-clamp-6')}>{message}</p>
      {(overflow || expanded) && <Button variant="outline" size="sm" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded((value) => !value)} className="mt-2 max-sm:h-11">{expanded ? 'Show less' : 'Show more'}</Button>}
    </>
  );
}

function FeedbackTab({ ctl }: { ctl: Ctl }) {
  const [view, setView] = useState<'grid' | 'list'>(() => {
    try { return localStorage.getItem('cp-owner-feedback-view') === 'list' ? 'list' : 'grid'; }
    catch { return 'grid'; }
  });
  const grid = view === 'grid';
  if (!ctl.feedback.length) return <EmptyState icon={MessageSquareHeart} title="No feedback yet" />;
  return (
    <>
    <ToggleGroup type="single" aria-label="Feedback view" value={view} onValueChange={(value) => {
      if (value !== 'grid' && value !== 'list') return;
      setView(value);
      try { localStorage.setItem('cp-owner-feedback-view', value); } catch { /* Keep the view usable without storage. */ }
    }} className="mb-5">
      <ToggleGroupItem value="grid" className="max-sm:h-11"><LayoutGrid /> Grid</ToggleGroupItem>
      <ToggleGroupItem value="list" className="max-sm:h-11"><List /> List</ToggleGroupItem>
    </ToggleGroup>
    <Stagger as="ul" aria-label="Feedback notes" className={grid ? 'grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3' : 'space-y-3'}>
      {ctl.feedback.map((f) => {
        const url: string = f.screenshot_url || '';
        const isVideo = (f.attachment_type || '').startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(url);
        const isImage = (f.attachment_type || '').startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(url);
        return (
          <StaggerItem as="li" key={f.id} className={cn('min-w-0 rounded-xl border border-border bg-card p-4', grid && 'flex flex-col')}>
            <div className={cn('flex items-start gap-3', grid && 'flex-1 flex-col')}>
              <div className={cn('min-w-0 flex-1', grid && 'w-full')}>
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <Badge variant="soft">{f.category}</Badge>
                  <Badge variant="outline" className={f.status === 'new' ? tone('emerald') : tone('')}>{f.status}</Badge>
                </div>
                {grid ? <FeedbackMessage key={f.message} message={f.message} /> : <p className="whitespace-pre-wrap break-words text-sm">{f.message}</p>}
                {url && (
                  <div className="mt-2">
                    {isVideo ? <video src={url} controls className="max-h-48 max-w-full rounded-lg border border-border" />
                      : isImage ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Feedback attachment" className="max-h-40 max-w-full rounded-lg border border-border object-contain" /></a>
                        : <a href={url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs hover:border-accent/40"><FileText className="size-4 shrink-0 text-accent" /><span className="max-w-48 truncate">{f.attachment_name || 'Download attachment'}</span></a>}
                  </div>
                )}
                <p className="mt-2 break-words text-xs text-muted-foreground">{f.user_name} · {f.user_email}{f.team_name ? ` · ${f.team_name}` : ''}{f.created_at ? ` · ${format(new Date(f.created_at), 'MMM d, yyyy h:mm a')}` : ''}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => void ctl.setFeedbackStatus(f.id, f.status === 'new' ? 'resolved' : 'new')} className={cn('shrink-0 max-sm:h-11', grid && 'mt-auto')}>{f.status === 'new' ? 'Resolve' : 'Reopen'}</Button>
            </div>
          </StaggerItem>
        );
      })}
    </Stagger>
    </>
  );
}

function UserSheet({ userId, teams, onClose, onChanged }: { userId: number; teams: any[]; onClose: () => void; onChanged: () => void }) {
  const narrow = useIsNarrow();
  const m = useOwnerUser(userId, { onClose, onChanged, teams });
  const u = m.data?.user;
  const st = aiStatusOf(u);
  const usage = (m.data?.usage14 || []) as any[];
  const maxT = Math.max(1, ...usage.map((d) => Number(d.tokens) || 0));
  const siblings = m.data?.siblings?.length || 0;
  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side={narrow ? 'bottom' : 'right'} className={cn('gap-0 p-0', !narrow && 'sm:max-w-md')}>
        <SheetHeader className="border-b border-border px-6 py-5 pr-12">
          <SheetTitle>Manage user</SheetTitle>
          <SheetDescription>{u ? `${u.email}` : 'Loading…'}</SheetDescription>
        </SheetHeader>
        {m.loading && !u ? <div className="space-y-3 p-6"><Skeleton className="h-16" /><Skeleton className="h-40" /></div> : !u ? <p className="p-6 text-sm text-muted-foreground">Couldn't load this user.</p> : (
          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center gap-3">
              <MemberAvatar member={u} className="size-12 border-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{u.name}</p>
                <p className="text-xs text-muted-foreground">{u.team_name || 'No team'} · {u.role} · {u.account_type}</p>
              </div>
              <Badge variant="outline" className={tone(st.cls)}>{st.label}</Badge>
            </div>
            {(loginChips(u).length > 0 || siblings > 0) && (
              <div className="flex flex-wrap gap-1.5">
                {loginChips(u).map((c) => <Badge key={c} variant="secondary">via {c}</Badge>)}
                {siblings > 0 && <Badge variant="secondary">{siblings + 1} teams total</Badge>}
              </div>
            )}

            <section aria-labelledby="ai-h" className="space-y-4 rounded-xl border border-border p-4">
              <h3 id="ai-h" className="text-sm font-semibold">AI access</h3>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="ai-enabled" className="flex-col items-start gap-0.5"><span>AI enabled</span><span className="text-xs font-normal text-muted-foreground">Off blocks all Bruno / NavGPT replies</span></Label>
                <Switch id="ai-enabled" checked={u.ai_disabled !== 1} disabled={m.busy} onCheckedChange={(next) => void m.patchAi({ ai_disabled: !next }, next ? 'AI re-enabled' : 'AI disabled for user')} />
              </div>
              <div>
                <p className="mb-1.5 text-sm">Timeout AI</p>
                <div className="flex flex-wrap gap-2">
                  {[{ l: '1 hour', h: 1 }, { l: '24 hours', h: 24 }, { l: '7 days', h: 168 }].map((t) => (
                    <Button key={t.l} variant="outline" size="sm" disabled={m.busy} onClick={() => void m.patchAi({ timeoutHours: t.h }, `AI paused for ${t.l}`)} className="max-sm:h-11"><Timer /> {t.l}</Button>
                  ))}
                  {m.timeoutUntil && <Button variant="ghost" size="sm" disabled={m.busy} onClick={() => void m.patchAi({ ai_timeout_until: null }, 'Timeout cleared')} className="max-sm:h-11">Clear timeout</Button>}
                </div>
                {m.timeoutUntil && <p className="mt-1.5 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"><Clock className="size-3" /> Paused until {format(m.timeoutUntil, 'MMM d, h:mm a')}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <form className="grid gap-1.5" onSubmit={(e) => { e.preventDefault(); void m.saveDailyLimit(); }}>
                  <Label htmlFor="ai-limit" className="text-xs">Daily token limit</Label>
                  <div className="flex gap-1.5"><Input id="ai-limit" inputMode="numeric" value={m.dailyLimit} onChange={(e) => m.setDailyLimit(e.target.value)} placeholder="Unlimited" className="h-9 max-sm:h-11" /><Button type="submit" size="sm" variant="outline" disabled={m.busy} className="h-9 max-sm:h-11">Set</Button></div>
                </form>
                <form className="grid gap-1.5" onSubmit={(e) => { e.preventDefault(); void m.saveReplyMax(); }}>
                  <Label htmlFor="ai-reply" className="text-xs">Max tokens / reply</Label>
                  <div className="flex gap-1.5"><Input id="ai-reply" inputMode="numeric" value={m.replyMax} onChange={(e) => m.setReplyMax(e.target.value)} placeholder="Default" className="h-9 max-sm:h-11" /><Button type="submit" size="sm" variant="outline" disabled={m.busy} className="h-9 max-sm:h-11">Set</Button></div>
                </form>
              </div>
              <p className="text-xs text-muted-foreground">Blank = no limit. Limits apply to Bruno / NavGPT chat; blocked users see your message in the chat.</p>
            </section>

            <section aria-labelledby="warn-h" className="space-y-2">
              <h3 id="warn-h" className="text-sm font-semibold">Warn user</h3>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void m.doWarn(); }}>
                <Input value={m.warnNote} onChange={(e) => m.setWarnNote(e.target.value)} placeholder="Reason for the warning" aria-label="Warning reason" className="max-sm:h-11" />
                <Button type="submit" variant="outline" disabled={m.busy} className="shrink-0 text-amber-600 dark:text-amber-400"><AlertTriangle /> Warn</Button>
              </form>
              {(m.data?.warnings || []).map((w: any) => (
                <div key={w.id} className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs">
                  <p>{w.note || 'Warning issued'}</p>
                  <p className="mt-0.5 text-muted-foreground">{w.created_at ? format(new Date(w.created_at), 'MMM d, yyyy h:mm a') : ''}</p>
                </div>
              ))}
            </section>

            <section aria-labelledby="use-h">
              <h3 id="use-h" className="mb-2 text-sm font-semibold">AI usage · last 14 days</h3>
              {usage.length ? (
                <div className="flex h-24 items-end gap-1" role="img" aria-label="Daily AI tokens">
                  {usage.map((d) => (
                    <div key={d.day} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${d.day}: ${d.messages} messages, ${fmtTokens(d.tokens)} tokens`}>
                      <div className="w-full rounded-sm bg-accent/70 transition-[height] duration-500" style={{ height: `${Math.max(4, (Number(d.tokens) / maxT) * 80)}px` }} />
                      <span className="text-[9px] text-muted-foreground">{String(d.day).slice(5)}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-muted-foreground">No AI usage recorded.</p>}
            </section>

            {(m.data?.flags || []).length > 0 && (
              <section aria-labelledby="fh-h" className="space-y-2">
                <h3 id="fh-h" className="text-sm font-semibold">Flag history</h3>
                {(m.data.flags as any[]).map((f) => {
                  const rs = FLAG_STATUSES[f.status] || { label: f.status, cls: '' };
                  const rr = FLAG_REASONS[f.reason] || { label: f.reason, cls: '' };
                  return (
                    <div key={f.id} className="rounded-lg border border-border px-3 py-2 text-xs">
                      <div className="mb-1 flex items-center gap-1.5"><Badge variant="outline" className={tone(rr.cls)}>{rr.label}</Badge><Badge variant="outline" className={tone(rs.cls)}>{rs.label}</Badge><span className="ml-auto text-muted-foreground">{f.created_at ? format(new Date(f.created_at), 'MMM d') : ''}</span></div>
                      <p className="line-clamp-2">“{f.excerpt}”</p>
                    </div>
                  );
                })}
              </section>
            )}

            <section aria-labelledby="move-h" className="space-y-2">
              <h3 id="move-h" className="text-sm font-semibold">Move workspace</h3>
              <p className="text-xs text-muted-foreground">Currently in <span className="font-medium text-foreground">{u.team_name || 'no workspace'}</span>. Moving clears their roles and signs them out. They aren't notified.</p>
              <div className="flex gap-2">
                <Select value={m.moveTeamId || 'none'} onValueChange={(v) => { m.setMoveTeamId(v === 'none' ? '' : v); m.setMoveError(''); }} disabled={m.moving || m.busy}>
                  <SelectTrigger className="min-w-0 flex-1 max-sm:h-11" aria-label="Destination workspace"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Pick a workspace…</SelectItem>
                    {(teams || []).filter((t: any) => t.id !== u.team_id).map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.name}{t.number ? ` (${t.number})` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" disabled={m.moving || m.busy || !m.moveTeamId} onClick={() => void m.doMoveUser()}>{m.moving ? 'Moving…' : 'Move'}</Button>
              </div>
              {m.moveError && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{m.moveError}</p>}
            </section>

            <section aria-labelledby="danger-h" className="space-y-2 rounded-xl border border-destructive/30 p-4">
              <h3 id="danger-h" className="text-sm font-semibold text-destructive">Danger zone</h3>
              <Button variant="outline" disabled={m.busy} onClick={() => void m.doDeleteMembership()} className="w-full text-destructive"><UserX /> Remove from {u.team_name || 'team'}</Button>
              <Button variant="outline" disabled={m.busy} onClick={() => void m.doDeleteAccount()} className="w-full text-destructive"><Trash2 /> Delete entire account ({siblings + 1} team{siblings + 1 > 1 ? 's' : ''})</Button>
              <p className="text-xs text-muted-foreground">Deleting the account removes every membership under {u.email}. You can't delete your own owner account or a team's last admin.</p>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
