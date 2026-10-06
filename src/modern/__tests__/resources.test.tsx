import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({ apiJson: vi.fn() }));
vi.mock('../../services/api', async (orig) => ({ ...(await orig<object>()), ...api }));

import { InterfaceModeProvider } from '../interfaceMode';
import { ResourcesPage } from '../pages/resources/ResourcesPage';
import { clearDrafts } from '../drafts';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
const me = { id: 7, name: 'Ada', team_id: 1, interface_mode: 'modern' };
const LIST = [
  { id: 1, url: 'https://www.revrobotics.com/rev-41-1300/', title: 'Core Hex Motor', description: 'Our go-to arm motor', category: 'Parts & Suppliers', created_by: 7, created_by_name: 'Ada', created_at: '2026-09-01 10:00:00' },
  { id: 2, url: 'https://ftc-docs.firstinspires.org/', title: 'FTC Docs', description: '', category: 'Code & Programming', created_by: 7, created_by_name: 'Ada', created_at: '2026-09-02 10:00:00' },
  { id: 3, url: 'https://youtube.com/watch?v=x', title: 'Reveal video', description: 'Season reveal', category: 'Videos', created_by: null, created_by_name: null, created_at: null },
];
const calls = (url: string, method?: string) => api.apiJson.mock.calls.filter((c) => c[0] === url && (method ? c[1]?.method === method : !c[1]?.method));

let list = LIST;
afterEach(cleanup);
beforeEach(() => {
  api.apiJson.mockReset();
  list = LIST;
  api.apiJson.mockImplementation(async (url: string, init?: any) => {
    if (url === '/api/resources' && !init?.method) return list;
    if (url === '/api/resources/parse') return { items: [{ url: 'https://gm0.org', title: 'Game Manual 0', description: 'Guide', category: 'Community' }, { url: 'https://cad.onshape.com/x', title: '', description: '', category: 'Nonsense' }], count: 2 };
    return {};
  });
  clearDrafts();
});

const setup = () => render(<InterfaceModeProvider user={me} team={{}} onUserSaved={() => {}}><MemoryRouter><ResourcesPage /></MemoryRouter></InterfaceModeProvider>);

describe('Modern Resources', () => {
  it('lists links with category chips (counts) and search', async () => {
    setup();
    expect(await screen.findByText('Core Hex Motor')).toBeInTheDocument();
    expect(screen.getByText('3 saved links')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Videos/ }));
    expect(screen.queryByText('Core Hex Motor')).not.toBeInTheDocument();
    expect(screen.getByText('Reveal video')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /^All/ }));
    fireEvent.change(screen.getByLabelText('Search resources'), { target: { value: 'firstinspires' } });
    expect(screen.getByText('FTC Docs')).toBeInTheDocument();
    expect(screen.queryByText('Reveal video')).not.toBeInTheDocument();
  });

  it('extracts links with Bruno into an editable preview, then saves them all', async () => {
    setup();
    await screen.findByText('Core Hex Motor');
    fireEvent.change(screen.getByLabelText('Text with links'), { target: { value: 'check https://gm0.org and https://cad.onshape.com/x' } });
    fireEvent.click(screen.getByRole('button', { name: /Extract links with Bruno/ }));
    expect(await screen.findByText(/Preview — edit before saving \(2\)/)).toBeInTheDocument();
    // Unknown categories fall back to Other; empty titles to the domain.
    expect(screen.getByLabelText('Title for https://cad.onshape.com/x')).toHaveValue('cad.onshape.com');
    fireEvent.change(screen.getByLabelText('Title for https://gm0.org'), { target: { value: 'gm0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove https://cad.onshape.com/x' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save all 1' }));
    await waitFor(() => expect(calls('/api/resources', 'POST')).toHaveLength(1));
    expect(JSON.parse(calls('/api/resources', 'POST')[0][1].body).items).toEqual([{ url: 'https://gm0.org', title: 'gm0', description: 'Guide', category: 'Community' }]);
    await waitFor(() => expect(screen.queryByText(/Preview — edit before saving/)).not.toBeInTheDocument());
    expect(screen.getByLabelText('Text with links')).toHaveValue('');
  });

  it('shows the parse error from the server', async () => {
    api.apiJson.mockImplementation(async (url: string, init?: any) => {
      if (url === '/api/resources/parse') throw Object.assign(new Error('x'), { body: { error: 'No links found in that text.' } });
      return url === '/api/resources' && !init?.method ? list : {};
    });
    setup();
    fireEvent.change(screen.getByLabelText('Text with links'), { target: { value: 'no links here' } });
    fireEvent.click(screen.getByRole('button', { name: /Extract links with Bruno/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No links found in that text.');
  });

  it('deletes optimistically and puts back only that link on failure', async () => {
    api.apiJson.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'DELETE') throw new Error('nope');
      return url === '/api/resources' && !init?.method ? list : {};
    });
    setup();
    await screen.findByText('FTC Docs');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions for FTC Docs' }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: /Delete/ }));
    await waitFor(() => expect(calls('/api/resources/2', 'DELETE')).toHaveLength(1));
    expect(await screen.findByText('FTC Docs')).toBeInTheDocument();
    const titles = screen.getAllByRole('link').map((a) => a.textContent).filter((t) => ['Core Hex Motor', 'FTC Docs', 'Reveal video'].includes(t || ''));
    expect(titles).toEqual(['Core Hex Motor', 'FTC Docs', 'Reveal video']);
  });

  it('refetches on the live resources-changed event', async () => {
    setup();
    await screen.findByText('Core Hex Motor');
    list = [...LIST, { ...LIST[0], id: 4, title: 'New from a teammate' }];
    act(() => { window.dispatchEvent(new Event('resources-changed')); });
    expect(await screen.findByText('New from a teammate')).toBeInTheDocument();
  });

  it('a pasted preview survives a remount, and a save in flight stays locked when you come back', async () => {
    let resolve: (v: any) => void = () => {};
    api.apiJson.mockImplementation(async (url: string, init?: any) => {
      if (url === '/api/resources/parse') return { items: [{ url: 'https://gm0.org', title: 'Game Manual 0', description: '', category: 'Community' }] };
      if (url === '/api/resources' && init?.method === 'POST') return new Promise((r) => { resolve = r; });
      return url === '/api/resources' ? list : {};
    });
    const first = setup();
    fireEvent.change(screen.getByLabelText('Text with links'), { target: { value: 'https://gm0.org' } });
    fireEvent.click(screen.getByRole('button', { name: /Extract links with Bruno/ }));
    await screen.findByText(/Preview — edit before saving \(1\)/);
    first.unmount();
    const second = setup();
    expect(await screen.findByLabelText('Title for https://gm0.org')).toHaveValue('Game Manual 0');
    fireEvent.click(screen.getByRole('button', { name: 'Save all 1' }));
    expect(screen.getByLabelText('Title for https://gm0.org')).toBeDisabled();
    second.unmount();
    setup();
    const saving = await screen.findByRole('button', { name: /Saving…/ });
    expect(saving).toBeDisabled();
    await act(async () => { resolve({}); });
    await waitFor(() => expect(screen.queryByText(/Preview — edit before saving/)).not.toBeInTheDocument());
    expect(calls('/api/resources', 'POST')).toHaveLength(1);
  });

  it('an older Bruno reply never replaces a newer preview (even across a remount)', async () => {
    const replies: ((v: any) => void)[] = [];
    api.apiJson.mockImplementation(async (url: string, init?: any) => {
      if (url === '/api/resources/parse') return new Promise((r) => { replies.push(r); });
      return url === '/api/resources' && !init?.method ? list : {};
    });
    const first = setup();
    fireEvent.change(screen.getByLabelText('Text with links'), { target: { value: 'old https://old.example' } });
    fireEvent.click(screen.getByRole('button', { name: /Extract links with Bruno/ }));
    first.unmount();
    setup();
    // Still reading: the returning page can't start a second parse yet.
    expect(screen.getByRole('button', { name: /Bruno is reading/ })).toBeDisabled();
    await act(async () => { replies[0]({ items: [{ url: 'https://old.example', title: 'Old', description: '', category: 'Other' }] }); });
    expect(await screen.findByLabelText('Title for https://old.example')).toHaveValue('Old');
    // A newer parse wins over a late older reply.
    fireEvent.change(screen.getByLabelText('Text with links'), { target: { value: 'new https://new.example' } });
    fireEvent.click(screen.getByRole('button', { name: /Extract links with Bruno/ }));
    fireEvent.change(screen.getByLabelText('Text with links'), { target: { value: 'newer https://newer.example' } });
    expect(replies).toHaveLength(2);
    await act(async () => { replies[1]({ items: [{ url: 'https://new.example', title: 'New', description: '', category: 'Other' }] }); });
    expect(await screen.findByLabelText('Title for https://new.example')).toHaveValue('New');
  });

  it('a save that finishes after leaving updates (or reports to) the page you came back to', async () => {
    let finish: (v: any) => void = () => {};
    let fail: (e: any) => void = () => {};
    api.apiJson.mockImplementation(async (url: string, init?: any) => {
      if (url === '/api/resources/parse') return { items: [{ url: 'https://gm0.org', title: 'GM0', description: '', category: 'Community' }] };
      if (url === '/api/resources' && init?.method === 'POST') return new Promise((r, j) => { finish = r; fail = j; });
      return url === '/api/resources' ? list : {};
    });
    const first = setup();
    fireEvent.change(screen.getByLabelText('Text with links'), { target: { value: 'https://gm0.org' } });
    fireEvent.click(screen.getByRole('button', { name: /Extract links with Bruno/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save all 1' }));
    first.unmount();
    setup();
    await screen.findByText('Core Hex Motor');
    await act(async () => { fail(Object.assign(new Error('x'), { body: { error: 'Server said no' } })); });
    expect(await screen.findByRole('alert')).toHaveTextContent('Server said no');
    // Retry from the returning page; success refetches its list.
    list = [...LIST, { ...LIST[0], id: 5, title: 'GM0 saved' }];
    fireEvent.click(screen.getByRole('button', { name: 'Save all 1' }));
    await act(async () => { finish({}); });
    expect(await screen.findByText('GM0 saved')).toBeInTheDocument();
  });

  it('a sign-out (cleared drafts) drops the pasted text and preview', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('Text with links'), { target: { value: 'https://gm0.org' } });
    fireEvent.click(screen.getByRole('button', { name: /Extract links with Bruno/ }));
    await screen.findByText(/Preview — edit before saving/);
    act(() => clearDrafts());
    expect(screen.getByLabelText('Text with links')).toHaveValue('');
    expect(screen.queryByText(/Preview — edit before saving/)).not.toBeInTheDocument();
  });

  it('an extraction error reaches the page you came back to', async () => {
    let reject: (e: any) => void = () => {};
    api.apiJson.mockImplementation(async (url: string, init?: any) => {
      if (url === '/api/resources/parse') return new Promise((_r, j) => { reject = j; });
      return url === '/api/resources' && !init?.method ? list : {};
    });
    const first = setup();
    fireEvent.change(screen.getByLabelText('Text with links'), { target: { value: 'nothing here' } });
    fireEvent.click(screen.getByRole('button', { name: /Extract links with Bruno/ }));
    first.unmount();
    setup();
    await act(async () => { reject(Object.assign(new Error('x'), { body: { error: 'No links found in that text.' } })); });
    expect(await screen.findByRole('alert')).toHaveTextContent('No links found in that text.');
  });
});

