// Fetches PUBLISHED scouting reports from Supabase and renders them into a
// dossier-grid on the public site. If the fetch fails or returns nothing
// (e.g. before any reports have been published yet), the existing static
// sample cards already in the page are left alone — the site never shows
// a broken or empty section.

function pbGradeClass(letter) {
  if (letter && letter.startsWith('A')) return 'grade-A';
  if (letter && letter.startsWith('B')) return 'grade-B';
  return 'grade-C';
}

function pbEscape(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}


// Card layout: every card is the same size, long notes are clamped to a few
// lines, and a "Read more" button appears only when text was actually cut off.
// Injected from here (not copied into each page) so all pages stay consistent.
function pbInjectCardStyles() {
  if (document.getElementById('pb-card-styles')) return;
  const style = document.createElement('style');
  style.id = 'pb-card-styles';
  style.textContent = `
    .dossier-grid{ grid-auto-rows:1fr; align-items:stretch; }
    .dossier-grid > .pb-card-link{ display:flex; min-width:0; }
    .dossier-grid > .pb-card-link > .dossier{ width:100%; display:flex; flex-direction:column; }
    .dossier-grid .dossier-body{ display:flex; flex-direction:column; flex:1 1 auto; }
    .dossier-grid .pb-excerpt{
      display:-webkit-box; -webkit-box-orient:vertical;
      -webkit-line-clamp:5; line-clamp:5; overflow:hidden;
    }
    .dossier-grid .pb-card-foot{ margin-top:auto; }
    .pb-readmore{
      display:none; margin:0 0 14px;
      font-family:'JetBrains Mono',monospace; font-size:11px; font-weight:700;
      letter-spacing:0.08em; text-transform:uppercase; color:var(--hazard);
      border:1px solid var(--hazard-2); padding:7px 12px;
      transition:background .15s, color .15s;
    }
    .dossier:hover .pb-readmore, .pb-card-link:focus-visible .pb-readmore{ background:var(--hazard); color:var(--black); }
  `;
  document.head.appendChild(style);
}

// Show "Read more" only on cards whose notes are actually clamped.
function pbRefreshReadMore(root) {
  (root || document).querySelectorAll('.pb-excerpt').forEach(p => {
    const body = p.closest('.dossier-body');
    const more = body && body.querySelector('.pb-readmore');
    if (!more) return;
    more.style.display = (p.scrollHeight > p.clientHeight + 1) ? 'inline-block' : 'none';
  });
}

let pbReadMoreWired = false;
function pbWireReadMore(grid) {
  pbRefreshReadMore(grid);
  setTimeout(() => pbRefreshReadMore(grid), 600);               // after badges/fonts settle
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => pbRefreshReadMore(grid));
  if (!pbReadMoreWired) {
    pbReadMoreWired = true;
    let t;
    window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => pbRefreshReadMore(document), 150); });
  }
}

function pbBuildCard(report) {
  const letter = report.overall_grade || 'B';
  const gClass = pbGradeClass(letter);
  const scores = report.scores || {};
  const topTags = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);
  const excerpt = (report.notes || '').replace(/\s+/g, ' ').trim() || 'Full breakdown inside.';
  const byline = report.reporter_name
    ? `<div data-scout="${pbEscape(report.reporter_name)}" style="font-family:'JetBrains Mono',monospace; font-size:11px; color:#CFD1D4; margin-bottom:10px;">SCOUTED BY ${pbEscape(report.reporter_name.toUpperCase())}</div>`
    : '';
  const metaBits = [report.position, report.team, report.league].filter(Boolean).map(pbEscape).join(' · ');
  const hasCustomTitle = report.title && report.title.trim();
  const subtitleHtml = hasCustomTitle
    ? `<div style="font-size:13px; color:var(--ice-dim); font-style:italic; margin-bottom:10px; overflow-wrap:break-word; word-break:break-word;">${pbEscape(report.title)}</div>`
    : '';

  const altText = `${report.name || 'Prospect'}${report.position ? ' — ' + report.position : ''}${report.team ? ', ' + report.team : ''} scouting report thumbnail`;
  const thumbImg = report.thumbnail_url
    ? `<img src="${pbEscape(report.thumbnail_url)}" alt="${pbEscape(altText)}" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;">`
    : '';

  const reportUrl = report.slug ? `/report/${report.slug}` : `/api/report/${report.id}`;
  return `<a href="${reportUrl}" class="pb-card-link" style="text-decoration:none; color:inherit;">
  <article class="dossier hud" data-pos="${pbEscape(report.position || '')}" data-seen-live="${report.seen_live ? 'true' : 'false'}">
    <span class="hud-bl"></span><span class="hud-br"></span>
    <div class="dossier-thumb">
      ${thumbImg}
      <span class="grade-stamp ${gClass}">GRADE ${pbEscape(letter)}</span>
    </div>
    <div class="dossier-body" style="overflow-wrap:break-word; word-break:break-word;">
      <h3 style="overflow-wrap:break-word; word-break:break-word;">${pbEscape(report.name || 'Unnamed Prospect')}</h3>
      ${metaBits ? `<div class="prospect-meta" style="overflow-wrap:break-word; word-break:break-word;">${metaBits}</div>` : ''}
      ${subtitleHtml}
      ${byline}
      <p class="pb-excerpt" style="overflow-wrap:break-word; word-break:break-word;">${pbEscape(excerpt)}</p>
      <div class="pb-card-foot">
        <span class="pb-readmore">Read more →</span>
        <div class="tool-tags">${topTags.map(t => `<span>${pbEscape(t)}</span>`).join('')}</div>
      </div>
    </div>
  </article>
  </a>`;
}

async function pbLoadPublished(gridId, limit) {
  const grid = document.getElementById(gridId);
  if (!grid || typeof puckBunkerDB === 'undefined') return;

  try {
    let query = puckBunkerDB
      .from('puckbunker_reports')
      .select('*')
      .eq('status', 'published')
      .order('created_at', { ascending: false });
    if (limit) query = query.limit(limit);

    const { data, error } = await query;
    if (error || !data || !data.length) return; // keep static sample cards as-is

    pbInjectCardStyles();
    grid.innerHTML = data.map(pbBuildCard).join('');
    pbWireReadMore(grid);
  } catch (e) {
    console.error('Puck Bunker: failed to load published reports', e);
    // leave static fallback cards in place
  }
}
