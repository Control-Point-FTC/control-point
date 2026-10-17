import { describe, it, expect, beforeEach } from 'vitest';
import { appearanceRequest, applyAppearanceFromReply } from '../brunoAppearance';
import { stripEventBlocks } from '../aiService';
import { THEME_STORAGE_KEY } from '../../hooks/useTheme';

const reply = (theme: string) => 'Switched to light mode.\n```appearance\n{"theme":"' + theme + '"}\n```';

beforeEach(() => { localStorage.clear(); document.documentElement.classList.remove('light'); });

describe("Bruno's appearance action", () => {
  it('a finished reply switches the theme on this device and saves the choice', () => {
    expect(applyAppearanceFromReply(reply('light'))).toBe('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(applyAppearanceFromReply(reply('dark'))).toBe('dark');
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });
  it('ignores replies without a valid block', () => {
    expect(appearanceRequest('Light mode is nice.')).toBeNull();
    expect(appearanceRequest(reply('purple'))).toBeNull();
    expect(appearanceRequest('```appearance\nnot json\n```')).toBeNull();
    expect(applyAppearanceFromReply('nothing here')).toBeNull();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });
  it('the block never shows in the chat', () => {
    expect(stripEventBlocks(reply('light'))).toBe('Switched to light mode.');
    expect(stripEventBlocks('Switching…\n```appearance\n{"the')).toBe('Switching…');
  });
});
