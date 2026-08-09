/* ============================================================
   N3NY000 — live Discord stats
   Reads member / online counts from the public invite endpoint and
   fills any [data-discord] element. Everything degrades to the
   static numbers already in the HTML if the request fails, so a
   rate limit or an offline visitor never shows a broken widget.
   ============================================================ */
(function () {
  'use strict';

  var INVITE = 'mwMcEDUjaa';
  var API = 'https://discord.com/api/v9/invites/' + INVITE + '?with_counts=true';
  var CACHE_KEY = 'nenyoo_discord';
  var TTL = 5 * 60 * 1000;          // 5 minutes is plenty for a member count

  function targets() {
    return document.querySelectorAll('[data-discord]');
  }

  function fmt(n) {
    if (n >= 1000) {
      var k = n / 1000;
      return (k >= 100 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')) + 'K';
    }
    return String(n);
  }

  function paint(data) {
    Array.prototype.forEach.call(targets(), function (el) {
      var kind = el.getAttribute('data-discord');
      var raw = kind === 'online' ? data.online : data.members;
      if (typeof raw !== 'number') return;
      var exact = el.hasAttribute('data-exact');
      el.textContent = exact ? raw.toLocaleString() : fmt(raw);
      // keep the count-up animation in sync if it hasn't run yet
      if (el.hasAttribute('data-count')) el.setAttribute('data-count', raw);
      el.classList.add('is-live');
    });
    document.documentElement.classList.add('discord-live');
  }

  function cached() {
    try {
      var c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      if (c && Date.now() - c.t < TTL) return c;
    } catch (e) {}
    return null;
  }

  function load() {
    if (!targets().length) return;

    var c = cached();
    if (c) { paint(c); return; }

    if (!window.fetch) return;
    fetch(API, { mode: 'cors', credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (j) {
        var data = {
          members: j.approximate_member_count,
          online: j.approximate_presence_count,
          t: Date.now()
        };
        if (typeof data.members !== 'number') return;
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (e) {}
        paint(data);
      })
      .catch(function () { /* leave the static fallback in place */ });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
