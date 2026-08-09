/* ============================================================
   N3NY000 — feature list browser
   Renders window.NENYOO_FEATURES, which is generated straight from
   the two menu sources (N3NY00 for VIP/MVP, project-native-gui for
   MVP Plus). Two menus, category filter, full-text search.
   ============================================================ */
(function () {
  'use strict';

  var el = {}, MENUS = [], menu = null, cat = 'all', query = '';

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

  // 17 control types collapse to 4 readable buckets
  function badge(t) {
    if (!t) return '';
    var cls = 't-option', label = t.replace(/_/g, ' ');
    if (t === 'toggle') cls = 't-toggle';
    else if (t === 'action') cls = 't-action';
    else if (t.indexOf('toggle') > -1) cls = 't-toggle';
    else if (t === 'slider' || t === 'color' || t.indexOf('input') > -1 || t.indexOf('int_') > -1) {
      cls = 't-value';
      if (t === 'color') label = 'colour';
      if (t === 'int_opt') label = 'number';
    }
    return '<span class="ft-type ' + cls + '">' + esc(label) + '</span>';
  }

  function countLeaves(nodes) {
    var n = 0;
    for (var i = 0; i < nodes.length; i++) n += nodes[i].c ? countLeaves(nodes[i].c) : 1;
    return n;
  }

  /* ---------------- menu switch ---------------- */
  function buildSwitch() {
    el.sw.innerHTML = '';
    MENUS.forEach(function (m) {
      var total = m.cats.reduce(function (s, c) { return s + (c.cnt || 0); }, 0);
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ft-menu' + (m === menu ? ' on' : '');
      b.setAttribute('data-id', m.id);
      b.innerHTML = '<b>' + esc(m.label) + '</b><s>' + esc(m.note) + '</s>' +
        '<i>' + total.toLocaleString() + ' options &middot; ' + m.cats.length + ' categories</i>';
      b.addEventListener('click', function () {
        if (menu === m) return;
        menu = m; cat = 'all';
        buildSwitch(); buildCats(); paint();
      });
      el.sw.appendChild(b);
    });
  }

  /* ---------------- category chips ---------------- */
  function buildCats() {
    var total = menu.cats.reduce(function (s, c) { return s + (c.cnt || 0); }, 0);
    var defs = [{ n: 'All', id: 'all', cnt: total }].concat(
      menu.cats.map(function (c) { return { n: c.n, id: c.n, cnt: c.cnt }; }));
    el.cats.innerHTML = '';
    defs.forEach(function (d) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ft-cat' + (d.id === cat ? ' on' : '');
      b.setAttribute('role', 'tab');
      b.innerHTML = esc(d.n) + ' <b>' + d.cnt.toLocaleString() + '</b>';
      b.addEventListener('click', function () {
        cat = d.id;
        Array.prototype.forEach.call(el.cats.children, function (n, i) {
          n.classList.toggle('on', defs[i].id === cat);
        });
        paint();
      });
      el.cats.appendChild(b);
    });
  }

  /* ---------------- search ---------------- */
  // Flatten once per menu so searching 4k options stays instant.
  var flatCache = {};
  function flat(m) {
    if (flatCache[m.id]) return flatCache[m.id];
    var out = [];
    m.cats.forEach(function (c) {
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

  function renderSearch(q) {
    var terms = q.split(/\s+/).filter(Boolean);
    var hits = flat(menu).filter(function (f) {
      if (cat !== 'all' && f.cat !== cat) return false;
      for (var i = 0; i < terms.length; i++) if (f.hay.indexOf(terms[i]) === -1) return false;
      return true;
    });
    var shown = hits.slice(0, 300);
    if (!shown.length) {
      el.out.innerHTML = '<div class="ft-state">Nothing matches &ldquo;' + esc(q) + '&rdquo; in ' +
        esc(menu.label) + '.</div>';
      el.count.textContent = '0 results';
      return;
    }
    el.out.innerHTML = '<div class="ft-sec open"><div class="ft-body">' + shown.map(function (f) {
      return '<div class="ft-leaf">' + badge(f.t) +
        '<div><span class="lbl">' + hl(f.n, q) + '</span>' +
        (f.d ? '<span class="dsc">' + hl(f.d, q) + '</span>' : '') +
        '<div class="ft-path">' + esc(f.path) + '</div></div></div>';
    }).join('') + '</div></div>';
    el.count.textContent = 'Showing ' + shown.length + ' of ' + hits.length.toLocaleString() +
      ' matches in ' + menu.label;
  }

  /* ---------------- tree ---------------- */
  function nodeHtml(n, depth) {
    if (!n.c) {
      return '<div class="ft-leaf">' + badge(n.t) +
        '<div><span class="lbl">' + esc(n.n) + '</span>' +
        (n.d ? '<span class="dsc">' + esc(n.d) + '</span>' : '') + '</div></div>';
    }
    return '<div class="ft-node">' +
      '<button class="ft-grouphead" type="button">' +
        '<span class="ft-caret"></span>' + esc(n.n) +
        '<span class="n">' + countLeaves(n.c).toLocaleString() + '</span>' +
      '</button>' +
      '<div class="ft-kids">' + n.c.map(function (k) { return nodeHtml(k, depth + 1); }).join('') + '</div>' +
      '</div>';
  }

  function renderTree() {
    var cats = cat === 'all' ? menu.cats : menu.cats.filter(function (c) { return c.n === cat; });
    var openFirst = cats.length === 1;
    el.out.innerHTML = cats.map(function (c) {
      return '<div class="ft-sec' + (openFirst ? ' open' : '') + '">' +
        '<button class="ft-sechead" type="button">' +
          '<span class="ft-caret"></span><h2>' + esc(c.n) + '</h2>' +
          '<span class="n">' + (c.cnt || 0).toLocaleString() + '</span>' +
        '</button>' +
        (c.d ? '<p class="ft-secdesc">' + esc(c.d) + '</p>' : '') +
        '<div class="ft-body">' + (c.c || []).map(function (n) { return nodeHtml(n, 1); }).join('') + '</div>' +
        '</div>';
    }).join('');
    var total = cats.reduce(function (s, c) { return s + (c.cnt || 0); }, 0);
    el.count.textContent = total.toLocaleString() + ' options in ' +
      (cat === 'all' ? menu.label : cat);
  }

  function paint() {
    query = (el.search.value || '').trim().toLowerCase();
    el.clear.hidden = !query;
    if (query) renderSearch(query); else renderTree();
    el.src.textContent = menu.id === 'mvpplus'
      ? 'Source: MVP Plus build' : 'Source: VIP / MVP build';
  }

  /* ---------------- boot ---------------- */
  function boot() {
    el.sw = $('ftSwitch'); el.cats = $('ftCats'); el.out = $('ftOut');
    el.search = $('ftSearch'); el.clear = $('ftClear');
    el.count = $('ftCount'); el.src = $('ftSrc');
    if (!el.out) return;

    var data = window.NENYOO_FEATURES;
    if (!data || !data.menus || !data.menus.length) {
      el.out.innerHTML = '<div class="ft-state">Feature list unavailable right now. ' +
        '<a href="https://discord.gg/mwMcEDUjaa" target="_blank" rel="noopener" style="color:var(--brand-3);font-weight:600;">Ask in Discord &rarr;</a></div>';
      return;
    }
    MENUS = data.menus;
    menu = MENUS[0];

    // deep link: /features#mvpplus
    var h = (location.hash || '').replace('#', '');
    for (var i = 0; i < MENUS.length; i++) if (MENUS[i].id === h) menu = MENUS[i];

    buildSwitch(); buildCats(); paint();

    var t;
    el.search.addEventListener('input', function () {
      clearTimeout(t); t = setTimeout(paint, 120);
    });
    el.clear.addEventListener('click', function () {
      el.search.value = ''; paint(); el.search.focus();
    });

    // one delegated handler for every expander
    el.out.addEventListener('click', function (e) {
      var sec = e.target.closest('.ft-sechead');
      if (sec) { sec.parentNode.classList.toggle('open'); return; }
      var grp = e.target.closest('.ft-grouphead');
      if (grp) grp.parentNode.classList.toggle('open');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
