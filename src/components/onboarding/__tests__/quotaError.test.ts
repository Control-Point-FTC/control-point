/**
 * Gemini quota-error detection — the honest "quota exhausted" message users
 * see instead of the generic "(Something glitched — try asking again.)".
 */
import { describe, it, expect } from 'vitest';
import { isQuotaError, QUOTA_EXHAUSTED_MSG } from '../../../../ai';

describe('isQuotaError', () => {
  it('detects the 429 quota error thrown by doFetch', () => {
    expect(isQuotaError(new Error('Gemini API error 429: {"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}'))).toBe(true);
  });

  it('detects RESOURCE_EXHAUSTED / quota language without a 429 prefix', () => {
    expect(isQuotaError(new Error('You exceeded your current quota, please check your plan and billing details.'))).toBe(true);
  });

  it('does not flag generic failures as quota errors', () => {
    expect(isQuotaError(new Error('Gemini API error 500: internal error'))).toBe(false);
    expect(isQuotaError(new Error('Gemini request timed out'))).toBe(false);
    expect(isQuotaError(new Error('Gemini API error 400: API key not valid'))).toBe(false);
    expect(isQuotaError(null)).toBe(false);
    expect(isQuotaError(undefined)).toBe(false);
  });

  it('quota message explains the fix is on the Google side, not retrying', () => {
    expect(QUOTA_EXHAUSTED_MSG).toMatch(/quota/i);
    expect(QUOTA_EXHAUSTED_MSG).toMatch(/billing/i);
  });
});
