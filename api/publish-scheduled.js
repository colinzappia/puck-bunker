// Vercel Serverless Function — checks for scheduled reports and articles whose
// release time has passed, and flips them from "scheduled" to "published".
//
// This is what actually makes scheduled publishing work: something has to
// periodically check the clock. Two ways to trigger this endpoint:
//
//  1. Vercel's own free Cron (see vercel.json) — runs once a day, timing
//     accurate only within that hour. Zero extra setup, works out of the box.
//  2. A free external scheduler (e.g. cron-job.org) pointed at this URL —
//     gives real minute-level precision, needs a 5-minute signup elsewhere.
//     See the CRON_TRIGGER_SECRET check below for how to protect it.
//
// SECURITY: this endpoint writes to the database using Supabase's SERVICE
// ROLE key, which bypasses Row Level Security entirely — that's necessary
// here because there's no logged-in admin session when a cron job fires,
// but it also means this endpoint must be protected. Vercel's own Cron
// automatically sends an Authorization: Bearer ${CRON_SECRET} header that
// this checks first. If you're using an external scheduler instead, set
// your own CRON_TRIGGER_SECRET env var and have that scheduler call:
//   https://www.puckbunker.com/api/publish-scheduled?secret=<that value>
//
// URL: https://www.puckbunker.com/api/publish-scheduled

const SUPABASE_URL = "https://bwexpvzstgkllkjaitzy.supabase.co";

module.exports = async (req, res) => {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured on the server." }));
    return;
  }

  // Accept either Vercel's own auto-injected cron auth, or a manually
  // configured secret for an external scheduler.
  const vercelCronSecret = process.env.CRON_SECRET;
  const customSecret = process.env.CRON_TRIGGER_SECRET;
  const authHeader = req.headers && req.headers.authorization;
  const suppliedSecret = (req.query && req.query.secret) || "";

  const isVercelCron = vercelCronSecret && authHeader === `Bearer ${vercelCronSecret}`;
  const isExternalTrigger = customSecret && suppliedSecret === customSecret;

  if (!isVercelCron && !isExternalTrigger) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Unauthorized." }));
    return;
  }

  try {
    const nowIso = new Date().toISOString();
    const headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };

    // Find rows in a table whose release time has passed, and flip them to
    // published. Returns the rows that were published.
    async function publishDue(table, select, extraFields) {
      const findUrl = `${SUPABASE_URL}/rest/v1/${table}?status=eq.scheduled&scheduled_at=lte.${encodeURIComponent(nowIso)}&select=${select}`;
      const findRes = await fetch(findUrl, { headers });
      if (!findRes.ok) {
        const body = await findRes.text();
        throw new Error(`${table} lookup failed (${findRes.status}): ${body}`);
      }
      const due = await findRes.json();
      if (!due.length) return [];

      const ids = due.map(r => r.id);
      const updateUrl = `${SUPABASE_URL}/rest/v1/${table}?id=in.(${ids.join(",")})`;
      const updateRes = await fetch(updateUrl, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status: "published", ...extraFields }),
      });
      if (!updateRes.ok) {
        const body = await updateRes.text();
        throw new Error(`${table} update failed (${updateRes.status}): ${body}`);
      }
      return updateRes.json();
    }

    const reports = await publishDue("puckbunker_reports", "id,name,scheduled_at", {});

    // Articles are checked separately, so a problem with them (for example the
    // articles table not being set up yet) never stops reports from publishing.
    let articles = [];
    let articleError = null;
    try {
      articles = await publishDue("puckbunker_articles", "id,title,scheduled_at", { published_at: nowIso });
    } catch (e) {
      articleError = String(e && e.message || e);
      console.error("publish-scheduled articles error:", e);
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      published: reports.length + articles.length,
      reports: reports.map(r => ({ id: r.id, name: r.name })),
      articles: articles.map(a => ({ id: a.id, title: a.title })),
      ...(articleError ? { articleError } : {}),
      ...(reports.length + articles.length ? {} : { message: "Nothing due right now." }),
    }));
  } catch (err) {
    console.error("publish-scheduled error:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Failed to publish scheduled reports.", detail: String(err && err.message || err) }));
  }
};
