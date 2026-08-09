/* ============================================================
   N3NY000 — MVP Plus menu replica
   A browser port of Themes/theme.lua: same layout constants, same
   textures, same fonts, driven by the real MVP Plus option tree out
   of features-data.js. Look and metrics are fixed in the page's CSS
   variables, mirroring theme.lua's defaults.
   ============================================================ */
(function () {
  'use strict';

  var el = {}, stack = [], values = {};

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function css(v) { return getComputedStyle(el.menu).getPropertyValue(v).trim(); }
  function num(v) { return parseFloat(css(v)) || 0; }

  /* ---------- option value model ---------- */
  var ARRAYS = ['Off', 'On', 'Auto'];
  function key(item) { return item.__k; }
  function val(item) {
    if (!(key(item) in values)) {
      var t = item.t;
      values[key(item)] =
        t === 'toggle' || t.indexOf('toggle') > -1 ? false :
        t === 'slider' || t === 'input_float' ? 1 :
        t === 'int_opt' || t === 'input_int' ? 1 :
        t === 'array' || t === 'loop' || t === 'picker' ? 0 :
        t === 'color' ? '#a855f7' : '';
    }
    return values[key(item)];
  }
  function setVal(item, v) { values[key(item)] = v; }

  /* ---------- pages ---------- */
  function pageOf(node) {
    return { title: node.n, items: node.c || [], sel: 0, top: 0 };
  }
  function cur() { return stack[stack.length - 1]; }

  function open(node) {
    if (!node.c || !node.c.length) return;
    stack.push(pageOf(node));
    render();
  }
  function back() {
    if (stack.length > 1) { stack.pop(); render(); }
  }

  /* ---------- widget on the right of a row ---------- */
  function widget(item) {
    if (item.c) return '<span class="mi mi-right"></span>';
    var t = item.t || 'action', v = val(item);
    if (t === 'action') return '';
    if (t === 'toggle') return '<span class="mi ' + (v ? 'mi-on' : 'mi-off') + '"></span>';
    if (t === 'color') return '<span class="mn-sw" style="background:' + esc(v) + '"></span>';
    if (t === 'search') return '<span class="mn-val">Search…</span><span class="mi mi-search"></span>';
    if (t === 'input_text') return '<span class="mn-val">…</span>';
    if (t.indexOf('toggle') > -1) {   // int_toggle / float_toggle / array_toggle / loop_toggle
      var extra = t === 'array_toggle' ? ARRAYS[v % ARRAYS.length] || 'Off' : String(v);
      return '<span class="mn-val">' + esc(extra) + '</span><span class="mi ' + (v ? 'mi-on' : 'mi-off') + '"></span>';
    }
    if (t === 'array' || t === 'loop' || t === 'picker') {
      return '<span class="mn-val">' + esc(ARRAYS[v % ARRAYS.length]) + '</span>';
    }
    if (t === 'slider' || t === 'input_float') return '<span class="mn-val">' + Number(v).toFixed(1) + '</span>';
    return '<span class="mn-val">' + esc(String(v)) + '</span>';
  }

  /* ---------- activate / adjust ---------- */
  function activate() {
    var p = cur(), it = p.items[p.sel];
    if (!it) return;
    if (it.c) { open(it); return; }
    var t = it.t || 'action';
    if (t === 'toggle' || t.indexOf('toggle') > -1) { setVal(it, !val(it)); render(); return; }
    if (t === 'array' || t === 'loop' || t === 'picker') { adjust(1); return; }
    flash();
  }
  function adjust(dir) {
    var p = cur(), it = p.items[p.sel];
    if (!it || it.c) return;
    var t = it.t || '', v = val(it);
    if (t === 'slider' || t === 'input_float' || t === 'float_toggle') setVal(it, Math.max(0, +(v + dir * 0.5).toFixed(1)));
    else if (t === 'int_opt' || t === 'input_int' || t === 'int_toggle') setVal(it, Math.max(0, v + dir));
    else if (t === 'array' || t === 'loop' || t === 'picker' || t === 'array_toggle')
      setVal(it, (v + dir + ARRAYS.length) % ARRAYS.length);
    else return;
    render();
  }
  function flash() {
    var row = el.rows.children[cur().sel - cur().top];
    if (!row) return;
    row.animate([{ filter: 'brightness(2.2)' }, { filter: 'brightness(1)' }], { duration: 220 });
  }

  function move(d) {
    var p = cur(), n = p.items.length;
    if (!n) return;
    p.sel = (p.sel + d + n) % n;
    var rows = Math.max(1, Math.round(num('--rows')));
    if (p.sel < p.top) p.top = p.sel;
    if (p.sel >= p.top + rows) p.top = p.sel - rows + 1;
    p.top = Math.max(0, Math.min(p.top, Math.max(0, n - rows)));
    render();
  }

  /* ---------- render ---------- */
  function render() {
    var p = cur(), n = p.items.length;
    var rows = Math.max(1, Math.round(num('--rows')));
    var shown = Math.min(n, rows);
    var rowH = num('--row');

    el.crumb.textContent = (p.title || 'MENU').toUpperCase();
    el.list.style.height = (shown * rowH) + 'px';

    var slice = p.items.slice(p.top, p.top + shown);
    el.rows.innerHTML = slice.map(function (it, i) {
      var idx = p.top + i;
      return '<div class="mn-row' + (idx === p.sel ? ' sel' : '') + '" data-i="' + idx + '">' +
        '<span class="mn-name">' + esc(it.n) + '</span>' + widget(it) + '</div>';
    }).join('');

    // scrollbar: only when the page overflows
    var w = num('--scroll');
    if (w > 0 && n > rows) {
      var listH = shown * rowH;
      var th = Math.max(18, listH * (rows / n));
      var maxTop = listH - th;
      var ratio = p.top / (n - rows);
      el.bar.hidden = false;
      el.bar.style.height = th + 'px';
      el.bar.style.top = (ratio * maxTop) + 'px';
    } else {
      el.bar.hidden = true;
    }

    var it = p.items[p.sel];
    el.desc.textContent = it ? (it.d || ('Adjust ' + it.n + '.')) : '';
    el.count.textContent = (n ? p.sel + 1 : 0) + ' / ' + n;
  }

  /* ---------- data ---------- */
  function buildTree(menu) {
    // stamp a stable key on every node so toggles persist across navigation
    var i = 0;
    (function walk(nodes) {
      nodes.forEach(function (n) {
        n.__k = i++;
        if (n.c) walk(n.c);
      });
    })(menu.cats);
    return { n: 'Nenyoo', c: menu.cats.map(function (c) { return { n: c.n, d: c.d, c: c.c, __k: c.__k }; }) };
  }

  function start() {
    var data = window.NENYOO_FEATURES;
    var menu = data && data.menus && data.menus.filter(function (m) { return m.id === 'mvpplus'; })[0];
    if (!menu) {
      el.rows.innerHTML = '<div class="mn-row"><span class="mn-name">Menu data unavailable</span></div>';
      return;
    }
    stack = [pageOf(buildTree(menu))];
    render();
  }

  function load() {
    if (window.NENYOO_FEATURES) { start(); return; }
    var s = document.createElement('script');
    s.src = 'features-data.js';
    s.onload = start;
    s.onerror = function () {
      el.rows.innerHTML = '<div class="mn-row"><span class="mn-name">Couldn\'t load the option list</span></div>';
    };
    document.head.appendChild(s);
  }

  /* ---------- boot ---------- */
  function boot() {
    el.menu = document.getElementById('menu');
    if (!el.menu) return;
    el.rows = document.getElementById('mnRows');
    el.list = document.getElementById('mnList');
    el.bar = document.getElementById('mnBar');
    el.crumb = document.getElementById('mnCrumb');
    el.desc = document.getElementById('mnDesc');
    el.count = document.getElementById('mnCount');

    // mouse
    el.rows.addEventListener('click', function (e) {
      var row = e.target.closest('.mn-row');
      if (!row) return;
      var i = +row.getAttribute('data-i');
      var p = cur();
      if (p.sel === i) activate(); else { p.sel = i; render(); }
      el.menu.focus();
    });
    el.list.addEventListener('wheel', function (e) {
      e.preventDefault();
      move(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });
    document.getElementById('mnUp').addEventListener('click', function () { move(-1); });
    document.getElementById('mnDown').addEventListener('click', function () { move(1); });

    // keyboard — only while the menu has focus, so the page still scrolls normally
    el.menu.addEventListener('keydown', function (e) {
      var k = e.key;
      if (k === 'ArrowUp') { move(-1); }
      else if (k === 'ArrowDown') { move(1); }
      else if (k === 'Enter') { activate(); }
      else if (k === 'ArrowRight') { var it = cur().items[cur().sel]; if (it && it.c) open(it); else adjust(1); }
      else if (k === 'ArrowLeft') { var i2 = cur().items[cur().sel]; if (i2 && !i2.c && i2.t && i2.t !== 'action' && i2.t !== 'toggle') adjust(-1); else back(); }
      else if (k === 'Backspace' || k === 'Escape') { back(); }
      else return;
      e.preventDefault();
    });

    el.rows.innerHTML = '<div class="mn-row"><span class="mn-name">Loading options…</span></div>';
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
