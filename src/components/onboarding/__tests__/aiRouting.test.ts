/**
 * Hybrid AI provider routing — the deterministic fast path that decides whether
 * a Bruno chat request goes to Gemini (free primary) or Anthropic (fallback).
 * Pure functions: no model call is spent on the decision.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  routeChatRequest,
  needsWebSearch,
  isAnthropicConfigured,
  isAnthropicQuotaError,
  isGeminiConfigured,
  extractAnthropicUsage,
  aiChat,
  ANTHROPIC_QUOTA_EXHAUSTED_MSG,
} from '../../../../ai-hybrid';

const ANTHROPIC_KEY_BACKUP = process.env.ANTHROPIC_API_KEY;
const GEMINI_KEY_BACKUP = process.env.GEMINI_API_KEY;

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.GEMINI_API_KEY = 'test-gemini-key';
});

afterEach(() => {
  if (ANTHROPIC_KEY_BACKUP === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ANTHROPIC_KEY_BACKUP;
  if (GEMINI_KEY_BACKUP === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = GEMINI_KEY_BACKUP;
});

describe('needsWebSearch', () => {
  it('flags explicit web-search requests', () => {
    expect(needsWebSearch('search the web for the latest FTC game manual')).toBe(true);
    expect(needsWebSearch('can you search: best swerve drive modules')).toBe(true);
    expect(needsWebSearch('look up the FTC Q&A on pinning rules')).toBe(true);
  });

  it('flags current/live factual questions', () => {
    expect(needsWebSearch('what happened in FTC news this week')).toBe(true);
    expect(needsWebSearch('when is the 2026 FTC kickoff')).toBe(true);
    expect(needsWebSearch('what is the price of a goBILDA 5203 motor')).toBe(true);
  });

  it('does not flag team actions that merely contain "announcement" or "news"', () => {
    expect(needsWebSearch('post an announcement to my team about practice')).toBe(false);
    expect(needsWebSearch('write an announcement for our team fundraiser')).toBe(false);
    expect(needsWebSearch('send the team news about saturday practice')).toBe(false);
  });

  it('does not flag ordinary chat or event-log data', () => {
    expect(needsWebSearch('add this to my event log: we finished the intake prototype')).toBe(false);
    expect(needsWebSearch('hey bruno how are you')).toBe(false);
    expect(needsWebSearch('summarize these build notes')).toBe(false);
    expect(needsWebSearch('')).toBe(false);
  });
});

describe('routeChatRequest', () => {
  it('routes ordinary conversation to Gemini (free primary)', () => {
    const r = routeChatRequest({ text: 'hey bruno, how should we organize saturday practice?' });
    expect(r.provider).toBe('gemini');
    expect(r.grounded).toBe(false);
  });

  it('routes supplied event-log data to Gemini — never to search', () => {
    const r = routeChatRequest({ text: 'add this to my event log: drivetrain assembled, intake in progress' });
    expect(r.provider).toBe('gemini');
    expect(r.grounded).toBe(false);
  });

  it('routes web-research requests to grounded Gemini', () => {
    const r = routeChatRequest({ text: 'search the web for the latest FTC game manual updates' });
    expect(r.provider).toBe('gemini');
    expect(r.grounded).toBe(true);
  });

  it('routes explicit client web-search toggle to grounded Gemini', () => {
    const r = routeChatRequest({ text: 'tell me about swerve drives', webSearch: true });
    expect(r.provider).toBe('gemini');
    expect(r.grounded).toBe(true);
  });

  it('routes image input to Gemini (vision path)', () => {
    const r = routeChatRequest({ text: 'what is in this photo', hasImages: true });
    expect(r.provider).toBe('gemini');
    expect(r.grounded).toBe(false);
  });

  it('routes to Anthropic on owner override (forceProvider: anthropic)', () => {
    const r = routeChatRequest({ text: 'hey bruno, how are you', forceProvider: 'anthropic' });
    expect(r.provider).toBe('anthropic');
    expect(r.grounded).toBe(false);
  });

  it('falls back to Gemini on owner Anthropic override when the key is missing', () => {
    delete process.env.ANTHROPIC_API_KEY;
    const r = routeChatRequest({ text: 'hey bruno, how are you', forceProvider: 'anthropic' });
    expect(r.provider).toBe('gemini');
    expect(r.grounded).toBe(false);
  });

  it('routes to Gemini on owner override (forceProvider: gemini)', () => {
    const r = routeChatRequest({ text: 'hey bruno, how are you', forceProvider: 'gemini' });
    expect(r.provider).toBe('gemini');
    expect(r.grounded).toBe(false);
  });
});

describe('isAnthropicConfigured', () => {
  it('is true when ANTHROPIC_API_KEY is set', () => {
    expect(isAnthropicConfigured()).toBe(true);
  });

  it('is false when the key is missing', () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(isAnthropicConfigured()).toBe(false);
  });
});

describe('isAnthropicQuotaError', () => {
  it('detects Anthropic 429 credit-exhaustion errors', () => {
    expect(isAnthropicQuotaError(new Error('Anthropic API error 429: {"error":"rate limited"}'))).toBe(true);
  });

  it('does not flag auth or bad-request errors as quota', () => {
    expect(isAnthropicQuotaError(new Error('Anthropic API error 401: bad key'))).toBe(false);
    expect(isAnthropicQuotaError(new Error('Anthropic API error 400: bad request'))).toBe(false);
  });
});

describe('ANTHROPIC_QUOTA_EXHAUSTED_MSG', () => {
  it('explains the fix is a credit top-up', () => {
    expect(ANTHROPIC_QUOTA_EXHAUSTED_MSG).toMatch(/top-up|credits/i);
  });
});

describe('extractAnthropicUsage', () => {
  it('parses Anthropic-format usage from a provider response', () => {
    const u = extractAnthropicUsage({
      usage: { input_tokens: 77, output_tokens: 25 },
    });
    expect(u).toEqual({ promptTokens: 77, responseTokens: 25, totalTokens: 102 });
  });

  it('returns null when usage is absent', () => {
    expect(extractAnthropicUsage({})).toBe(null);
    expect(extractAnthropicUsage(null)).toBe(null);
  });
});

describe('isGeminiConfigured', () => {
  it('is true when GEMINI_API_KEY is set', () => {
    expect(isGeminiConfigured()).toBe(true);
  });

  it('is false when the key is missing', () => {
    delete process.env.GEMINI_API_KEY;
    expect(isGeminiConfigured()).toBe(false);
  });
});
