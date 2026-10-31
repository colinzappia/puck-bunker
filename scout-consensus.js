// Combines every published report on one player into the "Bunker Consensus":
// an overall grade, each scout's own average, and a per-category comparison.
//
// Used by the player page (api/p/[player].js) for the full Scout vs. Scout
// section, and by the report page (api/r/[slug].js) for the consensus badge,
// so both always show the same numbers.
//
// RULES
//   • Every report counts once. The consensus is the plain average of all of
//     the player's reports, so a scout who files more reports on a player
//     counts for more.
//   • A report's score is the average of its category scores (the same number
//     the admin page saves as overall_score), and grades use the same letter
//     scale as the admin page.
//   • Two scouts "split" on a category when their averages are SPLIT_GAP
//     points or more apart.

const SPLIT_GAP = 1.5;

// Scouts in the order they're listed, each with a fixed color on the page.
// Anyone else who files a report still shows up, in the extra colors.
const SCOUTS = ["Rocco Zappia", "Darren Boyce"];
const SCOUT_COLORS = ["#CBAE7E", "#7FB3C8", "#B48FD0", "#8FC79A"];

function letterGrade(avg) {
  if (avg >= 9.0) return "A+";
  if (avg >= 8.5) return "A";
  if (avg >= 8.0) return "A-";
  if (avg >= 7.7) return "B+";
  if (avg >= 7.3) return "B";
  if (avg >= 7.0) return "B-";
  if (avg >= 6.7) return "C+";
  if (avg >= 6.3) return "C";
  if (avg >= 6.0) return "C-";
  if (avg >= 5.7) return "D+";
  if (avg >= 5.3) return "D";
  return "D-";
}

const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const round1 = x => Math.round(x * 10) / 10;

function scoreValues(report) {
  return Object.values(report.scores || {}).filter(v => typeof v === "number");
}

// A report's own average; falls back to the saved overall_score.
function reportAverage(report) {
  const vals = scoreValues(report);
  if (vals.length) return mean(vals);
  return typeof report.overall_score === "number" ? report.overall_score : null;
}

// reports: published reports on ONE player, newest first (as the pages fetch them).
function buildConsensus(reports) {
  const scored = reports.filter(r => reportAverage(r) !== null);
  if (!scored.length) return null;

  const overall = mean(scored.map(reportAverage));

  // Scouts, known ones first in the fixed order, then anyone else by name.
  const names = [...new Set(scored.map(r => (r.reporter_name || "").trim() || "Unknown scout"))];
  names.sort((a, b) => {
    const ia = SCOUTS.indexOf(a), ib = SCOUTS.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b);
  });
  const scoutOf = r => (r.reporter_name || "").trim() || "Unknown scout";
  // Rocco and Darren always get the same color; anyone else takes the next spare one.
  let spare = SCOUTS.length;
  const scouts = names.map(name => {
    const mine = scored.filter(r => scoutOf(r) === name);
    const avg = mean(mine.map(reportAverage));
    const slot = SCOUTS.indexOf(name) !== -1 ? SCOUTS.indexOf(name) : spare++;
    return { name, color: SCOUT_COLORS[slot % SCOUT_COLORS.length], reports: mine.length, avg: round1(avg), grade: letterGrade(avg) };
  });

  // Categories come from the newest report (skater and goalie reports use
  // different sets); older reports count for any category they also scored.
  const categories = Object.keys(scored[0].scores || {});
  const rows = categories.map((cat, i) => {
    const each = scored
      .filter(r => typeof (r.scores || {})[cat] === "number")
      .map(r => ({ scout: scoutOf(r), date: r.created_at, value: r.scores[cat] }));
    if (!each.length) return null;
    const byScout = scouts.map(s => {
      const vals = each.filter(e => e.scout === s.name).map(e => e.value);
      return vals.length ? round1(mean(vals)) : null;
    });
    const present = byScout.filter(v => v !== null);
    const gap = present.length > 1 ? round1(Math.max(...present) - Math.min(...present)) : 0;
    return { category: cat, order: i, avg: round1(mean(each.map(e => e.value))), byScout, gap, split: gap >= SPLIT_GAP, each };
  }).filter(Boolean);

  const compared = rows.filter(r => r.byScout.filter(v => v !== null).length > 1);
  return {
    reports: scored.length,
    overall: round1(overall),
    grade: letterGrade(overall),
    scouts,
    rows,
    compared: compared.length,
    agree: compared.filter(r => r.gap < 1).length,
    splits: compared.filter(r => r.split),
  };
}

module.exports = { buildConsensus, letterGrade, reportAverage, SPLIT_GAP, SCOUTS };
