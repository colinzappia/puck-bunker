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
    .dossier-grid .pb-excerpt{ margin-bottom:10px; }
    .dossier-grid .pb-card-foot{ margin-top:auto; }
    .pb-readmore{
      display:none; margin:0 0 14px;
      font-family:'JetBrains Mono',monospace; font-size:11px; font-weight:700;
      letter-spacing:0.08em; text-transform:uppercase; color:var(--hazard);
      border:1px solid var(--hazard-2); padding:7px 12px;
      transition:background .15s, color .15s;
    }
    .dossier:hover .pb-readmore, .pb-card-link:focus-visible .pb-readmore{ background:var(--hazard); color:var(--black); }
    .tool-tags .pb-multi{ cursor:pointer; color:var(--hazard); border-color:var(--hazard-2); font-weight:700; }
    .dossier:hover .tool-tags .pb-multi{ color:var(--hazard); border-color:var(--hazard); }
    .dossier:hover .tool-tags .pb-multi:hover{ background:var(--hazard); color:var(--black); }
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

// Cards in the same row can have headers of different heights (a long team name
// wraps onto a second line, some cards have no game line). Walk down the card
// section by section (game line, dog tag, text) and nudge shorter cards down so
// each section starts at the same height across the whole row. That keeps the
// game lines, dog tags, text and Read more buttons symmetrical.
function pbCardSections(card) {
  const body = card.querySelector('.dossier-body');
  if (!body) return [];
  return [
    body.querySelector('.pb-subtitle'),
    body.querySelector('.pb-tag-card') || body.querySelector('[data-scout]'),
    body.querySelector('.pb-excerpt'),
  ];
}

function pbAlignCards(root) {
  // Cards whose link is marked data-noalign (the home page's lead and side cards, which have a different
  // shape from their neighbours) are left alone.
  const cards = [...(root || document).querySelectorAll('.pb-card-link:not([data-noalign]) .dossier')];
  cards.forEach(c => pbCardSections(c).forEach(el => { if (el) el.style.marginTop = ''; }));
  const rows = new Map();
  cards.forEach(c => {
    if (!c.offsetParent) return;                       // hidden by a filter
    const key = Math.round(c.getBoundingClientRect().top + window.scrollY);
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(c);
  });
  rows.forEach(group => {
    if (group.length < 2) return;
    const sections = group.map(pbCardSections);
    for (let s = 0; s < 3; s++) {
      // measure after the previous section was nudged, since that moves everything below it
      const tops = group.map((c, i) => {
        const el = sections[i][s];
        return el ? el.getBoundingClientRect().top - c.getBoundingClientRect().top : null;
      });
      const present = tops.filter(t => t !== null);
      if (present.length < 2) continue;
      const max = Math.max(...present);
      group.forEach((c, i) => {
        const el = sections[i][s];
        if (el && tops[i] < max) el.style.marginTop = (max - tops[i]) + 'px';
      });
    }
  });
}

function pbLayoutCards(root) {
  pbAlignCards(root);
  pbRefreshReadMore(root);
}

let pbReadMoreWired = false;
function pbWireReadMore(grid) {
  pbLayoutCards(grid);
  setTimeout(() => pbLayoutCards(grid), 600);                   // after badges/fonts settle
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => pbLayoutCards(grid));
  // The badge script rearranges card headers right after cards appear; re-align when it does.
  let mt;
  new MutationObserver(() => { clearTimeout(mt); mt = setTimeout(() => pbLayoutCards(grid), 80); })
    .observe(grid, { childList: true, subtree: true });
  if (!pbReadMoreWired) {
    pbReadMoreWired = true;
    let t;
    window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => pbLayoutCards(document), 150); });
    // Filter buttons hide/show cards, which changes the rows.
    document.addEventListener('click', e => {
      if (e.target.closest && e.target.closest('.filter-chip')) setTimeout(() => pbLayoutCards(document), 80);
    });
  }
}


// Same rule the server uses to decide two reports are the same player:
// ignore capitals, accents and punctuation ("Landon DuPont" = "landon dupont").
function pbPlayerSlug(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// How many published reports exist per player (all of them, not just the ones on this page).
let pbCountsPromise = null;
function pbPlayerCounts() {
  if (!pbCountsPromise) {
    pbCountsPromise = (async () => {
      try {
        const { data } = await puckBunkerDB.from('puckbunker_reports').select('name').eq('status', 'published');
        const map = {};
        (data || []).forEach(r => { const k = pbPlayerSlug(r.name); if (k) map[k] = (map[k] || 0) + 1; });
        return map;
      } catch (e) { return {}; }
    })();
  }
  return pbCountsPromise;
}
let PB_COUNTS = {};

// The "N reports" chip sits inside the card's link, so it can't be a link itself;
// catch its click and send the visitor to the player page instead.
const pbMultiWired = new WeakSet();
function pbWireMultiLinks(grid) {
  if (pbMultiWired.has(grid)) return;
  pbMultiWired.add(grid);
  grid.addEventListener('click', e => {
    const chip = e.target.closest && e.target.closest('.pb-multi');
    if (!chip) return;
    e.preventDefault();
    e.stopPropagation();
    window.location.href = chip.dataset.href;
  });
}

// Fill the "player" dropdown on the Scouting Reports page, A to Z by last name.
function pbPopulatePlayerSelect(reports) {
  const sel = document.getElementById('playerSelect');
  if (!sel) return;
  const players = new Map();
  reports.forEach(r => {
    const key = pbPlayerSlug(r.name);
    if (!key) return;
    if (!players.has(key)) players.set(key, { key, name: r.name, count: 0 });   // newest report's spelling wins
    players.get(key).count += 1;
  });
  const split = name => {
    const t = String(name).trim().split(/\s+/);
    return t.length < 2 ? { first: '', last: t[0] || '' } : { first: t[0], last: t.slice(1).join(' ') };
  };
  const list = [...players.values()].map(p => ({ ...p, ...split(p.name) })).sort((a, b) =>
    a.last.localeCompare(b.last, undefined, { sensitivity: 'base' }) ||
    a.first.localeCompare(b.first, undefined, { sensitivity: 'base' }));
  const previous = sel.value;
  sel.innerHTML = '<option value="">All players</option>' + list.map(p => {
    const label = (p.first ? `${p.last}, ${p.first}` : p.last) + (p.count > 1 ? ` (${p.count})` : '');
    return `<option value="${pbEscape(p.key)}" data-count="${p.count}" data-name="${pbEscape(p.name)}">${pbEscape(label)}</option>`;
  }).join('');
  if (previous && players.has(previous)) sel.value = previous;
  sel.disabled = false;
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
    ? `<div class="pb-subtitle" style="font-size:13px; color:var(--ice-dim); font-style:italic; margin-bottom:10px; overflow-wrap:break-word; word-break:break-word;">${pbEscape(report.title)}</div>`
    : '';

  const altText = `${report.name || 'Prospect'}${report.position ? ' — ' + report.position : ''}${report.team ? ', ' + report.team : ''} scouting report thumbnail`;
  const thumbImg = report.thumbnail_url
    ? `<img src="${pbEscape(report.thumbnail_url)}" alt="${pbEscape(altText)}" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;">`
    : '';

  const pslug = pbPlayerSlug(report.name);
  const pcount = PB_COUNTS[pslug] || 0;
  const multi = pcount > 1
    ? `<span class="pb-multi" data-href="/player/${pslug}" title="See all ${pcount} reports on ${pbEscape(report.name)}">${pcount} REPORTS ›</span>`
    : '';
  const reportUrl = report.slug ? `/report/${report.slug}` : `/api/report/${report.id}`;
  return `<a href="${reportUrl}" class="pb-card-link" style="text-decoration:none; color:inherit;">
  <article class="dossier hud" data-pos="${pbEscape(report.position || '')}" data-player="${pslug}" data-seen-live="${report.seen_live ? 'true' : 'false'}">
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
      <div class="pb-more-row"><span class="pb-readmore">Read more →</span></div>
      <div class="pb-card-foot">
        <div class="tool-tags">${multi}${topTags.map(t => `<span>${pbEscape(t)}</span>`).join('')}</div>
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

    PB_COUNTS = await pbPlayerCounts();
    pbInjectCardStyles();
    grid.innerHTML = data.map(pbBuildCard).join('');
    pbWireMultiLinks(grid);
    pbWireReadMore(grid);
    pbPopulatePlayerSelect(data);
  } catch (e) {
    console.error('Puck Bunker: failed to load published reports', e);
    // leave static fallback cards in place
  }
}
