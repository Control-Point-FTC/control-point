// Modern CAD (phase 8d), rebuilt on the shadcn kit over the shared useCad
// hooks (same /api/cad/* endpoints, review workflow and ownership rules as
// Legacy). One page with route-driven tabs: Overview, Onshape docs, Design
// reviews, 3D snapshots and the Parts list (BOM).
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, Box, ClipboardCheck, Clock, ExternalLink, FileBox, Layers, Link2, MoreHorizontal, Package, Plus, Trash2, Upload } from 'lucide-react';
import { useRecordFocus } from '../../hooks/useRecordFocus';
import { cn } from '../../../components/cn';
import {
  Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Input, Label, Skeleton,
  Tabs, TabsList, TabsTrigger,
} from '../../../components/ui-kit';
import { fmtDate, useCadDashboard, useCadDocs } from '../../../components/cad/useCad';
import { Page, PageHeader, Section, EmptyState, Stat } from '../../ui/page';
import { Reveal, Stagger, StaggerItem } from '../../ui/motion';
import { AnimatedValue } from '../../AnimatedValue';
import { BulkBar, RowCheckbox, SelectAllCheckbox, useSelection } from '../../ui/selection';

const docId = (r: any) => r.id as number;
import { CadReviewsTab } from './CadReviewsTab';
import { CadSnapshotsTab } from './CadSnapshotsTab';
import { CadPartsTab } from './CadPartsTab';

const TABS = [
  { id: 'cad', label: 'Overview', icon: Box },
  { id: 'cad-docs', label: 'Onshape docs', icon: FileBox },
  { id: 'cad-reviews', label: 'Design reviews', icon: ClipboardCheck },
  { id: 'cad-snapshots', label: 'Snapshots', icon: Layers },
  { id: 'cad-parts', label: 'Parts list', icon: Package },
];

export function CadPage({ activeTab, currentUser, isAdmin }: { activeTab: string; currentUser?: any; isAdmin: boolean }) {
  const navigate = useNavigate();
  const tab = TABS.some((t) => t.id === activeTab) ? activeTab : 'cad';
  return (
    <Page>
      <PageHeader eyebrow="Build" title="CAD" description="Designs, reviews, 3D snapshots and the bill of materials — one home for the CAD team.">
        <Tabs value={tab} onValueChange={(v) => navigate(`/${v}`)}>
          <TabsList aria-label="CAD sections" className="max-w-full justify-start overflow-x-auto">
            {TABS.map(({ id, label, icon: Icon }) => (
              <TabsTrigger key={id} value={id} className="shrink-0 max-sm:h-11"><Icon />{label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </PageHeader>
      {tab === 'cad' && <Overview onNavigate={(p) => navigate(p)} />}
      {tab === 'cad-docs' && <DocsTab />}
      {tab === 'cad-reviews' && <CadReviewsTab currentUser={currentUser} isAdmin={isAdmin} />}
      {tab === 'cad-snapshots' && <CadSnapshotsTab currentUser={currentUser} isAdmin={isAdmin} />}
      {tab === 'cad-parts' && <CadPartsTab />}
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

const KIND_ICON: Record<string, typeof Box> = { review: ClipboardCheck, snapshot: Layers, part: Package, doc: FileBox };

function Overview({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { data, loading } = useCadDashboard();
  if (loading) return <div className="grid grid-cols-2 gap-6 lg:grid-cols-4" aria-busy="true">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>;
  if (!data) return <EmptyState icon={Box} title="Couldn't load the CAD dashboard" description="Try refreshing the page." />;
  return (
    <>
      <Reveal className="mb-8 grid grid-cols-2 gap-6 border-b border-border pb-6 lg:grid-cols-4">
        <Stat icon={FileBox} label="Onshape docs" value={<AnimatedValue value={data.docsCount} />} onClick={() => onNavigate('/cad-docs')} />
        <Stat icon={ClipboardCheck} label="Pending reviews" value={<AnimatedValue value={data.pendingReviews} />} tone={data.pendingReviews > 0 ? 'bad' : 'default'} onClick={() => onNavigate('/cad-reviews')} />
        <Stat icon={Layers} label="Snapshots" value={<AnimatedValue value={data.snapshotsCount} />} onClick={() => onNavigate('/cad-snapshots')} />
        <Stat icon={Package} label="Parts" value={<AnimatedValue value={data.partsCount} />} hint={`$${Number(data.partsTotalCost || 0).toFixed(2)} total`} onClick={() => onNavigate('/cad-parts')} />
      </Reveal>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Section title="Review queue" description="Designs waiting for an admin.">
          {data.needsAttention?.length ? (
            <Stagger as="ul" className="space-y-2">
              {data.needsAttention.map((r: any) => (
                <StaggerItem as="li" key={r.id}>
                  <button onClick={() => onNavigate('/cad-reviews')} className="flex w-full items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3 text-left transition-colors hover:border-amber-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
                    <AlertCircle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{r.title}</span>
                      <span className="block text-xs text-muted-foreground">{r.section}{r.author_name ? ` · ${r.author_name}` : ''} · waiting since {fmtDate(r.updated_at)}</span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </StaggerItem>
              ))}
            </Stagger>
          ) : <EmptyState icon={ClipboardCheck} title="Queue is clear" description="Nothing is waiting for review." className="py-6" />}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => onNavigate('/cad-docs')} className="max-sm:h-11"><Link2 /> Link a doc</Button>
            <Button variant="outline" size="sm" onClick={() => onNavigate('/cad-reviews')} className="max-sm:h-11"><ClipboardCheck /> Submit a design</Button>
            <Button variant="outline" size="sm" onClick={() => onNavigate('/cad-snapshots')} className="max-sm:h-11"><Upload /> Upload a snapshot</Button>
            <Button variant="outline" size="sm" onClick={() => onNavigate('/cad-parts')} className="max-sm:h-11"><Plus /> Add a part</Button>
          </div>
        </Section>
        <Section title="Recent activity" description="Latest CAD work across the team.">
          {data.recent?.length ? (
            <Stagger as="ol" className="relative space-y-3 before:absolute before:bottom-2 before:left-[0.95rem] before:top-2 before:w-px before:bg-border">
              {data.recent.map((a: any, i: number) => {
                const Icon = KIND_ICON[a.kind] || Box;
                return (
                  <StaggerItem as="li" key={`${a.kind}-${a.id}-${i}`} className="relative flex items-center gap-3">
                    <span className="z-[1] flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-card"><Icon className="size-4 text-accent" /></span>
                    <span className="min-w-0 flex-1 truncate text-sm">{a.title}</span>
                    {a.section && <span className="hidden text-xs text-muted-foreground sm:inline">{a.section}</span>}
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><Clock className="size-3" />{fmtDate(a.ts)}</span>
                  </StaggerItem>
                );
              })}
            </Stagger>
          ) : <EmptyState icon={Clock} title="No CAD activity yet" description="Link an Onshape doc to get started." className="py-6" />}
        </Section>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Onshape docs
// ---------------------------------------------------------------------------

function DocsTab() {
  const d = useCadDocs();
  const sel = useSelection(d.docs, docId);
  useRecordFocus('id', d.loaded, 'That CAD document');
  return (
    <>
      <Reveal className="mb-8 rounded-2xl border border-border bg-card p-5">
        <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); void d.add(); }}>
          <fieldset disabled={d.busy} className="contents">
            <div className="grid gap-2">
              <Label htmlFor="doc-name">Document name</Label>
              <Input id="doc-name" value={d.name} onChange={(e) => d.setName(e.target.value)} placeholder="2026 Robot Assembly" className="max-sm:h-11" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="doc-url">Onshape link</Label>
              <Input id="doc-url" value={d.url} onChange={(e) => d.setUrl(e.target.value)} placeholder="https://cad.onshape.com/documents/…" className="max-sm:h-11" />
            </div>
            <Button type="submit"><Link2 /> {d.busy ? 'Linking…' : 'Link'}</Button>
          </fieldset>
        </form>
      </Reveal>
      <Section
        title={`Team documents (${d.docs.length})`}
        description="One shared home for every CAD document the team uses."
        action={d.docs.length > 0 ? (
          <label className="flex min-h-9 items-center gap-2 rounded-md px-1 text-sm text-muted-foreground max-sm:min-h-11">
            <SelectAllCheckbox sel={sel} label="Select all linked documents" />
            <span>{sel.count ? `${sel.count} selected` : 'Select all'}</span>
          </label>
        ) : undefined}
      >
        {!d.loaded ? <div className="grid gap-3 sm:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-20" />)}</div> : d.docs.length ? (
          <Stagger as="ul" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {d.docs.map((doc) => (
              <StaggerItem as="li" key={doc.id} data-record-id={doc.id} className={cn('flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-accent/40', sel.has(doc.id) && 'border-accent/60 ring-1 ring-accent/40')}>
                <RowCheckbox sel={sel} id={doc.id} label={`Select ${doc.name}`} />
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/15"><FileBox className="size-5 text-accent" /></span>
                <div className="min-w-0 flex-1">
                  <a href={doc.url} target="_blank" rel="noreferrer" className="block truncate font-medium underline-offset-2 hover:underline">{doc.name}</a>
                  <p className="text-xs text-muted-foreground">Linked {fmtDate(doc.created_at)}</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button data-cm-menu variant="ghost" size="icon-sm" aria-label={`Actions for ${doc.name}`} className="max-sm:size-11"><MoreHorizontal /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild><a href={doc.url} target="_blank" rel="noreferrer"><ExternalLink /> Open in Onshape</a></DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => void d.remove(doc.id)} className={cn('text-destructive focus:text-destructive')}><Trash2 /> Unlink</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </StaggerItem>
            ))}
          </Stagger>
        ) : <EmptyState icon={FileBox} title="No Onshape docs linked yet" description="Paste a document link above — the whole team will see it here." />}
        <BulkBar sel={sel} noun="document" actions={[{ label: 'Unlink', icon: <Trash2 />, danger: true, run: (ids) => d.bulkRemove(ids.map(Number)) }]} />
      </Section>
    </>
  );
}
