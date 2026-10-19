// Vercel Serverless Function — ONE page with every published report on a player.
//
// URL: https://www.puckbunker.com/player/<name-slug>   e.g. /player/landon-dupont
// (vercel.json rewrites /player/:player to this file at /api/p/:player)
//
// Reports are matched to a player by name (ignoring capitals, accents and
// punctuation), so "Landon DuPont" and "landon dupont" are the same player.
// Rendered on the server so search engines and link previews see the real
// content, same as the individual report pages.

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

// Same rule the rest of the site uses to decide two reports are the same player.
function playerSlug(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

const HEADERS = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

// Step 1: a light list of every published report's id + name, to find this player's.
async function fetchNames() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/puckbunker_reports?status=eq.published&select=id,name`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Name lookup failed (${res.status})`);
  return res.json();
}

// Step 2: the full reports for just that player, newest first.
async function fetchReportsByIds(ids) {
  const url = `${SUPABASE_URL}/rest/v1/puckbunker_reports?id=in.(${ids.map(encodeURIComponent).join(",")})&status=eq.published&select=*&order=created_at.desc`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Report lookup failed (${res.status})`);
  return res.json();
}

function renderNotFoundPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Player Not Found — Puck Bunker</title>
<meta name="robots" content="noindex">
<link href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Stencil+Display:wght@700;800;900&family=Archivo:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  body{ background:#0B0C0D; color:#F2F2EF; font-family:'Archivo',sans-serif; min-height:100vh; display:flex; align-items:center; justify-content:center; text-align:center; margin:0; }
  h1{ font-family:'Big Shoulders Stencil Display',sans-serif; text-transform:uppercase; font-size:48px; }
  a{ color:#CBAE7E; }
</style>
</head>
<body>
  <div>
    <h1>Player Not Found</h1>
    <p>We don't have any published reports on this player yet.</p>
    <p><a href="/scouting-reports.html">← Back to Scouting Reports</a></p>
  </div>
</body>
</html>`;
}

function renderPlayerPage(reports, slug) {
  const latest = reports[0];
  const name = latest.name || "Unnamed Prospect";
  const n = reports.length;
  const canonicalUrl = `${SITE_URL}/player/${slug}`;
  const metaLine = [latest.position, latest.team, latest.league, latest.nation].filter(Boolean).map(escapeHtml).join(" · ");
  const pageTitle = `${name} — ${n} Scouting Report${n === 1 ? "" : "s"} | Puck Bunker`;
  const flatNote = (latest.notes || "").replace(/\s+/g, " ").trim();
  const description = flatNote ? flatNote.slice(0, 200) + (flatNote.length > 200 ? "…" : "") : `Every scouting report on ${name}.`;
  const ogImage = (reports.find(r => r.thumbnail_url) || {}).thumbnail_url || LOGO_URL;
  const reportUrl = r => r.slug ? `/report/${r.slug}` : `/api/report/${r.id}`;

  // Grade history, oldest to newest. Each grade is a .grade-pill (the badge script turns it into a chevron).
  const history = [...reports].reverse().map(r =>
    `<div class="gh-item"><span class="grade-pill mono ${gradeClass(r.overall_grade || "B")}">${escapeHtml(r.overall_grade || "B")}</span><span class="gh-date">${escapeHtml(fmtDate(r.created_at))}</span></div>`
  ).join('<span class="gh-arrow" aria-hidden="true">›</span>');

  const blocks = reports.map((r, i) => {
    const letter = r.overall_grade || "B";
    const scores = r.scores || {};
    const gauges = Object.keys(scores).map(cat => {
      const val = typeof scores[cat] === "number" ? scores[cat] : 0;
      const pct = Math.round((val / 10) * 100);
      return `
        <div class="gauge">
          <div class="gauge-label"><span>${escapeHtml(cat)}</span><b>${val.toFixed(1)}</b></div>
          <div class="gauge-track"><div class="gauge-fill" style="width:${pct}%;"></div></div>
        </div>`;
    }).join("");
    const notes = escapeHtml(r.notes || "No notes filed for this report yet.")
      .split("\n").filter(Boolean).map(p => `<p>${p}</p>`).join("");
    const video = r.video_url
      ? `<a href="${escapeHtml(r.video_url)}" target="_blank" rel="noopener" class="patreon-link">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          Watch on Patreon
        </a>`
      : "";
    const scout = r.reporter_name ? `<div class="byline">SCOUTED BY ${escapeHtml(r.reporter_name.toUpperCase())}</div>` : "";
    const title = r.title && r.title.trim() ? r.title : `Report filed ${fmtDate(r.created_at)}`;
    return `
    <section class="report-block" id="report-${escapeHtml(r.id)}">
      <div class="rb-top">
        <span class="rb-count mono">REPORT ${n - i} OF ${n}</span>
        <a class="rb-open" href="${reportUrl(r)}">Open on its own page →</a>
      </div>
      <div class="report-head" data-seen-live="${r.seen_live ? "true" : "false"}">
        <span class="grade-pill mono ${gradeClass(letter)}">GRADE ${escapeHtml(letter)}</span>
      </div>
      <div class="rb-title">${escapeHtml(title)}</div>
      ${scout}
      ${video}
      <div class="panel notes"><h2>Scouting Notes</h2>${notes}</div>
      <div class="panel"><h2>The M.O. — Category Scores</h2>${gauges}</div>
    </section>`;
  }).join("");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": pageTitle,
    "description": description,
    "url": canonicalUrl,
    "about": {
      "@type": "Person",
      "name": name,
      ...(latest.position ? { "jobTitle": latest.position } : {}),
      ...(latest.nation ? { "nationality": latest.nation } : {})
    },
    "hasPart": reports.map(r => ({
      "@type": "Article",
      "headline": `${r.name} — Grade ${r.overall_grade || ""}`.trim(),
      "url": SITE_URL + reportUrl(r),
      "datePublished": r.created_at || undefined
    }))
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(pageTitle)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${canonicalUrl}">

<meta property="og:type" content="profile">
<meta property="og:site_name" content="Puck Bunker">
<meta property="og:title" content="${escapeHtml(pageTitle)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(ogImage)}">
<meta property="og:url" content="${canonicalUrl}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(pageTitle)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(ogImage)}">

<script type="application/ld+json">
${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}
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
  h1{ font-size:clamp(34px,6.5vw,56px); line-height:0.95; margin-top:34px; overflow-wrap:break-word; word-break:break-word; }
  .prospect-meta{
    font-family:'JetBrains Mono',monospace; font-size:14px; font-weight:700;
    letter-spacing:0.05em; text-transform:uppercase; color:var(--hazard);
    margin-top:12px; overflow-wrap:break-word; word-break:break-word;
  }
  .pp-count{ font-family:'JetBrains Mono',monospace; font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:#CFD1D4; margin-top:10px; }
  .gh-wrap{ margin-top:30px; }
  .gh-title{ font-size:12px; letter-spacing:0.1em; text-transform:uppercase; color:var(--ice-dim); margin-bottom:12px; font-weight:600; }
  .gh{ display:flex; align-items:flex-start; gap:6px; flex-wrap:wrap; }
  .gh-item{ display:flex; flex-direction:column; align-items:center; gap:6px; min-width:64px; }
  .gh-date{ font-family:'JetBrains Mono',monospace; font-size:10.5px; color:var(--ice-dim); white-space:nowrap; }
  .gh-arrow{ color:var(--steel); font-size:22px; line-height:44px; padding:0 4px; }
  .grade-pill{
    font-family:'JetBrains Mono',monospace; font-weight:700; font-size:15px;
    padding:6px 14px; border:1px solid currentColor;
  }
  .grade-A{ color:var(--cyan); } .grade-B{ color:var(--ice); } .grade-C{ color:var(--hazard); }
  .report-block{ margin-top:44px; }
  .report-block + .report-block{ margin-top:60px; padding-top:44px; border-top:1px solid var(--steel); }
  .rb-top{ display:flex; justify-content:space-between; align-items:baseline; gap:12px; flex-wrap:wrap; }
  .rb-count{ font-size:11px; letter-spacing:0.12em; color:var(--hazard); }
  .rb-open{ font-family:'JetBrains Mono',monospace; font-size:11px; letter-spacing:0.06em; color:var(--ice-dim); }
  .rb-open:hover{ color:var(--hazard); }
  .report-head{ margin:18px 0 10px; display:flex; align-items:center; gap:16px; flex-wrap:wrap; }
  .rb-title{ font-size:20px; font-weight:700; line-height:1.25; overflow-wrap:break-word; word-break:break-word; }
  .byline{ font-family:'JetBrains Mono',monospace; font-size:12px; color:#CFD1D4; margin:10px 0 0; letter-spacing:0.06em; }
  .patreon-link{
    display:inline-flex; align-items:center; gap:10px;
    background:var(--panel); border:1px solid var(--hazard-2); color:var(--hazard);
    padding:12px 20px; margin:20px 0 0; font-family:'JetBrains Mono',monospace;
    font-size:13px; font-weight:700; letter-spacing:0.05em; text-transform:uppercase;
    transition:background .15s, border-color .15s;
  }
  .patreon-link:hover{ background:var(--panel-2); border-color:var(--hazard); }
  .panel{ background:var(--panel); border:1px solid var(--steel); padding:26px 24px; margin:24px 0 0; overflow-wrap:break-word; word-break:break-word; }
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
  .deco{ position:absolute; top:0; left:0; right:0; height:700px; overflow:hidden; pointer-events:none; z-index:0; }
  .crosshair{ position:absolute; top:40px; right:40px; width:100px; height:100px; opacity:0.7; z-index:2; pointer-events:none; }
  .crosshair circle{ transform-origin:center; }
  .crosshair svg{ width:100%; height:100%; }
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
  <div class="deco" aria-hidden="true">
    <div class="radar-sweep"></div>
    <div class="crosshair">
      <svg viewBox="0 0 120 120" fill="none" stroke="var(--cyan)" stroke-width="1.5">
        <circle cx="60" cy="60" r="50" opacity="0.5"/>
        <circle cx="60" cy="60" r="30" opacity="0.7"/>
        <line x1="60" y1="0" x2="60" y2="24" opacity="0.8"/>
        <line x1="60" y1="96" x2="60" y2="120" opacity="0.8"/>
        <line x1="0" y1="60" x2="24" y2="60" opacity="0.8"/>
        <line x1="96" y1="60" x2="120" y2="60" opacity="0.8"/>
      </svg>
    </div>
  </div>
  <div class="wrap">
    <a href="/scouting-reports.html" class="back-link">← BACK TO SCOUTING REPORTS</a>

    <h1 class="stencil">${escapeHtml(name)}</h1>
    ${metaLine ? `<div class="prospect-meta">${metaLine}</div>` : ""}
    <div class="pp-count">${n} scouting report${n === 1 ? "" : "s"}</div>
    ${n > 1 ? `<div class="gh-wrap"><h2 class="gh-title">Grade history · by date filed</h2><div class="gh">${history}</div></div>` : ""}

    ${blocks}
  </div>
</body>
</html>`;
}

module.exports = async (req, res) => {
  const slug = playerSlug(req.query && req.query.player);
  const send = (status, html, cache) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (cache) res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    res.end(html);
  };

  if (!slug) return send(400, renderNotFoundPage());

  try {
    const names = await fetchNames();
    const ids = names.filter(r => playerSlug(r.name) === slug).map(r => r.id);
    if (!ids.length) return send(404, renderNotFoundPage());
    const reports = await fetchReportsByIds(ids);
    if (!reports.length) return send(404, renderNotFoundPage());
    return send(200, renderPlayerPage(reports, slug), true);
  } catch (err) {
    console.error("player page error:", err);
    return send(500, renderNotFoundPage());
  }
};
