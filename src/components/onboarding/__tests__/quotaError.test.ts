/**
 * Gemini quota-error detection — the honest "quota exhausted" message users
 * see instead of the generic "(Something glitched — try asking again.)".
 */
import { describe, it, expect } from 'vitest';
import { isQuotaError, QUOTA_EXHAUSTED_MSG, shouldRetryWithoutGrounding } from '../../../../ai';

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

describe('shouldRetryWithoutGrounding', () => {
  it('retries once when a grounded call hits 429 (grounding quota may be the exhausted bucket)', () => {
    expect(shouldRetryWithoutGrounding(429, true)).toBe(true);
  });

  it('never retries ungrounded calls (no retry loop)', () => {
    expect(shouldRetryWithoutGrounding(429, false)).toBe(false);
  });

  it('never retries non-429 failures (400s, 500s, timeouts)', () => {
    expect(shouldRetryWithoutGrounding(400, true)).toBe(false);
    expect(shouldRetryWithoutGrounding(500, true)).toBe(false);
    expect(shouldRetryWithoutGrounding(503, true)).toBe(false);
  });
});
