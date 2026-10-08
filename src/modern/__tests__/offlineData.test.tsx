import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { OFFLINE_PACK_FORMAT, type OfflinePack, type OfflineRegions } from '../../types/offlinePack';

const svc = vi.hoisted(() => ({
  getOfflinePack: vi.fn(), fetchOfflineRegions: vi.fn(), downloadOfflinePack: vi.fn(), removeOfflinePack: vi.fn(),
  listeners: new Set<(p: any) => void>(),
}));
vi.mock('../../services/offlinePack', () => ({
  getOfflinePack: svc.getOfflinePack, fetchOfflineRegions: svc.fetchOfflineRegions,
  downloadOfflinePack: svc.downloadOfflinePack, removeOfflinePack: svc.removeOfflinePack,
  onOfflinePackChange: (fn: (p: any) => void) => { svc.listeners.add(fn); return () => svc.listeners.delete(fn); },
}));
const dialog = vi.hoisted(() => ({ notify: vi.fn(), confirmDialog: vi.fn() }));
vi.mock('../../components/dialog', async (orig) => ({ ...(await orig<object>()), ...dialog }));

import { OfflineSection } from '../pages/settings/OfflineSection';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;

const regions: OfflineRegions = {
  season: 2025, dataAsOf: new Date().toISOString(),
  detected: { code: 'USNJ', name: 'New Jersey', events: 40, teams: 332 },
  regions: [{ code: 'USNJ', name: 'New Jersey', events: 40, teams: 332 }, { code: 'USPA', name: 'Pennsylvania', events: 30, teams: 200 }],
  all: { events: 2000, teams: 7000 },
};
const pack = (region: string, regionName: string, asOf: string): OfflinePack => ({
  format: OFFLINE_PACK_FORMAT, region, regionName, season: 2025, builtAt: asOf, dataAsOf: asOf,
  teams: [[4215, 'Mech', null, null], [1111, 'Robo', null, null]], events: [],
});

beforeEach(() => {
  Object.values(svc).forEach((f) => typeof f === 'function' && (f as any).mockReset());
  svc.listeners.clear();
  svc.getOfflinePack.mockResolvedValue(null);
  svc.fetchOfflineRegions.mockResolvedValue(regions);
  svc.downloadOfflinePack.mockImplementation(async (code: string) => {
    const saved = { pack: pack(code, code === 'USNJ' ? 'New Jersey' : 'Pennsylvania', new Date().toISOString()), bytes: 412_000, savedAt: '' };
    svc.listeners.forEach((l) => l(saved));
    return saved;
  });
  dialog.notify.mockReset();
  dialog.confirmDialog.mockReset();
  dialog.confirmDialog.mockResolvedValue(true);
});
afterEach(cleanup);

describe('Settings → Offline data', () => {
  it('offers the detected region, downloads it, and shows what is on the device', async () => {
    render(<OfflineSection />);
    expect(screen.getByText('Nothing downloaded')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Download NJ offline data' }));
    expect(svc.downloadOfflinePack).toHaveBeenCalledWith('USNJ');
    expect(await screen.findByText('New Jersey · 2025–26 season')).toBeInTheDocument();
    expect(screen.getByText(/2 teams · 0 events · 412 KB · data from just now/)).toBeInTheDocument();
    expect(dialog.notify).toHaveBeenCalledWith('New Jersey offline data saved (412 KB).', 'success');
    // Update re-downloads the same region.
    fireEvent.click(screen.getByRole('button', { name: /Update/ }));
    await waitFor(() => expect(svc.downloadOfflinePack).toHaveBeenLastCalledWith('USNJ'));
  });

  it('downloads everything, and flags a copy over a week old', async () => {
    svc.getOfflinePack.mockResolvedValue({ pack: pack('USNJ', 'New Jersey', new Date(Date.now() - 9 * 864e5).toISOString()), bytes: 2_500_000, savedAt: '' });
    render(<OfflineSection />);
    expect(await screen.findByText(/over a week old/)).toBeInTheDocument();
    expect(screen.getByText(/2\.5 MB/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Download all regions' }));
    await waitFor(() => expect(svc.downloadOfflinePack).toHaveBeenCalledWith('ALL'));
  });

  it('removes the copy; offline, it says to connect', async () => {
    svc.getOfflinePack.mockResolvedValue({ pack: pack('USNJ', 'New Jersey', new Date().toISOString()), bytes: 1000, savedAt: '' });
    svc.fetchOfflineRegions.mockRejectedValue(new TypeError('Failed to fetch'));
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    svc.removeOfflinePack.mockImplementation(async () => { svc.listeners.forEach((l) => l(null)); });
    render(<OfflineSection />);
    expect(await screen.findByText('Connect to the internet to download offline data.')).toBeInTheDocument();
    // Can't update while offline; can still remove.
    expect(await screen.findByRole('button', { name: /Update/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Remove/ }));
    expect(await screen.findByText('Nothing downloaded')).toBeInTheDocument();
    online.mockRestore();
  });

  it('a failed download says why', async () => {
    svc.downloadOfflinePack.mockRejectedValue(new Error('Download failed'));
    render(<OfflineSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Download NJ offline data' }));
    await waitFor(() => expect(dialog.notify).toHaveBeenCalledWith('Download failed', 'error'));
    expect(screen.getByText('Nothing downloaded')).toBeInTheDocument();
  });

  it('asks before another region replaces the one on this device', async () => {
    svc.getOfflinePack.mockResolvedValue({ pack: pack('USNJ', 'New Jersey', new Date().toISOString()), bytes: 1000, savedAt: '' });
    dialog.confirmDialog.mockResolvedValueOnce(false);
    render(<OfflineSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Download all regions' }));
    await waitFor(() => expect(dialog.confirmDialog).toHaveBeenCalledWith(expect.objectContaining({ title: 'Replace New Jersey?' })));
    expect(svc.downloadOfflinePack).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Download all regions' }));
    await waitFor(() => expect(svc.downloadOfflinePack).toHaveBeenCalledWith('ALL'));
    // Updating the same region doesn't ask.
    dialog.confirmDialog.mockClear();
    fireEvent.click(await screen.findByRole('button', { name: /Update/ }));
    await waitFor(() => expect(svc.downloadOfflinePack).toHaveBeenCalledTimes(2));
    expect(dialog.confirmDialog).not.toHaveBeenCalled();
  });

  it('loads the regions again on Try again and when the connection comes back', async () => {
    svc.fetchOfflineRegions.mockRejectedValueOnce(new Error('Could not load offline regions')).mockRejectedValueOnce(new Error('Could not load offline regions'));
    render(<OfflineSection />);
    fireEvent.click(await screen.findByRole('button', { name: /Try again/ }));
    await waitFor(() => expect(svc.fetchOfflineRegions).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Could not load offline regions')).toBeInTheDocument();
    window.dispatchEvent(new Event('online'));
    expect(await screen.findByRole('button', { name: 'Download NJ offline data' })).toBeInTheDocument();
  });
});
