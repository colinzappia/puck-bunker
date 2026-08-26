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

const CATEGORIES = [
  "Skating", "Shot", "Puck Skills", "Playmaking",
  "OZ Hockey Sense", "DZ Hockey Sense", "Compete", "Physicality"
];

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

function youtubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(url.trim())) return url.trim();
  return null;
}

async function fetchReport(id) {
  const url = `${SUPABASE_URL}/rest/v1/puckbunker_reports?id=eq.${encodeURIComponent(id)}&status=eq.published&select=*`;
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
  const ytId = youtubeId(report.video_url);
  const title = report.title || `${report.name}: Scouting Report`;
  const pageTitle = `${report.name} — Grade ${letter} | Puck Bunker`;
  const firstLine = (report.notes || "").split("\n").filter(Boolean)[0] || `Full scouting breakdown of ${report.name}, graded across all eight tools.`;
  const ogImage = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : LOGO_URL;
  const canonicalUrl = `${SITE_URL}/api/report/${report.id}`;
  const scores = report.scores || {};

  const gaugesHtml = CATEGORIES.map(cat => {
    const val = typeof scores[cat] === "number" ? scores[cat] : 0;
    const pct = Math.round((val / 10) * 100);
    return `
        <div class="gauge">
          <div class="gauge-label"><span>${escapeHtml(cat)}</span><b>${val.toFixed(1)}</b></div>
          <div class="gauge-track"><div class="gauge-fill" style="width:${pct}%;"></div></div>
        </div>`;
  }).join("");

  const videoHtml = ytId
    ? `<div class="video-embed"><iframe src="https://www.youtube.com/embed/${ytId}" allowfullscreen loading="lazy"></iframe></div>`
    : "";

  const bylineHtml = report.reporter_name
    ? `<div class="byline">SCOUTED BY ${escapeHtml(report.reporter_name.toUpperCase())}</div>`
    : "";

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
  body{ background:var(--black); color:var(--ice); font-family:'Archivo',sans-serif; line-height:1.6; }
  .stencil{ font-family:'Big Shoulders Stencil Display',sans-serif; text-transform:uppercase; }
  .mono{ font-family:'JetBrains Mono',monospace; }
  a{ color:var(--hazard); text-decoration:none; }
  .wrap{ max-width:820px; margin:0 auto; padding:48px 24px 80px; }
  .back-link{ font-family:'JetBrains Mono',monospace; font-size:12px; letter-spacing:0.06em; color:var(--ice-dim); }
  .back-link:hover{ color:var(--hazard); }
  .report-head{ margin:28px 0 8px; display:flex; align-items:center; gap:16px; flex-wrap:wrap; }
  .grade-pill{
    font-family:'JetBrains Mono',monospace; font-weight:700; font-size:15px;
    padding:6px 14px; border:1px solid currentColor;
  }
  .grade-A{ color:var(--cyan); } .grade-B{ color:var(--ice); } .grade-C{ color:var(--hazard); }
  h1{ font-size:clamp(32px,6vw,52px); line-height:0.95; }
  .subline{ color:var(--ice-dim); font-size:14px; margin-top:6px; }
  .byline{ font-family:'JetBrains Mono',monospace; font-size:11px; color:var(--steel); margin:18px 0; letter-spacing:0.06em; }
  .video-embed{ aspect-ratio:16/9; margin:28px 0; border:1px solid var(--steel); background:var(--panel); }
  .video-embed iframe{ width:100%; height:100%; border:none; }
  .panel{ background:var(--panel); border:1px solid var(--steel); padding:26px 24px; margin:28px 0; }
  .panel h2{ font-size:12px; letter-spacing:0.1em; text-transform:uppercase; color:var(--ice-dim); margin-bottom:20px; }
  .gauge{ margin-bottom:18px; }
  .gauge:last-child{ margin-bottom:0; }
  .gauge-label{ display:flex; justify-content:space-between; font-size:12px; text-transform:uppercase; letter-spacing:0.06em; color:var(--ice-dim); margin-bottom:7px; }
  .gauge-label b{ color:var(--ice); font-family:'JetBrains Mono',monospace; }
  .gauge-track{ height:9px; background:var(--steel-soft); }
  .gauge-fill{ height:100%; background:linear-gradient(90deg,var(--hazard),var(--cyan)); }
  .notes p{ margin-bottom:14px; color:var(--ice-dim); }
  .notes p:last-child{ margin-bottom:0; }
  @media (max-width:600px){ .wrap{ padding:32px 18px 60px; } }
</style>
</head>
<body>
  <div class="wrap">
    <a href="/scouting-reports.html" class="back-link">← BACK TO SCOUTING REPORTS</a>

    <div class="report-head">
      <span class="grade-pill mono ${gClass}">GRADE ${escapeHtml(letter)}</span>
      <span class="mono" style="font-size:12px; color:var(--steel);">FILE #${escapeHtml(report.file_num || "----")}</span>
    </div>
    <h1 class="stencil">${escapeHtml(title)}</h1>
    <div class="subline">${escapeHtml(report.name || "")}${report.position ? " — " + escapeHtml(report.position) : ""}${report.team ? " · " + escapeHtml(report.team) : ""}</div>
    ${bylineHtml}

    ${videoHtml}

    <div class="panel">
      <h2>The M.O. — Category Scores</h2>
      ${gaugesHtml}
    </div>

    <div class="panel notes">
      <h2>Scouting Notes</h2>
      ${notesHtml}
    </div>
  </div>
</body>
</html>`;
}

module.exports = async (req, res) => {
  const id = req.query && req.query.id;

  if (!id) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(renderNotFoundPage());
    return;
  }

  try {
    const report = await fetchReport(id);
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
