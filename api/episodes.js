// Vercel Serverless Function — fetches the channel's latest YouTube uploads
// via the official YouTube Data API v3, so episodes.html always reflects
// whatever's actually live on the channel, no manual updates needed.
//
// The API key is read from a Vercel Environment Variable (YOUTUBE_API_KEY),
// not committed to this file or the repo — unlike Supabase's "publishable"
// key, a YouTube API key isn't meant to be public.
//
// URL: https://www.puckbunker.com/api/episodes
// Optional: ?limit=12 (defaults to 12, max 50)

const CHANNEL_HANDLE = "@PuckBunker";
const DEFAULT_LIMIT = 12;

// Cached for the lifetime of a warm serverless instance, so repeat
// invocations don't re-resolve the channel -> uploads-playlist mapping
// (saves a small amount of quota; harmless either way since it's 1 unit).
let cachedUploadsPlaylistId = null;

async function resolveUploadsPlaylistId(apiKey) {
  if (cachedUploadsPlaylistId) return cachedUploadsPlaylistId;

  const url = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&forHandle=${encodeURIComponent(CHANNEL_HANDLE)}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Channel lookup failed (${res.status}): ${body}`);
  }
  const data = await res.json();
  const item = data.items && data.items[0];
  if (!item) throw new Error(`No channel found for handle ${CHANNEL_HANDLE}`);

  const playlistId = item.contentDetails.relatedPlaylists.uploads;
  cachedUploadsPlaylistId = playlistId;
  return playlistId;
}

async function fetchLatestVideos(apiKey, limit) {
  const playlistId = await resolveUploadsPlaylistId(apiKey);

  const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${encodeURIComponent(playlistId)}&maxResults=${limit}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Playlist fetch failed (${res.status}): ${body}`);
  }
  const data = await res.json();

  const videos = (data.items || [])
    .filter(item => item.snippet && item.snippet.resourceId && item.snippet.resourceId.videoId)
    .map(item => {
      const sn = item.snippet;
      const thumb = (sn.thumbnails && (sn.thumbnails.high || sn.thumbnails.medium || sn.thumbnails.default)) || {};
      return {
        id: sn.resourceId.videoId,
        title: sn.title || "",
        description: sn.description || "",
        publishedAt: sn.publishedAt || null,
        thumbnail: thumb.url || "",
      };
    })
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  return videos;
}

module.exports = async (req, res) => {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "YOUTUBE_API_KEY is not configured on the server." }));
    return;
  }

  const rawLimit = parseInt((req.query && req.query.limit) || DEFAULT_LIMIT, 10);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : DEFAULT_LIMIT, 1), 50);

  try {
    const videos = await fetchLatestVideos(apiKey, limit);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    // Cache at the edge for 30 minutes so repeat page loads don't re-hit
    // the YouTube API (and don't spend quota) for the same data.
    res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=3600");
    res.end(JSON.stringify({ videos }));
  } catch (err) {
    console.error("episodes endpoint error:", err);
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Failed to load videos from YouTube.", detail: String(err && err.message || err) }));
  }
};
