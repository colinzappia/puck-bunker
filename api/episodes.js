// Vercel Serverless Function — fetches the channel's latest YouTube uploads
// via the official YouTube Data API v3, so episodes.html always reflects
// whatever's actually live on the channel, no manual updates needed.
//
// The API key is read from a Vercel Environment Variable (YOUTUBE_API_KEY),
// not committed to this file or the repo — unlike Supabase's "publishable"
// key, a YouTube API key isn't meant to be public.
//
// Videos on the "excluded episodes" list (managed from admin.html) are
// filtered out here, and the pool is backfilled from further back in the
// upload history so the page still shows the requested count.
//
// URL: https://www.puckbunker.com/api/episodes
// Optional: ?limit=12 (defaults to 12, max 50)

const CHANNEL_HANDLE = "@PuckBunker";
const DEFAULT_LIMIT = 12;
const FETCH_POOL_SIZE = 50; // max allowed per YouTube API call; gives room to backfill around exclusions

const SUPABASE_URL = "https://bwexpvzstgkllkjaitzy.supabase.co";
const SUPABASE_KEY = "sb_publishable_AqjW7wYPhZ6OTpM1W-jVew_1L18nkZE";

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

async function fetchExcludedIds() {
  try {
    const url = `${SUPABASE_URL}/rest/v1/puckbunker_excluded_episodes?select=video_id`;
    const res = await fetch(url, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!res.ok) return new Set();
    const rows = await res.json();
    return new Set((rows || []).map(r => r.video_id));
  } catch (e) {
    console.error("Failed to load excluded episodes list, showing all videos:", e);
    return new Set(); // fail open — never let an exclusion-list hiccup take the whole page down
  }
}

async function fetchLatestVideos(apiKey, limit) {
  const playlistId = await resolveUploadsPlaylistId(apiKey);

  const [playlistRes, excludedIds] = await Promise.all([
    fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${encodeURIComponent(playlistId)}&maxResults=${FETCH_POOL_SIZE}&key=${apiKey}`),
    fetchExcludedIds(),
  ]);

  if (!playlistRes.ok) {
    const body = await playlistRes.text();
    throw new Error(`Playlist fetch failed (${playlistRes.status}): ${body}`);
  }
  const data = await playlistRes.json();

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
    .filter(v => !excludedIds.has(v.id))
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, limit);

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
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : DEFAULT_LIMIT, 1), FETCH_POOL_SIZE);

  try {
    const videos = await fetchLatestVideos(apiKey, limit);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    // Cache at the edge for 5 minutes — short enough that hiding a video
    // from admin.html takes effect quickly, long enough to avoid hammering
    // the YouTube API on every page load.
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    res.end(JSON.stringify({ videos }));
  } catch (err) {
    console.error("episodes endpoint error:", err);
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Failed to load videos from YouTube.", detail: String(err && err.message || err) }));
  }
};
