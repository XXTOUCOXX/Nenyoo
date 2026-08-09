/* ============================================================
   N3NY000 — site.js
   Animated intro, scroll choreography and nav behaviour.
   Loaded on every page; every block is a no-op if its markup
   isn't present, so pages can opt in piecemeal.
   ============================================================ */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var INTRO_KEY = 'nenyoo_intro_seen';     // session-scoped: only once per visit

  /* ---------------------------------------------------------
     1. ANIMATED INTRO
     Built in JS so no page has to carry the markup. Skipped on
     repeat navigations within the same session, when the user
     asks for reduced motion, or on deep links with a hash.
     --------------------------------------------------------- */
  function seenIntro() {
    try { return sessionStorage.getItem(INTRO_KEY) === '1'; } catch (e) { return false; }
  }
  function markIntro() {
    try { sessionStorage.setItem(INTRO_KEY, '1'); } catch (e) {}
  }

  // Returns true when the curtain is actually on screen.
  function buildIntro() {
    if (document.body.getAttribute('data-intro') === 'off') return false;
    if (reduced || seenIntro() || location.hash) return false;

    var word = 'N3NY000';
    var el = document.createElement('div');
    el.className = 'intro';
    el.setAttribute('role', 'presentation');

    var chars = word.split('').map(function (c, i) {
      return '<span style="animation-delay:' + (0.45 + i * 0.05).toFixed(2) + 's">' + c + '</span>';
    }).join('');

    el.innerHTML =
      '<img class="intro-logo" src="brand/Logo@512.gif" alt="N3NY000">' +
      '<div class="intro-word">' + chars + '</div>' +
      '<div class="intro-bar"><i></i></div>' +
      '<div class="intro-meta">Initialising loader</div>';

    document.body.appendChild(el);
    document.body.classList.add('intro-lock');

    var done = false;
    function exit() {
      if (done) return;
      done = true;
      markIntro();
      el.classList.add('is-out');
      document.body.classList.remove('intro-lock');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 800);
      document.dispatchEvent(new CustomEvent('intro:done'));
    }

    // Leave when the bar finishes, or as soon as the user insists.
    var timer = setTimeout(exit, 2000);
    el.addEventListener('click', function () { clearTimeout(timer); exit(); });
    window.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape' || e.key === 'Enter') { clearTimeout(timer); exit(); window.removeEventListener('keydown', onKey); }
    });
    // Hard cap: never trap someone behind a stalled asset.
    setTimeout(exit, 4500);
    return true;
  }

  /* ---------------------------------------------------------
     2. SCROLL REVEAL
     --------------------------------------------------------- */
  function initReveal() {
    var items = document.querySelectorAll('.reveal,.reveal-l,.reveal-r,.reveal-s,.reveal-clip');
    if (!items.length) return;

    function showAll() {
      Array.prototype.forEach.call(items, function (n) { n.classList.add('in'); });
    }

    if (reduced || !('IntersectionObserver' in window)) { showAll(); return; }

    // Backstop: if the observer never delivers (odd embedded webviews,
    // headless renderers), un-hide everything rather than show a blank page.
    setTimeout(showAll, 3000);

    // Stagger siblings that share a parent so rows cascade.
    var groups = new Map();
    Array.prototype.forEach.call(items, function (n) {
      if (n.hasAttribute('data-delay')) return;
      var p = n.parentNode;
      var i = groups.get(p) || 0;
      groups.set(p, i + 1);
      if (i) n.style.transitionDelay = Math.min(i * 70, 420) + 'ms';
    });
    Array.prototype.forEach.call(items, function (n) {
      if (n.hasAttribute('data-delay')) n.style.transitionDelay = n.getAttribute('data-delay') + 'ms';
    });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });

    Array.prototype.forEach.call(items, function (n) { io.observe(n); });
  }

  /* ---------------------------------------------------------
     3. COUNT-UP NUMBERS  <b data-count="7000" data-suffix="+">
     --------------------------------------------------------- */
  function initCounters() {
    var nums = document.querySelectorAll('[data-count]');
    if (!nums.length) return;

    function run(el) {
      var target = parseFloat(el.getAttribute('data-count')) || 0;
      var suffix = el.getAttribute('data-suffix') || '';
      var prefix = el.getAttribute('data-prefix') || '';
      var dur = 1400, t0 = performance.now();
      if (reduced) { el.textContent = prefix + fmt(target) + suffix; return; }
      (function step(now) {
        var p = Math.min((now - t0) / dur, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = prefix + fmt(Math.round(target * eased)) + suffix;
        if (p < 1) requestAnimationFrame(step);
      })(t0);
    }
    function fmt(n) {
      if (n >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'K';
      return String(n);
    }

    if (!('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(nums, run); return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        run(e.target); io.unobserve(e.target);
      });
    }, { threshold: 0.5 });
    Array.prototype.forEach.call(nums, function (n) { io.observe(n); });
  }

  /* ---------------------------------------------------------
     4. NAV — stuck state, active link, mobile drawer
     --------------------------------------------------------- */
  function initNav() {
    var nav = document.querySelector('.nav');
    if (!nav) return;

    var onScroll = function () {
      nav.classList.toggle('is-stuck', window.scrollY > 12);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    // active link
    var here = location.pathname.replace(/\/index(\.html)?$/i, '/').replace(/\.html$/i, '');
    if (here.length > 1) here = here.replace(/\/$/, '');
    nav.querySelectorAll('.nav-links a').forEach(function (a) {
      var href = a.getAttribute('href') || '';
      if (href.charAt(0) !== '/' || href === '/') return;
      if (here === href.replace(/\/$/, '')) a.classList.add('is-active');
    });

    var burger = nav.querySelector('.nav-burger');
    var drawer = document.querySelector('.nav-drawer');
    if (burger && drawer) {
      burger.addEventListener('click', function () {
        var open = drawer.classList.toggle('is-open');
        burger.classList.toggle('is-open', open);
        burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      drawer.addEventListener('click', function (e) {
        if (e.target.tagName === 'A') {
          drawer.classList.remove('is-open');
          burger.classList.remove('is-open');
        }
      });
    }
  }

  /* ---------------------------------------------------------
     5. SCROLL PROGRESS BAR
     --------------------------------------------------------- */
  function initProgress() {
    var bar = document.createElement('div');
    bar.className = 'scroll-bar';
    document.body.appendChild(bar);
    var ticking = false;
    function paint() {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = 'scaleX(' + (h > 0 ? Math.min(window.scrollY / h, 1) : 0) + ')';
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(paint); }
    }, { passive: true });
    paint();
  }

  /* ---------------------------------------------------------
     6. HOVER SPOTLIGHT for .spot cards
     --------------------------------------------------------- */
  function initSpotlight() {
    if (reduced) return;
    var spots = document.querySelectorAll('.spot');
    if (!spots.length) return;
    document.addEventListener('pointermove', function (e) {
      for (var i = 0; i < spots.length; i++) {
        var el = spots[i];
        var r = el.getBoundingClientRect();
        if (e.clientX < r.left - 60 || e.clientX > r.right + 60 ||
            e.clientY < r.top - 60 || e.clientY > r.bottom + 60) continue;
        el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        el.style.setProperty('--my', (e.clientY - r.top) + 'px');
      }
    }, { passive: true });
  }

  /* ---------------------------------------------------------
     7. MAGNETIC BUTTONS  (opt in with data-magnet)
     --------------------------------------------------------- */
  function initMagnet() {
    if (reduced || window.matchMedia('(hover: none)').matches) return;
    document.querySelectorAll('[data-magnet]').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) / r.width;
        var dy = (e.clientY - (r.top + r.height / 2)) / r.height;
        el.style.transform = 'translate(' + (dx * 10).toFixed(2) + 'px,' + (dy * 8).toFixed(2) + 'px)';
      });
      el.addEventListener('pointerleave', function () { el.style.transform = ''; });
    });
  }

  /* ---------------------------------------------------------
     7b. 3D TILT  (opt in with data-tilt, optional data-tilt-max)
     --------------------------------------------------------- */
  function initTilt() {
    if (reduced || window.matchMedia('(hover: none)').matches) return;
    var els = document.querySelectorAll('[data-tilt]');
    if (!els.length) return;

    Array.prototype.forEach.call(els, function (el) {
      var max = parseFloat(el.getAttribute('data-tilt-max')) || 7;
      var frame = 0;

      el.addEventListener('pointermove', function (e) {
        if (frame) return;
        frame = requestAnimationFrame(function () {
          frame = 0;
          var r = el.getBoundingClientRect();
          var px = (e.clientX - r.left) / r.width - 0.5;   // -0.5 .. 0.5
          var py = (e.clientY - r.top) / r.height - 0.5;
          el.classList.add('is-tilting');
          el.style.setProperty('--ry', (px * max * 2).toFixed(2) + 'deg');
          el.style.setProperty('--rx', (-py * max * 2).toFixed(2) + 'deg');
          el.style.setProperty('--tz', '14px');
        });
      });

      el.addEventListener('pointerleave', function () {
        if (frame) { cancelAnimationFrame(frame); frame = 0; }
        el.classList.remove('is-tilting');
        el.style.setProperty('--rx', '0deg');
        el.style.setProperty('--ry', '0deg');
        el.style.setProperty('--tz', '0px');
      });
    });
  }

  /* ---------------------------------------------------------
     8. PARALLAX  (opt in with data-parallax="0.15")
     --------------------------------------------------------- */
  function initParallax() {
    if (reduced) return;
    var els = document.querySelectorAll('[data-parallax]');
    if (!els.length) return;
    var ticking = false;
    function paint() {
      var vh = window.innerHeight;
      els.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return;
        var k = parseFloat(el.getAttribute('data-parallax')) || 0.1;
        var mid = r.top + r.height / 2 - vh / 2;
        el.style.setProperty('--py', (-mid * k).toFixed(1) + 'px');
        el.style.transform = 'translate3d(0,' + (-mid * k).toFixed(1) + 'px,0)';
      });
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(paint); }
    }, { passive: true });
    paint();
  }

  /* ---------------------------------------------------------
     9. MARQUEE — duplicate the track so the loop is seamless
     --------------------------------------------------------- */
  function initMarquee() {
    document.querySelectorAll('.marquee-track').forEach(function (track) {
      if (track.getAttribute('data-cloned')) return;
      track.setAttribute('data-cloned', '1');
      track.innerHTML += track.innerHTML;
    });
  }

  /* ---------------------------------------------------------
     10. SALE COUNTDOWN  — any [data-countdown] element
     --------------------------------------------------------- */
  function initCountdown() {
    var els = document.querySelectorAll('[data-countdown]');
    if (!els.length) return;
    var KEY = 'nenyoo_countdown_end';
    var end = parseInt(localStorage.getItem(KEY), 10);
    if (!end || isNaN(end) || end < Date.now()) {
      end = Date.now() + 48 * 3600 * 1000;
      try { localStorage.setItem(KEY, end); } catch (e) {}
    }
    function pad(n) { return String(n).padStart(2, '0'); }
    function tick() {
      var rem = Math.max(end - Date.now(), 0);
      var txt = pad(Math.floor(rem / 3600000)) + ':' +
                pad(Math.floor((rem % 3600000) / 60000)) + ':' +
                pad(Math.floor((rem % 60000) / 1000));
      els.forEach(function (el) { el.textContent = txt; });
    }
    tick();
    setInterval(tick, 1000);
  }

  /* ---------------------------------------------------------
     boot
     --------------------------------------------------------- */
  function safe(fn) {
    return function () { try { return fn(); } catch (e) { if (window.console) console.error('[site]', e); } };
  }

  function boot() {
    var introShowing = safe(buildIntro)();
    safe(initNav)();
    // Hold the scroll choreography until the curtain lifts, otherwise the
    // hero would animate in behind the intro and land already-finished.
    var start = function () { safe(initReveal)(); safe(initCounters)(); };
    if (introShowing) document.addEventListener('intro:done', start, { once: true });
    else start();

    safe(initProgress)();
    safe(initSpotlight)();
    safe(initMagnet)();
    safe(initTilt)();
    safe(initParallax)();
    safe(initMarquee)();
    safe(initCountdown)();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
