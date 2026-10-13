// Mech Invasion login on a short screen (a phone turned sideways, with or without the on-screen keyboard):
//   - --app-vh / --app-top follow the VISIBLE part of the page (visualViewport), so the login panel is never taller than what can be seen and the footer with JACK IN stays above the keyboard
//   - a field that gets focus is scrolled into view (the panel scrolls; css/style.css keeps room for the footer with scroll-padding)
// The panel's own rules apply only on short landscape screens (see the media query at the end of css/style.css); these variables are unused elsewhere.
(function () {
  var root = document.documentElement, vv = window.visualViewport;
  function fit() {
    if (!vv) return;
    root.style.setProperty('--app-vh', Math.round(vv.height) + 'px');
    root.style.setProperty('--app-top', Math.round(vv.offsetTop) + 'px');
  }
  if (vv) { vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); fit(); }
  document.addEventListener('focusin', function (e) {
    var t = e.target;
    if (!t || !/^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
    setTimeout(function () { try { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (err) { t.scrollIntoView(); } }, 300);   // after the keyboard has finished opening
  });
})();
