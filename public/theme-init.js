// Applies the saved light / dark choice before the first paint, so the page never flashes the
// other theme. The choice is a per-browser convenience (localStorage); "system" = no attribute.
(function () {
  try {
    var t = localStorage.getItem('cb-forms.theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {
    /* storage blocked: follow the system setting */
  }
})();
