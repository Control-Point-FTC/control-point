// Modern Inventory (phase 8a), rebuilt on the shadcn kit over the shared
// useInventoryController (same endpoints and rules as Legacy: add with REV
// link import, edit, optimistic delete, invoice parse → review → confirm,
// auto-categorize). Stat strip, category chips + search, a card grid or a
// dense table, and drafted add / edit sheets. Only members with the
// inventory scope can change anything.
import { useState } from 'react';
import { Boxes, Edit2, FileUp, LayoutGrid, Link2, Loader2, MoreHorizontal, Package, Plus, Rows3, Search, Tags, Trash2 } from 'lucide-react';
import { cn } from '../../../components/cn';
import {
  Badge, Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Input, Label,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea, ToggleGroup, ToggleGroupItem,
} from '../../../components/ui-kit';
import { useIsNarrow } from '../../../components/scout/ScoutUi';
import { INVENTORY_CATEGORIES, useInventoryController } from '../../../components/inventory/useInventoryController';
import { Page, PageHeader, EmptyState, Stat } from '../../ui/page';
import { Reveal, Stagger, StaggerItem } from '../../ui/motion';
import { AnimatedValue } from '../../AnimatedValue';

type Ctl = ReturnType<typeof useInventoryController>;
const money = (n: number) => `$${(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export function InventoryPage({ inventory, setInventory, teams, refresh, currentUser, hasScope }: any) {
  const ctl = useInventoryController({ inventory, setInventory, teams, refresh, currentUser, hasScope });
  const [layout, setLayout] = useState<'grid' | 'table'>('grid');
  const units = inventory.reduce((a: number, p: any) => a + (Number(p.quantity) || 0), 0);
  const uncategorized = inventory.some((p: any) => !p.category);
  return (
    <Page>
      <PageHeader
        eyebrow="Operations"
        title="Inventory"
        description="Every part, tool and material the team owns — search it, add it, keep the counts right."
        actions={ctl.canManage && (
          <>
            <Button variant="outline" onClick={() => ctl.invoiceFileRef.current?.click()} disabled={!!ctl.invoiceParsing} className="max-sm:h-11">
              {ctl.invoiceParsing ? <Loader2 className="animate-spin" /> : <FileUp />} {ctl.invoiceParsing || 'Import invoice'}
            </Button>
            <Button onClick={ctl.openAdd} className="max-sm:h-11"><Plus /> Add part</Button>
            <input ref={ctl.invoiceFileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" multiple className="hidden" onChange={ctl.handleInvoiceFile} aria-label="Invoice files" />
          </>
        )}
      />

      <Reveal className="mb-8 grid grid-cols-3 gap-6 border-b border-border pb-6">
        <Stat icon={Package} label="Parts" value={<AnimatedValue value={inventory.length} />} />
        <Stat icon={Boxes} label="Units on hand" value={<AnimatedValue value={units} />} />
        <Stat label="Inventory value" value={<AnimatedValue value={money(ctl.totalValue)} />} />
      </Reveal>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={ctl.searchTerm} onChange={(e) => ctl.setSearchTerm(e.target.value)} placeholder="Search by name, SKU or part number" aria-label="Search parts" className="pl-9 max-sm:h-11" />
        </div>
        {ctl.canManage && uncategorized && (
          <Button variant="outline" onClick={ctl.handleAutoCategorize} disabled={ctl.autoCategorizing} className="max-sm:h-11">
            <Tags /> {ctl.autoCategorizing ? 'Categorizing…' : 'Auto-categorize'}
          </Button>
        )}
        <ToggleGroup type="single" aria-label="Layout" value={layout} onValueChange={(v) => { if (v) setLayout(v as typeof layout); }} className="max-sm:hidden">
          <ToggleGroupItem value="grid" aria-label="Cards"><LayoutGrid /></ToggleGroupItem>
          <ToggleGroupItem value="table" aria-label="Table"><Rows3 /></ToggleGroupItem>
        </ToggleGroup>
      </div>
      {ctl.categories.length > 0 && (
        <ToggleGroup type="single" aria-label="Category" value={ctl.filterCategory || 'all'} onValueChange={(v) => ctl.setFilterCategory(!v || v === 'all' ? '' : v)} className="mb-5 flex w-full justify-start gap-1.5 overflow-x-auto bg-transparent p-0 pb-1">
          {['all', ...ctl.categories].map((c) => (
            <ToggleGroupItem key={c} value={c} className="h-8 shrink-0 rounded-full border border-border px-3 data-[state=on]:border-accent/50 data-[state=on]:bg-accent/10 data-[state=on]:shadow-none max-sm:h-11">
              {c === 'all' ? 'All' : c}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}

      {!inventory.length ? (
        <EmptyState icon={Package} title="No parts yet" description={ctl.canManage ? 'Add a part, paste a REV link, or import an order invoice.' : 'Parts appear here once someone with inventory access adds them.'}
          action={ctl.canManage && <Button onClick={ctl.openAdd}><Plus /> Add part</Button>} />
      ) : !ctl.filteredParts.length ? <EmptyState title="No parts found" description="Try another search or category." /> : layout === 'table' ? (
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Name</TableHead><TableHead>SKU</TableHead><TableHead>Part #</TableHead><TableHead className="text-right">Qty</TableHead><TableHead>Category</TableHead><TableHead className="text-right">Value</TableHead>{ctl.canManage && <TableHead><span className="sr-only">Actions</span></TableHead>}</TableRow>
            </TableHeader>
            <TableBody>
              {ctl.filteredParts.map((p: any) => (
                <TableRow key={p.id} data-cm-type="inventory-part" data-cm-id={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="font-mono text-xs text-accent">{p.sku}</TableCell>
                  <TableCell className="text-muted-foreground">{p.part_number || '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.quantity}</TableCell>
                  <TableCell className="text-muted-foreground">{p.category || '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(p.cost * p.quantity)}</TableCell>
                  {ctl.canManage && <TableCell className="text-right"><PartMenu ctl={ctl} part={p} /></TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <Stagger as="ul" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ctl.filteredParts.map((p: any) => (
            <StaggerItem as="li" key={p.id} data-cm-type="inventory-part" data-cm-id={p.id} className="group flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-accent/40">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug">{p.name}</p>
                  <p className="mt-0.5 font-mono text-xs text-accent">{p.sku}{p.part_number ? <span className="text-muted-foreground"> · {p.part_number}</span> : null}</p>
                </div>
                {ctl.canManage && <PartMenu ctl={ctl} part={p} />}
              </div>
              <div className="mt-auto flex items-end justify-between gap-3 pt-4">
                <div>
                  <p className="font-display text-2xl font-semibold tabular-nums leading-none">{p.quantity}</p>
                  <p className="mt-1 text-xs text-muted-foreground">on hand{p.location ? ` · ${p.location}` : ''}</p>
                </div>
                <div className="text-right">
                  {p.category ? <Badge variant="secondary">{p.category}</Badge> : <Badge variant="outline">Uncategorized</Badge>}
                  <p className="mt-1 text-xs tabular-nums text-muted-foreground">{money(p.cost * p.quantity)}</p>
                </div>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      )}

      <PartSheet ctl={ctl} teams={teams} />
      <InvoiceReview ctl={ctl} />
    </Page>
  );
}

function PartMenu({ ctl, part }: { ctl: Ctl; part: any }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${part.name}`} className="max-sm:size-11"><MoreHorizontal /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => ctl.setShowEdit(part)}><Edit2 /> Edit part</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void ctl.handleDelete(part.id)} className="text-destructive focus:text-destructive"><Trash2 /> Delete part</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Add (with REV import) or edit a part; both forms are drafted in the controller. */
function PartSheet({ ctl, teams }: { ctl: Ctl; teams: any[] }) {
  const narrow = useIsNarrow();
  const editing = !!ctl.showEdit;
  const open = editing || ctl.showAdd;
  const f: any = editing ? ctl.showEdit : ctl.newPart;
  const set = (patch: Record<string, string>) => (editing ? ctl.setShowEdit((cur: any) => ({ ...cur, ...patch })) : ctl.setNewPart((cur) => ({ ...cur, ...patch })));
  const close = () => (editing ? ctl.setShowEdit(null) : ctl.setShowAdd(false));
  const field = (id: string, label: string, key: string, props: Record<string, unknown> = {}) => (
    <div className="grid gap-2">
      <Label htmlFor={`part-${id}`}>{label}</Label>
      <Input id={`part-${id}`} value={f?.[key] ?? ''} onChange={(e) => set({ [key]: e.target.value })} className="max-sm:h-11" {...props} />
    </div>
  );
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <SheetContent side={narrow ? 'bottom' : 'right'} className={cn('gap-0 p-0', !narrow && 'sm:max-w-lg')}>
        {open && f && (
          <>
            <SheetHeader className="border-b border-border px-6 py-5 pr-12">
              <SheetTitle>{editing ? 'Edit part' : 'Add part'}</SheetTitle>
              <SheetDescription>{editing ? f.name : 'Name and SKU are required. A REV Robotics link can fill the rest.'}</SheetDescription>
            </SheetHeader>
            <form id="part-form" noValidate className="flex-1 space-y-5 overflow-y-auto px-6 py-5" onSubmit={(e) => { e.preventDefault(); void (editing ? ctl.handleUpdate() : ctl.handleAdd()); }}>
              <fieldset disabled={ctl.busy} className="m-0 min-w-0 space-y-5 border-0 p-0">
              {!editing && (
                <div className="rounded-xl border border-dashed border-border p-4">
                  <Label htmlFor="part-rev" className="flex items-center gap-1.5"><Link2 className="size-4" /> Import from REV Robotics</Label>
                  <div className="mt-2 flex gap-2">
                    <Input id="part-rev" value={ctl.revLink} onChange={(e) => ctl.setRevLink(e.target.value)} placeholder="Paste a REV product link" className="min-w-0 flex-1 max-sm:h-11" />
                    <Button type="button" variant="outline" onClick={ctl.handleImportRev} disabled={ctl.isLoadingRev || !ctl.revLink.trim()} className="max-sm:h-11">
                      {ctl.isLoadingRev ? <Loader2 className="animate-spin" /> : null}{ctl.isLoadingRev ? 'Loading…' : 'Import'}
                    </Button>
                  </div>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                {field('name', 'Part name *', 'name')}
                {field('sku', 'SKU (unique) *', 'sku', { className: 'font-mono max-sm:h-11' })}
                {field('number', 'Part number', 'part_number')}
                {field('qty', 'Quantity', 'quantity', { type: 'number', min: '0', inputMode: 'numeric' })}
                {field('cost', 'Cost per unit', 'cost', { type: 'number', step: '0.01', min: '0', inputMode: 'decimal' })}
                {field('location', 'Location', 'location', { placeholder: 'Bin, shelf, box…' })}
                <div className="grid gap-2">
                  <Label htmlFor="part-category">Category</Label>
                  <Select value={f.category || 'Other'} onValueChange={(v) => set({ category: v })}>
                    <SelectTrigger id="part-category"><SelectValue /></SelectTrigger>
                    <SelectContent>{INVENTORY_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="part-team">Team</Label>
                  <Select value={f.team_id ? String(f.team_id) : 'none'} onValueChange={(v) => set({ team_id: v === 'none' ? '' : v })}>
                    <SelectTrigger id="part-team"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select team</SelectItem>
                      {teams.map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.name}{t.number ? ` #${t.number}` : ''}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="part-description">Description</Label>
                <Textarea id="part-description" rows={3} value={f.description ?? ''} onChange={(e) => set({ description: e.target.value })} />
              </div>
              </fieldset>
            </form>
            <SheetFooter className="flex-row justify-end gap-2 border-t border-border px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <Button variant="outline" onClick={close} className="max-sm:h-11">Cancel</Button>
              <Button type="submit" form="part-form" disabled={ctl.busy} className="max-sm:h-11">{ctl.busy ? 'Saving…' : editing ? 'Save changes' : 'Add part'}</Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function InvoiceReview({ ctl }: { ctl: Ctl }) {
  const items = ctl.invoiceItems;
  const selected = items.filter((it: any) => it.selected).length;
  return (
    <Dialog open={ctl.showInvoicePreview} onOpenChange={(o) => { if (!o && !ctl.invoiceConfirming) ctl.setShowInvoicePreview(false); }}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-4xl flex-col">
        <DialogHeader>
          <DialogTitle>Review invoice items</DialogTitle>
          <DialogDescription>
            The AI read these lines and picked a category for each. Fix anything wrong and untick what you don't want. Items already in inventory get restocked.
          </DialogDescription>
        </DialogHeader>
        <fieldset disabled={ctl.invoiceConfirming} className="-mx-1 m-0 min-h-0 min-w-0 flex-1 overflow-auto border-0 px-1 py-0">
          <Table>
            <TableHeader>
              <TableRow><TableHead className="w-10"><span className="sr-only">Import</span></TableHead><TableHead>Item</TableHead><TableHead>SKU</TableHead><TableHead className="w-24">Qty</TableHead><TableHead className="w-28">Unit $</TableHead><TableHead className="w-40">Category</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it: any, i: number) => (
                <TableRow key={i} className={cn(!it.selected && 'opacity-50')}>
                  <TableCell><Checkbox checked={!!it.selected} onCheckedChange={(v) => ctl.updateInvoiceItem(i, { selected: v === true })} aria-label={`Import ${it.name}`} /></TableCell>
                  <TableCell className="min-w-[12rem]"><Input value={it.name} onChange={(e) => ctl.updateInvoiceItem(i, { name: e.target.value })} aria-label={`Name for ${it.sku}`} className="h-9" /></TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs text-accent">{it.sku}</TableCell>
                  <TableCell><Input type="number" min="0" value={it.quantity} onChange={(e) => ctl.updateInvoiceItem(i, { quantity: e.target.value })} aria-label={`Quantity for ${it.sku}`} className="h-9" /></TableCell>
                  <TableCell><Input type="number" min="0" step="0.01" value={it.unitPrice} onChange={(e) => ctl.updateInvoiceItem(i, { unitPrice: e.target.value })} aria-label={`Unit price for ${it.sku}`} className="h-9" /></TableCell>
                  <TableCell>
                    <Select value={it.category || 'Other'} onValueChange={(v) => ctl.updateInvoiceItem(i, { category: v })}>
                      <SelectTrigger className="h-9" aria-label={`Category for ${it.sku}`}><SelectValue /></SelectTrigger>
                      <SelectContent>{INVENTORY_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </fieldset>
        <DialogFooter>
          <Button variant="outline" onClick={() => ctl.setShowInvoicePreview(false)} disabled={ctl.invoiceConfirming}>Cancel</Button>
          <Button onClick={ctl.handleInvoiceConfirm} disabled={ctl.invoiceConfirming || !selected}>
            {ctl.invoiceConfirming ? <><Loader2 className="animate-spin" /> Importing…</> : <>Import {selected} item{selected === 1 ? '' : 's'}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
