// Modern CAD → Parts list (BOM): a cost summary with a status breakdown,
// per-subsystem tables with row menus, a drafted add / edit sheet, and the
// Bruno invoice import as a review dialog.
import { useMemo } from 'react';
import { Check, CircleDollarSign, FileUp, Loader2, MoreHorizontal, Package, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { cn } from '../../../components/cn';
import {
  Badge, Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader,
  TableRow, Textarea,
} from '../../../components/ui-kit';
import { useIsNarrow } from '../../../components/scout/ScoutUi';
import { CAD_SECTIONS, PART_SOURCE_LABELS, PART_STATUS_LABELS, useCadInvoiceImport, useCadParts, usePartForm } from '../../../components/cad/useCad';
import { Section, EmptyState } from '../../ui/page';
import { Reveal } from '../../ui/motion';
import { AnimatedValue } from '../../AnimatedValue';

const STATUS_ORDER = ['to_order', 'ordered', 'received', 'printed', 'installed'];
const STATUS_BAR: Record<string, string> = { to_order: 'bg-amber-500', ordered: 'bg-sky-500', received: 'bg-violet-500', printed: 'bg-cyan-500', installed: 'bg-emerald-500' };
const STATUS_BADGE: Record<string, string> = {
  to_order: 'border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-300',
  installed: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
};
const money = (n: number) => `$${(Number(n) || 0).toFixed(2)}`;

export function CadPartsTab() {
  const ctl = useCadParts();
  const byStatus = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of ctl.parts) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [ctl.parts]);
  const editing = ctl.editing && ctl.editing !== 'new' ? ctl.editing : null;
  return (
    <>
      <Reveal className="mb-8 grid gap-6 rounded-2xl border border-border bg-card p-6 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
        <div>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><CircleDollarSign className="size-4 text-accent" />Total BOM cost</p>
          <p className="mt-1 font-display text-4xl font-semibold tabular-nums"><AnimatedValue value={money(ctl.total)} /></p>
          <p className="text-sm text-muted-foreground">{ctl.parts.length} part{ctl.parts.length === 1 ? '' : 's'}</p>
        </div>
        <div className="min-w-0">
          {ctl.parts.length > 0 && (
            <>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label="Parts by status">
                {STATUS_ORDER.filter((s) => byStatus[s]).map((s) => <div key={s} className={cn(STATUS_BAR[s], 'transition-[width] duration-700')} style={{ width: `${(byStatus[s] / ctl.parts.length) * 100}%` }} />)}
              </div>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {STATUS_ORDER.filter((s) => byStatus[s]).map((s) => <li key={s} className="flex items-center gap-1.5"><span className={cn('size-2 rounded-full', STATUS_BAR[s])} />{PART_STATUS_LABELS[s]} {byStatus[s]}</li>)}
              </ul>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => ctl.setShowInvoice(true)} className="max-sm:h-11"><Sparkles /> Import invoice</Button>
          <Button onClick={() => ctl.setEditing('new')} className="max-sm:h-11"><Plus /> Add part</Button>
        </div>
      </Reveal>

      {!ctl.loaded ? <Skeleton className="h-64" /> : ctl.grouped.length ? ctl.grouped.map(({ section, items }) => {
        const sub = items.reduce((a: number, p: any) => a + (Number(p.quantity) || 0) * (Number(p.unit_cost) || 0), 0);
        return (
          <Section key={section} title={section} description={`${items.length} part${items.length === 1 ? '' : 's'}`} action={<span className="text-sm tabular-nums text-muted-foreground">{money(sub)}</span>}>
            <div className="overflow-x-auto rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Part</TableHead><TableHead className="text-right">Qty</TableHead><TableHead>Source</TableHead><TableHead className="text-right">Unit</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Status</TableHead><TableHead>Assignee</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="min-w-[10rem] font-medium">{p.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.quantity}</TableCell>
                      <TableCell><Badge variant="secondary">{PART_SOURCE_LABELS[p.source] || p.source}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{money(p.unit_cost)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{money(p.quantity * p.unit_cost)}</TableCell>
                      <TableCell><Badge variant="outline" className={STATUS_BADGE[p.status] ?? 'border-sky-500/30 bg-sky-500/15 text-sky-600 dark:text-sky-300'}>{PART_STATUS_LABELS[p.status] || p.status}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">{p.assignee || '—'}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${p.name}`} className="max-sm:size-11"><MoreHorizontal /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => ctl.setEditing(p)}><Pencil /> Edit part</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => void ctl.remove(p.id)} className="text-destructive focus:text-destructive"><Trash2 /> Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Section>
        );
      }) : <EmptyState icon={Package} title="BOM is empty" description="Add every part the robot needs — printed, purchased, or goBILDA." action={<Button onClick={() => ctl.setEditing('new')}><Plus /> Add part</Button>} />}

      {ctl.editing !== null && (
        <PartSheet key={editing?.id ?? 'new'} initial={editing} onClose={() => ctl.setEditing(null)} onDone={() => { ctl.setEditing(null); void ctl.load(); }} />
      )}
      <InvoiceDialog open={ctl.showInvoice} onClose={() => ctl.setShowInvoice(false)} onDone={() => { ctl.setShowInvoice(false); void ctl.load(); }} />
    </>
  );
}

function PartSheet({ initial, onClose, onDone }: { initial: any | null; onClose: () => void; onDone: () => void }) {
  const narrow = useIsNarrow();
  const f = usePartForm(initial, onDone);
  const close = () => { if (f.busy) return; f.discard(); onClose(); };
  const sel = (id: string, label: string, value: string, onChange: (v: string) => void, options: [string, string][]) => (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="max-sm:h-11"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
  return (
    <Sheet open onOpenChange={(o) => { if (!o) close(); }}>
      <SheetContent side={narrow ? 'bottom' : 'right'} className={cn('gap-0 p-0', !narrow && 'sm:max-w-lg')}>
        <SheetHeader className="border-b border-border px-6 py-5 pr-12">
          <SheetTitle>{initial ? 'Edit part' : 'Add part'}</SheetTitle>
          <SheetDescription>{initial ? initial.name : 'Printed, purchased or goBILDA — everything the robot needs.'}</SheetDescription>
        </SheetHeader>
        <form id="bom-form" className="flex-1 overflow-y-auto px-6 py-5" onSubmit={(e) => { e.preventDefault(); void f.submit(); }}>
          <fieldset disabled={f.busy} className="m-0 min-w-0 space-y-5 border-0 p-0">
            <div className="grid gap-2">
              <Label htmlFor="bom-name">Part name</Label>
              <Input id="bom-name" value={f.form.name} onChange={(e) => f.set({ name: e.target.value })} placeholder="goBILDA 96mm omni wheel" className="max-sm:h-11" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              {sel('bom-section', 'Subsystem', f.form.section, (v) => f.set({ section: v }), CAD_SECTIONS.map((s) => [s, s]))}
              {sel('bom-source', 'Source', f.form.source, (v) => f.set({ source: v }), Object.entries(PART_SOURCE_LABELS))}
              <div className="grid gap-2">
                <Label htmlFor="bom-qty">Quantity</Label>
                <Input id="bom-qty" type="number" min="1" step="1" inputMode="numeric" value={f.form.quantity} onChange={(e) => f.set({ quantity: e.target.value })} className="tabular-nums max-sm:h-11" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bom-cost">Unit cost ($)</Label>
                <Input id="bom-cost" type="number" min="0" step="any" inputMode="decimal" value={f.form.unitCost} onChange={(e) => f.set({ unitCost: e.target.value })} className="tabular-nums max-sm:h-11" />
              </div>
              {sel('bom-status', 'Status', f.form.status, (v) => f.set({ status: v }), Object.entries(PART_STATUS_LABELS))}
              <div className="grid gap-2">
                <Label htmlFor="bom-assignee">Assignee</Label>
                <Input id="bom-assignee" value={f.form.assignee} onChange={(e) => f.set({ assignee: e.target.value })} placeholder="Who's responsible" className="max-sm:h-11" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bom-notes">Notes</Label>
              <Textarea id="bom-notes" rows={3} value={f.form.notes} onChange={(e) => f.set({ notes: e.target.value })} placeholder="Link, specs, print settings…" />
            </div>
          </fieldset>
        </form>
        <SheetFooter className="flex-row justify-end gap-2 border-t border-border px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button variant="outline" onClick={close} disabled={f.busy} className="max-sm:h-11">Cancel</Button>
          <Button type="submit" form="bom-form" disabled={f.busy} className="max-sm:h-11"><Check /> {f.busy ? 'Saving…' : initial ? 'Save' : 'Add part'}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function InvoiceDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const inv = useCadInvoiceImport(onDone);
  const close = () => { if (inv.importing) return; inv.discard(); onClose(); };
  const cell = (props: React.ComponentProps<typeof Input>) => <Input {...props} className={cn('h-9 min-w-0', props.className)} />;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-5xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="size-5 text-accent" /> Import an invoice with Bruno</DialogTitle>
          <DialogDescription>{inv.items.length ? `${inv.items.length} line item${inv.items.length === 1 ? '' : 's'} found — review, edit, then import.` : "Upload a vendor invoice (PDF or image). Bruno reads the line items so you don't have to type them."}</DialogDescription>
        </DialogHeader>
        {!inv.items.length ? (
          <div className="space-y-4">
            <label htmlFor="cad-invoice" className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/60">
              <FileUp className="size-6" />
              {inv.files.length ? inv.files.map((f) => f.name).join(', ') : 'Choose invoice files (PDF / PNG / JPG)'}
              <input id="cad-invoice" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" multiple className="sr-only" onChange={(e) => inv.setFiles(Array.from(e.target.files || []))} />
            </label>
            {inv.parsing && <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="size-4 animate-spin" />{inv.parsing}</p>}
          </div>
        ) : (
          <div className="-mx-1 min-h-0 flex-1 overflow-auto px-1">
            <fieldset disabled={inv.importing} className="m-0 min-w-0 border-0 p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"><Checkbox checked={inv.selectedCount === inv.items.length} onCheckedChange={(v) => inv.toggleAll(v === true)} aria-label="Select all" /></TableHead>
                    <TableHead>Part</TableHead><TableHead className="w-20">Qty</TableHead><TableHead className="w-24">Unit $</TableHead><TableHead className="w-36">Subsystem</TableHead><TableHead className="w-32">Source</TableHead><TableHead className="w-32">Status</TableHead><TableHead>Notes</TableHead><TableHead className="w-10"><span className="sr-only">Remove</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inv.items.map((it: any, i: number) => (
                    <TableRow key={i} className={cn(!it.selected && 'opacity-50')}>
                      <TableCell><Checkbox checked={!!it.selected} onCheckedChange={(v) => inv.updateItem(i, { selected: v === true })} aria-label={`Import ${it.name || 'row'}`} /></TableCell>
                      <TableCell className="min-w-[12rem]">{cell({ value: it.name, onChange: (e) => inv.updateItem(i, { name: e.target.value }), 'aria-label': `Name for row ${i + 1}` })}</TableCell>
                      <TableCell>{cell({ type: 'number', min: 1, step: 1, value: it.quantity, onChange: (e) => inv.updateItem(i, { quantity: e.target.value }), 'aria-label': `Quantity for row ${i + 1}` })}</TableCell>
                      <TableCell>{cell({ type: 'number', min: 0, step: 'any', value: it.unitCost, onChange: (e) => inv.updateItem(i, { unitCost: e.target.value }), 'aria-label': `Unit cost for row ${i + 1}` })}</TableCell>
                      {(['section', 'source', 'status'] as const).map((k) => (
                        <TableCell key={k}>
                          <Select value={it[k]} onValueChange={(v) => inv.updateItem(i, { [k]: v })}>
                            <SelectTrigger className="h-9" aria-label={`${k} for row ${i + 1}`}><SelectValue /></SelectTrigger>
                            <SelectContent>{(k === 'section' ? CAD_SECTIONS.map((s) => [s, s]) : Object.entries(k === 'source' ? PART_SOURCE_LABELS : PART_STATUS_LABELS)).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                          </Select>
                        </TableCell>
                      ))}
                      <TableCell className="min-w-[10rem]">{cell({ value: it.notes, onChange: (e) => inv.updateItem(i, { notes: e.target.value }), placeholder: 'SKU / link', 'aria-label': `Notes for row ${i + 1}` })}</TableCell>
                      <TableCell><Button variant="ghost" size="icon-sm" onClick={() => inv.removeItem(i)} aria-label={`Remove row ${i + 1}`}><X /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </fieldset>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={inv.importing}>Cancel</Button>
          {!inv.items.length
            ? <Button onClick={() => void inv.parse()} disabled={!inv.files.length || !!inv.parsing}><Sparkles /> Parse with Bruno</Button>
            : <Button onClick={() => void inv.importSelected()} disabled={inv.importing || !inv.selectedCount}>{inv.importing ? <><Loader2 className="animate-spin" /> Importing…</> : <><Check /> Import selected ({inv.selectedCount})</>}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
