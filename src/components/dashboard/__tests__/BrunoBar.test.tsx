import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BrunoBar from '../BrunoBar';

vi.mock('../../../services/aiService', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    streamBuildHelper: vi.fn(),
    applyActionProposals: vi.fn(),
    applyActionProposalsWithIds: vi.fn(),
    notifyBrunoDataChanged: vi.fn(),
  };
});

import {
  streamBuildHelper,
  applyActionProposalsWithIds,
  notifyBrunoDataChanged,
} from '../../../services/aiService';

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

describe('BrunoBar', () => {
  it('renders the bar with an input and suggestion chips', () => {
    render(<MemoryRouter><BrunoBar /></MemoryRouter>);
    expect(screen.getByLabelText(/ask bruno/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /what’s happening this week/i })).toBeInTheDocument();
  });

  it('streams a reply inline and shows the confirm card for proposed actions', async () => {
    const user = userEvent.setup();
    vi.mocked(streamBuildHelper).mockImplementation(async (_msgs, onChunk) => {
      onChunk('Here you go\n```event\n[{"title":"Build night","date":"2026-10-05"}]\n```');
    });
    render(<MemoryRouter><BrunoBar /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: /add a calendar event/i }));

    await waitFor(() => {
      expect(screen.getByText(/build night/i)).toBeInTheDocument();
    });
    // Confirm card appears with the proposed item
    expect(screen.getByRole("button", { name: /add all/i })).toBeInTheDocument();
  });

  it('confirming a proposal applies it and notifies the dashboard', async () => {
    const user = userEvent.setup();
    vi.mocked(streamBuildHelper).mockImplementation(async (_msgs, onChunk) => {
      onChunk('```event\n[{"title":"Build night","date":"2026-10-05"}]\n```');
    });
    vi.mocked(applyActionProposalsWithIds).mockResolvedValue({ applied: { event: 1 }, created: { event: [9] } });
    render(<MemoryRouter><BrunoBar /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: /add a calendar event/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /add all/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /add all/i }));

    await waitFor(() => {
      expect(applyActionProposalsWithIds).toHaveBeenCalledTimes(1);
      expect(notifyBrunoDataChanged).toHaveBeenCalledWith(['calendar']);
    });
    expect(screen.getByRole('link', { name: 'View in calendar' }).getAttribute('href')).toBe('/calendar?event=9');
  });

  it('collapse resets the bar to its idle state', async () => {
    const user = userEvent.setup();
    vi.mocked(streamBuildHelper).mockImplementation(async (_msgs, onChunk) => {
      onChunk('hello');
    });
    render(<MemoryRouter><BrunoBar /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: /add a calendar event/i }));
    await waitFor(() => {
      expect(screen.getByLabelText(/collapse/i)).toBeInTheDocument();
    });
    await user.click(screen.getByLabelText(/collapse/i));
    expect(screen.getByRole('button', { name: /what’s happening this week/i })).toBeInTheDocument();
  });
});
