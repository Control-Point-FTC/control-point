import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

const reporting = vi.hoisted(() => ({ reportClientError: vi.fn(), reloadForNewBuild: vi.fn(() => true) }));
vi.mock('../../services/errorReporting', async (orig) => ({ ...(await orig<object>()), ...reporting }));

import { ErrorBoundary } from '../ErrorBoundary';
import { isChunkLoadError } from '../../services/errorReporting';

let shouldThrow: Error | null = null;
function Boom() {
  if (shouldThrow) throw shouldThrow;
  return <p>page content</p>;
}

beforeEach(() => {
  reporting.reportClientError.mockReset();
  reporting.reloadForNewBuild.mockReset();
  reporting.reloadForNewBuild.mockReturnValue(true);
  vi.spyOn(console, 'error').mockImplementation(() => {}); // React logs caught errors
});
afterEach(() => { cleanup(); shouldThrow = null; vi.restoreAllMocks(); });

describe('ErrorBoundary', () => {
  it('shows a recoverable message instead of a blank page, and reports the crash', () => {
    shouldThrow = new Error('kaboom');
    render(<ErrorBoundary resetKey="/code"><Boom /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong on this page');
    expect(reporting.reportClientError).toHaveBeenCalledWith(expect.objectContaining({ kind: 'render', message: 'kaboom' }));
  });

  it('Try again re-renders the page once the problem is gone', () => {
    shouldThrow = new Error('flaky');
    render(<ErrorBoundary resetKey="/code"><Boom /></ErrorBoundary>);
    shouldThrow = null;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('page content')).toBeInTheDocument();
  });

  it('navigating to another route clears the error', () => {
    shouldThrow = new Error('only on /code');
    const { rerender } = render(<ErrorBoundary resetKey="/code"><Boom /></ErrorBoundary>);
    shouldThrow = null;
    rerender(<ErrorBoundary resetKey="/tasks"><Boom /></ErrorBoundary>);
    expect(screen.getByText('page content')).toBeInTheDocument();
  });

  it('a stale chunk after a deploy reloads once instead of showing an error report', () => {
    shouldThrow = new Error('Failed to fetch dynamically imported module: /assets/CodePage-old.js');
    render(<ErrorBoundary resetKey="/code"><Boom /></ErrorBoundary>);
    expect(reporting.reloadForNewBuild).toHaveBeenCalled();
    expect(reporting.reportClientError).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Control Point was updated');
  });
});

describe('isChunkLoadError', () => {
  it('recognises the browsers’ chunk-load messages', () => {
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: x'))).toBe(true);
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
  });
});
