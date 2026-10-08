// Modern Resources (phase 8c), rebuilt on the shadcn kit over the shared
// useResourcesController (same endpoints, live refetch and row-only delete
// rollback as Legacy). A link library: an "add links" composer where Bruno
// extracts and sorts every URL from pasted text into an editable preview,
// category chips with counts, a search box, and link cards with an actions
// menu.
import { useMemo, useState } from 'react';
import {
  Box, Code2, Copy, ExternalLink, Flag, Globe, Link2, Loader2, MoreHorizontal, Package, Play, RefreshCw, Save, Search,
  Sparkles, Trash2, Users, X,
} from 'lucide-react';
import { cn } from '../../../components/cn';
import {
  Badge, Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Input, Label,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, Textarea, ToggleGroup, ToggleGroupItem,
} from '../../../components/ui-kit';
import { notify } from '../../../components/dialog';
import { copyText } from '../../../components/copyText';
import { RESOURCE_CATEGORIES, RESOURCE_FILTERS, domainOf, formatResourceDate, useResourcesController } from '../../../components/resources/useResourcesController';
import { Page, PageHeader, Section, EmptyState } from '../../ui/page';
import { Reveal, Stagger, StaggerItem } from '../../ui/motion';
import { BulkBar, RowCheckbox, SelectAllCheckbox, useSelection } from '../../ui/selection';
import { useContextMenu } from '../../../components/contextmenu/ContextMenuProvider';

const rowId = (r: any) => r.id as number;
const copyLink = (url: string) => { void copyText(url).then((ok) => notify(ok ? 'Link copied.' : 'Could not copy the link.', ok ? 'success' : 'error')); };

type Ctl = ReturnType<typeof useResourcesController>;

const CAT: Record<string, { Icon: typeof Flag; tone: string }> = {
  'Game Updates': { Icon: Flag, tone: 'bg-sky-500/15 text-sky-600 dark:text-sky-300' },
  'Parts & Suppliers': { Icon: Package, tone: 'bg-accent/15 text-accent' },
  'CAD & Design': { Icon: Box, tone: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300' },
  'Code & Programming': { Icon: Code2, tone: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' },
  Outreach: { Icon: Globe, tone: 'bg-orange-500/15 text-orange-600 dark:text-orange-300' },
  Videos: { Icon: Play, tone: 'bg-rose-500/15 text-rose-600 dark:text-rose-300' },
  Community: { Icon: Users, tone: 'bg-violet-500/15 text-violet-600 dark:text-violet-300' },
};
const catOf = (c: string) => CAT[c] ?? { Icon: Link2, tone: 'bg-muted text-muted-foreground' };

export function ResourcesPage() {
  const ctl = useResourcesController();
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return term ? ctl.items.filter((r) => `${r.title} ${r.description} ${r.url}`.toLowerCase().includes(term)) : ctl.items;
  }, [ctl.items, q]);
  const sel = useSelection(shown, rowId);
  // Right-click a resource card, title link included: open, copy, delete.
  useContextMenu('resource', (el) => {
    const r = ctl.resources.find((x: any) => String(x.id) === el.dataset.cmId);
    if (!r) return null;
    return [
      { label: 'Open link', icon: ExternalLink, action: () => { window.open(r.url, '_blank', 'noopener,noreferrer'); } },
      { label: 'Copy link', icon: Copy, action: () => copyLink(r.url) },
      { separator: true },
      { label: 'Delete', icon: Trash2, danger: true, action: () => void ctl.handleDelete(r.id) },
    ];
  });
  return (
    <Page>
      <PageHeader
        eyebrow="Operations"
        title="Resources"
        description="The team's link library. Paste a chat log and Bruno files every link."
        actions={<Badge variant="secondary" className="text-sm">{ctl.resources.length} saved link{ctl.resources.length === 1 ? '' : 's'}</Badge>}
      />
      <Composer ctl={ctl} />

      <Section title="Library">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[12rem] flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles, notes and links" aria-label="Search resources" className="pl-9 max-sm:h-11" />
          </div>
        </div>
        <ToggleGroup variant="chips" type="single" aria-label="Category" value={ctl.filter} onValueChange={(v) => { if (v) ctl.setFilter(v); }} className="mb-5 w-full overflow-x-auto pb-1 flex-nowrap">
          {RESOURCE_FILTERS.map((f) => (
            <ToggleGroupItem key={f} value={f}>
              {f}{ctl.counts[f] > 0 && <span className="text-muted-foreground"> {ctl.counts[f]}</span>}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {ctl.loading && !ctl.resources.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-40" />)}</div>
        ) : ctl.loadError ? (
          <EmptyState title="Couldn't load resources" description={ctl.loadError} action={<Button variant="outline" onClick={() => void ctl.fetchResources()}><RefreshCw /> Try again</Button>} />
        ) : !ctl.resources.length ? (
          <EmptyState icon={Link2} title="No resources yet" description="Paste a Discord thread or any text full of links above — Bruno pulls out every link, writes titles and descriptions, and files them for the whole team." />
        ) : !shown.length ? (
          <EmptyState title="Nothing here" description="Try another category or search." />
        ) : (
          <>
          <div className="mb-3 flex items-center">
            <label className="flex min-h-9 items-center gap-2 rounded-md px-1 text-sm text-muted-foreground max-sm:min-h-11">
              <SelectAllCheckbox sel={sel} label="Select all shown resources" />
              <span>{sel.count ? `${sel.count} selected` : 'Select all'}</span>
            </label>
          </div>
          <Stagger as="ul" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((r) => {
              const { Icon, tone } = catOf(r.category || 'Other');
              const domain = domainOf(r.url);
              const deleting = ctl.deletingIds.has(r.id);
              return (
                <StaggerItem as="li" key={r.id} data-cm-type="resource" data-cm-id={r.id} data-cm-links className={cn('group flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-accent/40', deleting && 'pointer-events-none opacity-50', sel.has(r.id) && 'border-accent/60 ring-1 ring-accent/40')}>
                  <div className="flex items-start gap-3">
                    <RowCheckbox sel={sel} id={r.id} label={`Select ${r.title || domain}`} className="mt-2.5" />
                    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', tone)} aria-hidden><Icon className="size-4" /></span>
                    <div className="min-w-0 flex-1">
                      <a href={r.url} target="_blank" rel="noreferrer" className="line-clamp-2 font-medium leading-snug underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60">{r.title || domain}</a>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{domain}</p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button data-cm-menu variant="ghost" size="icon-sm" aria-label={`Actions for ${r.title || domain}`} className="-mr-1 -mt-1 max-sm:size-11"><MoreHorizontal /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild><a href={r.url} target="_blank" rel="noreferrer"><ExternalLink /> Open link</a></DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => copyLink(r.url)}><Copy /> Copy link</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => void ctl.handleDelete(r.id)} className="text-destructive focus:text-destructive"><Trash2 /> Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {r.description && <p className="mt-3 line-clamp-3 flex-1 text-sm text-muted-foreground">{r.description}</p>}
                  <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-xs text-muted-foreground">
                    <Badge variant="outline" className="max-w-[55%] truncate">{r.category || 'Other'}</Badge>
                    <span className="truncate">{r.created_by_name ? `${r.created_by_name} · ` : ''}{formatResourceDate(r.created_at)}</span>
                  </div>
                </StaggerItem>
              );
            })}
          </Stagger>
          <BulkBar sel={sel} noun="resource" actions={[{ label: 'Delete', icon: <Trash2 />, danger: true, run: (ids) => ctl.bulkDeleteResources(ids.map(Number)) }]} />
          </>
        )}
      </Section>
    </Page>
  );
}

/** Paste text → Bruno extracts links → edit the preview → save all. */
function Composer({ ctl }: { ctl: Ctl }) {
  const preview = ctl.preview;
  return (
    <Reveal className="mb-8 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <Sparkles className="size-5 text-accent" />
        <h2 className="text-base font-semibold">Add links in bulk</h2>
      </div>
      <Label htmlFor="res-paste" className="sr-only">Text with links</Label>
      <Textarea
        id="res-paste" rows={4} value={ctl.pasteText} onChange={(e) => ctl.setPasteText(e.target.value)} disabled={ctl.saving}
        placeholder="Paste text with links — Discord messages, chat logs, notes. Bruno pulls out every link, writes titles and sorts them."
        className="mt-3 min-h-24 resize-y"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">Tip: dump a whole thread here — each URL is filed under the right category.</p>
        <Button onClick={() => void ctl.handleParse()} disabled={!ctl.pasteText.trim() || ctl.parsing || ctl.saving} className="max-sm:w-full">
          {ctl.parsing ? <Loader2 className="animate-spin" /> : <Sparkles />} {ctl.parsing ? 'Bruno is reading…' : 'Extract links with Bruno'}
        </Button>
      </div>
      {ctl.parseError && <p role="alert" className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{ctl.parseError}</p>}

      {preview && preview.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="mb-3 text-sm text-muted-foreground">Preview — edit before saving ({preview.length})</p>
          <fieldset disabled={ctl.saving} className="m-0 min-w-0 border-0 p-0">
            <ul className="max-h-[26rem] space-y-2 overflow-y-auto pr-1">
              {preview.map((row, i) => (
                <li key={`${row.url}-${i}`} className="rounded-xl border border-border p-3">
                  <div className="flex items-start gap-2">
                    <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_12rem]">
                      <Input value={row.title} onChange={(e) => ctl.updatePreviewRow(i, { title: e.target.value })} placeholder="Title" aria-label={`Title for ${row.url}`} className="font-medium max-sm:h-11" />
                      <Select value={row.category} onValueChange={(v) => ctl.updatePreviewRow(i, { category: v })}>
                        <SelectTrigger aria-label={`Category for ${row.url}`} className="max-sm:h-11"><SelectValue /></SelectTrigger>
                        <SelectContent>{RESOURCE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                      <p className="truncate px-1 text-xs text-muted-foreground sm:col-span-2">{row.url}</p>
                      <Input value={row.description} onChange={(e) => ctl.updatePreviewRow(i, { description: e.target.value })} placeholder="Short description…" aria-label={`Description for ${row.url}`} className="sm:col-span-2 max-sm:h-11" />
                    </div>
                    <Button variant="ghost" size="icon-sm" onClick={() => ctl.removePreviewRow(i)} aria-label={`Remove ${row.url}`} className="max-sm:size-11"><X /></Button>
                  </div>
                </li>
              ))}
            </ul>
          </fieldset>
          <SkippedNote items={ctl.skipped.filter((r) => r.duplicate !== 'repeat')} lead="already in your library" />
          <SkippedNote items={ctl.skipped.filter((r) => r.duplicate === 'repeat')} lead="repeated in this paste" />
          {ctl.saveError && <p role="alert" className="mt-3 text-sm text-destructive">{ctl.saveError}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={ctl.discardPreview} disabled={ctl.saving}>Discard</Button>
            <Button onClick={() => void ctl.handleSaveAll()} disabled={ctl.saving || preview.length === 0}>
              {ctl.saving ? <Loader2 className="animate-spin" /> : <Save />} {ctl.saving ? 'Saving…' : `Save all ${preview.length}`}
            </Button>
          </div>
        </div>
      )}
    </Reveal>
  );
}

/** "Left out 2 already in your library: FTC Docs, Core Hex." */
function SkippedNote({ items, lead }: { items: { url: string; title: string }[]; lead: string }) {
  if (!items.length) return null;
  const names = items.slice(0, 3).map((r) => r.title || r.url).join(', ');
  return <p className="mt-3 text-sm text-muted-foreground">Left out {items.length} {lead}: {names}{items.length > 3 ? ` and ${items.length - 3} more` : ''}.</p>;
}
