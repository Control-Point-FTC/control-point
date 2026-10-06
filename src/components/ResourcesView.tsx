import {
  Flag,
  Package,
  Box,
  Code2,
  Globe,
  Play,
  Users,
  Link2,
  ExternalLink,
  Trash2,
  X,
  Sparkles,
  Loader2,
  Save,
} from 'lucide-react';
import { RESOURCE_CATEGORIES, RESOURCE_FILTERS, domainOf, formatResourceDate, useResourcesController } from './resources/useResourcesController';
import { Card, Button, Input, cn } from './ui';
import { Select as ThemedSelect } from './Select';

export { RESOURCE_CATEGORIES } from './resources/useResourcesController';
export type { ResourceItem } from './resources/useResourcesController';
const FILTERS = RESOURCE_FILTERS;

function catMeta(cat: string): { Icon: any; badge: string } {
  switch (cat) {
    case 'Game Updates': return { Icon: Flag, badge: 'text-sky-300 bg-sky-400/10 border-sky-400/30' };
    case 'Parts & Suppliers': return { Icon: Package, badge: 'text-accent bg-accent/10 border-accent/30' };
    case 'CAD & Design': return { Icon: Box, badge: 'text-cyan-300 bg-cyan-400/10 border-cyan-400/30' };
    case 'Code & Programming': return { Icon: Code2, badge: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/30' };
    case 'Outreach': return { Icon: Globe, badge: 'text-orange-300 bg-orange-400/10 border-orange-400/30' };
    case 'Videos': return { Icon: Play, badge: 'text-rose-300 bg-rose-400/10 border-rose-400/30' };
    case 'Community': return { Icon: Users, badge: 'text-violet-300 bg-violet-400/10 border-violet-400/30' };
    default: return { Icon: Link2, badge: 'text-text-muted bg-text-base/5 border-text-base/10' };
  }
}

const formatDate = formatResourceDate;

/** Self-contained Resources page. Fetches its own data; needs no props. */
export default function ResourcesView() {
  // List, paste/preview and delete logic is shared with the Modern Resources page.
  const {
    resources, loading, loadError, fetchResources, filter, setFilter, items, counts,
    pasteText, setPasteText, parsing, parseError, preview, saving, saveError,
    handleParse, updatePreviewRow, removePreviewRow, discardPreview, handleSaveAll, deletingIds, handleDelete,
  } = useResourcesController();

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0">
      {/* header */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg sm:text-xl font-display font-bold text-text-base">Resources</h3>
          <p className="text-sm text-text-muted mt-1">Team link library — paste chat logs, AI sorts them.</p>
        </div>
        <span className="text-xs text-text-muted whitespace-nowrap">
          {resources.length} saved link{resources.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* paste box */}
      <Card className="!p-4 sm:!p-5">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-accent" />
          <p className="text-sm font-bold text-text-base">Add links in bulk</p>
        </div>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          disabled={saving}
          rows={4}
          placeholder="Paste text with links… (Discord messages, chat logs, notes — Bruno pulls out every link, writes titles, and sorts them into categories)"
          className="w-full min-w-0 bg-elevated border border-text-base/10 rounded-xl px-4 py-3 text-sm text-text-base placeholder:text-text-muted/60 focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-all resize-y min-h-[96px]"
        />
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between mt-3">
          <p className="text-[11px] text-text-muted">
            Tip: dump a whole Discord thread in here — Bruno extracts each URL and files it under the right category.
          </p>
          <Button onClick={handleParse} disabled={!pasteText.trim() || parsing || saving} className="shrink-0 w-full sm:w-auto">
            {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {parsing ? 'Bruno is reading…' : 'Extract links with Bruno'}
          </Button>
        </div>
        {parsing ? (
          <div className="flex items-center gap-3 mt-4 rounded-xl border border-accent/25 bg-accent/5 px-4 py-3">
            <Loader2 className="w-5 h-5 text-accent animate-spin shrink-0" />
            <p className="text-sm text-text-base">
              Bruno is reading your text<span className="animate-pulse">…</span>
              <span className="block text-xs text-text-muted mt-0.5">Pulling out links, writing titles, sorting into categories.</span>
            </p>
          </div>
        ) : null}
        {parseError ? (
          <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-200/90">
            {parseError}
          </div>
        ) : null}

        {/* editable preview */}
        {preview && preview.length > 0 ? (
          <div className="mt-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-text-muted">
              Preview — edit before saving ({preview.length})
            </p>
            <div className="space-y-2 max-h-[380px] overflow-y-auto custom-scrollbar pr-1">
              {preview.map((row, i) => (
                <div
                  key={`${row.url}-${i}`}
                  className="rounded-xl border border-text-base/10 bg-text-base/[0.02] p-3 space-y-2"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 space-y-2 min-w-0">
                      <Input
                        value={row.title}
                        onChange={(e: any) => updatePreviewRow(i, { title: e.target.value })}
                        disabled={saving}
                        placeholder="Title"
                        className="!py-1.5 !text-sm font-semibold"
                      />
                      <p className="text-xs text-text-muted/70 truncate px-1">{row.url}</p>
                      <Input
                        value={row.description}
                        onChange={(e: any) => updatePreviewRow(i, { description: e.target.value })}
                        disabled={saving}
                        placeholder="Short description…"
                        className="!py-1.5 !text-sm"
                      />
                    </div>
                    <button
                      onClick={() => removePreviewRow(i)}
                      disabled={saving}
                      className="p-1.5 rounded-lg text-text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0 disabled:opacity-40"
                      title="Remove"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <ThemedSelect
                    value={row.category}
                    onChange={(e) => updatePreviewRow(i, { category: e.target.value })}
                    disabled={saving}
                    className="w-full sm:w-56 bg-elevated border border-text-base/10 rounded-xl px-3 py-1.5 text-sm text-text-base focus:outline-none focus:border-accent/60"
                  >
                    {RESOURCE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </ThemedSelect>
                </div>
              ))}
            </div>
            {saveError ? (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-2.5 text-sm text-rose-200/90">
                {saveError}
              </div>
            ) : null}
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={discardPreview} disabled={saving}>
                Discard
              </Button>
              <Button onClick={handleSaveAll} disabled={saving || preview.length === 0}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving…' : `Save all ${preview.length}`}
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      {/* category filter chips */}
      <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1 -mx-1 px-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all active:scale-95',
              filter === f
                ? 'bg-accent text-accent-ink border-accent shadow-[0_4px_16px_rgba(255,199,0,0.25)]'
                : 'bg-text-base/[0.03] text-text-muted border-text-base/10 hover:text-text-base hover:border-text-base/25'
            )}
          >
            {f}{counts[f] > 0 ? <span className="opacity-70"> · {counts[f]}</span> : null}
          </button>
        ))}
      </div>

      {/* cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card-surface p-5 space-y-3 animate-pulse">
              <div className="h-6 w-32 rounded-full bg-text-base/10" />
              <div className="h-5 w-4/5 rounded bg-text-base/10" />
              <div className="h-4 w-full rounded bg-text-base/5" />
              <div className="h-4 w-2/3 rounded bg-text-base/5" />
            </div>
          ))}
        </div>
      ) : loadError ? (
        <Card className="min-h-[240px] flex flex-col items-center justify-center gap-4 text-center px-6">
          <p className="text-text-base font-bold">Couldn't load resources</p>
          <p className="text-sm text-text-muted">{loadError}</p>
          <Button onClick={fetchResources} variant="outline">Try again</Button>
        </Card>
      ) : items.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((r) => {
            const { Icon, badge } = catMeta(r.category || 'Other');
            const deleting = deletingIds.has(r.id);
            return (
              <div
                key={r.id}
                className={cn(
                  'group card-surface p-4 sm:p-5 flex flex-col gap-3 hover:!border-accent/40 transition-all active:scale-[0.99]',
                  deleting && 'opacity-50 pointer-events-none'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border', badge)}>
                    <Icon className="w-3 h-3" /> {r.category || 'Other'}
                  </span>
                  <button
                    onClick={() => handleDelete(r.id)}
                    title="Delete"
                    className="p-1.5 rounded-lg text-text-muted/60 hover:text-rose-400 hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <h4 className="text-text-base font-bold leading-snug">{r.title || domainOf(r.url)}</h4>
                {r.description ? (
                  <p className="text-sm text-text-muted leading-relaxed line-clamp-3 flex-1">{r.description}</p>
                ) : (
                  <div className="flex-1" />
                )}
                <p className="text-xs text-text-muted/70 truncate">{domainOf(r.url)}</p>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-accent hover:opacity-80 transition-opacity"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Open
                  </a>
                  <p className="text-[11px] text-text-muted/70 truncate">
                    {r.created_by_name ? `${r.created_by_name} · ` : ''}{formatDate(r.created_at)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card className="min-h-[280px] flex flex-col items-center justify-center gap-3 text-center px-6">
          <div className="w-12 h-12 rounded-2xl bg-accent/10 border border-accent/25 flex items-center justify-center">
            <Link2 className="w-6 h-6 text-accent" />
          </div>
          <p className="text-text-base font-bold">No resources yet</p>
          <p className="text-sm text-text-muted max-w-sm">
            Paste a Discord thread or any text full of links above — Bruno will pull out every link,
            write titles and descriptions, and file them into categories for the whole team.
          </p>
        </Card>
      )}
    </div>
  );
}

export { ResourcesView };
