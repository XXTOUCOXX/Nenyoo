/* ============================================================
   N3NY000 — landing-page feature explorer
   Flattens window.NENYOO_FEATURES (the same tree roadmap.html
   browses) into a searchable teaser. No-ops if the section or
   the data isn't on the page.
   ============================================================ */
(function () {
  'use strict';

  var PAGE = 33;          // items rendered per category / per search
  var els = {};

  function $(id) { return document.getElementById(id); }

  function boot() {
    els.grid = $('fxGrid');
    els.cats = $('fxCats');
    els.search = $('fxSearch');
    els.clear = $('fxClear');
    els.count = $('fxCount');
    els.total = $('fxTotal');
    if (!els.grid || !els.cats) return;

    var DATA = window.NENYOO_FEATURES;
    if (!DATA || !DATA.cats) {
      els.grid.innerHTML = '<div class="fx-empty">Feature list unavailable — ' +
        '<a href="/roadmap" style="color:var(--brand-3);">browse it on the roadmap</a>.</div>';
      return;
    }

    // ---- flatten the tree, keeping the menu path for context ----
    var cats = DATA.cats.filter(function (c) { return (c.cnt || 0) > 0; });
    var flat = [];   // {n, d, t, cat, path, hay}

    cats.forEach(function (cat, ci) {
      (function walk(nodes, trail) {
        (nodes || []).forEach(function (node) {
          if (node.c && node.c.length) {
            walk(node.c, trail.concat(node.n));
          } else if (node.t !== 'header') {
            flat.push({
              n: node.n || '',
              d: node.d || '',
              t: node.t || '',
              ci: ci,
              path: trail.join(' › '),
              hay: ((node.n || '') + ' ' + (node.d || '')).toLowerCase()
            });
          }
        });
      })(cat.c, [cat.n]);
    });

    var grand = cats.reduce(function (s, c) { return s + (c.cnt || 0); }, 0);
    if (els.total) els.total.textContent = grand.toLocaleString();

    // ---- category chips ----
    var active = 0;
    cats.forEach(function (cat, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'fx-cat' + (i === 0 ? ' on' : '');
      b.setAttribute('role', 'tab');
      b.innerHTML = esc(cat.n) + ' <b>' + (cat.cnt || 0) + '</b>';
      b.addEventListener('click', function () {
        active = i;
        els.search.value = '';
        toggleClear();
        paint();
      });
      els.cats.appendChild(b);
    });

    // ---- search ----
    var timer;
    els.search.addEventListener('input', function () {
      toggleClear();
      clearTimeout(timer);
      timer = setTimeout(paint, 110);
    });
    els.clear.addEventListener('click', function () {
      els.search.value = '';
      toggleClear();
      paint();
      els.search.focus();
    });

    function toggleClear() { els.clear.hidden = !els.search.value; }

    // ---- render ----
    function paint() {
      var q = els.search.value.trim().toLowerCase();
      var hits, scope;

      if (q) {
        // Search spans every category; the chips stop looking selected.
        var terms = q.split(/\s+/);
        hits = flat.filter(function (f) {
          for (var i = 0; i < terms.length; i++) if (f.hay.indexOf(terms[i]) === -1) return false;
          return true;
        });
        scope = 'across all categories';
        setChip(-1);
      } else {
        hits = flat.filter(function (f) { return f.ci === active; });
        scope = 'in ' + cats[active].n;
        setChip(active);
      }

      var shown = hits.slice(0, PAGE);
      els.grid.scrollTop = 0;

      if (!shown.length) {
        els.grid.innerHTML = '<div class="fx-empty">Nothing matches &ldquo;' + esc(els.search.value) +
          '&rdquo;.<br><span style="font-size:12.5px;color:var(--ink-4);">' +
          'The menu has ' + grand.toLocaleString() + ' options — try a shorter word.</span></div>';
      } else {
        els.grid.innerHTML = shown.map(function (f, i) {
          return '<div class="fx-item" style="animation-delay:' + Math.min(i * 12, 260) + 'ms">' +
            '<div class="fx-head"><span class="fx-name">' + hl(f.n, q) + '</span>' + badge(f.t) + '</div>' +
            (f.d ? '<div class="fx-desc">' + hl(f.d, q) + '</div>' : '') +
            '<div class="fx-path">' + esc(f.path) + '</div>' +
            '</div>';
        }).join('');
      }

      els.count.textContent = hits.length
        ? 'Showing ' + shown.length + ' of ' + hits.length.toLocaleString() + ' ' + scope
        : '0 results';
    }

    function setChip(i) {
      Array.prototype.forEach.call(els.cats.children, function (c, ci) {
        c.classList.toggle('on', ci === i);
      });
    }

    paint();
  }

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function hl(text, q) {
    var out = esc(text);
    if (!q) return out;
    q.split(/\s+/).filter(Boolean).forEach(function (term) {
      var re = new RegExp('(' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
      out = out.replace(re, '<mark>$1</mark>');
    });
    return out;
  }

  // 13 control types collapse to 4 readable buckets.
  function badge(t) {
    if (!t) return '';
    var cls = 't-option', label = t.replace(/_/g, ' ');
    if (t === 'toggle') { cls = 't-toggle'; }
    else if (t === 'action') { cls = 't-action'; }
    else if (t.indexOf('toggle') > -1) { cls = 't-toggle'; }
    else if (t === 'slider' || t.indexOf('input') > -1 || t === 'color') { cls = 't-value'; label = t === 'color' ? 'colour' : label; }
    return '<span class="fx-type ' + cls + '">' + esc(label) + '</span>';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
