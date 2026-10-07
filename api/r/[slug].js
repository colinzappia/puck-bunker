// Vercel Serverless Function — dynamic per-report page with real social
// preview tags (Open Graph / Twitter Card).
//
// WHY THIS EXISTS AS A SEPARATE SERVERLESS FUNCTION:
// Twitter, Discord, iMessage, Slack, etc. read <meta> tags by fetching the
// raw HTML — they do NOT run JavaScript. A normal page that fetches its
// content client-side (like the rest of this site) would show a blank or
// generic preview when shared, because the real title/description/image
// only exist after JS runs, which link-preview bots never do. This
// function fetches the report from Supabase on the SERVER and writes the
// real title/description/image directly into the HTML before it's ever
// sent to the browser, so link previews actually work.
//
// URL: https://www.puckbunker.com/api/report/<report-id>
// (Vercel automatically maps this file's path to that route — no extra
// config needed.)

const SUPABASE_URL = "https://bwexpvzstgkllkjaitzy.supabase.co";
const SUPABASE_KEY = "sb_publishable_AqjW7wYPhZ6OTpM1W-jVew_1L18nkZE";
const SITE_URL = "https://www.puckbunker.com";
const LOGO_URL = `${SITE_URL}/puck-bunker-logo.png`;

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function gradeClass(letter) {
  if (letter && letter.startsWith("A")) return "grade-A";
  if (letter && letter.startsWith("B")) return "grade-B";
  return "grade-C";
}

async function fetchReport(slug) {
  const url = `${SUPABASE_URL}/rest/v1/puckbunker_reports?slug=eq.${encodeURIComponent(slug)}&status=eq.published&select=*`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows && rows.length ? rows[0] : null;
}

function renderNotFoundPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Report Not Found — Puck Bunker</title>
<meta name="robots" content="noindex">
<meta property="og:title" content="Report Not Found — Puck Bunker">
<meta property="og:description" content="This report doesn't exist or hasn't been published yet.">
<meta property="og:image" content="${LOGO_URL}">
<link href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Stencil+Display:wght@700;800;900&family=Archivo:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  body{ background:#0B0C0D; color:#F2F2EF; font-family:'Archivo',sans-serif; min-height:100vh; display:flex; align-items:center; justify-content:center; text-align:center; margin:0; }
  h1{ font-family:'Big Shoulders Stencil Display',sans-serif; text-transform:uppercase; font-size:48px; }
  a{ color:#CBAE7E; }
</style>
</head>
<body>
  <div>
    <h1>File Not Found</h1>
    <p>This report doesn't exist, or hasn't been published yet.</p>
    <p><a href="/scouting-reports.html">← Back to Scouting Reports</a></p>
  </div>
</body>
</html>`;
}

function renderReportPage(report, reqHost) {
  const letter = report.overall_grade || "B";
  const gClass = gradeClass(letter);
  const pageTitle = `${report.name} — Grade ${letter} | Puck Bunker`;
  const firstLine = (report.notes || "").split("\n").filter(Boolean)[0] || `Full scouting breakdown of ${report.name}.`;
  const ogImage = report.thumbnail_url || LOGO_URL;
  const canonicalUrl = `${SITE_URL}/report/${report.slug}`;
  const scores = report.scores || {};
  const categories = Object.keys(scores); // dynamic — skater and goalie reports use different category sets

  const gaugesHtml = categories.map(cat => {
    const val = typeof scores[cat] === "number" ? scores[cat] : 0;
    const pct = Math.round((val / 10) * 100);
    return `
        <div class="gauge">
          <div class="gauge-label"><span>${escapeHtml(cat)}</span><b>${val.toFixed(1)}</b></div>
          <div class="gauge-track"><div class="gauge-fill" style="width:${pct}%;"></div></div>
        </div>`;
  }).join("");

  const videoHtml = report.video_url
    ? `<a href="${escapeHtml(report.video_url)}" target="_blank" rel="noopener" class="patreon-link">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        Watch on Patreon
      </a>`
    : "";

  const bylineHtml = report.reporter_name
    ? `<div class="byline" data-scout="${escapeHtml(report.reporter_name)}">SCOUTED BY ${escapeHtml(report.reporter_name.toUpperCase())}</div>`
    : "";

  const metaLine = [report.position, report.team, report.league, report.nation].filter(Boolean).map(escapeHtml).join(" · ");

  const notesHtml = escapeHtml(report.notes || "No notes filed for this report yet.")
    .split("\n").filter(Boolean).map(p => `<p>${p}</p>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(pageTitle)}</title>
<meta name="description" content="${escapeHtml(firstLine)}">
<link rel="canonical" href="${canonicalUrl}">

<meta property="og:type" content="article">
<meta property="og:site_name" content="Puck Bunker">
<meta property="og:title" content="${escapeHtml(pageTitle)}">
<meta property="og:description" content="${escapeHtml(firstLine)}">
<meta property="og:image" content="${ogImage}">
<meta property="og:url" content="${canonicalUrl}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(pageTitle)}">
<meta name="twitter:description" content="${escapeHtml(firstLine)}">
<meta name="twitter:image" content="${ogImage}">

<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": pageTitle,
  "description": firstLine,
  "image": ogImage,
  "url": canonicalUrl,
  "datePublished": report.created_at || undefined,
  "dateModified": report.updated_at || report.created_at || undefined,
  "author": { "@type": "Organization", "name": "Puck Bunker" },
  "publisher": {
    "@type": "Organization",
    "name": "Puck Bunker",
    "logo": { "@type": "ImageObject", "url": LOGO_URL }
  },
  "about": {
    "@type": "Person",
    "name": report.name,
    ...(report.position ? { "jobTitle": report.position } : {}),
    ...(report.nation ? { "nationality": report.nation } : {})
  }
}).replace(/</g, "\\u003c")}
</script>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Stencil+Display:wght@700;800;900&family=Archivo:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  :root{
    --black:#0B0C0D; --panel:#17181A; --panel-2:#1D1F21; --steel:#33363A; --steel-soft:#28292C;
    --ice:#F2F2EF; --ice-dim:#9A9C9F; --hazard:#CBAE7E; --hazard-2:#96805F;
    --cyan:#DCDDDD; --cyan-dim:#8B8D90; --red:#C1684A;
  }
  *{margin:0;padding:0;box-sizing:border-box;}
  body{ background:var(--black); color:var(--ice); font-family:'Archivo',sans-serif; line-height:1.6; overflow-x:hidden; }
  .stencil{ font-family:'Big Shoulders Stencil Display',sans-serif; text-transform:uppercase; }
  .mono{ font-family:'JetBrains Mono',monospace; }
  a{ color:var(--hazard); text-decoration:none; }
  .wrap{ position:relative; z-index:1; max-width:820px; margin:0 auto; padding:48px 24px 80px; overflow-wrap:break-word; word-break:break-word; }
  .back-link{ font-family:'JetBrains Mono',monospace; font-size:12px; letter-spacing:0.06em; color:var(--ice-dim); }
  .back-link:hover{ color:var(--hazard); }
  .hero-thumb{ aspect-ratio:16/9; overflow:hidden; margin-top:20px; border:1px solid var(--steel); }
  .hero-thumb img{ width:100%; height:100%; object-fit:cover; display:block; }
  .report-head{ margin:28px 0 8px; display:flex; align-items:center; gap:16px; flex-wrap:wrap; }
  .grade-pill{
    font-family:'JetBrains Mono',monospace; font-weight:700; font-size:15px;
    padding:6px 14px; border:1px solid currentColor;
  }
  .grade-A{ color:var(--cyan); } .grade-B{ color:var(--ice); } .grade-C{ color:var(--hazard); }
  h1{ font-size:clamp(32px,6vw,52px); line-height:0.95; overflow-wrap:break-word; word-break:break-word; }
  .subline{ color:var(--ice-dim); font-size:14px; margin-top:6px; }
  .prospect-meta{
    font-family:'JetBrains Mono',monospace; font-size:14px; font-weight:700;
    letter-spacing:0.05em; text-transform:uppercase; color:var(--hazard);
    margin-top:10px; overflow-wrap:break-word; word-break:break-word;
  }
  .byline{ font-family:'JetBrains Mono',monospace; font-size:12px; color:#CFD1D4; margin:18px 0; letter-spacing:0.06em; }
  .patreon-link{
    display:inline-flex; align-items:center; gap:10px;
    background:var(--panel); border:1px solid var(--hazard-2); color:var(--hazard);
    padding:14px 22px; margin:28px 0; font-family:'JetBrains Mono',monospace;
    font-size:13px; font-weight:700; letter-spacing:0.05em; text-transform:uppercase;
    transition:background .15s, border-color .15s;
  }
  .patreon-link:hover{ background:var(--panel-2); border-color:var(--hazard); }
  .panel{ background:var(--panel); border:1px solid var(--steel); padding:26px 24px; margin:28px 0; overflow-wrap:break-word; word-break:break-word; }
  .panel h2{ font-size:12px; letter-spacing:0.1em; text-transform:uppercase; color:var(--ice-dim); margin-bottom:20px; }
  .gauge{ margin-bottom:18px; }
  .gauge:last-child{ margin-bottom:0; }
  .gauge-label{ display:flex; justify-content:space-between; gap:12px; font-size:12px; text-transform:uppercase; letter-spacing:0.06em; color:var(--ice-dim); margin-bottom:7px; }
  .gauge-label span{ overflow-wrap:break-word; word-break:break-word; }
  .gauge-label b{ color:var(--ice); font-family:'JetBrains Mono',monospace; flex-shrink:0; }
  .gauge-track{ height:9px; background:var(--steel-soft); }
  .gauge-fill{ height:100%; background:linear-gradient(90deg,var(--hazard),var(--cyan)); }
  .notes p{ margin-bottom:14px; color:var(--ice-dim); overflow-wrap:break-word; word-break:break-word; white-space:pre-wrap; }
  .notes p:last-child{ margin-bottom:0; }
  @media (max-width:600px){ .wrap{ padding:32px 18px 60px; } }
  .crosshair{ position:absolute; top:40px; right:40px; width:100px; height:100px; opacity:0.7; z-index:2; pointer-events:none; }
  .crosshair circle{ transform-origin:center; }
  .crosshair svg{ width:100%; height:100%; }
  /* Rotating radar sweep behind the top-right target (matches the home page) */
  .radar-sweep{ position:absolute; top:-220px; right:-220px; width:640px; height:640px; border-radius:50%; pointer-events:none; opacity:0.55; z-index:0; }
  .radar-sweep::before{ content:""; position:absolute; inset:0; border-radius:50%; background:conic-gradient(from 0deg, rgba(220,221,221,0.35), transparent 28%, transparent 100%); animation:radar-sweep-spin 6s linear infinite; }
  .radar-sweep::after{ content:""; position:absolute; inset:0; border-radius:50%; background-image:repeating-radial-gradient(circle, transparent 0, transparent 79px, rgba(220,221,221,0.14) 80px); border:1px solid rgba(220,221,221,0.18); }
  @keyframes radar-sweep-spin{ to{ transform:rotate(360deg); } }
  @media (prefers-reduced-motion:reduce){ .radar-sweep::before{ animation:none; } }
  .crosshair circle{ animation:crosshair-pulse 2.4s ease-in-out infinite; }
  @keyframes crosshair-pulse{ 0%,100%{ opacity:0.4; } 50%{ opacity:0.95; } }
  @media (max-width:900px){ .crosshair{ display:none; } }
  @media (prefers-reduced-motion:reduce){ .crosshair circle{ animation:none; } }
</style>
<script src="/traffic.js"></script>
<script src="/badges.js" defer></script>
</head>
<body>
  <div class="radar-sweep" aria-hidden="true"></div>
  <div class="crosshair" aria-hidden="true">
    <svg viewBox="0 0 120 120" fill="none" stroke="var(--cyan)" stroke-width="1.5">
      <circle cx="60" cy="60" r="50" opacity="0.5"/>
      <circle cx="60" cy="60" r="30" opacity="0.7"/>
      <line x1="60" y1="0" x2="60" y2="24" opacity="0.8"/>
      <line x1="60" y1="96" x2="60" y2="120" opacity="0.8"/>
      <line x1="0" y1="60" x2="24" y2="60" opacity="0.8"/>
      <line x1="96" y1="60" x2="120" y2="60" opacity="0.8"/>
    </svg>
  </div>
  <div class="wrap">
    <a href="/scouting-reports.html" class="back-link">← BACK TO SCOUTING REPORTS</a>

    ${report.thumbnail_url ? `<div class="hero-thumb"><img src="${escapeHtml(report.thumbnail_url)}" alt=""></div>` : ""}

    <div class="report-head" data-seen-live="${report.seen_live ? 'true' : 'false'}">
      <span class="grade-pill mono ${gClass}">GRADE ${escapeHtml(letter)}</span>
    </div>
    <h1 class="stencil">${escapeHtml(report.name || "Unnamed Prospect")}</h1>
    ${metaLine ? `<div class="prospect-meta">${metaLine}</div>` : ""}
    ${report.title && report.title.trim() ? `<div class="subline" style="font-style:italic;">${escapeHtml(report.title)}</div>` : ""}
    ${bylineHtml}

    ${videoHtml}

    <div class="panel notes">
      <h2>Scouting Notes</h2>
      ${notesHtml}
    </div>

    <div class="panel">
      <h2>The M.O. — Category Scores</h2>
      ${gaugesHtml}
    </div>
  </div>
</body>
</html>`;
}

module.exports = async (req, res) => {
  const slug = req.query && req.query.slug;

  if (!slug) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(renderNotFoundPage());
    return;
  }

  try {
    const report = await fetchReport(slug);
    if (!report) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(renderNotFoundPage());
      return;
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    res.end(renderReportPage(report, req.headers.host));
  } catch (err) {
    console.error("report page error:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(renderNotFoundPage());
  }
};
