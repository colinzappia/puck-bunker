// Vercel Serverless Function — the public page for one article, with real
// social preview tags (Open Graph / Twitter Card).
//
// Like the report pages (api/r/[slug].js), this is rendered on the SERVER:
// link-preview bots (Twitter, Discord, iMessage, Slack...) read the raw HTML
// and never run JavaScript, so the headline, summary and cover image have to
// be in the HTML before it's sent.
//
// URL: https://www.puckbunker.com/article/<slug>  (rewrite in vercel.json)
//
// The article body is stored in the admin editor's simple formatting and
// turned into HTML by article-format.js, the same code the editor's Preview
// uses, so what admins preview is what readers get.

const PBArticle = require("../../article-format.js");

const SUPABASE_URL = "https://bwexpvzstgkllkjaitzy.supabase.co";
const SUPABASE_KEY = "sb_publishable_AqjW7wYPhZ6OTpM1W-jVew_1L18nkZE";
const SITE_URL = "https://www.puckbunker.com";
const LOGO_URL = `${SITE_URL}/puck-bunker-logo.png`;

const escapeHtml = PBArticle.escapeHtml;

async function fetchArticle(slug) {
  const url = `${SUPABASE_URL}/rest/v1/puckbunker_articles?slug=eq.${encodeURIComponent(slug)}&status=eq.published&select=*`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows && rows.length ? rows[0] : null;
}

// Up to three other published articles, newest first, for the "More from the desk" list.
async function fetchMore(slug) {
  try {
    const url = `${SUPABASE_URL}/rest/v1/puckbunker_articles?status=eq.published&slug=neq.${encodeURIComponent(slug)}&select=slug,title,published_at,author_name&order=published_at.desc&limit=3`;
    const res = await fetch(url, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!res.ok) return [];
    return res.json();
  } catch (e) {
    return [];
  }
}

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Toronto" });
}

function renderNotFoundPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Article Not Found — Puck Bunker</title>
<meta name="robots" content="noindex">
<meta property="og:title" content="Article Not Found — Puck Bunker">
<meta property="og:description" content="This article doesn't exist or hasn't been published yet.">
<meta property="og:image" content="${LOGO_URL}">
<link href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Stencil+Display:wght@700;800;900&family=Archivo:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  body{ background:#0B0C0D; color:#F2F2EF; font-family:'Archivo',sans-serif; min-height:100vh; display:flex; align-items:center; justify-content:center; text-align:center; margin:0; padding:24px; }
  h1{ font-family:'Big Shoulders Stencil Display',sans-serif; text-transform:uppercase; font-size:48px; }
  a{ color:#CBAE7E; }
</style>
</head>
<body>
  <div>
    <h1>File Not Found</h1>
    <p>This article doesn't exist, or hasn't been published yet.</p>
    <p><a href="/articles.html">← Back to Articles</a></p>
  </div>
</body>
</html>`;
}

function renderArticlePage(article, more) {
  const title = article.title || "Untitled";
  const pageTitle = `${title} | Puck Bunker`;
  const description = article.dek || PBArticle.excerpt(article.body, 160) || "Long-form scouting from the Puck Bunker desk.";
  const ogImage = article.cover_url || LOGO_URL;
  const canonicalUrl = `${SITE_URL}/article/${article.slug}`;
  const published = article.published_at || article.created_at;
  const minutes = PBArticle.readingMinutes(article.body);
  const tags = (article.tags || []).filter(Boolean);

  const metaBits = [
    article.author_name ? `BY ${escapeHtml(article.author_name.toUpperCase())}` : "",
    published ? `<time datetime="${escapeHtml(published)}">${escapeHtml(formatDate(published).toUpperCase())}</time>` : "",
    `${minutes} MIN READ`,
  ].filter(Boolean).join(" · ");

  const moreHtml = more.length ? `
    <aside class="more">
      <h2>More from the desk</h2>
      <ul>
        ${more.map(m => `<li><a href="/article/${encodeURIComponent(m.slug)}">${escapeHtml(m.title)}</a><span>${escapeHtml([m.author_name, formatDate(m.published_at)].filter(Boolean).join(" · "))}</span></li>`).join("")}
      </ul>
    </aside>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(pageTitle)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${canonicalUrl}">

<meta property="og:type" content="article">
<meta property="og:site_name" content="Puck Bunker">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(ogImage)}">
<meta property="og:url" content="${canonicalUrl}">
${published ? `<meta property="article:published_time" content="${escapeHtml(published)}">` : ""}

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(ogImage)}">

<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": title,
  "description": description,
  "image": ogImage,
  "url": canonicalUrl,
  "datePublished": published || undefined,
  "dateModified": article.updated_at || published || undefined,
  "author": article.author_name
    ? { "@type": "Person", "name": article.author_name }
    : { "@type": "Organization", "name": "Puck Bunker" },
  "publisher": {
    "@type": "Organization",
    "name": "Puck Bunker",
    "logo": { "@type": "ImageObject", "url": LOGO_URL }
  },
  ...(tags.length ? { "keywords": tags.join(", ") } : {})
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
  a{ color:var(--hazard); text-decoration:none; }
  .wrap{ position:relative; z-index:1; max-width:760px; margin:0 auto; padding:48px 24px 80px; overflow-wrap:break-word; }
  .back-link{ font-family:'JetBrains Mono',monospace; font-size:12px; letter-spacing:0.06em; color:var(--ice-dim); }
  .back-link:hover{ color:var(--hazard); }
  .tags{ display:flex; flex-wrap:wrap; gap:8px; margin-top:34px; }
  .tags span{ font-family:'JetBrains Mono',monospace; font-size:10.5px; color:var(--hazard); border:1px solid var(--hazard-2); padding:3px 8px; letter-spacing:0.06em; text-transform:uppercase; }
  h1{ font-size:clamp(38px,7vw,64px); line-height:0.95; margin-top:18px; text-wrap:balance; }
  .dek{ font-size:clamp(18px,2.4vw,21px); line-height:1.5; color:#CFD1D4; margin-top:18px; max-width:62ch; }
  .byline{ font-family:'JetBrains Mono',monospace; font-size:12px; color:var(--ice-dim); letter-spacing:0.06em; margin-top:22px; padding-bottom:22px; border-bottom:1px solid var(--steel); }
  .cover{ margin-top:30px; border:1px solid var(--steel); aspect-ratio:16/9; overflow:hidden; background:var(--panel); }
  .cover img{ width:100%; height:100%; object-fit:cover; display:block; }

  .body{ margin-top:34px; font-size:18px; line-height:1.75; color:#DEDFDD; }
  .body > *{ margin-bottom:22px; }
  .body h2{ font-family:'Big Shoulders Stencil Display',sans-serif; text-transform:uppercase; font-size:clamp(28px,4vw,36px); line-height:1; color:var(--ice); margin-top:44px; margin-bottom:14px; }
  .body h3{ font-size:21px; font-weight:700; color:var(--ice); margin-top:32px; margin-bottom:10px; }
  .body a{ text-decoration:underline; text-underline-offset:3px; text-decoration-color:var(--hazard-2); }
  .body a:hover{ text-decoration-color:var(--hazard); }
  .body strong{ color:var(--ice); }
  .body ul, .body ol{ padding-left:24px; }
  .body li{ margin-bottom:8px; }
  .body li::marker{ color:var(--hazard); }
  .body blockquote{ border-left:3px solid var(--hazard); padding:6px 0 6px 22px; margin:34px 0; font-size:22px; line-height:1.5; font-style:italic; color:var(--ice); }
  .body hr{ border:0; height:1px; background:var(--steel); margin:40px 0; }
  .body figure{ margin:34px 0; }
  .body figure img{ max-width:100%; display:block; border:1px solid var(--steel); }
  .body figcaption{ font-family:'JetBrains Mono',monospace; font-size:11.5px; color:var(--ice-dim); margin-top:10px; letter-spacing:0.03em; }
  .body .embed{ position:relative; aspect-ratio:16/9; background:var(--panel); border:1px solid var(--steel); margin:34px 0; }
  .body .embed iframe{ position:absolute; inset:0; width:100%; height:100%; border:0; }

  .more{ margin-top:64px; border-top:1px solid var(--steel); padding-top:26px; }
  .more h2{ font-size:12px; letter-spacing:0.1em; text-transform:uppercase; color:var(--ice-dim); margin-bottom:16px; }
  .more ul{ list-style:none; display:grid; gap:2px; }
  .more li{ background:var(--panel); border:1px solid var(--steel); padding:16px 18px; display:grid; gap:4px; }
  .more li a{ color:var(--ice); font-weight:700; font-size:17px; line-height:1.3; }
  .more li a:hover{ color:var(--hazard); }
  .more li span{ font-family:'JetBrains Mono',monospace; font-size:11px; color:var(--ice-dim); }
  .end-link{ display:inline-block; margin-top:36px; }

  @media (max-width:600px){ .wrap{ padding:32px 18px 60px; } .body{ font-size:17px; } }
  .radar-sweep{ position:absolute; top:-220px; right:-220px; width:640px; height:640px; border-radius:50%; pointer-events:none; opacity:0.4; z-index:0; }
  .radar-sweep::before{ content:""; position:absolute; inset:0; border-radius:50%; background:conic-gradient(from 0deg, rgba(220,221,221,0.35), transparent 28%, transparent 100%); animation:radar-sweep-spin 6s linear infinite; }
  .radar-sweep::after{ content:""; position:absolute; inset:0; border-radius:50%; background-image:repeating-radial-gradient(circle, transparent 0, transparent 79px, rgba(220,221,221,0.14) 80px); border:1px solid rgba(220,221,221,0.18); }
  @keyframes radar-sweep-spin{ to{ transform:rotate(360deg); } }
  @media (prefers-reduced-motion:reduce){ .radar-sweep::before{ animation:none; } }
  @media (max-width:900px){ .radar-sweep{ display:none; } }
</style>
<script src="/traffic.js"></script>
<script src="/badges.js" defer></script>
</head>
<body>
  <div class="radar-sweep" aria-hidden="true"></div>
  <article class="wrap">
    <a href="/articles.html" class="back-link">← BACK TO ARTICLES</a>

    ${tags.length ? `<div class="tags">${tags.map(t => `<span>${escapeHtml(t)}</span>`).join("")}</div>` : ""}
    <h1 class="stencil"${tags.length ? "" : ' style="margin-top:34px;"'}>${escapeHtml(title)}</h1>
    ${article.dek ? `<p class="dek">${escapeHtml(article.dek)}</p>` : ""}
    <div class="byline">${metaBits}</div>

    ${article.cover_url ? `<div class="cover"><img src="${escapeHtml(article.cover_url)}" alt=""></div>` : ""}

    <div class="body">
      ${PBArticle.render(article.body)}
    </div>

    ${moreHtml}
    <a href="/articles.html" class="back-link end-link">← ALL ARTICLES</a>
  </article>
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
    const [article, more] = await Promise.all([fetchArticle(slug), fetchMore(slug)]);
    if (!article) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(renderNotFoundPage());
      return;
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    res.end(renderArticlePage(article, more));
  } catch (err) {
    console.error("article page error:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(renderNotFoundPage());
  }
};
