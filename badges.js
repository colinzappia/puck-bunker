// =====================================================================
//  PUCK BUNKER — MILITARY BADGES ADD-ON
// ---------------------------------------------------------------------
//  ON/OFF SWITCH: change true to false on the line below to turn every
//  badge off across the whole site (chevrons, dog tags, stamps, crests).
//  The site goes straight back to its original look. Change it back to
//  true to turn them on again. Nothing else needs to be edited.
// =====================================================================
const PB_BADGES_ON = true;


(function () {
  if (!PB_BADGES_ON) return;

  const SUPABASE_URL = "https://bwexpvzstgkllkjaitzy.supabase.co";
  const SUPABASE_KEY = "sb_publishable_AqjW7wYPhZ6OTpM1W-jVew_1L18nkZE";
  const GOLD = "#CBAE7E";

  // ---------- Styles ----------
  const css = `
  .pb-chev{ display:inline-block; line-height:0; }
  .pb-chev svg{ display:block; }
  .pb-name-row{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
  .pb-name-row h3{ flex:1; min-width:0; }
  .pb-name-col{ flex:1; min-width:0; }
  .pb-name-row .pb-chev{ flex-shrink:0; margin-top:-4px; transform:rotate(4deg); }
  .board-row .pb-chev{ transform:rotate(4deg); }
  .grade-stamp.pb-done{ border:0 !important; padding:0 !important; background:none !important; top:8px; right:8px; }
  .grade-pill.pb-done{ border:0 !important; padding:0 !important; background:none !important; }
  .pb-tag-sm{ display:inline-flex; align-items:center; gap:8px; background:#28292C; border:1px solid #8B8D90; border-radius:10px; padding:4px 10px 4px 6px; margin-bottom:10px; }
  .pb-tag-sm .pb-t1{ font-family:'JetBrains Mono',monospace; font-size:10px; color:${GOLD}; letter-spacing:0.08em; }
  .pb-tag-sm .pb-t2{ font-family:'Big Shoulders Stencil Display',sans-serif; font-weight:800; font-size:14px; color:#F2F2EF; letter-spacing:0.03em; }
  .pb-tag-lg{ display:flex; align-items:center; gap:14px; margin:14px 0 6px; }
  .pb-tag-lg .pb-tl{ font-family:'JetBrains Mono',monospace; font-size:10px; color:#CFD1D4; letter-spacing:0.15em; }
  .pb-stamp{ display:inline-block; line-height:0; pointer-events:none; }
  .dossier-thumb .pb-stamp{ position:absolute; left:6px; bottom:8px; z-index:2; }
  .report-head .pb-stamp{ margin-left:6px; }
  .eyebrow.pb-crested::before{ display:none !important; }
  .pb-crest{ display:inline-block; line-height:0; flex-shrink:0; }
  .pb-footer-div{ display:inline-flex; align-items:center; gap:8px; margin-left:14px; font-family:'JetBrains Mono',monospace; font-size:10px; letter-spacing:0.15em; color:#9A9C9F; }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  // ---------- Graphics ----------
  function esc(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function chevron(grade, size) {
    const g = (grade || "").toUpperCase();
    const stripes = g[0] === "A" ? 3 : g[0] === "B" ? 2 : 1;
    let paths = "";
    for (let i = 0; i < stripes; i++) {
      const y = 9 + i * 11;
      paths += `<path d="M10 ${y + 8} L30 ${y} L50 ${y + 8} L50 ${y + 14} L30 ${y + 6} L10 ${y + 14} Z" fill="${GOLD}"/>`;
    }
    const w = size, h = Math.round(size * 68 / 60);
    return `<span class="pb-chev" role="img" aria-label="Grade ${esc(g)}"><svg viewBox="0 0 60 68" width="${w}" height="${h}">
      <rect x="2" y="2" width="56" height="64" rx="6" fill="#111213" stroke="#96805F" stroke-width="1.5"/>
      ${paths}
      <text x="30" y="63" text-anchor="middle" font-family="'Big Shoulders Stencil Display',sans-serif" font-weight="800" font-size="16" fill="#F2F2EF">${esc(g)}</text>
    </svg></span>`;
  }

  function splitName(name) {
    const parts = String(name || "").trim().split(/\s+/);
    if (parts.length < 2) return [parts[0] || "", ""];
    return [parts[0], parts.slice(1).join(" ")];
  }

  function tagSmall(name) {
    const [, last] = splitName(name);
    return `<div class="pb-tag-sm" role="img" aria-label="Scouted by ${esc(name)}">
      <svg width="14" height="18" viewBox="0 0 14 18" aria-hidden="true"><rect x="1" y="1" width="12" height="16" rx="4" fill="none" stroke="#DCDDDD"/><circle cx="7" cy="4.5" r="1.3" fill="none" stroke="#DCDDDD"/></svg>
      <span class="pb-t1">SCOUT</span><span class="pb-t2">${esc((last || name).toUpperCase())}</span>
    </div>`;
  }

  function tagLarge(name, filed) {
    const [first, last] = splitName(name);
    const filedLine = filed ? `<text x="36" y="84" text-anchor="middle" font-family="'JetBrains Mono',monospace" font-size="7.5" fill="#CFD1D4">${filed} FILED</text>` : "";
    return `<div class="pb-tag-lg">
      <svg viewBox="0 0 90 110" width="90" height="110" role="img" aria-label="Filed by ${esc(name)}">
        <path d="M18 2 Q40 14 34 26" fill="none" stroke="#8B8D90" stroke-dasharray="2 2"/>
        <g transform="rotate(9 58 64)"><rect x="34" y="22" width="48" height="74" rx="14" fill="#28292C" stroke="#8B8D90"/></g>
        <rect x="12" y="22" width="48" height="74" rx="14" fill="#1D1F21" stroke="#DCDDDD" stroke-width="1.5"/>
        <circle cx="36" cy="31" r="3" fill="none" stroke="#DCDDDD"/>
        <text x="36" y="48" text-anchor="middle" font-family="'JetBrains Mono',monospace" font-size="7" fill="${GOLD}">SCOUT</text>
        <text x="36" y="60" text-anchor="middle" font-family="'Big Shoulders Stencil Display',sans-serif" font-weight="800" font-size="10" fill="#F2F2EF">${esc(first.toUpperCase())}</text>
        <text x="36" y="71" text-anchor="middle" font-family="'Big Shoulders Stencil Display',sans-serif" font-weight="800" font-size="10" fill="#F2F2EF">${esc(last.toUpperCase())}</text>
        ${filedLine}
      </svg>
      <div class="pb-tl">FILED BY<br><span style="color:#F2F2EF;">${esc(name.toUpperCase())}</span></div>
    </div>`;
  }

  function stamp(text) {
    return `<span class="pb-stamp" role="img" aria-label="${esc(text)}"><svg viewBox="0 0 96 40" width="96" height="40">
      <g transform="rotate(-8 48 20)">
        <rect x="4" y="8" width="88" height="24" fill="rgba(14,15,16,0.75)" stroke="#C1684A" stroke-width="2.5"/>
        <rect x="8" y="12" width="80" height="16" fill="none" stroke="#C1684A" stroke-width="0.8"/>
        <text x="48" y="25" text-anchor="middle" font-family="'Big Shoulders Stencil Display',sans-serif" font-weight="800" font-size="13" fill="#C1684A" letter-spacing="2">${esc(text)}</text>
      </g></svg></span>`;
  }

  function crest(size) {
    const h = Math.round(size * 68 / 60);
    return `<span class="pb-crest" aria-hidden="true"><svg viewBox="0 0 60 68" width="${size}" height="${h}">
      <path d="M30 3 L54 10 L54 34 C54 50 43 60 30 65 C17 60 6 50 6 34 L6 10 Z" fill="#1D1F21" stroke="${GOLD}" stroke-width="2.5"/>
      <circle cx="30" cy="31" r="10" fill="none" stroke="#DCDDDD" stroke-width="1.6"/>
      <line x1="30" y1="15" x2="30" y2="23" stroke="#DCDDDD" stroke-width="1.6"/><line x1="30" y1="39" x2="30" y2="47" stroke="#DCDDDD" stroke-width="1.6"/>
      <line x1="14" y1="31" x2="22" y2="31" stroke="#DCDDDD" stroke-width="1.6"/><line x1="38" y1="31" x2="46" y2="31" stroke="#DCDDDD" stroke-width="1.6"/>
    </svg></span>`;
  }

  function gradeFrom(el) {
    const m = (el.textContent || "").toUpperCase().match(/[A-F][+-]?/g);
    return m ? m[m.length - 1] : "";
  }

  // ---------- Reports-filed count (for the big dog tags) ----------
  let filedCounts = null;
  async function getFiledCounts() {
    if (filedCounts) return filedCounts;
    filedCounts = (async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/puckbunker_reports?status=eq.published&select=reporter_name`, {
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        });
        if (!res.ok) return {};
        const rows = await res.json();
        const counts = {};
        rows.forEach(r => { if (r.reporter_name) counts[r.reporter_name] = (counts[r.reporter_name] || 0) + 1; });
        return counts;
      } catch (e) { return {}; }
    })();
    return filedCounts;
  }

  // ---------- Apply badges ----------
  function apply(root) {
    // Chevrons on report cards: shown to the right of the player's name
    root.querySelectorAll(".grade-stamp:not(.pb-done)").forEach(el => {
      const g = gradeFrom(el);
      if (!g) return;
      el.classList.add("pb-done");
      const card = el.closest(".dossier");
      const title = card && card.querySelector(".dossier-body h3");
      if (title) {
        el.style.display = "none";
        // The position/team line goes in the same column as the name, so it can
        // only be as wide as that column and wraps before it reaches the badge.
        const next = title.nextElementSibling;
        const meta = next && next.classList.contains("prospect-meta") ? next : null;
        const row = document.createElement("div");
        row.className = "pb-name-row";
        const col = document.createElement("div");
        col.className = "pb-name-col";
        title.parentNode.insertBefore(row, title);
        col.appendChild(title);
        if (meta) col.appendChild(meta);
        row.appendChild(col);
        row.insertAdjacentHTML("beforeend", chevron(g, 56));
      } else {
        el.innerHTML = chevron(g, 56);
      }
    });

    // Chevrons on the rankings board and the individual report page
    root.querySelectorAll(".grade-pill:not(.pb-done)").forEach(el => {
      const g = gradeFrom(el);
      if (!g) return;
      el.classList.add("pb-done");
      const onReportPage = !!el.closest(".report-head");
      el.innerHTML = chevron(g, onReportPage ? 62 : 44);
    });

    // Dog tags
    root.querySelectorAll("[data-scout]:not(.pb-done)").forEach(el => {
      const name = el.getAttribute("data-scout");
      if (!name) return;
      el.classList.add("pb-done");
      if (el.closest(".dossier")) {
        el.outerHTML = tagSmall(name);
      } else {
        el.innerHTML = tagLarge(name, "");
        el.style.cssText += ";font-size:inherit;color:inherit;";
        getFiledCounts().then(c => { if (c[name]) el.innerHTML = tagLarge(name, c[name]); });
      }
    });

    // "Seen live" ink stamps
    root.querySelectorAll('[data-seen-live="true"]:not(.pb-stamped)').forEach(el => {
      el.classList.add("pb-stamped");
      const target = el.querySelector(".dossier-thumb") || el;
      target.insertAdjacentHTML("beforeend", stamp("SEEN LIVE"));
    });

    // Division crest on page titles and home section headers
    root.querySelectorAll(".page-header .eyebrow:not(.pb-crested), .sec-head .eyebrow:not(.pb-crested)").forEach(el => {
      el.classList.add("pb-crested");
      el.insertAdjacentHTML("afterbegin", crest(22));
    });

    // Division crest in the footer
    root.querySelectorAll("footer .footer-row .brand:not(.pb-crested)").forEach(el => {
      el.classList.add("pb-crested");
      el.insertAdjacentHTML("beforeend", `<span class="pb-footer-div">${crest(20)}</span>`);
    });
  }

  function start() {
    apply(document);
    // Reports and the rankings board load in after the page opens, so keep watching for them
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; apply(document); });
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
