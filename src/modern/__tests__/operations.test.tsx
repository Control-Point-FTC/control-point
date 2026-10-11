import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));
const dialog = vi.hoisted(() => ({ notify: vi.fn(), confirmDialog: vi.fn() }));
vi.mock('../../components/dialog', async (orig) => ({ ...(await orig<object>()), ...dialog }));

import { InterfaceModeProvider } from '../interfaceMode';
import { BudgetPage } from '../pages/budget/BudgetPage';
import { InventoryPage } from '../pages/inventory/InventoryPage';
import { clearDrafts } from '../drafts';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
const json = (body: any, ok = true) => Promise.resolve({ ok, json: async () => body });
const me = { id: 7, name: 'Ada', team_id: 1, interface_mode: 'modern' };
const TEAMS = [{ id: 1, name: 'Robo', number: 4215 }];
const calls = (url: string | RegExp, method: string) => api.apiFetch.mock.calls.filter((c) => (typeof url === 'string' ? c[0] === url : url.test(c[0])) && c[1]?.method === method);
const body = (url: string | RegExp, method: string) => JSON.parse(calls(url, method).at(-1)![1].body);
const wrap = (ui: React.ReactNode) => render(<InterfaceModeProvider user={me} team={{}} onUserSaved={() => {}}><MemoryRouter>{ui}</MemoryRouter></InterfaceModeProvider>);
const menu = async (label: string, item: RegExp) => {
  fireEvent.pointerDown(screen.getAllByRole('button', { name: label })[0], { button: 0, ctrlKey: false });
  fireEvent.click(await screen.findByRole('menuitem', { name: item }));
};

afterEach(cleanup);
beforeEach(() => {
  api.apiFetch.mockReset();
  api.apiFetch.mockImplementation(() => json({}));
  dialog.notify.mockReset();
  dialog.confirmDialog.mockReset();
  dialog.confirmDialog.mockResolvedValue(true);
  clearDrafts();
});

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

const BUDGET = [
  { id: 1, team_id: 1, type: 'income', amount: 1500, category: 'Sponsorship', description: 'Acme sponsorship', date: '2026-09-02' },
  { id: 2, team_id: 1, type: 'expense', amount: 400, category: 'Parts', description: 'REV starter kit', date: '2026-09-10' },
  { id: 3, team_id: 1, type: 'expense', amount: 150, category: 'Registration', description: 'League fee', date: '2026-08-20' },
];
function budgetSetup(admin = true, budget = BUDGET) {
  const props = { budget, setBudget: vi.fn(), teams: TEAMS, refresh: { budget: vi.fn() }, hasScope: (s: string) => admin && s === 'budget', currentUser: { id: 7, team_id: 1 } };
  return { ...wrap(<BudgetPage {...props} />), props };
}

/** Budget entries need a description and a category (required fields). */
function fillRequired() {
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Motors' } });
  fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Parts' } });
}

describe('Modern Budget', () => {
  it('shows the balance, cash flow by month and a month-grouped ledger', () => {
    budgetSetup();
    expect(screen.getByText('Net balance')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'September 2026' })).toHaveTextContent('Acme sponsorship');
    expect(screen.getByRole('region', { name: 'August 2026' })).toHaveTextContent('League fee');
    expect(screen.getByText('Where the money goes')).toBeInTheDocument();
  });

  it('amounts past two decimals still save (no silent browser validation block)', async () => {
    budgetSetup();
    fireEvent.click(screen.getAllByRole('button', { name: /Log transaction/ })[0]);
    fireEvent.change(await screen.findByLabelText('Amount'), { target: { value: '10.005' } });
    // Said up front, in money terms (not the browser's 10.00499999… tooltip).
    expect(screen.getByText('Saved as $10.01')).toBeInTheDocument();
    expect(screen.getByLabelText('Amount')).not.toHaveAttribute('min');
    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: 'Log entry' }));
    await waitFor(() => expect(calls('/api/budget', 'POST')).toHaveLength(1));
    // Rounded to cents before sending (the server stores cents too).
    expect(body('/api/budget', 'POST')).toMatchObject({ amount: 10.01 });
  });

  it('rejects zero or negative amounts', async () => {
    budgetSetup();
    fireEvent.click(screen.getAllByRole('button', { name: /Log transaction/ })[0]);
    fireEvent.change(await screen.findByLabelText('Amount'), { target: { value: '0.004' } });
    expect(screen.getByText('Amount must be at least $0.01')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '-50' } });
    expect(screen.getByText('Amount must be more than $0')).toBeInTheDocument();
    fireEvent.submit(document.getElementById('budget-form')!);
    expect(dialog.notify).toHaveBeenCalledWith('Amount must be more than $0', 'error');
    expect(calls('/api/budget', 'POST')).toHaveLength(0);
  });

  it('caps absurd amounts and asks before logging a large one (M-1)', async () => {
    budgetSetup();
    fireEvent.click(screen.getAllByRole('button', { name: /Log transaction/ })[0]);
    fireEvent.change(await screen.findByLabelText('Amount'), { target: { value: '999999999999.99' } });
    fillRequired();
    fireEvent.submit(document.getElementById('budget-form')!);
    expect(dialog.notify).toHaveBeenCalledWith("Amount can't be more than $1,000,000", 'error');
    expect(calls('/api/budget', 'POST')).toHaveLength(0);

    dialog.confirmDialog.mockResolvedValueOnce(false);
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '25000' } });
    fireEvent.submit(document.getElementById('budget-form')!);
    await waitFor(() => expect(dialog.confirmDialog).toHaveBeenCalledWith(expect.objectContaining({ title: 'Large amount' })));
    expect(calls('/api/budget', 'POST')).toHaveLength(0);

    dialog.confirmDialog.mockResolvedValueOnce(true);
    fireEvent.submit(document.getElementById('budget-form')!);
    await waitFor(() => expect(calls('/api/budget', 'POST')).toHaveLength(1));
    expect(body('/api/budget', 'POST')).toMatchObject({ amount: 25000 });
  });

  it('filters by type and search', () => {
    budgetSetup();
    fireEvent.click(screen.getByRole('radio', { name: 'Income' }));
    expect(screen.queryByText('REV starter kit')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'All' }));
    fireEvent.change(screen.getByLabelText('Search transactions'), { target: { value: 'regis' } });
    expect(screen.getByText('League fee')).toBeInTheDocument();
    expect(screen.queryByText('Acme sponsorship')).not.toBeInTheDocument();
  });

  it('read-only without the budget permission', () => {
    budgetSetup(false);
    expect(screen.queryByRole('button', { name: /Log transaction/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Actions for/ })).not.toBeInTheDocument();
  });

  it('logs a transaction (POST) and closes the sheet', async () => {
    const { props } = budgetSetup();
    fireEvent.click(screen.getAllByRole('button', { name: /Log transaction/ })[0]);
    fireEvent.click(await screen.findByRole('radio', { name: /Income/ }));
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '250.5' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Bake sale' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Fundraising' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log entry' }));
    await waitFor(() => expect(calls('/api/budget', 'POST')).toHaveLength(1));
    expect(body('/api/budget', 'POST')).toMatchObject({ type: 'income', amount: 250.5, description: 'Bake sale', category: 'Fundraising', team_id: 1 });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(props.refresh.budget).toHaveBeenCalled();
  });

  it('edits (PATCH), duplicates as a new entry, and deletes after confirm', async () => {
    const { props } = budgetSetup();
    await menu('Actions for REV starter kit', /Edit transaction/);
    const amount = await screen.findByLabelText('Amount');
    expect(amount).toHaveValue(400);
    fireEvent.change(amount, { target: { value: '420' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(calls('/api/budget/2', 'PATCH')).toHaveLength(1));
    expect(body('/api/budget/2', 'PATCH')).toMatchObject({ amount: 420 });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await menu('Actions for League fee', /Duplicate/);
    expect(await screen.findByRole('heading', { name: 'Log transaction' })).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toHaveValue('League fee');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await menu('Actions for Acme sponsorship', /Delete transaction/);
    await waitFor(() => expect(calls('/api/budget/1', 'DELETE')).toHaveLength(1));
    expect(props.setBudget).toHaveBeenCalled();
  });

  it('a failed delete puts back only that row (newer rows survive)', async () => {
    api.apiFetch.mockImplementation((_u: string, init?: any) => (init?.method === 'DELETE' ? json({}, false) : json({})));
    const { props } = budgetSetup();
    await menu('Actions for Acme sponsorship', /Delete transaction/);
    await waitFor(() => expect(dialog.notify).toHaveBeenCalledWith('Could not delete entry — try again.', 'error'));
    const restore = props.setBudget.mock.calls.at(-1)![0];
    // Meanwhile a save refreshed the list (row 1 gone, a new row 9 added).
    const fresh = [BUDGET[1], BUDGET[2], { id: 9, type: 'income', amount: 5, category: '', description: 'New', date: '2026-09-20' }];
    expect(restore(fresh).map((b: any) => b.id)).toEqual([1, 2, 3, 9]);
    expect(restore(BUDGET)).toBe(BUDGET); // already back: unchanged
  });

  it('a half-written entry survives a remount (mode switch)', async () => {
    const first = budgetSetup();
    fireEvent.click(screen.getAllByRole('button', { name: /Log transaction/ })[0]);
    fireEvent.change(await screen.findByLabelText('Description'), { target: { value: 'Field tiles' } });
    first.unmount();
    budgetSetup();
    expect(await screen.findByLabelText('Description')).toHaveValue('Field tiles');
  });

  it("an old save finishing after a workspace switch doesn't unlock the new save", async () => {
    const pending: ((v: any) => void)[] = [];
    api.apiFetch.mockImplementation((_u: string, init?: any) => (init?.method === 'POST' ? new Promise((r) => { pending.push(r); }) : json({})));
    budgetSetup();
    fireEvent.click(screen.getAllByRole('button', { name: /Log transaction/ })[0]);
    fireEvent.change(await screen.findByLabelText('Amount'), { target: { value: '10' } });
    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: 'Log entry' }));
    act(() => clearDrafts()); // sign-out / workspace switch
    fireEvent.click(screen.getAllByRole('button', { name: /Log transaction/ })[0]);
    fireEvent.change(await screen.findByLabelText('Amount'), { target: { value: '20' } });
    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: 'Log entry' }));
    expect(pending).toHaveLength(2);
    await act(async () => { pending[0]({ ok: true, json: async () => ({}) }); });
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByLabelText('Amount')).toBeDisabled();
    await act(async () => { pending[1]({ ok: true, json: async () => ({}) }); });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('freezes the form while saving, and the lock survives leaving and coming back', async () => {
    let resolve: (v: any) => void = () => {};
    api.apiFetch.mockImplementation((_u: string, init?: any) => (init?.method === 'POST' ? new Promise((r) => { resolve = r; }) : json({})));
    const first = budgetSetup();
    fireEvent.click(screen.getAllByRole('button', { name: /Log transaction/ })[0]);
    fireEvent.change(await screen.findByLabelText('Amount'), { target: { value: '10' } });
    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: 'Log entry' }));
    expect(screen.getByLabelText('Description')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'typed after saving' } });
    expect(screen.getByLabelText('Description')).toHaveValue('Motors');
    // Leave and come back (mode switch) while the save is in flight.
    first.unmount();
    budgetSetup();
    const again = await screen.findByRole('button', { name: 'Saving…' });
    expect(again).toBeDisabled();
    fireEvent.click(again);
    expect(calls('/api/budget', 'POST')).toHaveLength(1);
    await act(async () => { resolve({ ok: true, json: async () => ({}) }); });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

const PARTS = [
  { id: 1, team_id: 1, name: 'Core Hex Motor', sku: 'REV-41-1300', part_number: '41-1300', quantity: 4, category: 'Motion', cost: 22, location: 'Bin A' },
  { id: 2, team_id: 1, name: 'Control Hub', sku: 'REV-31-1595', part_number: '', quantity: 1, category: 'Electronics', cost: 300, location: '' },
  { id: 3, team_id: 1, name: 'Zip ties', sku: 'ZIP-100', part_number: '', quantity: 100, category: '', cost: 0.05, location: '' },
];
function invSetup(manage = true, inventory: any[] = PARTS) {
  const props = { inventory, setInventory: vi.fn(), teams: TEAMS, refresh: { inventory: vi.fn() }, hasScope: (s: string) => manage && s === 'inventory', currentUser: { id: 7, team_id: 1 } };
  return { ...wrap(<InventoryPage {...props} />), props };
}

describe('Modern Inventory', () => {
  it('shows parts as cards with supplier chips and search', () => {
    invSetup();
    expect(screen.getByText('Core Hex Motor')).toBeInTheDocument();
    expect(screen.getByText('Uncategorized')).toBeInTheDocument();
    // Suppliers come from the data: REV (by SKU format) and the rest as Other.
    fireEvent.click(screen.getByRole('radio', { name: 'Other' }));
    expect(screen.queryByText('Core Hex Motor')).not.toBeInTheDocument();
    expect(screen.getByText('Zip ties')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'REV Robotics' }));
    expect(screen.queryByText('Zip ties')).not.toBeInTheDocument();
    expect(screen.getByText('Control Hub')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'All suppliers' }));
    fireEvent.change(screen.getByLabelText('Search parts'), { target: { value: '41-13' } });
    expect(screen.getByText('Core Hex Motor')).toBeInTheDocument();
    expect(screen.queryByText('Zip ties')).not.toBeInTheDocument();
  });

  it("a part's name opens its order page; a saved link wins; no supplier, no link", () => {
    invSetup(true, [...PARTS, { id: 4, team_id: 1, name: 'Axon Max+', sku: 'BOX-9', part_number: '', quantity: 2, category: 'Motion', cost: 40, location: '', url: 'https://axon-robotics.com/products/max' }]);
    expect(screen.getByRole('link', { name: /Core Hex Motor: order from REV Robotics/ })).toHaveAttribute('href', 'https://www.revrobotics.com/rev-41-1300/');
    const axon = screen.getByRole('link', { name: /Axon Max\+: order from Axon Robotics/ });
    expect(axon).toHaveAttribute('href', 'https://axon-robotics.com/products/max');
    expect(axon).toHaveAttribute('target', '_blank');
    expect(screen.queryByRole('link', { name: /Zip ties/ })).not.toBeInTheDocument();
  });

  it('printing swaps in a stock-check sheet with every shown part, by location', async () => {
    invSetup();
    expect(screen.queryByRole('region', { name: 'Inventory print sheet' })).not.toBeInTheDocument();
    act(() => { window.dispatchEvent(new Event('beforeprint')); });
    const sheet = await screen.findByRole('region', { name: 'Inventory print sheet' });
    const rows = within(sheet).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[1].textContent);
    // "Bin A" first, then parts with no location by name.
    expect(rows).toEqual(['Core Hex Motor · Motion', 'Control Hub · Electronics', 'Zip ties']);
    expect(within(sheet).getByText(/3 parts/)).toBeInTheDocument();
    act(() => { window.dispatchEvent(new Event('afterprint')); });
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Inventory print sheet' })).not.toBeInTheDocument());
  });

  it('read-only without the inventory permission', () => {
    invSetup(false);
    expect(screen.queryByRole('button', { name: /Add part/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Actions for/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Auto-categorize/ })).not.toBeInTheDocument();
  });

  it('requires name and SKU, then adds a part with parsed numbers', async () => {
    const { props } = invSetup();
    fireEvent.click(screen.getByRole('button', { name: /Add part/ }));
    const save = within(await screen.findByRole('dialog')).getByRole('button', { name: 'Add part' });
    fireEvent.click(save);
    expect(dialog.notify).toHaveBeenCalledWith('Name and SKU are required', 'error');
    fireEvent.change(screen.getByLabelText('Part name *'), { target: { value: 'Servo' } });
    fireEvent.change(screen.getByLabelText('SKU (unique) *'), { target: { value: 'GB-2000' } });
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('Cost per unit'), { target: { value: '31.99' } });
    fireEvent.click(save);
    await waitFor(() => expect(calls('/api/inventory', 'POST')).toHaveLength(1));
    expect(body('/api/inventory', 'POST')).toMatchObject({ name: 'Servo', sku: 'GB-2000', quantity: 6, cost: 31.99, team_id: 1 });
    await waitFor(() => expect(props.refresh.inventory).toHaveBeenCalled());
  });

  it('fills the add form from a REV link', async () => {
    api.apiFetch.mockImplementation((url: string) => (url === '/api/inventory/scrape-rev' ? json({ name: 'Ultra 90 Gearbox', sku: 'REV-41-1600', cost: 49 }) : json({})));
    invSetup();
    fireEvent.click(screen.getByRole('button', { name: /Add part/ }));
    fireEvent.change(await screen.findByLabelText(/Import from REV Robotics/), { target: { value: 'https://www.revrobotics.com/rev-41-1600/' } });
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(screen.getByLabelText('Part name *')).toHaveValue('Ultra 90 Gearbox'));
    expect(screen.getByLabelText('SKU (unique) *')).toHaveValue('REV-41-1600');
    expect(screen.getByLabelText('Cost per unit')).toHaveValue(49);
  });

  it('importing a different product starts its fields over instead of mixing two parts', async () => {
    let n = 0;
    api.apiFetch.mockImplementation((url: string) => (url === '/api/inventory/scrape-rev'
      ? json(++n === 1
        ? { name: 'Ultra 90 Gearbox', sku: 'REV-41-1600', cost: 49, url: 'https://www.revrobotics.com/rev-41-1600/', supplier: 'rev' }
        : { sku: 'REV-41-1300', url: 'https://www.revrobotics.com/rev-41-1300/', supplier: 'rev', partial: true, note: 'Only the SKU and link.' })
      : json({})));
    invSetup();
    fireEvent.click(screen.getByRole('button', { name: /Add part/ }));
    const box = await screen.findByLabelText(/Import from REV Robotics/);
    fireEvent.change(box, { target: { value: 'REV-41-1600' } });
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(screen.getByLabelText('Part name *')).toHaveValue('Ultra 90 Gearbox'));
    fireEvent.change(screen.getByLabelText(/Import from REV Robotics/), { target: { value: 'REV-41-1300' } });
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(screen.getByLabelText('SKU (unique) *')).toHaveValue('REV-41-1300'));
    expect(screen.getByLabelText('Part name *')).toHaveValue('');
    expect(screen.getByLabelText('Cost per unit')).toHaveValue(null);
    expect(screen.getByLabelText('Purchase link')).toHaveValue('https://www.revrobotics.com/rev-41-1300/');
  });

  it("REV import that couldn't read the page fills the SKU and link and says so", async () => {
    api.apiFetch.mockImplementation((url: string) => (url === '/api/inventory/scrape-rev'
      ? json({ sku: 'REV-41-1600', url: 'https://www.revrobotics.com/rev-41-1600/', supplier: 'rev', partial: true, note: 'Only the SKU and link.' })
      : json({})));
    invSetup();
    fireEvent.click(screen.getByRole('button', { name: /Add part/ }));
    fireEvent.change(await screen.findByLabelText(/Import from REV Robotics/), { target: { value: 'REV-41-1600' } });
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(screen.getByLabelText('SKU (unique) *')).toHaveValue('REV-41-1600'));
    expect(screen.getByLabelText('Purchase link')).toHaveValue('https://www.revrobotics.com/rev-41-1600/');
    expect(dialog.notify).toHaveBeenCalledWith('Only the SKU and link.', 'info');
  });

  it('edits (PATCH) and deletes after confirm', async () => {
    invSetup();
    await menu('Actions for Control Hub', /Edit part/);
    fireEvent.change(await screen.findByLabelText('Quantity'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(calls('/api/inventory/2', 'PATCH')).toHaveLength(1));
    expect(body('/api/inventory/2', 'PATCH')).toMatchObject({ quantity: '2', cost: 300, team_id: 1 });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await menu('Actions for Zip ties', /Delete part/);
    await waitFor(() => expect(calls('/api/inventory/3', 'DELETE')).toHaveLength(1));
  });

  it('imports an invoice: parse → review (untick one) → confirm', async () => {
    api.apiFetch.mockImplementation((url: string) => {
      if (url === '/api/inventory/import-invoice/parse') return json({ items: [{ sku: 'A1', name: 'Bolt pack', quantity: 2, unitPrice: 5, category: 'Hardware', supplier: 'axon' }, { sku: 'B2', name: 'Wheel', quantity: 4, unitPrice: 12, category: 'Wheels' }] });
      if (url === '/api/inventory/import-invoice/confirm') return json({ added: 1, merged: 0 });
      return json({});
    });
    const { props } = invSetup();
    const input = screen.getByLabelText('Invoice files');
    fireEvent.change(input, { target: { files: [new File(['x'], 'order.pdf', { type: 'application/pdf' })] } });
    const dlg = await screen.findByRole('dialog');
    fireEvent.click(within(dlg).getByRole('checkbox', { name: 'Import Wheel' }));
    fireEvent.click(within(dlg).getByRole('button', { name: 'Import 1 item' }));
    await waitFor(() => expect(calls('/api/inventory/import-invoice/confirm', 'POST')).toHaveLength(1));
    expect(body('/api/inventory/import-invoice/confirm', 'POST').items).toEqual([{ sku: 'A1', name: 'Bolt pack', quantity: 2, cost: 5, category: 'Hardware', supplier: 'axon' }]);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(props.refresh.inventory).toHaveBeenCalled();
    expect(dialog.notify).toHaveBeenCalledWith('Import complete: 1 added, 0 restocked', 'success');
  });

  it('the invoice review is frozen while importing', async () => {
    let finish: (v: any) => void = () => {};
    api.apiFetch.mockImplementation((url: string) => {
      if (url === '/api/inventory/import-invoice/parse') return json({ items: [{ sku: 'A1', name: 'Bolt pack', quantity: 2, unitPrice: 5, category: 'Hardware' }] });
      if (url === '/api/inventory/import-invoice/confirm') return new Promise((r) => { finish = r; });
      return json({});
    });
    invSetup();
    fireEvent.change(screen.getByLabelText('Invoice files'), { target: { files: [new File(['x'], 'order.pdf')] } });
    const dlg = await screen.findByRole('dialog');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Import 1 item' }));
    await waitFor(() => expect(within(dlg).getByLabelText('Quantity for A1')).toBeDisabled());
    fireEvent.change(within(dlg).getByLabelText('Quantity for A1'), { target: { value: '99' } });
    expect(within(dlg).getByLabelText('Quantity for A1')).toHaveValue(2);
    await act(async () => { finish({ ok: true, json: async () => ({ added: 1, merged: 0 }) }); });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls('/api/inventory/import-invoice/confirm', 'POST')).toHaveLength(1);
  });

  it('rejects fractional or negative stock and negative cost', async () => {
    invSetup();
    fireEvent.click(screen.getByRole('button', { name: /Add part/ }));
    fireEvent.change(await screen.findByLabelText('Part name *'), { target: { value: 'Servo' } });
    fireEvent.change(screen.getByLabelText('SKU (unique) *'), { target: { value: 'S1' } });
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '1.5' } });
    fireEvent.submit(document.getElementById('part-form')!);
    expect(dialog.notify).toHaveBeenCalledWith('Quantity must be a whole number, 0 or more.', 'error');
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Cost per unit'), { target: { value: '-3' } });
    fireEvent.submit(document.getElementById('part-form')!);
    expect(dialog.notify).toHaveBeenCalledWith("Cost can't be negative.", 'error');
    expect(calls('/api/inventory', 'POST')).toHaveLength(0);
  });

  it('auto-categorizes uncategorized parts', async () => {
    api.apiFetch.mockImplementation((url: string) => (url === '/api/inventory/auto-categorize' ? json({ categorized: 1 }) : json({})));
    invSetup();
    fireEvent.click(screen.getByRole('button', { name: /Auto-categorize/ }));
    await waitFor(() => expect(dialog.notify).toHaveBeenCalledWith('Categorized 1 part', 'success'));
  });

  it('a half-written part survives a remount (mode switch)', async () => {
    const first = invSetup();
    fireEvent.click(screen.getByRole('button', { name: /Add part/ }));
    fireEvent.change(await screen.findByLabelText('Part name *'), { target: { value: 'Half typed' } });
    first.unmount();
    invSetup();
    expect(await screen.findByLabelText('Part name *')).toHaveValue('Half typed');
  });

  it('switches to the table layout', () => {
    invSetup();
    fireEvent.click(screen.getByRole('radio', { name: 'Table' }));
    expect(screen.getByRole('columnheader', { name: 'SKU' })).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(4);
  });
});

describe('Modern Inventory: a link to one part', () => {
  const openLinked = (inventory: any[], item: number) => {
    Element.prototype.scrollIntoView = vi.fn();
    const props = { inventory, setInventory: vi.fn(), teams: TEAMS, refresh: { inventory: vi.fn() }, hasScope: () => false, currentUser: { id: 7, team_id: 1 } };
    render(<InterfaceModeProvider user={me} team={{}} onUserSaved={() => {}}><MemoryRouter initialEntries={[`/inventory?item=${item}`]}><InventoryPage {...props} /></MemoryRouter></InterfaceModeProvider>);
  };

  it('shows just the linked part (wherever it is in a long list), highlights it, and can show all again', async () => {
    const many = [...Array.from({ length: 80 }, (_, i) => ({ id: 100 + i, team_id: 1, name: `Zip tie pack ${i}`, sku: `Z-${i}`, quantity: 1, category: 'Misc', cost: 1 })), ...PARTS];
    openLinked(many, 3);
    await waitFor(() => expect(document.querySelector('[data-record-id="3"]')?.classList.contains('cp-record-focus')).toBe(true));
    expect(screen.getByRole('status')).toHaveTextContent('Showing the linked part, Zip ties.');
    expect(screen.queryByText('Core Hex Motor')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show all parts' }));
    expect(await screen.findByText('Zip tie pack 0')).toBeInTheDocument();
  });

  it('says so when the linked part is gone, even from an empty inventory', async () => {
    const toast = vi.spyOn(await import('../../components/ui-kit'), 'toast');
    openLinked([], 3);
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringMatching(/That part isn’t in this list/)), { timeout: 4000 });
  });
});
