import { describe, it, expect, beforeEach } from 'vitest';
import { clearInvite, inviteTokenFromPath, inviteTokenFromText, peekInvite, stashInvite } from '../pages/join/joinLink';

const TOKEN = 'cpi_abcdefghijklmnopqrstuvwxyz012345';

describe('invite link parsing', () => {
  it('reads a token from a /join path only', () => {
    expect(inviteTokenFromPath(`/join/${TOKEN}`)).toBe(TOKEN);
    expect(inviteTokenFromPath(`/join/${TOKEN}/`)).toBe(TOKEN);
    expect(inviteTokenFromPath('/join/CP-ABCD-123456')).toBeNull();
    expect(inviteTokenFromPath(`/dashboard/${TOKEN}`)).toBeNull();
  });

  it('finds a token in a pasted link, and treats anything else as a code', () => {
    expect(inviteTokenFromText(`https://tryctrlpoint.org/join/${TOKEN}`)).toBe(TOKEN);
    expect(inviteTokenFromText(`  ${TOKEN}  `)).toBe(TOKEN);
    expect(inviteTokenFromText('CP-ABCD-123456')).toBeNull();
  });
});

describe('pending invite', () => {
  beforeEach(() => clearInvite());
  it('is kept for the tab until cleared', () => {
    expect(peekInvite()).toBeNull();
    stashInvite(TOKEN);
    expect(peekInvite()).toBe(TOKEN);
    clearInvite();
    expect(peekInvite()).toBeNull();
  });
});
