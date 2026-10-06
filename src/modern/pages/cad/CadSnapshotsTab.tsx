// Modern CAD → 3D snapshots: grouped by subsystem, preview tiles that open
// the 3D viewer, owner/admin delete (useCadSnapshots.canDelete), and a
// drafted upload sheet (STEP / STL + optional screenshot).
import React, { Suspense } from 'react';
import { Box, Eye, Layers, MoreHorizontal, Trash2, Upload } from 'lucide-react';
import { cn } from '../../../components/cn';
import {
  Badge, Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Input, Label, Select,
  SelectContent, SelectItem, SelectTrigger, SelectValue, Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, Skeleton, Textarea,
} from '../../../components/ui-kit';
import { useIsNarrow } from '../../../components/scout/ScoutUi';
import { CAD_SECTIONS, fmtSize, useCadSnapshots, useSnapshotForm } from '../../../components/cad/useCad';
import { Section, EmptyState } from '../../ui/page';
import { Stagger, StaggerItem } from '../../ui/motion';
import { FilePick } from './CadReviewsTab';

const CadModelViewer = React.lazy(() => import('../../../components/CadModelViewer'));

export function CadSnapshotsTab({ currentUser, isAdmin }: { currentUser?: any; isAdmin: boolean }) {
  const ctl = useCadSnapshots({ currentUser, isAdmin });
  const [viewer, setViewer] = React.useState<any>(null);
  return (
    <>
      <div className="mb-5 flex justify-end">
        <Button onClick={() => ctl.setShowForm(true)} className="max-sm:h-11"><Upload /> Upload snapshot</Button>
      </div>
      {!ctl.loaded ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-60" />)}</div> : ctl.grouped.length ? ctl.grouped.map(({ section, items }) => (
        <Section key={section} title={section} description={`${items.length} snapshot${items.length === 1 ? '' : 's'}`}>
          <Stagger as="ul" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((s: any) => (
              <StaggerItem as="li" key={s.id} className="group overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-accent/40">
                <button onClick={() => setViewer(s)} aria-label={`View ${s.title} in 3D`} className="relative block aspect-video w-full overflow-hidden bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60">
                  {s.screenshot_url
                    ? <img src={s.screenshot_url} alt="" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:group-hover:scale-100" />
                    : <span className="flex size-full items-center justify-center"><Box className="size-12 text-accent/60 transition-transform duration-300 group-hover:rotate-12 motion-reduce:group-hover:rotate-0" /></span>}
                  <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent py-2 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"><Eye className="size-3.5" /> View 3D</span>
                </button>
                <div className="flex items-start gap-2 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{s.title}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <Badge variant="secondary">{String(s.file_type || '').toUpperCase()}</Badge>{fmtSize(s.file_size)}{s.author_name ? ` · ${s.author_name}` : ''}
                    </p>
                    {s.notes && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{s.notes}</p>}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${s.title}`} className="max-sm:size-11"><MoreHorizontal /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setViewer(s)}><Eye /> View 3D</DropdownMenuItem>
                      {ctl.canDelete(s) && (<><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => void ctl.remove(s.id)} className="text-destructive focus:text-destructive"><Trash2 /> Delete</DropdownMenuItem></>)}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </Section>
      )) : <EmptyState icon={Layers} title="No snapshots yet" description="Upload a STEP or STL export — the team can orbit around it right here." action={<Button onClick={() => ctl.setShowForm(true)}><Upload /> Upload snapshot</Button>} />}

      <UploadSheet open={ctl.showForm} onOpenChange={ctl.setShowForm} onDone={() => { ctl.setShowForm(false); void ctl.load(); }} />
      {viewer && (
        <Suspense fallback={<div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 text-sm text-muted-foreground">Loading 3D viewer…</div>}>
          <CadModelViewer fileUrl={viewer.file_url} fileType={viewer.file_type} fileName={viewer.file_name || viewer.title} onClose={() => setViewer(null)} />
        </Suspense>
      )}
    </>
  );
}

function UploadSheet({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const narrow = useIsNarrow();
  const f = useSnapshotForm(onDone);
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o && !f.busy) onOpenChange(false); }}>
      <SheetContent side={narrow ? 'bottom' : 'right'} className={cn('gap-0 p-0', !narrow && 'sm:max-w-lg')}>
        <SheetHeader className="border-b border-border px-6 py-5 pr-12">
          <SheetTitle>Upload a design snapshot</SheetTitle>
          <SheetDescription>A STEP or STL export the whole team can orbit around.</SheetDescription>
        </SheetHeader>
        <form id="snap-form" className="flex-1 overflow-y-auto px-6 py-5" onSubmit={(e) => { e.preventDefault(); void f.submit(); }}>
          <fieldset disabled={f.busy} className="m-0 min-w-0 space-y-5 border-0 p-0">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="sn-title">Title</Label>
                <Input id="sn-title" value={f.form.title} onChange={(e) => f.set({ title: e.target.value })} placeholder="Intake v3 milestone" className="max-sm:h-11" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sn-section">Subsystem</Label>
                <Select value={f.form.section} onValueChange={(v) => f.set({ section: v })}>
                  <SelectTrigger id="sn-section" className="max-sm:h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>{CAD_SECTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <FilePick id="sn-model" label="3D model (.step / .stp / .stl)" accept=".step,.stp,.stl" file={f.form.model} onPick={(file) => f.set({ model: file })} />
            {f.form.model && <p className="-mt-3 text-xs text-muted-foreground">{fmtSize(f.form.model.size)}</p>}
            <FilePick id="sn-shot" label="Screenshot (optional)" accept="image/*" file={f.form.shot} onPick={(file) => f.set({ shot: file })} />
            <div className="grid gap-2">
              <Label htmlFor="sn-notes">Notes</Label>
              <Textarea id="sn-notes" rows={3} value={f.form.notes} onChange={(e) => f.set({ notes: e.target.value })} placeholder="What does this snapshot capture?" />
            </div>
          </fieldset>
        </form>
        <SheetFooter className="flex-row justify-end gap-2 border-t border-border px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={f.busy} className="max-sm:h-11">Cancel</Button>
          <Button type="submit" form="snap-form" disabled={f.busy} className="max-sm:h-11"><Upload /> {f.busy ? 'Uploading…' : 'Upload'}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
