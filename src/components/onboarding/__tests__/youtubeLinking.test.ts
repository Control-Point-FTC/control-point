/**
 * YouTube channel linking — verified against the real channel
 * https://www.youtube.com/@FTCGeneral4215 ("FTC Decode Highlights",
 * channel ID UCi6bxo-zIbgLrZf3DYpT24A, confirmed via the public channel page).
 *
 * The YouTube Data API key lives on Render, so these tests mock fetch and
 * assert the exact request the code builds (forHandle param, channel lookup)
 * plus response parsing and error paths.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  resolveYouTubeChannel,
  fetchYouTubeStats,
  pickYouTubeChannel,
  youtubeApi,
} from '../../../../server/youtube';

// Canned channels.list response shaped like the real API, using the verified
// @FTCGeneral4215 channel ID.
const FTC_GENERAL_RESPONSE = {
  items: [
    {
      id: 'UCi6bxo-zIbgLrZf3DYpT24A',
      snippet: {
        title: 'FTC Decode Highlights',
        thumbnails: { default: { url: 'https://i.ytimg.com/vi/x/default.jpg' } },
      },
      statistics: { subscriberCount: '1234', viewCount: '56789', videoCount: '42' },
    },
  ],
};

function mockFetchOnce(json: any, ok = true, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => json,
    text: async () => JSON.stringify(json),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('resolveYouTubeChannel', () => {
  it('resolves a full @handle URL via forHandle (the @FTCGeneral4215 example)', async () => {
    const fetchMock = mockFetchOnce(FTC_GENERAL_RESPONSE);
    const ch = await resolveYouTubeChannel('https://www.youtube.com/@FTCGeneral4215', 'test-key');

    // The request must hit channels.list with forHandle=FTCGeneral4215
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/youtube/v3/channels');
    expect(url.searchParams.get('forHandle')).toBe('FTCGeneral4215');
    expect(url.searchParams.get('part')).toBe('snippet,statistics');
    expect(url.searchParams.get('key')).toBe('test-key');

    expect(ch.channelId).toBe('UCi6bxo-zIbgLrZf3DYpT24A');
    expect(ch.handle).toBe('@FTCGeneral4215');
    expect(ch.displayName).toBe('FTC Decode Highlights');
    expect(ch.followers).toBe(1234);
    expect(ch.views).toBe(56789);
    expect(ch.posts).toBe(42);
    expect(ch.avatarUrl).toBe('https://i.ytimg.com/vi/x/default.jpg');
  });

  it('accepts a bare @handle', async () => {
    const fetchMock = mockFetchOnce(FTC_GENERAL_RESPONSE);
    const ch = await resolveYouTubeChannel('@FTCGeneral4215', 'test-key');
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get('forHandle')).toBe('FTCGeneral4215');
    expect(ch.handle).toBe('@FTCGeneral4215');
  });

  it('accepts a plain handle without @', async () => {
    const fetchMock = mockFetchOnce(FTC_GENERAL_RESPONSE);
    await resolveYouTubeChannel('FTCGeneral4215', 'test-key');
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get('forHandle')).toBe('FTCGeneral4215');
  });

  it('resolves a bare channel ID via the id param', async () => {
    const fetchMock = mockFetchOnce(FTC_GENERAL_RESPONSE);
    const ch = await resolveYouTubeChannel('UCi6bxo-zIbgLrZf3DYpT24A', 'test-key');
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get('id')).toBe('UCi6bxo-zIbgLrZf3DYpT24A');
    expect(url.searchParams.get('forHandle')).toBeNull();
    expect(ch.channelId).toBe('UCi6bxo-zIbgLrZf3DYpT24A');
    expect(ch.handle).toBeNull();
  });

  it('resolves a /channel/ URL via the id param', async () => {
    const fetchMock = mockFetchOnce(FTC_GENERAL_RESPONSE);
    await resolveYouTubeChannel('https://www.youtube.com/channel/UCi6bxo-zIbgLrZf3DYpT24A', 'test-key');
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get('id')).toBe('UCi6bxo-zIbgLrZf3DYpT24A');
  });

  it('throws a clear error when the handle matches nothing', async () => {
    mockFetchOnce({ items: [] });
    await expect(resolveYouTubeChannel('@NoSuchChannelXYZ123', 'test-key')).rejects.toThrow(
      'No YouTube channel found for @NoSuchChannelXYZ123'
    );
  });

  it('throws a clear error on API failure', async () => {
    mockFetchOnce({ error: { message: 'quota exceeded' } }, false, 403);
    await expect(resolveYouTubeChannel('@FTCGeneral4215', 'test-key')).rejects.toThrow('YouTube API error 403');
  });

  it('requires an API key', async () => {
    await expect(resolveYouTubeChannel('@FTCGeneral4215', '')).rejects.toThrow('not configured');
  });
});

describe('fetchYouTubeStats', () => {
  it('parses snippet + statistics for a channel ID', async () => {
    const fetchMock = mockFetchOnce(FTC_GENERAL_RESPONSE);
    const s = await fetchYouTubeStats('test-key', 'UCi6bxo-zIbgLrZf3DYpT24A');
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get('id')).toBe('UCi6bxo-zIbgLrZf3DYpT24A');
    expect(s.displayName).toBe('FTC Decode Highlights');
    expect(s.followers).toBe(1234);
  });

  it('throws when the channel is gone', async () => {
    mockFetchOnce({ items: [] });
    await expect(fetchYouTubeStats('test-key', 'UCxxxxxxxxxxxxxxxxxxxxxx')).rejects.toThrow(
      'YouTube channel not found'
    );
  });
});

describe('pickYouTubeChannel', () => {
  it('defaults missing stats to zero', () => {
    const s = pickYouTubeChannel({ snippet: { title: 'X' } });
    expect(s).toEqual({ displayName: 'X', avatarUrl: '', followers: 0, views: 0, posts: 0 });
  });
});

describe('youtubeApi', () => {
  it('throws when the key is missing', async () => {
    await expect(youtubeApi('', 'channels', {})).rejects.toThrow('not configured');
  });
});
