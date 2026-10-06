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

describe('Modern Budget', () => {
  it('shows the balance, cash flow by month and a month-grouped ledger', () => {
    budgetSetup();
    expect(screen.getByText('Net balance')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'September 2026' })).toHaveTextContent('Acme sponsorship');
    expect(screen.getByRole('region', { name: 'August 2026' })).toHaveTextContent('League fee');
    expect(screen.getByText('Where the money goes')).toBeInTheDocument();
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

  it('freezes the form while saving, and the lock survives leaving and coming back', async () => {
    let resolve: (v: any) => void = () => {};
    api.apiFetch.mockImplementation((_u: string, init?: any) => (init?.method === 'POST' ? new Promise((r) => { resolve = r; }) : json({})));
    const first = budgetSetup();
    fireEvent.click(screen.getAllByRole('button', { name: /Log transaction/ })[0]);
    fireEvent.change(await screen.findByLabelText('Amount'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log entry' }));
    expect(screen.getByLabelText('Description')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'typed after saving' } });
    expect(screen.getByLabelText('Description')).toHaveValue('');
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
function invSetup(manage = true, inventory = PARTS) {
  const props = { inventory, setInventory: vi.fn(), teams: TEAMS, refresh: { inventory: vi.fn() }, hasScope: (s: string) => manage && s === 'inventory', currentUser: { id: 7, team_id: 1 } };
  return { ...wrap(<InventoryPage {...props} />), props };
}

describe('Modern Inventory', () => {
  it('shows parts as cards with category chips and search', () => {
    invSetup();
    expect(screen.getByText('Core Hex Motor')).toBeInTheDocument();
    expect(screen.getByText('Uncategorized')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Electronics' }));
    expect(screen.queryByText('Core Hex Motor')).not.toBeInTheDocument();
    expect(screen.getByText('Control Hub')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'All' }));
    fireEvent.change(screen.getByLabelText('Search parts'), { target: { value: '41-13' } });
    expect(screen.getByText('Core Hex Motor')).toBeInTheDocument();
    expect(screen.queryByText('Zip ties')).not.toBeInTheDocument();
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
      if (url === '/api/inventory/import-invoice/parse') return json({ items: [{ sku: 'A1', name: 'Bolt pack', quantity: 2, unitPrice: 5, category: 'Hardware' }, { sku: 'B2', name: 'Wheel', quantity: 4, unitPrice: 12, category: 'Wheels' }] });
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
    expect(body('/api/inventory/import-invoice/confirm', 'POST').items).toEqual([{ sku: 'A1', name: 'Bolt pack', quantity: 2, cost: 5, category: 'Hardware' }]);
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
