// Legacy ResourcesView on the shared controller: the preview is visibly
// frozen (disabled) while a save is in flight.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';

const api = vi.hoisted(() => ({ apiJson: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));

import ResourcesView from '../ResourcesView';
import { clearDrafts } from '../../modern/drafts';

let finish: (v: any) => void = () => {};
beforeEach(() => {
  clearDrafts();
  api.apiJson.mockReset();
  api.apiJson.mockImplementation(async (url: string, init?: any) => {
    if (url === '/api/resources/parse') return { items: [{ url: 'https://gm0.org', title: 'GM0', description: '', category: 'Community' }] };
    if (url === '/api/resources' && init?.method === 'POST') return new Promise((r) => { finish = r; });
    return [];
  });
});
afterEach(cleanup);

describe('Legacy ResourcesView', () => {
  it('disables the paste box and preview while saving', async () => {
    render(<ResourcesView />);
    fireEvent.change(screen.getByPlaceholderText(/Paste text with links/), { target: { value: 'https://gm0.org' } });
    fireEvent.click(screen.getByRole('button', { name: /Extract links with Bruno/ }));
    const title = await screen.findByDisplayValue('GM0');
    fireEvent.click(screen.getByRole('button', { name: /Save all 1/ }));
    expect(title).toBeDisabled();
    expect(screen.getByPlaceholderText(/Paste text with links/)).toBeDisabled();
    expect(screen.getByTitle('Remove')).toBeDisabled();
    await act(async () => { finish({}); });
  });
});
