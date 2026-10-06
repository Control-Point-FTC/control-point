import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from '../copyText';

describe('copyText', () => {
  const original = navigator.clipboard;
  afterEach(() => { Object.defineProperty(navigator, 'clipboard', { value: original, configurable: true }); });

  it('uses the Clipboard API when it is there', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    expect(await copyText('hi')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hi');
  });

  it('falls back to a hidden textarea when the API is missing (plain HTTP)', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    const exec = vi.fn().mockReturnValue(true);
    (document as any).execCommand = exec;
    expect(await copyText('hi')).toBe(true);
    expect(exec).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('reports failure when nothing could be copied', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true });
    (document as any).execCommand = vi.fn().mockReturnValue(false);
    expect(await copyText('hi')).toBe(false);
  });

  it('removes its hidden textarea even when copying throws', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    (document as any).execCommand = vi.fn(() => { throw new Error('nope'); });
    expect(await copyText('hi')).toBe(false);
    expect(document.querySelector('textarea')).toBeNull();
  });
});
