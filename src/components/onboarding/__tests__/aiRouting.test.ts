/**
 * Hybrid AI provider routing — the deterministic fast path that decides whether
 * a Bruno chat request goes to Groq (ordinary chat) or grounded Gemini
 * (web research). Pure functions: no model call is spent on the decision.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  routeChatRequest,
  needsWebSearch,
  isGroqConfigured,
  isGroqQuotaError,
  extractGroqUsage,
  aiChat,
  GROQ_QUOTA_EXHAUSTED_MSG,
} from '../../../../ai-hybrid';

const GROQ_KEY_BACKUP = process.env.GROQ_API_KEY;

beforeEach(() => {
  process.env.GROQ_API_KEY = 'test-key';
});

afterEach(() => {
  if (GROQ_KEY_BACKUP === undefined) delete process.env.GROQ_API_KEY;
  else process.env.GROQ_API_KEY = GROQ_KEY_BACKUP;
});

describe('isGroqConfigured', () => {
  it('is true when GROQ_API_KEY is set', () => {
    expect(isGroqConfigured()).toBe(true);
  });

  it('is false when the key is missing', () => {
    delete process.env.GROQ_API_KEY;
    expect(isGroqConfigured()).toBe(false);
  });
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
  it('routes ordinary conversation to Groq', () => {
    const r = routeChatRequest({ text: 'hey bruno, how should we organize saturday practice?' });
    expect(r.provider).toBe('groq');
    expect(r.grounded).toBe(false);
  });

  it('routes supplied event-log data to Groq — never to search', () => {
    const r = routeChatRequest({ text: 'add this to my event log: drivetrain assembled, intake in progress' });
    expect(r.provider).toBe('groq');
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

  it('falls back to ungrounded Gemini when Groq is not configured', () => {
    delete process.env.GROQ_API_KEY;
    const r = routeChatRequest({ text: 'hey bruno, how are you' });
    expect(r.provider).toBe('gemini');
    expect(r.grounded).toBe(false);
  });

  it('still grounds on Gemini without a Groq key when the web is needed', () => {
    delete process.env.GROQ_API_KEY;
    const r = routeChatRequest({ text: 'what is the latest FTC news' });
    expect(r.provider).toBe('gemini');
    expect(r.grounded).toBe(true);
  });
});

describe('isGroqQuotaError', () => {
  it('detects Groq 429 rate-limit errors', () => {
    expect(isGroqQuotaError(new Error('Groq API error 429: {"error":{"code":"rate_limit_exceeded"}}'))).toBe(true);
  });

  it('detects rate_limit_exceeded language without the 429 prefix', () => {
    expect(isGroqQuotaError(new Error('Request failed: rate_limit_exceeded for model'))).toBe(true);
  });

  it('does not flag auth, bad-request, or server errors as quota', () => {
    expect(isGroqQuotaError(new Error('Groq API error 401: invalid api key'))).toBe(false);
    expect(isGroqQuotaError(new Error('Groq API error 400: bad request'))).toBe(false);
    expect(isGroqQuotaError(new Error('Groq API error 500: internal error'))).toBe(false);
    expect(isGroqQuotaError(null)).toBe(false);
  });
});

describe('extractGroqUsage', () => {
  it('parses OpenAI-format usage from a Groq response', () => {
    const u = extractGroqUsage({
      usage: { prompt_tokens: 77, completion_tokens: 25, total_tokens: 102 },
    });
    expect(u).toEqual({ promptTokens: 77, responseTokens: 25, totalTokens: 102 });
  });

  it('returns null when usage is absent', () => {
    expect(extractGroqUsage({})).toBe(null);
    expect(extractGroqUsage(null)).toBe(null);
  });
});

describe('GROQ_QUOTA_EXHAUSTED_MSG', () => {
  it('tells the user the fix is quota reset or Groq billing, not retrying', () => {
    expect(GROQ_QUOTA_EXHAUSTED_MSG).toMatch(/groq/i);
    expect(GROQ_QUOTA_EXHAUSTED_MSG).toMatch(/refill|reset|daily/i);
  });
});

describe('aiChat (Groq path, stubbed network)', () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function stubGroqSse() {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"Hello"}}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n',
      'data: {"choices":[{"delta":{"content":" there"}}]}\n\n',
      'data: [DONE]\n\n',
    ];
    const stream = new ReadableStream({
      start(controller) {
        for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
        controller.close();
      },
    });
    globalThis.fetch = (async () => new Response(stream, { status: 200 })) as any;
  }

  it('streams Groq deltas and returns the concatenated reply', async () => {
    stubGroqSse();
    const seen: string[] = [];
    const result = await aiChat({
      messages: [{ role: 'user', text: 'say hi' }],
      maxTokens: 512,
      stream: true,
      onChunk: (t) => seen.push(t),
    });
    expect(result.provider).toBe('groq');
    expect(result.grounded).toBe(false);
    expect(result.text).toBe('Hello there');
    expect(seen.join('')).toBe('Hello there');
  });

  it('extracts usage from the stream for token logging', async () => {
    stubGroqSse();
    let usage: any = null;
    await aiChat({
      messages: [{ role: 'user', text: 'say hi' }],
      maxTokens: 512,
      stream: true,
      onUsage: (u) => { usage = u; },
    });
    expect(usage).toEqual({ promptTokens: 10, responseTokens: 5, totalTokens: 15 });
  });

  it('sends the OpenAI-compatible request shape to the Groq endpoint', async () => {
    stubGroqSse();
    let capturedUrl = '';
    let capturedBody: any = null;
    globalThis.fetch = (async (url: any, init: any) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(init.body);
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'hi' } }], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as any;
    await aiChat({ messages: [{ role: 'user', text: 'hi' }], maxTokens: 256, stream: false });
    expect(capturedUrl).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(capturedBody.model).toBeTruthy();
    expect(capturedBody.messages[0].role).toBe('system');
    expect(capturedBody.messages[1]).toEqual({ role: 'user', content: 'hi' });
    expect(capturedBody.reasoning_effort).toBe('low');
  });
});
