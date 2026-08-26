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

function pbYoutubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(url.trim())) return url.trim();
  return null;
}

function pbBuildCard(report) {
  const letter = report.overall_grade || 'B';
  const gClass = pbGradeClass(letter);
  const ytId = pbYoutubeId(report.video_url);
  const thumbInner = ytId
    ? `<img src="https://img.youtube.com/vi/${ytId}/hqdefault.jpg" alt="" style="width:100%;height:100%;object-fit:cover;">`
    : '';
  const scores = report.scores || {};
  const topTags = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);
  const firstLine = (report.notes || '').split('\n').filter(Boolean)[0] || 'Full breakdown inside.';
  const title = report.title || `${report.name || 'Prospect'}: Scouting Report`;
  const byline = report.reporter_name
    ? `<div style="font-family:'JetBrains Mono',monospace; font-size:10.5px; color:var(--steel); margin-bottom:10px;">SCOUTED BY ${pbEscape(report.reporter_name.toUpperCase())}</div>`
    : '';
  const metaBits = [report.position, report.team].filter(Boolean).map(pbEscape).join(' · ');
  const metaLine = metaBits
    ? `<div style="font-family:'JetBrains Mono',monospace; font-size:11px; color:var(--ice-dim); margin-bottom:8px;">${metaBits}</div>`
    : '';

  return `<a href="/api/report/${report.id}" style="text-decoration:none; color:inherit; display:block;">
  <article class="dossier hud" data-pos="${pbEscape(report.position || '')}">
    <span class="hud-bl"></span><span class="hud-br"></span>
    <div class="dossier-thumb">${thumbInner}
      <span class="file-tag">FILE #${pbEscape(report.file_num || '----')}</span>
      <span class="grade-stamp ${gClass}">GRADE ${pbEscape(letter)}</span>
      <div class="play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
    </div>
    <div class="dossier-body">
      <h3>${pbEscape(title)}</h3>
      ${metaLine}
      ${byline}
      <p>${pbEscape(firstLine)}</p>
      <div class="tool-tags">${topTags.map(t => `<span>${pbEscape(t)}</span>`).join('')}</div>
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

    grid.innerHTML = data.map(pbBuildCard).join('');
  } catch (e) {
    console.error('Puck Bunker: failed to load published reports', e);
    // leave static fallback cards in place
  }
}
