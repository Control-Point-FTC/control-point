// Modern Outreach (phase 8b), rebuilt on the shadcn kit over the shared
// useOutreachController (same endpoints, permissions and optimistic updates
// as Legacy). An impact strip, an event timeline, auto-synced social
// channels, a drafted event sheet and the Bruno AI bulk log.
import { useMemo } from 'react';
import { motion } from 'motion/react';
import {
  ArrowDown, ArrowUp, Clock, DollarSign, ExternalLink, Flag, Globe, Loader2, MapPin, MoreHorizontal, Pencil, Pin, PinOff,
  Plus, RefreshCw, Sparkles, Trash2, Users, Wand2, X, Youtube,
} from 'lucide-react';
import { cn } from '../../../components/cn';
import {
  Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DropdownMenu,
  DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Input, Label, Sheet, SheetContent,
  SheetDescription, SheetFooter, SheetHeader, SheetTitle, Textarea, ToggleGroup, ToggleGroupItem, RequiredMark,
} from '../../../components/ui-kit';
import { useIsNarrow } from '../../../components/scout/ScoutUi';
import { OUTREACH_PRESETS, useOutreachController } from '../../../components/outreach/useOutreachController';
import { assetUrl } from '../../../services/api';
import { Page, PageHeader, Section, EmptyState, Stat } from '../../ui/page';
import { Reveal, Stagger, StaggerItem } from '../../ui/motion';
import { AnimatedValue } from '../../AnimatedValue';
import { BulkBar, RowCheckbox, SelectAllCheckbox, useSelection } from '../../ui/selection';

const rowId = (r: any) => r.id as number;

type Ctl = ReturnType<typeof useOutreachController>;
const compact = (n: any) => {
  const v = Number(n);
  return Number.isFinite(v) ? new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(v) : '—';
};
const timeAgo = (ts: number) => {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export function OutreachPage({ outreach, setOutreach, socialProfiles, setSocialProfiles, youtubeEnabled, currentUser, onRefresh, refresh, hasScope }: any) {
  const ctl = useOutreachController({ outreach, setOutreach, socialProfiles, setSocialProfiles, currentUser, onRefresh, refresh, hasScope });
  const t = ctl.totals;
  return (
    <Page>
      <PageHeader
        eyebrow="Operations"
        title="Outreach"
        description="Every demo, workshop and fundraiser the team runs — and the channels that tell the story."
        actions={
          <>
            <Button variant="outline" onClick={() => ctl.setBulkOpen(true)}><Wand2 /> Bruno AI</Button>
            <Button onClick={ctl.openAdd}><Plus /> Log event</Button>
          </>
        }
      />
      <Reveal className="mb-8 grid grid-cols-2 gap-6 border-b border-border pb-6 lg:grid-cols-4">
        <Stat icon={Flag} label="Events" value={<AnimatedValue value={t.events} />} />
        <Stat icon={Clock} label="Hours" value={<AnimatedValue value={`${t.hours}h`} />} />
        <Stat icon={Users} label="People reached" value={<AnimatedValue value={compact(t.attendees)} />} />
        <Stat icon={DollarSign} label="Funds raised" value={<AnimatedValue value={`$${compact(t.funds)}`} />} />
      </Reveal>

      <Timeline ctl={ctl} outreach={outreach || []} />
      <Channels ctl={ctl} youtubeEnabled={youtubeEnabled} />
      <EventSheet ctl={ctl} />
      <BulkSheet ctl={ctl} />
      <LinkYouTube ctl={ctl} />
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Event timeline (any member can log, edit or delete — as on the server)
// ---------------------------------------------------------------------------

function Timeline({ ctl, outreach }: { ctl: Ctl; outreach: any[] }) {
  const events = useMemo(() => [...outreach].sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.id - a.id), [outreach]);
  const sel = useSelection(events, rowId);
  return (
    <Section
      title="Event log"
      description="Newest first. Right-click (or use the menu) to edit or delete."
      action={events.length > 0 ? (
        <label className="flex min-h-9 items-center gap-2 rounded-md px-1 text-sm text-muted-foreground max-sm:min-h-11">
          <SelectAllCheckbox sel={sel} label="Select all outreach events" />
          <span>{sel.count ? `${sel.count} selected` : 'Select all'}</span>
        </label>
      ) : undefined}
    >
      {!events.length ? (
        <EmptyState icon={Globe} title="No outreach events yet" description="Log your first one, paste a list into Bruno AI, or ask Bruno in chat." action={<Button onClick={ctl.openAdd}><Plus /> Log event</Button>} />
      ) : (
        <Stagger as="ol" className="relative space-y-3 before:absolute before:bottom-6 before:left-[1.6rem] before:top-6 before:w-px before:bg-border">
          {events.map((e) => {
            const d = new Date(`${String(e.date).slice(0, 10)}T00:00:00`);
            const ok = !Number.isNaN(d.getTime());
            return (
              <StaggerItem as="li" key={e.id} data-cm-type="outreach" data-cm-id={e.id} className="relative flex items-start gap-3 sm:gap-4">
                <RowCheckbox sel={sel} id={e.id} label={`Select ${e.title}`} className="mt-4" />
                <div className="z-[1] flex w-[3.2rem] shrink-0 flex-col items-center rounded-xl border border-border bg-card py-1.5 text-center">
                  <span className="text-[11px] uppercase text-muted-foreground">{ok ? d.toLocaleDateString(undefined, { month: 'short' }) : '—'}</span>
                  <span className="font-display text-lg font-semibold leading-none tabular-nums">{ok ? d.getDate() : ''}</span>
                  <span className="text-[10px] text-muted-foreground">{ok ? d.getFullYear() : ''}</span>
                </div>
                <article className={cn('min-w-0 flex-1 rounded-xl border border-border bg-card p-4 transition-colors hover:border-accent/40', sel.has(e.id) && 'border-accent/60 ring-1 ring-accent/40')}>
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium leading-snug">{e.title}</h3>
                      {e.location && <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3.5" />{e.location}</p>}
                    </div>
                    <Badge variant="soft" className="shrink-0 tabular-nums"><Clock />{e.hours}h</Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button data-cm-menu variant="ghost" size="icon-sm" aria-label={`Actions for ${e.title}`} className="-mr-1 -mt-1 max-sm:size-11"><MoreHorizontal /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => ctl.openEdit(e)}><Pencil /> Edit event</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => void ctl.handleDelete(e.id)} className="text-destructive focus:text-destructive"><Trash2 /> Delete event</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {e.description && <p className="mt-2 text-sm text-muted-foreground">{e.description}</p>}
                  {(e.attendees > 0 || e.funds_raised > 0) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {e.attendees > 0 && <Badge variant="secondary"><Users />{e.attendees} reached</Badge>}
                      {e.funds_raised > 0 && <Badge variant="success"><DollarSign />{compact(e.funds_raised)} raised</Badge>}
                    </div>
                  )}
                </article>
              </StaggerItem>
            );
          })}
        </Stagger>
      )}
      <BulkBar sel={sel} noun="outreach event" actions={[{ label: 'Delete', icon: <Trash2 />, danger: true, run: (ids) => ctl.bulkDeleteEvents(ids.map(Number)) }]} />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Social channels (manage with the outreach permission)
// ---------------------------------------------------------------------------

function Trend({ points }: { points: any[] }) {
  const vals = (points || []).filter((v: any) => typeof v === 'number' && Number.isFinite(v));
  if (vals.length < 2) return <p className="text-xs text-muted-foreground">Sync history will chart here</p>;
  const w = 140, h = 44, pad = 4;
  const min = Math.min(...vals), max = Math.max(...vals), span = (max - min) || 1;
  const pts = vals.map((v: number, i: number) => [pad + (i * (w - 2 * pad)) / (vals.length - 1), h - pad - ((v - min) / span) * (h - 2 * pad)]);
  const line = pts.map(([x, y]: number[]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const up = vals[vals.length - 1] >= vals[0];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible" aria-hidden>
      <motion.polyline points={line} fill="none" className={up ? 'stroke-success' : 'stroke-destructive'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8 }} />
    </svg>
  );
}

function Channels({ ctl, youtubeEnabled }: { ctl: Ctl; youtubeEnabled: boolean }) {
  const admin = ctl.isAdminSocial;
  return (
    <Section
      title="Channels"
      description="YouTube stats sync automatically every day."
      action={admin && youtubeEnabled && ctl.profiles.length > 0 && <Button size="sm" variant="outline" onClick={() => ctl.setShowLinkYT(true)} className="max-sm:h-11"><Plus /> Link YouTube</Button>}
    >
      {!ctl.profiles.length ? (
        <EmptyState
          icon={Youtube}
          title="No channels linked yet"
          description={admin ? (youtubeEnabled ? 'Link the team YouTube channel to track subscribers and views.' : "Social auto-sync isn't configured on the server yet.") : 'Members with the outreach permission can link channels.'}
          action={admin && youtubeEnabled && <Button variant="outline" onClick={() => ctl.setShowLinkYT(true)}><Youtube /> Link YouTube channel</Button>}
        />
      ) : (
        <Stagger className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ctl.profiles.map((p: any, i: number) => {
            const g = p.growth;
            const yt = p.platform === 'youtube';
            const videos = Number(p.latest?.posts) || 0, views = Number(p.latest?.views) || 0;
            const url = p.custom_url ? `https://www.youtube.com/${String(p.custom_url)}` : p.external_id ? `https://www.youtube.com/channel/${p.external_id}` : null;
            return (
              <StaggerItem key={p.id} data-cm-row-root className="flex flex-col rounded-2xl border border-border bg-card p-5">
                <div className="flex items-start gap-3">
                  {p.avatar_url ? <img src={assetUrl(p.avatar_url)} alt="" className="size-10 rounded-full object-cover" /> : (
                    <span className="flex size-10 items-center justify-center rounded-full bg-red-500/15 text-red-500">{yt ? <Youtube className="size-5" /> : <Globe className="size-5" />}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate font-medium">{p.display_name || p.handle}{p.is_pinned ? <Pin className="size-3.5 text-accent" aria-label="Pinned" /> : null}</p>
                    <p className="truncate text-xs text-muted-foreground">{yt ? 'YouTube' : p.platform}{p.handle ? ` · ${p.handle}` : ''}</p>
                  </div>
                  {admin && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button data-cm-menu variant="ghost" size="icon-sm" aria-label={`Manage ${p.display_name || p.handle}`} className="max-sm:size-11"><MoreHorizontal /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => void ctl.handlePinProfile(p.id, !!p.is_pinned)}>{p.is_pinned ? <><PinOff /> Unpin from top</> : <><Pin /> Pin to top</>}</DropdownMenuItem>
                        <DropdownMenuItem disabled={i === 0} onSelect={() => void ctl.handleMoveProfile(p.id, -1)}><ArrowUp /> Move up</DropdownMenuItem>
                        <DropdownMenuItem disabled={i === ctl.profiles.length - 1} onSelect={() => void ctl.handleMoveProfile(p.id, 1)}><ArrowDown /> Move down</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => void ctl.handleUnlinkProfile(p.id)} className="text-destructive focus:text-destructive"><Trash2 /> Unlink</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                <div className="mt-4 flex items-end justify-between gap-3">
                  <div>
                    <p className="font-display text-4xl font-semibold tabular-nums leading-none">{compact(p.latest?.followers)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{yt ? 'Subscribers' : 'Followers'}</p>
                    {g && <Badge variant={g.delta >= 0 ? 'success' : 'destructive'} className="mt-2">{g.delta >= 0 ? '+' : ''}{compact(g.delta)} ({g.delta >= 0 ? '+' : ''}{g.pct}%)</Badge>}
                  </div>
                  <Trend points={p.history} />
                </div>
                {yt && (p.latest?.views != null || p.latest?.posts != null) && (
                  <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
                    <div><dd className="font-medium tabular-nums">{compact(views)}</dd><dt className="text-[11px] text-muted-foreground">views</dt></div>
                    <div><dd className="font-medium tabular-nums">{compact(videos)}</dd><dt className="text-[11px] text-muted-foreground">videos</dt></div>
                    <div><dd className="font-medium tabular-nums">{compact(videos ? Math.round(views / videos) : 0)}</dd><dt className="text-[11px] text-muted-foreground">avg / video</dt></div>
                  </dl>
                )}
                <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs text-muted-foreground">
                  <span>{p.last_synced_at ? `Synced ${timeAgo(p.last_synced_at)}` : 'Not synced yet'}</span>
                  <span className="flex items-center gap-1">
                    {url && <Button asChild variant="ghost" size="sm" className="max-sm:h-11"><a href={url} target="_blank" rel="noreferrer"><ExternalLink /> Open</a></Button>}
                    {admin && (
                      <Button variant="ghost" size="sm" onClick={() => void ctl.handleSyncNow(p.id)} disabled={ctl.syncingId === p.id} className="max-sm:h-11">
                        <RefreshCw className={cn(ctl.syncingId === p.id && 'animate-spin motion-reduce:animate-none')} /> {ctl.syncingId === p.id ? 'Syncing…' : 'Sync now'}
                      </Button>
                    )}
                  </span>
                </div>
              </StaggerItem>
            );
          })}
        </Stagger>
      )}
    </Section>
  );
}

function LinkYouTube({ ctl }: { ctl: Ctl }) {
  return (
    <Dialog open={ctl.showLinkYT} onOpenChange={(o) => { if (!o && !ctl.linkingYT) ctl.setShowLinkYT(false); }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>Link YouTube channel</DialogTitle>
          <DialogDescription>Stats sync right away, then every day.</DialogDescription>
        </DialogHeader>
        <form id="yt-form" noValidate onSubmit={(e) => { e.preventDefault(); void ctl.handleLinkYouTube(); }} className="grid gap-2">
          <Label htmlFor="yt-input">Channel</Label>
          <Input id="yt-input" value={ctl.ytInput} onChange={(e) => ctl.setYtInput(e.target.value)} placeholder="@handle, channel URL, channel ID, or analyzer link" />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => ctl.setShowLinkYT(false)} disabled={ctl.linkingYT}>Cancel</Button>
          <Button type="submit" form="yt-form" disabled={ctl.linkingYT}>{ctl.linkingYT ? <><Loader2 className="animate-spin" /> Linking…</> : 'Link channel'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Event sheet (drafted)
// ---------------------------------------------------------------------------

function EventSheet({ ctl }: { ctl: Ctl }) {
  const narrow = useIsNarrow();
  const f = ctl.form;
  const num = (id: string, label: string, key: 'hours' | 'attendees' | 'funds_raised', extra: Record<string, unknown> = {}) => (
    <div className="grid gap-2">
      <Label htmlFor={`oe-${id}`}>{label}</Label>
      <Input id={`oe-${id}`} type="number" min="0" inputMode="decimal" value={f[key]} onChange={ctl.set(key)} className="tabular-nums max-sm:h-11" {...extra} />
    </div>
  );
  return (
    <Sheet open={ctl.showForm} onOpenChange={(o) => { if (!o) ctl.closeForm(); }}>
      <SheetContent side={narrow ? 'bottom' : 'right'} className={cn('gap-0 p-0', !narrow && 'sm:max-w-md')}>
        <SheetHeader className="border-b border-border px-6 py-5 pr-12">
          <SheetTitle>{ctl.editingId ? 'Edit outreach event' : 'Log outreach event'}</SheetTitle>
          <SheetDescription>{ctl.editingId ? 'Update the details below.' : 'Pick a quick type or fill in the details.'}</SheetDescription>
        </SheetHeader>
        <form id="outreach-form" noValidate className="flex-1 space-y-5 overflow-y-auto px-6 py-5" onSubmit={(e) => { e.preventDefault(); void ctl.handleSubmit(); }}>
          <fieldset disabled={ctl.saving} className="m-0 min-w-0 space-y-5 border-0 p-0">
          {!ctl.editingId && (
            <ToggleGroup variant="chips" type="single" aria-label="Quick type" value={OUTREACH_PRESETS.includes(f.title) ? f.title : ''} onValueChange={(v) => { if (v) ctl.setForm((cur) => ({ ...cur, title: v })); }}>
              {OUTREACH_PRESETS.map((p) => (
                <ToggleGroupItem key={p} value={p}>{p}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
          <div className="grid gap-2">
            <Label htmlFor="oe-title">Event title <RequiredMark /></Label>
            <Input id="oe-title" required value={f.title} onChange={ctl.set('title')} placeholder="e.g. Library STEM Demo" className="max-sm:h-11" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="oe-description">Description</Label>
            <Textarea id="oe-description" rows={3} value={f.description} onChange={ctl.set('description')} placeholder="What did the team do?" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="oe-date">Date <RequiredMark /></Label>
              <Input id="oe-date" required type="date" value={f.date} onChange={ctl.set('date')} className="max-sm:h-11" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="oe-location">Location</Label>
              <Input id="oe-location" value={f.location} onChange={ctl.set('location')} placeholder="Where?" className="max-sm:h-11" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {num('hours', 'Hours', 'hours', { placeholder: '2', step: 'any' })}
            {num('attendees', 'Attendees', 'attendees', { placeholder: '0', step: '1', inputMode: 'numeric' })}
            {num('funds', 'Funds ($)', 'funds_raised', { step: 'any', placeholder: '0' })}
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Sparkles className="size-3.5 text-accent" />You can also ask Bruno in chat to log one or many events.</p>
          </fieldset>
        </form>
        <SheetFooter className="flex-row justify-end gap-2 border-t border-border px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button variant="outline" onClick={ctl.closeForm}>Cancel</Button>
          <Button type="submit" form="outreach-form" disabled={ctl.saving}>{ctl.saving ? 'Saving…' : ctl.editingId ? 'Save changes' : 'Log event'}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Bruno AI bulk log (drafted text + parsed rows)
// ---------------------------------------------------------------------------

function BulkSheet({ ctl }: { ctl: Ctl }) {
  const narrow = useIsNarrow();
  return (
    <Sheet open={ctl.bulkOpen} onOpenChange={(o) => ctl.setBulkOpen(o)}>
      <SheetContent side={narrow ? 'bottom' : 'right'} className={cn('gap-0 p-0', !narrow && 'sm:max-w-lg')}>
        <SheetHeader className="border-b border-border px-6 py-5 pr-12">
          <SheetTitle className="flex items-center gap-2"><Wand2 className="size-5 text-accent" /> Bruno AI</SheetTitle>
          <SheetDescription>Paste rows or describe events in plain words — they become log entries in one go.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div className="grid gap-2">
            <Label htmlFor="bulk-text">Events</Label>
            <Textarea
              id="bulk-text" rows={6} disabled={ctl.bulkSaving} value={ctl.bulkText} onChange={(e) => ctl.setBulkText(e.target.value)} className="font-mono text-xs"
              placeholder={'Robotics demo | 2026-09-12 | 2 | Community center | 40 attendees\nSTEM workshop | Sep 18 | 3h | Local high school | $250 raised\n\n…or paste straight from a spreadsheet — tabs work too.'}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={ctl.handleBulkParse} disabled={!ctl.bulkText.trim() || ctl.bulkSaving}>Quick parse</Button>
            <Button variant="outline" onClick={() => void ctl.handleBulkAiParse()} disabled={ctl.bulkBusy || ctl.bulkSaving || !ctl.bulkText.trim()}>
              {ctl.bulkBusy ? <Loader2 className="animate-spin" /> : <Sparkles />} {ctl.bulkBusy ? 'Bruno is reading…' : 'Bruno'}
            </Button>
          </div>
          {ctl.bulkNote && <p className="text-sm text-muted-foreground" role="status">{ctl.bulkNote}</p>}
          {ctl.bulkRows.length > 0 && (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {ctl.bulkRows.map((r: any, i: number) => (
                <li key={i} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.title}</p>
                    <p className="text-xs text-muted-foreground">{[r.date, r.hours !== '' && `${r.hours}h`, r.location, r.attendees !== '' && `${r.attendees} attendees`, r.funds_raised !== '' && `$${r.funds_raised}`].filter(Boolean).join(' · ')}</p>
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={() => ctl.removeBulkRow(i)} aria-label={`Remove ${r.title}`} className="max-sm:size-11"><X /></Button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <SheetFooter className="flex-row justify-end gap-2 border-t border-border px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button variant="outline" onClick={() => ctl.setBulkOpen(false)}>Close</Button>
          <Button onClick={() => void ctl.handleBulkLogAll()} disabled={ctl.bulkSaving || !ctl.bulkRows.length}>
            {ctl.bulkSaving ? 'Logging…' : `Log all ${ctl.bulkRows.length} event${ctl.bulkRows.length === 1 ? '' : 's'}`}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
