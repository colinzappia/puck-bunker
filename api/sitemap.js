// Vercel Serverless Function — generates sitemap.xml dynamically, listing
// every static page plus every published scouting report. This is what
// lets search engines discover report pages directly, instead of relying
// on them rendering the JavaScript on the archive pages to find the links.
//
// Served at the clean URL /sitemap.xml via the rewrite in vercel.json.

const SUPABASE_URL = "https://bwexpvzstgkllkjaitzy.supabase.co";
const SUPABASE_KEY = "sb_publishable_AqjW7wYPhZ6OTpM1W-jVew_1L18nkZE";
const SITE_URL = "https://www.puckbunker.com";

const STATIC_PAGES = [
  { path: "/", priority: "1.0", changefreq: "daily" },
  { path: "/episodes.html", priority: "0.8", changefreq: "weekly" },
  { path: "/scouting-reports.html", priority: "0.9", changefreq: "daily" },
  { path: "/articles.html", priority: "0.5", changefreq: "weekly" },
  { path: "/analytics.html", priority: "0.4", changefreq: "monthly" },
  { path: "/bunker-data.html", priority: "0.6", changefreq: "weekly" },
  { path: "/prospect-tracker.html", priority: "0.7", changefreq: "daily" },
  { path: "/compare.html", priority: "0.5", changefreq: "weekly" },
  { path: "/predict.html", priority: "0.5", changefreq: "weekly" },
];

// Same rule the rest of the site uses to decide two reports are the same player.
function playerSlug(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeXml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function fetchPublishedReports() {
  const url = `${SUPABASE_URL}/rest/v1/puckbunker_reports?status=eq.published&select=id,slug,name,updated_at`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) return [];
  return res.json();
}

module.exports = async (req, res) => {
  try {
    const reports = await fetchPublishedReports();

    let urls = STATIC_PAGES.map(p => `  <url>
    <loc>${SITE_URL}${p.path}</loc>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join("\n");

    const reportUrls = reports.map(r => {
      // Prefer the clean slug URL; fall back to the ID-based one for any
      // report that somehow doesn't have a slug yet.
      const loc = r.slug ? `${SITE_URL}/report/${r.slug}` : `${SITE_URL}/api/report/${r.id}`;
      const lastmod = r.updated_at ? new Date(r.updated_at).toISOString().split("T")[0] : "";
      return `  <url>
    <loc>${escapeXml(loc)}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ""}
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`;
    }).join("\n");

    // Player pages: only for players with 2+ reports (a one-report player's page would just duplicate the report page)
    const byPlayer = new Map();
    reports.forEach(r => {
      const slug = playerSlug(r.name);
      if (!slug) return;
      const entry = byPlayer.get(slug) || { count: 0, last: "" };
      entry.count += 1;
      if (r.updated_at && r.updated_at > entry.last) entry.last = r.updated_at;
      byPlayer.set(slug, entry);
    });
    const playerUrls = [...byPlayer.entries()].filter(([, v]) => v.count > 1).map(([slug, v]) => {
      const lastmod = v.last ? new Date(v.last).toISOString().split("T")[0] : "";
      return `  <url>
    <loc>${escapeXml(`${SITE_URL}/player/${slug}`)}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ""}
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`;
    }).join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
${reportUrls}
${playerUrls}
</urlset>`;

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/xml");
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=7200");
    res.end(xml);
  } catch (err) {
    console.error("sitemap error:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain");
    res.end("Failed to generate sitemap.");
  }
};
