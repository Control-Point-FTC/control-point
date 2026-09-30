// YouTube Data API v3 helpers for Control Point's Outreach social linking.
// Pure module (API key passed in) so the channel-resolution logic is unit
// testable without booting the server. server.ts wraps these with the
// configured YOUTUBE_API_KEY.

export interface YouTubeChannelInfo {
  displayName: string;
  avatarUrl: string;
  followers: number;
  views: number;
  posts: number;
}

export interface ResolvedYouTubeChannel extends YouTubeChannelInfo {
  channelId: string;
  handle: string | null;
}

export async function youtubeApi(apiKey: string, path: string, params: Record<string, string>): Promise<any> {
  if (!apiKey) throw new Error("YouTube API key not configured");
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", apiKey);
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(url.toString(), { signal: ctl.signal });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      throw new Error(`YouTube API error ${r.status}: ${body.slice(0, 160)}`);
    }
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

export function pickYouTubeChannel(ch: any): YouTubeChannelInfo {
  const s = ch.statistics || {};
  return {
    displayName: ch.snippet?.title || "",
    avatarUrl: ch.snippet?.thumbnails?.default?.url || "",
    followers: Number(s.subscriberCount || 0),
    views: Number(s.viewCount || 0),
    posts: Number(s.videoCount || 0),
  };
}

export async function resolveYouTubeChannel(input: string, apiKey: string): Promise<ResolvedYouTubeChannel> {
  const clean = input.trim();
  // Direct channel URL or bare channel ID
  const m = clean.match(/youtube\.com\/channel\/([A-Za-z0-9_-]{10,})/) || clean.match(/^UC[A-Za-z0-9_-]{20,}$/);
  if (m) {
    const id = m[1] || m[0];
    const data = await youtubeApi(apiKey, "channels", { part: "snippet,statistics", id });
    const ch = data.items?.[0];
    if (!ch) throw new Error("Channel not found on YouTube");
    return { channelId: ch.id, handle: null as string | null, ...pickYouTubeChannel(ch) };
  }
  // @handle lookup — also accepts full URLs like https://www.youtube.com/@SomeHandle
  let handle = clean;
  const urlHandle = clean.match(/youtube\.com\/@([^/?#\s]+)/i);
  if (urlHandle) handle = urlHandle[1];
  else handle = clean.replace(/^@/, "").split(/[/?#]/)[0];
  if (!handle) throw new Error("Enter a channel handle or URL");
  const data = await youtubeApi(apiKey, "channels", { part: "snippet,statistics", forHandle: handle });
  const ch = data.items?.[0];
  if (!ch) throw new Error(`No YouTube channel found for @${handle}`);
  return { channelId: ch.id, handle: "@" + handle, ...pickYouTubeChannel(ch) };
}

export async function fetchYouTubeStats(apiKey: string, channelId: string): Promise<YouTubeChannelInfo> {
  const data = await youtubeApi(apiKey, "channels", { part: "snippet,statistics", id: channelId });
  const ch = data.items?.[0];
  if (!ch) throw new Error("YouTube channel not found");
  return pickYouTubeChannel(ch);
}
