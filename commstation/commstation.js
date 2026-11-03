/* CommStation page: nav and download menu (same as the other tool pages). */
// ===== Nav / UI bootstrap =====
(function() {
  var nav = document.getElementById('nav');
  window.addEventListener('scroll', function() {
    nav.classList.toggle('scrolled', window.scrollY > 10);
  }, { passive: true });

  var toggle = document.getElementById('navToggle');
  var navLinks = document.getElementById('navLinks');
  toggle.addEventListener('click', function() {
    toggle.classList.toggle('active');
    navLinks.classList.toggle('open');
  });
  navLinks.querySelectorAll('a').forEach(function(a) {
    a.addEventListener('click', function() {
      toggle.classList.remove('active');
      navLinks.classList.remove('open');
    });
  });

  var dlBtn = document.getElementById('downloadBtn');
  var dlMenu = document.getElementById('downloadMenu');
  if (dlBtn && dlMenu) {
    dlBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      dlMenu.classList.toggle('open');
    });
    document.addEventListener('click', function() {
      dlMenu.classList.remove('open');
    });
  }
})();
