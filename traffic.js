// =====================================================================
//  PUCK BUNKER — GOOGLE ANALYTICS (site traffic tracking)
// ---------------------------------------------------------------------
//  Paste your Google Analytics Measurement ID between the quotes below.
//  It starts with "G-" (for example "G-AB12CD34EF"). You'll find it in
//  Google Analytics under Admin > Data streams > your web stream.
//
//  To stop tracking at any time, set the ID back to an empty "".
// =====================================================================
const PB_GA_ID = "G-S5LZXRZPF5";


(function () {
  if (!PB_GA_ID || !/^G-[A-Z0-9]+$/i.test(PB_GA_ID)) return;

  // Load Google's tracking script
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(PB_GA_ID);
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", PB_GA_ID);
})();
