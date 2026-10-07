// Modern Budget (phase 8a), rebuilt on the shadcn kit over the shared
// useBudgetController (same endpoints, optimistic delete, duplicate and
// right-click menu as Legacy). A balance hero with a month-by-month cash
// flow chart, where the money goes by category, then a month-grouped
// ledger with type / search filters. Entries are logged in a drafted sheet;
// only members with the budget scope can add or edit.
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ArrowDownLeft, ArrowUpRight, Copy, Download, MoreHorizontal, Pencil, Plus, Search, Trash2, Wallet } from 'lucide-react';
import { datedName, downloadCsv } from '../../../utils/csv';
import { cn } from '../../../components/cn';
import {
  Badge, Button, ChartContainer, ChartTooltip, ChartTooltipContent, DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, ToggleGroup, ToggleGroupItem,
} from '../../../components/ui-kit';
import { useIsNarrow } from '../../../components/scout/ScoutUi';
import { useBudgetController } from '../../../components/budget/useBudgetController';
import { Page, PageHeader, Section, EmptyState } from '../../ui/page';
import { Reveal, Stagger, StaggerItem } from '../../ui/motion';
import { AnimatedValue } from '../../AnimatedValue';
import { MONEY_MAX, formatMoneyCompact } from '../../../utils/validation';

type Ctl = ReturnType<typeof useBudgetController>;
const money = (n: number) => `$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const monthKey = (d: string) => (d || '').slice(0, 7);
const monthLabel = (k: string, long = false) => {
  const [y, m] = k.split('-').map(Number);
  if (!y || !m) return 'Undated';
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, long ? { month: 'long', year: 'numeric' } : { month: 'short' });
};

export function BudgetPage({ budget, setBudget, teams, refresh, hasScope, currentUser }: any) {
  const ctl = useBudgetController({ budget, setBudget, teams, refresh, hasScope, currentUser });
  const net = ctl.totalIncome - ctl.totalExpense;
  return (
    <Page>
      <PageHeader
        eyebrow="Operations"
        title="Budget"
        description="Team money at a glance — every dollar in and out. Everyone can view; members whose role has the budget permission can log and edit entries."
        actions={
          <>
            <Button variant="outline" disabled={!budget?.length} onClick={() => downloadCsv(datedName('budget'), budget ?? [], [
              { header: 'Date', value: (b: any) => String(b.date || '').slice(0, 10) },
              { header: 'Type', value: (b: any) => (b.type === 'income' ? 'Income' : 'Expense') },
              { header: 'Category', value: (b: any) => b.category },
              { header: 'Description', value: (b: any) => b.description },
              { header: 'Amount', value: (b: any) => Number(b.amount) },
            ])}><Download /> Export CSV</Button>
            {ctl.isAdmin && <Button onClick={ctl.openNewEntry}><Plus /> Log transaction</Button>}
          </>
        }
      />
      <Reveal className="mb-8 grid gap-6 rounded-2xl border border-border bg-card p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Net balance</p>
          <p className={cn('mt-1 font-display text-5xl font-semibold tabular-nums tracking-tight', net < 0 ? 'text-destructive' : 'text-foreground')}>
            {net < 0 && '−'}<AnimatedValue value={money(net)} />
          </p>
          <dl className="mt-6 grid grid-cols-2 gap-4">
            <div>
              <dt className="flex items-center gap-1.5 text-sm text-muted-foreground"><ArrowDownLeft className="size-4 text-success" />Income</dt>
              <dd className="mt-0.5 font-display text-2xl font-semibold tabular-nums">{money(ctl.totalIncome)}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-sm text-muted-foreground"><ArrowUpRight className="size-4 text-destructive" />Expenses</dt>
              <dd className="mt-0.5 font-display text-2xl font-semibold tabular-nums">{money(ctl.totalExpense)}</dd>
            </div>
          </dl>
          {(ctl.totalIncome > 0 || ctl.totalExpense > 0) && (
            <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-muted" title="Income vs expenses">
              <div className="bg-success transition-[width] duration-700" style={{ width: `${(ctl.totalIncome / (ctl.totalIncome + ctl.totalExpense)) * 100}%` }} />
              <div className="flex-1 bg-destructive/80" />
            </div>
          )}
        </div>
        <CashFlow budget={budget} />
      </Reveal>
      <Categories budget={budget} />
      <Ledger ctl={ctl} budget={budget} />
      <EntrySheet ctl={ctl} teams={teams} budget={budget} />
    </Page>
  );
}

/** Income vs expenses per month (last 6 months with activity). */
function CashFlow({ budget }: { budget: any[] }) {
  const data = useMemo(() => {
    const by = new Map<string, { income: number; expense: number }>();
    for (const b of budget) {
      const k = monthKey(b.date);
      if (!k) continue;
      const m = by.get(k) ?? { income: 0, expense: 0 };
      if (b.type === 'income') m.income += b.amount; else m.expense += b.amount;
      by.set(k, m);
    }
    return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([k, v]) => ({ month: monthLabel(k), ...v }));
  }, [budget]);
  if (!data.length) return <div className="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">Cash flow appears once transactions are logged.</div>;
  return (
    <figure className="min-w-0">
      <figcaption className="mb-2 text-sm text-muted-foreground">Cash flow by month</figcaption>
      <ChartContainer config={{ income: { label: 'Income', color: 'var(--color-success)' }, expense: { label: 'Expenses', color: 'var(--color-destructive)' } }} className="h-48 w-full">
        <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => formatMoneyCompact(v)} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
          <Bar dataKey="income" fill="var(--color-income)" radius={[4, 4, 0, 0]} animationDuration={700} />
          <Bar dataKey="expense" fill="var(--color-expense)" radius={[4, 4, 0, 0]} animationDuration={700} />
        </BarChart>
      </ChartContainer>
    </figure>
  );
}

function Categories({ budget }: { budget: any[] }) {
  const rows = useMemo(() => {
    const by = new Map<string, number>();
    for (const b of budget) if (b.type !== 'income') by.set(b.category || 'Uncategorized', (by.get(b.category || 'Uncategorized') ?? 0) + b.amount);
    return [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [budget]);
  if (!rows.length) return null;
  const top = rows[0][1] || 1;
  return (
    <Section title="Where the money goes" description="Expenses by category.">
      <Stagger as="ul" className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {rows.map(([cat, amt]) => (
          <StaggerItem as="li" key={cat}>
            <div className="flex items-baseline justify-between gap-3 text-sm"><span className="truncate">{cat}</span><span className="tabular-nums text-muted-foreground">{money(amt)}</span></div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${(amt / top) * 100}%` }} /></div>
          </StaggerItem>
        ))}
      </Stagger>
    </Section>
  );
}

function RowMenu({ ctl, item }: { ctl: Ctl; item: any }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${item.description || 'transaction'}`} className="max-sm:size-11"><MoreHorizontal /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => ctl.openEditEntry(item)}><Pencil /> Edit transaction</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => ctl.openDuplicateEntry(item)}><Copy /> Duplicate</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void ctl.handleDelete(item.id)} className="text-destructive focus:text-destructive"><Trash2 /> Delete transaction</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Ledger({ ctl, budget }: { ctl: Ctl; budget: any[] }) {
  const [kind, setKind] = useState<'all' | 'income' | 'expense'>('all');
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = budget
      .filter((b) => kind === 'all' || b.type === kind)
      .filter((b) => !term || `${b.description} ${b.category}`.toLowerCase().includes(term))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.id - a.id);
    const out: { key: string; items: any[]; net: number }[] = [];
    for (const b of list) {
      const k = monthKey(b.date);
      let g = out[out.length - 1];
      if (!g || g.key !== k) { g = { key: k, items: [], net: 0 }; out.push(g); }
      g.items.push(b);
      g.net += b.type === 'income' ? b.amount : -b.amount;
    }
    return out;
  }, [budget, kind, q]);
  return (
    <Section title="Transactions" description="A line-by-line record of money in and out.">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <ToggleGroup type="single" aria-label="Show" value={kind} onValueChange={(v) => { if (v) setKind(v as typeof kind); }}>
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="income">Income</ToggleGroupItem>
          <ToggleGroupItem value="expense">Expenses</ToggleGroupItem>
        </ToggleGroup>
        <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search description or category" aria-label="Search transactions" className="pl-9 max-sm:h-11" />
        </div>
      </div>
      {!budget.length ? (
        <EmptyState icon={Wallet} title="No transactions yet" description={ctl.isAdmin ? 'Log the first income or expense to start tracking.' : 'Entries appear here once someone with budget access logs them.'}
          action={ctl.isAdmin && <Button onClick={ctl.openNewEntry}><Plus /> Log transaction</Button>} />
      ) : !groups.length ? <EmptyState title="Nothing matches" description="Try another filter or search." /> : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key || 'undated'} aria-label={monthLabel(g.key, true)}>
              <div className="sticky top-0 z-10 flex items-baseline justify-between border-b border-border bg-background/90 py-2 backdrop-blur">
                <h3 className="text-sm font-medium">{monthLabel(g.key, true)}</h3>
                <span className={cn('text-xs tabular-nums', g.net < 0 ? 'text-destructive' : 'text-success')}>{g.net < 0 ? '−' : '+'}{money(g.net)}</span>
              </div>
              <Stagger as="ul" className="divide-y divide-border">
                {g.items.map((item) => {
                  const income = item.type === 'income';
                  return (
                    <StaggerItem as="li" key={item.id} data-cm-type="budget-tx" data-cm-id={item.id} className="flex items-center gap-3 py-3">
                      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', income ? 'bg-success/15 text-success' : 'bg-destructive/10 text-destructive')} aria-hidden>
                        {income ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.description || '(no description)'}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {item.category && <Badge variant="secondary">{item.category}</Badge>}
                          <span>{item.date}</span>
                        </p>
                      </div>
                      <span className={cn('shrink-0 text-sm font-medium tabular-nums', income ? 'text-success' : 'text-foreground')}>
                        <span className="sr-only">{income ? 'Income' : 'Expense'} </span>{income ? '+' : '−'}{money(item.amount)}
                      </span>
                      {ctl.isAdmin && <RowMenu ctl={ctl} item={item} />}
                    </StaggerItem>
                  );
                })}
              </Stagger>
            </section>
          ))}
        </div>
      )}
    </Section>
  );
}

function EntrySheet({ ctl, teams, budget }: { ctl: Ctl; teams: any[]; budget: any[] }) {
  const narrow = useIsNarrow();
  const f = ctl.newItem;
  const set = (patch: Partial<typeof f>) => ctl.setNewItem((cur) => ({ ...cur, ...patch }));
  const cats = useMemo(() => [...new Set(budget.map((b) => b.category).filter(Boolean))] as string[], [budget]);
  return (
    <Sheet open={ctl.showAdd} onOpenChange={(o) => { if (!o) ctl.closeEntryModal(); }}>
      <SheetContent side={narrow ? 'bottom' : 'right'} className={cn('gap-0 p-0', !narrow && 'sm:max-w-md')}>
        <SheetHeader className="border-b border-border px-6 py-5 pr-12">
          <SheetTitle>{ctl.editingId ? 'Edit transaction' : 'Log transaction'}</SheetTitle>
          <SheetDescription>{ctl.editingId ? 'Changes save to the shared ledger.' : 'Record money coming in or going out.'}</SheetDescription>
        </SheetHeader>
        <form id="budget-form" className="flex-1 space-y-5 overflow-y-auto px-6 py-5" onSubmit={(e) => { e.preventDefault(); void ctl.handleAdd(); }}>
          <fieldset disabled={ctl.busy} className="m-0 min-w-0 space-y-5 border-0 p-0">
          <ToggleGroup type="single" aria-label="Type" value={f.type} onValueChange={(v) => { if (v) set({ type: v }); }} className="grid w-full grid-cols-2">
            <ToggleGroupItem value="income" size="lg" className="max-sm:h-11"><ArrowDownLeft /> Income</ToggleGroupItem>
            <ToggleGroupItem value="expense" size="lg" className="max-sm:h-11"><ArrowUpRight /> Expense</ToggleGroupItem>
          </ToggleGroup>
          <div className="grid gap-2">
            <Label htmlFor="budget-amount">Amount</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input id="budget-amount" type="number" inputMode="decimal" step="any" min="0.01" max={MONEY_MAX} required value={f.amount} onChange={(e) => set({ amount: e.target.value })} className="pl-7 font-display text-lg tabular-nums" placeholder="0.00" />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="budget-description">Description</Label>
            <Input id="budget-description" value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="e.g. REV starter kit" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="budget-category">Category</Label>
              <Input id="budget-category" list="budget-categories" value={f.category} onChange={(e) => set({ category: e.target.value })} placeholder="Parts" />
              <datalist id="budget-categories">{cats.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="budget-date">Date</Label>
              <Input id="budget-date" type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="budget-team">Team</Label>
            <Select value={f.team_id || 'none'} onValueChange={(v) => set({ team_id: v === 'none' ? '' : v })}>
              <SelectTrigger id="budget-team"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select team</SelectItem>
                {teams.map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.name}{t.number ? ` #${t.number}` : ''}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          </fieldset>
        </form>
        <SheetFooter className="flex-row justify-end gap-2 border-t border-border px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button variant="outline" onClick={ctl.closeEntryModal}>Cancel</Button>
          <Button type="submit" form="budget-form" disabled={ctl.busy}>{ctl.busy ? 'Saving…' : ctl.editingId ? 'Save changes' : 'Log entry'}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
