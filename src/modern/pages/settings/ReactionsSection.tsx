// Settings → Reactions: upload, list and delete your own custom reactions
// (max 25), over the shared useCustomReactions controller. Only you can
// react with them; everyone else sees them on messages.
import { useRef } from 'react';
import { ImagePlus, Loader2, RefreshCw, SmilePlus, Trash2, X } from 'lucide-react';
import { cn } from '../../../components/cn';
import { Button, Input, Label, Skeleton } from '../../../components/ui-kit';
import { assetUrl } from '../../../services/api';
import { useCustomReactions } from '../../../components/useCustomReactions';
import { SettingsGroup } from './SettingsPage';

export function ReactionsSection() {
  const r = useCustomReactions();
  const fileRef = useRef<HTMLInputElement>(null);
  // The draft (image + name) is locked until the list is in, during an
  // upload, and at the limit.
  const locked = !r.ready || r.uploading || r.atLimit;

  return (
    <>
      <SettingsGroup
        title={`My custom reactions · ${r.items.length}/${r.max}`}
        description="Stickers, your team mascot, an inside joke. Only you can react with these; everyone else sees them on messages."
      >
        {r.loading ? (
          <div className="grid grid-cols-3 gap-2 p-4 sm:grid-cols-5" aria-label="Loading your reactions">
            {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
          </div>
        ) : r.loadError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
            <p role="alert" className="text-sm text-muted-foreground">{r.loadError}</p>
            <Button variant="outline" size="sm" onClick={r.reload} className="max-sm:h-11"><RefreshCw /> Try again</Button>
          </div>
        ) : r.items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <SmilePlus className="size-8 text-muted-foreground/60" aria-hidden />
            <p className="text-sm text-muted-foreground">No custom reactions yet. Upload your first one below.</p>
          </div>
        ) : (
          <ul className="grid grid-cols-3 gap-2 p-4 sm:grid-cols-4 md:grid-cols-5" aria-label="Your custom reactions">
            {r.items.map((c) => (
              <li key={c.id} className="group relative flex flex-col items-center gap-1.5 rounded-lg border border-border bg-muted/40 p-2">
                <img src={assetUrl(c.image_url) ?? undefined} alt={c.name} draggable={false} className="size-14 rounded-md object-contain" />
                <span className="max-w-full truncate text-xs font-medium text-muted-foreground">:{c.name}:</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => void r.remove(c.id, c.name)}
                  disabled={r.deletingId === c.id}
                  aria-label={`Delete :${c.name}:`}
                  title={`Delete :${c.name}:`}
                  className="absolute right-1 top-1 bg-card/90 text-muted-foreground hover:text-destructive md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                >
                  {r.deletingId === c.id ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Trash2 />}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SettingsGroup>

      <SettingsGroup title="Upload a reaction" description="Square images work best. GIFs animate.">
        <div className="flex flex-col gap-4 p-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={locked}
              aria-label={r.preview ? 'Change reaction image' : 'Choose reaction image'}
              className={cn(
                'flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                r.preview ? 'border-accent/60' : 'border-border text-muted-foreground hover:border-accent/60 hover:text-foreground',
              )}
            >
              {r.preview ? <img src={r.preview} alt="Preview" className="size-full object-contain" /> : <ImagePlus className="size-7" />}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              data-testid="reaction-file"
              onChange={(e) => { r.pickFile(e.target.files?.[0] ?? null); e.target.value = ''; }}
            />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="reaction-name">Name</Label>
              <Input id="reaction-name" value={r.name} onChange={(e) => r.setName(e.target.value)} placeholder="e.g. zog_hype" maxLength={32} disabled={locked} />
              <p className="text-xs text-muted-foreground">
                {r.file ? (
                  <span className="inline-flex items-center gap-1">
                    <span className="truncate">{r.file.name}</span>
                    <button type="button" onClick={r.clearFile} disabled={r.uploading} aria-label="Remove chosen image" className="rounded text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
                  </span>
                ) : (
                  `${r.slotsLeft} slot${r.slotsLeft === 1 ? '' : 's'} left.`
                )}
              </p>
            </div>
          </div>
          <Button onClick={() => void r.upload()} disabled={!r.ready || r.uploading || !r.file || r.atLimit} className="w-full max-sm:h-11 sm:w-auto sm:self-end">
            {r.uploading ? <><Loader2 className="animate-spin motion-reduce:animate-none" /> Uploading…</> : r.atLimit ? `Limit reached (${r.max}): delete one first` : 'Upload reaction'}
          </Button>
        </div>
      </SettingsGroup>
    </>
  );
}
