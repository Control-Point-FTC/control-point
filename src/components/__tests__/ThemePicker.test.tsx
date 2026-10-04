// @vitest-environment jsdom
import { StrictMode } from 'react';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '../../i18n';
import ThemePicker from '../ThemePicker';
import ThemeToggle from '../ThemeToggle';

const isLight = () => document.documentElement.classList.contains('light');
const radio = (name: string) => screen.getByRole('radio', { name });

describe('ThemePicker (Settings → Appearance)', () => {
  beforeEach(() => {
    localStorage.setItem('cp-theme', 'dark');
    document.documentElement.classList.remove('light');
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
    document.documentElement.classList.remove('light');
  });

  it('applies, persists and marks the chosen theme', () => {
    render(<StrictMode><ThemePicker /></StrictMode>);
    expect(radio('Dark').getAttribute('aria-checked')).toBe('true');

    fireEvent.click(radio('Light'));
    expect(isLight()).toBe(true);
    expect(localStorage.getItem('cp-theme')).toBe('light');
    expect(radio('Light').getAttribute('aria-checked')).toBe('true');
    expect(radio('Dark').getAttribute('aria-checked')).toBe('false');

    fireEvent.click(radio('Dark'));
    expect(isLight()).toBe(false);
    expect(localStorage.getItem('cp-theme')).toBe('dark');
    expect(radio('Dark').getAttribute('aria-checked')).toBe('true');
  });

  it('stays in sync with the header toggle', () => {
    render(<StrictMode><ThemeToggle /><ThemePicker /></StrictMode>);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle light/dark mode' }));
    expect(isLight()).toBe(true);
    expect(radio('Light').getAttribute('aria-checked')).toBe('true');
  });

  it('is one tab stop and arrow keys move + select', () => {
    render(<StrictMode><ThemePicker /></StrictMode>);
    expect(radio('Dark').tabIndex).toBe(0);
    expect(radio('Light').tabIndex).toBe(-1);

    radio('Dark').focus();
    fireEvent.keyDown(radio('Dark'), { key: 'ArrowLeft' });
    expect(isLight()).toBe(true);
    expect(document.activeElement).toBe(radio('Light'));
    expect(radio('Light').tabIndex).toBe(0);

    fireEvent.keyDown(radio('Light'), { key: 'ArrowRight' });
    expect(isLight()).toBe(false);
    expect(document.activeElement).toBe(radio('Dark'));
  });
});
