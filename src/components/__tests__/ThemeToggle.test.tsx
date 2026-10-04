// @vitest-environment jsdom
import { StrictMode } from 'react';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import ThemeToggle from '../ThemeToggle';

// Regression: the first click after load used to do nothing — the toggle's
// state updater dispatched the theme event, which re-set the same state, and
// React re-ran the updater against it, flipping the theme straight back.
describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.setItem('cp-theme', 'dark');
    document.documentElement.classList.remove('light');
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
    document.documentElement.classList.remove('light');
  });

  it('switches theme on the very first click, and back on the second', () => {
    render(
      <StrictMode>
        <ThemeToggle />
        {/* a second useTheme() instance, like the charts/wizard that also listen */}
        <ThemeToggle />
      </StrictMode>
    );
    const [button] = screen.getAllByRole('button', { name: 'Toggle light/dark mode' });

    fireEvent.click(button);
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(localStorage.getItem('cp-theme')).toBe('light');

    fireEvent.click(button);
    expect(document.documentElement.classList.contains('light')).toBe(false);
    expect(localStorage.getItem('cp-theme')).toBe('dark');
  });
});
