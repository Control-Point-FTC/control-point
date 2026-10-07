// Modern Predict (phase 7a). Rebuilt on the shadcn kit over the shared
// usePredictController (same endpoints, latest-wins loading, URL sync and
// Bruno context as Legacy). Event chips + season toggle up top, a stage
// stepper for where the event is, then Outlook / Alliance / Field / Matches,
// and the accuracy report in a side sheet.
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Check, CircleHelp, CloudOff, ListOrdered, RefreshCw, Settings as SettingsIcon, Sparkles, Swords, Target, Users } from 'lucide-react';
import { cn } from '../../../components/cn';
import { Badge, Button, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger, ToggleGroup, ToggleGroupItem } from '../../../components/ui-kit';
import { relTime, seasonShort, SEASON_NAMES } from '../../../components/scout/ScoutUi';
import { usePredictController, type PredictTab } from '../../../components/predict/usePredictController';
import { Page, PageHeader, EmptyState } from '../../ui/page';
import { Reveal } from '../../ui/motion';
import { OutlookTab, AllianceTab, FieldTab, MatchesTab } from './PredictTabs';
import { AccuracySheet } from './AccuracySheet';

type Ctl = ReturnType<typeof usePredictController>;

const STAGES = [
  { k: 'pre', label: 'Before the event', short: 'Pre-event' },
  { k: 'live', label: 'Quals in progress', short: 'Quals live' },
  { k: 'quals', label: 'Quals finished', short: 'Quals done' },
  { k: 'selected', label: 'Alliances selected', short: 'Selected' },
] as const;

export function PredictPage() {
  const ctl = usePredictController();
  const navigate = useNavigate();

  if (ctl.teamError === 'not-connected') {
    return (
      <Page>
        <PageHeader eyebrow="Compete" title="Predict" />
        <EmptyState
          icon={SettingsIcon}
          title="Connect your FTC team"
          description="Predict works out your team's odds at its events. Add your FTC team number in Settings to get started."
          action={<Button onClick={() => navigate('/settings?section=workspace')}><SettingsIcon /> Go to Settings</Button>}
        />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        eyebrow={<span className="inline-flex items-center gap-2">Compete <Badge variant="beta">Beta</Badge></span>}
        title="Predict"
        description="Your odds of advancing, simulated from every team's match history. Estimates, not guarantees."
        actions={
          <Button variant="outline" onClick={() => ctl.setShowAccuracy(true)}>
            <CircleHelp /> How accurate is this?
          </Button>
        }
      >
        <EventPicker ctl={ctl} />
      </PageHeader>

      {ctl.fc && <StageStrip ctl={ctl} />}
      <Body ctl={ctl} />
      <AccuracySheet open={ctl.showAccuracy} onOpenChange={ctl.setShowAccuracy} accuracy={ctl.accuracy} live={ctl.live} />
    </Page>
  );
}

function EventPicker({ ctl }: { ctl: Ctl }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground" id="predict-season-label">Season</span>
        <ToggleGroup type="single" aria-labelledby="predict-season-label" value={String(ctl.season)} onValueChange={(v) => { if (v) ctl.chooseSeason(Number(v)); }}>
          {ctl.seasons.map((s) => (
            <ToggleGroupItem key={s} value={String(s)} size="lg" className="max-sm:h-11" title={SEASON_NAMES[s] ? `${seasonShort(s)} · ${SEASON_NAMES[s]}` : undefined}>
              {seasonShort(s)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {ctl.events == null ? (
        <div className="flex gap-2"><Skeleton className="h-16 w-56" /><Skeleton className="h-16 w-56" /></div>
      ) : ctl.teamError ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <CloudOff className="size-4 text-destructive" />
          <span className="min-w-0 flex-1">{ctl.teamError}</span>
          <Button size="sm" variant="outline" onClick={ctl.retryTeam} className="max-sm:h-11">Try again</Button>
        </div>
      ) : ctl.events.length ? (
        <ToggleGroup variant="cards"
          type="single"
          aria-label="Event"
          value={ctl.code ?? ''}
          onValueChange={(v) => { if (v) ctl.chooseEvent(v); }}
          className="-mx-1 w-[calc(100%+0.5rem)] snap-x overflow-x-auto px-1 pb-1"
        >
          {ctl.events.map((e) => {
            const upcoming = (e.date ?? '') >= today;
            return (
              <ToggleGroupItem
                key={e.code}
                value={e.code}
                className="min-h-14 snap-start bg-card px-4 py-2.5"
              >
                <span className="max-w-[15rem] truncate text-sm font-medium text-foreground">{e.name}</span>
                <span className="text-xs text-muted-foreground">{e.date ?? 'Date TBA'}{upcoming ? ' · upcoming' : ''}</span>
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
      ) : (
        <p className="text-sm text-muted-foreground">No advancing events for team {ctl.myTeam ?? ''} in {seasonShort(ctl.season)} yet.</p>
      )}
    </div>
  );
}

function StageStrip({ ctl }: { ctl: Ctl }) {
  const fc = ctl.fc!;
  const at = STAGES.findIndex((s) => s.k === fc.stage);
  return (
    <Reveal className="mb-6 rounded-xl border border-border bg-card p-4">
      <ol className="grid grid-cols-4 gap-2" aria-label="Event stage">
        {STAGES.map((s, i) => {
          const done = i < at, now = i === at;
          return (
            <li key={s.k} aria-current={now ? 'step' : undefined} className="min-w-0">
              <div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
                <motion.div
                  className={cn('absolute inset-y-0 left-0 rounded-full', now ? 'bg-accent' : 'bg-accent/50')}
                  initial={{ width: 0 }}
                  animate={{ width: done || now ? '100%' : 0 }}
                  transition={{ duration: 0.5, delay: i * 0.08 }}
                />
              </div>
              <p className={cn('mt-2 flex items-center gap-1 truncate text-xs', now ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                {done && <Check className="size-3 shrink-0 text-accent" />}
                <span className="truncate max-lg:sr-only">{s.label}</span>
                <span className="truncate lg:hidden" aria-hidden>{s.short}</span>
              </p>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
        <span><span className="font-medium text-foreground">{fc.slots}</span> advancement slot{fc.slots === 1 ? '' : 's'}{fc.slotsSource !== 'official' ? ' (estimated)' : ''}</span>
        <span>{fc.runs.toLocaleString()} simulations</span>
        <span>Updated {relTime(fc.generatedAt)}</span>
        <Button variant="ghost" size="sm" onClick={() => ctl.load(true)} disabled={ctl.loading} className="ml-auto max-sm:h-11">
          <RefreshCw className={cn(ctl.loading && 'animate-spin motion-reduce:animate-none')} /> Refresh
        </Button>
      </div>
    </Reveal>
  );
}

const TABS: { k: PredictTab; label: string; icon: typeof Target }[] = [
  { k: 'odds', label: 'Outlook', icon: Target },
  { k: 'alliance', label: 'Alliance', icon: Users },
  { k: 'field', label: 'Field', icon: ListOrdered },
  { k: 'matches', label: 'Matches', icon: Swords },
];

function Body({ ctl }: { ctl: Ctl }) {
  const { code, fc, fcError } = ctl;
  if (!code) return null;
  if (fcError) {
    if (fcError.status === 503) {
      return (
        <EmptyState
          icon={Sparkles}
          title="Predictions are warming up"
          description="The engine is loading match history. This takes a few minutes after an update."
          action={<Button variant="outline" onClick={() => ctl.load(true)}><RefreshCw /> Try again</Button>}
        />
      );
    }
    if (fcError.status === 422) return <EmptyState icon={CloudOff} title="No forecast for this event" description={fcError.message} />;
    return (
      <EmptyState
        icon={CloudOff}
        title="Couldn't load the forecast"
        description={fcError.message}
        action={<Button variant="outline" onClick={() => ctl.load(true)}><RefreshCw /> Try again</Button>}
      />
    );
  }
  if (!fc) {
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]" aria-busy="true">
        <Skeleton className="h-56" /><Skeleton className="h-56" /><Skeleton className="h-28 lg:col-span-2" />
      </div>
    );
  }
  return (
    <Tabs value={ctl.tab} onValueChange={(v) => ctl.setTab(v as PredictTab)}>
      <TabsList aria-label="Predict views" className="mb-5 grid w-full grid-cols-4 sm:inline-flex sm:w-auto">
        {TABS.map(({ k, label, icon: Icon }) => (
          <TabsTrigger key={k} value={k} className="max-sm:h-11 max-sm:px-1">
            <Icon className="max-sm:hidden" />{label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="odds"><OutlookTab fc={fc} myTeam={ctl.myTeam} /></TabsContent>
      <TabsContent value="alliance"><AllianceTab season={ctl.season} code={code} fc={fc} nameOf={ctl.nameOf} myTeam={ctl.myTeam} refreshKey={ctl.refreshKey} /></TabsContent>
      <TabsContent value="field"><FieldTab fc={fc} nameOf={ctl.nameOf} myTeam={ctl.myTeam} /></TabsContent>
      <TabsContent value="matches"><MatchesTab fc={fc} myTeam={ctl.myTeam} /></TabsContent>
      {fc.assumptions.length > 0 && (
        <details className="group mt-6 rounded-xl border border-border px-4 py-3 text-sm">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 font-medium text-foreground sm:min-h-0">
            What this assumes <span className="text-xs text-muted-foreground group-open:hidden">{fc.assumptions.length} note{fc.assumptions.length === 1 ? '' : 's'}</span>
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            {fc.assumptions.map((a) => <li key={a}>{a}</li>)}
          </ul>
        </details>
      )}
    </Tabs>
  );
}
