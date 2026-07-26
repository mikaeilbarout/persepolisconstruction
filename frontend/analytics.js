// ---------------------------------------------------------------
// Analytics loader — opt-in, not hardcoded.
//
// Nothing loads until you set a real GA4 measurement ID below (or via
// window.PERSEPOLIS_GA_ID before this script runs). Until then this file
// does nothing, so the site ships with zero analytics/tracking by default.
//
// To enable Google Analytics:
//   1. Create a GA4 property at https://analytics.google.com
//   2. Copy its Measurement ID (looks like "G-XXXXXXXXXX")
//   3. Paste it below, or set window.PERSEPOLIS_GA_ID in each page's <head>
//      before this script tag.
//
// Prefer not to use Google Analytics? Swap this file for a snippet from a
// privacy-friendly alternative instead — Plausible or Umami both work with
// a single <script> tag and don't need any of the loader logic below:
//   Plausible: <script defer data-domain="yoursite.co.uk" src="https://plausible.io/js/script.js"></script>
//   Umami:     <script defer data-website-id="YOUR-ID" src="https://your-umami-instance/script.js"></script>
// ---------------------------------------------------------------
(function () {
  const GA_MEASUREMENT_ID = window.PERSEPOLIS_GA_ID || ''; // e.g. 'G-XXXXXXXXXX'
  if (!GA_MEASUREMENT_ID) return;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  gtag('js', new Date());
  gtag('config', GA_MEASUREMENT_ID, { anonymize_ip: true });
})();
