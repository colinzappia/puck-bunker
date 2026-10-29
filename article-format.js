// Turns an article body, written in the admin editor's simple formatting
// (a small, safe subset of Markdown), into HTML.
//
// Used in three places, so an article looks the same everywhere:
//   • admin.html — the editor's live Preview
//   • api/a/[slug].js — the public article page (rendered on the server)
//   • articles.html — summaries and reading times on the article cards
//
// SAFETY: everything the writer types is HTML-escaped FIRST, and only the
// formatting below is turned back into tags. Links and images must be
// http(s) or site-relative, so a pasted "javascript:" link does nothing.
//
// Formatting supported:
//   ## Heading            ### Smaller heading
//   **bold**  *italic*    [link text](https://...)
//   > quote               - bullet / 1. numbered list
//   ---  (divider)
//   ![caption](https://image-url)       an image on its own line
//   https://youtu.be/...                a YouTube link on its own line becomes a video
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PBArticle = factory();
})(typeof self !== "undefined" ? self : this, function () {
  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Only web links and site-relative paths; anything else is dropped.
  function safeUrl(url) {
    const u = String(url || "").trim();
    if (/^https?:\/\//i.test(u) || /^\/(?!\/)/.test(u)) return u;
    return "";
  }

  function youtubeId(url) {
    const m = String(url || "").trim().match(
      /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#][^\s]*)?$/
    );
    return m ? m[1] : "";
  }

  // Inline formatting on ALREADY-ESCAPED text.
  function inline(text) {
    const saved = [];
    const hold = html => "\u0000" + (saved.push(html) - 1) + "\u0000";
    // Links first, so underscores or asterisks inside a URL aren't read as italics.
    let out = text.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (all, label, url) => {
      const href = safeUrl(url.replace(/&amp;/g, "&"));
      if (!href) return label;
      const external = /^https?:/i.test(href) && !/^https?:\/\/(www\.)?puckbunker\.com/i.test(href);
      return hold(`<a href="${escapeHtml(href)}"${external ? ' target="_blank" rel="noopener"' : ""}>`) + label + hold("</a>");
    });
    out = out
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
      .replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, "$1<em>$2</em>");
    return out.replace(/\u0000(\d+)\u0000/g, (m, i) => saved[Number(i)]);
  }

  function render(md) {
    const lines = String(md || "").replace(/\r\n?/g, "\n").split("\n");
    const html = [];
    let para = [];
    let list = null; // { tag, items }
    let quote = [];

    const flushPara = () => { if (para.length) { html.push(`<p>${inline(escapeHtml(para.join("\n"))).replace(/\n/g, "<br>")}</p>`); para = []; } };
    const flushList = () => { if (list) { html.push(`<${list.tag}>${list.items.map(i => `<li>${inline(escapeHtml(i))}</li>`).join("")}</${list.tag}>`); list = null; } };
    const flushQuote = () => { if (quote.length) { html.push(`<blockquote><p>${inline(escapeHtml(quote.join("\n"))).replace(/\n/g, "<br>")}</p></blockquote>`); quote = []; } };
    const flushAll = () => { flushPara(); flushList(); flushQuote(); };

    for (const raw of lines) {
      const line = raw.trimEnd();
      const t = line.trim();
      let m;
      if (!t) { flushAll(); continue; }

      if ((m = t.match(/^(#{1,3})\s+(.+)$/))) {
        flushAll();
        const tag = m[1].length === 3 ? "h3" : "h2";
        html.push(`<${tag}>${inline(escapeHtml(m[2].replace(/\s+#+$/, "")))}</${tag}>`);
        continue;
      }
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flushAll(); html.push("<hr>"); continue; }

      if ((m = t.match(/^!\[([^\]\n]*)\]\(([^)\s]+)\)$/))) {
        flushAll();
        const src = safeUrl(m[2]);
        if (src) {
          const cap = m[1].trim();
          html.push(`<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(cap)}" loading="lazy">${cap ? `<figcaption>${inline(escapeHtml(cap))}</figcaption>` : ""}</figure>`);
        }
        continue;
      }
      const yt = youtubeId(t);
      if (yt) {
        flushAll();
        html.push(`<div class="embed"><iframe src="https://www.youtube-nocookie.com/embed/${yt}" title="YouTube video" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`);
        continue;
      }

      if ((m = t.match(/^>\s?(.*)$/))) { flushPara(); flushList(); quote.push(m[1]); continue; }

      if ((m = t.match(/^[-*+]\s+(.+)$/)) || (m = t.match(/^\d+[.)]\s+(.+)$/))) {
        flushPara(); flushQuote();
        const tag = /^\d/.test(t) ? "ol" : "ul";
        if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
        list.items.push(m[1]);
        continue;
      }

      // A plain line continues the current list item or quote only if it's indented / quoted;
      // otherwise it's paragraph text.
      if (list && /^\s{2,}/.test(raw)) { list.items[list.items.length - 1] += " " + t; continue; }
      flushList(); flushQuote();
      para.push(t);
    }
    flushAll();
    return html.join("\n");
  }

  // Plain text of the body (for summaries and search engines).
  function plainText(md) {
    return String(md || "")
      .replace(/^!\[[^\]]*\]\([^)]*\)\s*$/gm, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/^\s*(#{1,3}|>|[-*+]|\d+[.)])\s+/gm, "")
      .replace(/^\s*(-{3,}|\*{3,}|_{3,})\s*$/gm, "")
      .replace(/^\s*https?:\/\/\S+\s*$/gm, "")
      .replace(/\*\*|__|\*|_/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function excerpt(md, max) {
    const text = plainText(md);
    const n = max || 180;
    if (text.length <= n) return text;
    return text.slice(0, n).replace(/\s+\S*$/, "") + "…";
  }

  function readingMinutes(md) {
    const words = plainText(md).split(" ").filter(Boolean).length;
    return Math.max(1, Math.round(words / 230));
  }

  function slugify(str) {
    return String(str || "")
      .toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80)
      .replace(/-+$/g, "");
  }

  return { render, plainText, excerpt, readingMinutes, slugify, escapeHtml, youtubeId };
});
