import { describe, it, expect } from 'vitest';
import { passwordProblem, passwordRules, PASSWORD_MAX } from '../password';

describe('password rules', () => {
  it('needs 8+ characters, a letter, and a number or symbol', () => {
    expect(passwordProblem('goodpass-1')).toBeNull();
    expect(passwordProblem('pässwört9')).toBeNull();
    expect(passwordProblem('Correct horse!')).toBeNull();
    expect(passwordProblem('short1')).toBe('Password needs: at least 8 characters.');
    expect(passwordProblem('allletters')).toBe('Password needs: a number or symbol.');
    expect(passwordProblem('12345678')).toBe('Password needs: a letter.');
    // Spaces don't count as a symbol.
    expect(passwordProblem('two words')).toBe('Password needs: a number or symbol.');
    expect(passwordProblem(undefined)).toMatch(/^Password needs:/);
  });

  it('refuses what bcrypt would silently cut (72 bytes)', () => {
    expect(passwordProblem(`a1${'x'.repeat(PASSWORD_MAX - 2)}`)).toBeNull();
    expect(passwordProblem(`a1${'x'.repeat(PASSWORD_MAX - 1)}`)).toMatch(/at most 72/);
    expect(passwordProblem(`a1${'é'.repeat(36)}`)).toMatch(/at most 72/); // 2 bytes each
  });

  it('lists each rule for the live checklist', () => {
    expect(passwordRules('abc').map((r) => r.ok)).toEqual([false, true, false]);
  });
});
