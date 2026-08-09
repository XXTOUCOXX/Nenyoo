/* ============================================================
   N3NY000 — landing-page feature teaser
   Same data as /features, but the payload is ~360KB so it is only
   fetched once the section scrolls into view. Falls back to a link
   if anything goes wrong.
   ============================================================ */
(function () {
  'use strict';

  var PAGE = 30;
  var els = {}, MENUS = [], menu = null, flatCache = {}, loaded = false;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function hl(text, q) {
    var out = esc(text);
    if (!q) return out;
    q.split(/\s+/).filter(Boolean).forEach(function (t) {
      out = out.replace(new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>');
    });
    return out;
  }
  function badge(t) {
    if (!t) return '';
    var cls = 't-option', label = t.replace(/_/g, ' ');
    if (t === 'toggle' || t.indexOf('toggle') > -1) cls = 't-toggle';
    else if (t === 'action') cls = 't-action';
    else if (t === 'slider' || t === 'color' || t.indexOf('input') > -1 || t.indexOf('int_') > -1) {
      cls = 't-value';
      if (t === 'color') label = 'colour';
      if (t === 'int_opt') label = 'number';
    }
    return '<span class="fx-type ' + cls + '">' + esc(label) + '</span>';
  }

  function flat(m) {
    if (flatCache[m.id]) return flatCache[m.id];
    var out = [];
    (m.cats || []).forEach(function (c) {
      (function walk(nodes, trail) {
        nodes.forEach(function (n) {
          if (n.c) walk(n.c, trail.concat(n.n));
          else out.push({
            n: n.n, t: n.t, d: n.d || '', cat: c.n,
            path: trail.join(' › '),
            hay: ((n.n || '') + ' ' + (n.d || '')).toLowerCase()
          });
        });
      })(c.c || [], [c.n]);
    });
    flatCache[m.id] = out;
    return out;
  }

  var activeCat = 0;

  function buildCats() {
    els.cats.innerHTML = '';
    // menu switch first, then this menu's categories
    MENUS.forEach(function (m) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'fx-cat fx-menu' + (m === menu ? ' on' : '');
      var total = (m.cats || []).reduce(function (s, c) { return s + (c.cnt || 0); }, 0);
      b.innerHTML = esc(m.label) + ' <b>' + total.toLocaleString() + '</b>';
      b.addEventListener('click', function () {
        if (menu === m) return;
        menu = m; activeCat = 0; els.search.value = '';
        buildCats(); paint();
      });
      els.cats.appendChild(b);
    });
    var sep = document.createElement('span');
    sep.className = 'fx-sep';
    els.cats.appendChild(sep);
    (menu.cats || []).forEach(function (c, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'fx-cat' + (i === activeCat ? ' on' : '');
      b.innerHTML = esc(c.n) + ' <b>' + (c.cnt || 0).toLocaleString() + '</b>';
      b.addEventListener('click', function () {
        activeCat = i; els.search.value = '';
        toggleClear(); buildCats(); paint();
      });
      els.cats.appendChild(b);
    });
  }

  function toggleClear() { els.clear.hidden = !els.search.value; }

  function paint() {
    var q = els.search.value.trim().toLowerCase();
    var all = flat(menu), hits, scope;
    if (q) {
      var terms = q.split(/\s+/);
      hits = all.filter(function (f) {
        for (var i = 0; i < terms.length; i++) if (f.hay.indexOf(terms[i]) === -1) return false;
        return true;
      });
      scope = 'across ' + menu.label;
      Array.prototype.forEach.call(els.cats.children, function (n) {
        if (n.classList && !n.classList.contains('fx-menu')) n.classList.remove('on');
      });
    } else {
      var name = (menu.cats[activeCat] || {}).n;
      hits = all.filter(function (f) { return f.cat === name; });
      scope = 'in ' + name;
    }
    var shown = hits.slice(0, PAGE);
    els.grid.scrollTop = 0;
    if (!shown.length) {
      els.grid.innerHTML = '<div class="fx-empty">Nothing matches &ldquo;' + esc(els.search.value) + '&rdquo;.</div>';
    } else {
      els.grid.innerHTML = shown.map(function (f, i) {
        return '<div class="fx-item" style="animation-delay:' + Math.min(i * 12, 260) + 'ms">' +
          '<div class="fx-head"><span class="fx-name">' + hl(f.n, q) + '</span>' + badge(f.t) + '</div>' +
          (f.d ? '<div class="fx-desc">' + hl(f.d, q) + '</div>' : '') +
          '<div class="fx-path">' + esc(f.path) + '</div></div>';
      }).join('');
    }
    els.count.textContent = hits.length
      ? 'Showing ' + shown.length + ' of ' + hits.length.toLocaleString() + ' ' + scope
      : '0 results';
  }

  function start() {
    var data = window.NENYOO_FEATURES;
    if (!data || !data.menus || !data.menus.length) {
      els.grid.innerHTML = '<div class="fx-empty">Feature list unavailable — ' +
        '<a href="/features" style="color:var(--brand-3);">open the full list</a>.</div>';
      return;
    }
    MENUS = data.menus;
    menu = MENUS[0];
    var grand = MENUS.reduce(function (s, m) {
      return s + m.cats.reduce(function (a, c) { return a + (c.cnt || 0); }, 0);
    }, 0);
    if (els.total) els.total.textContent = grand.toLocaleString();

    buildCats();
    paint();

    var t;
    els.search.addEventListener('input', function () {
      toggleClear(); clearTimeout(t); t = setTimeout(paint, 110);
    });
    els.clear.addEventListener('click', function () {
      els.search.value = ''; toggleClear(); paint(); els.search.focus();
    });
  }

  function load() {
    if (loaded) return;
    loaded = true;
    if (window.NENYOO_FEATURES) { start(); return; }
    var s = document.createElement('script');
    s.src = 'features-data.js';
    s.onload = start;
    s.onerror = function () {
      els.grid.innerHTML = '<div class="fx-empty">Couldn\'t load the feature list — ' +
        '<a href="/features" style="color:var(--brand-3);">try the full page</a>.</div>';
    };
    document.head.appendChild(s);
  }

  function boot() {
    els.grid = $('fxGrid'); els.cats = $('fxCats'); els.search = $('fxSearch');
    els.clear = $('fxClear'); els.count = $('fxCount'); els.total = $('fxTotal');
    if (!els.grid || !els.cats) return;

    els.grid.innerHTML = '<div class="fx-empty">Loading the feature list…</div>';

    var section = document.getElementById('features');
    if (!section || !('IntersectionObserver' in window)) { load(); return; }
    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) { io.disconnect(); load(); }
    }, { rootMargin: '400px' });
    io.observe(section);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
