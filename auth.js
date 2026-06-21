/* ===== Nenyoo — shared auth client (ProudlyAuthentication API) =====
   Ported from the original js/portal.js helpers. Used by login / signup /
   forgot / dashboard. Config is constant here instead of hidden inputs. */
(function (global) {
  'use strict';

  var API_BASE = 'https://proudlyauthentication.com';
  var PORTAL_KEY = 'pk_wq5QrTCJgdWbnTAI7eYzD4OAcXBkeCsE';
  var TOKEN_KEY = 'portalSessionToken';

  // Discord is the only OAuth provider we surface.
  var DISCORD = { name: 'discord', display_name: 'Discord', color: '#5865F2' };

  function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function setToken(t) { try { localStorage.setItem(TOKEN_KEY, t); } catch (e) {} }
  function clearToken() { try { localStorage.removeItem(TOKEN_KEY); } catch (e) {} }

  function getApiUrl(endpoint) {
    var base = API_BASE;
    if (base.charAt(base.length - 1) === '/') base = base.slice(0, -1);
    return base + '/api/portal/v1/' + PORTAL_KEY + endpoint;
  }

  function getHeaders() {
    var headers = { 'Content-Type': 'application/json' };
    var t = getToken();
    if (t) headers['Authorization'] = 'Bearer ' + t;
    return headers;
  }

  // Returns { ok, status, data } — never throws.
  async function api(method, endpoint, body) {
    var options = { method: method, headers: getHeaders() };
    if (body && method !== 'GET') options.body = JSON.stringify(body);
    try {
      var res = await fetch(getApiUrl(endpoint), options);
      var data;
      try { data = await res.json(); } catch (e) { data = {}; }
      return { ok: res.ok, status: res.status, data: data || {} };
    } catch (err) {
      return { ok: false, status: 0, data: { message: err && err.message ? err.message : 'Network error' } };
    }
  }

  // Redirect the browser into the provider's OAuth flow.
  // action: 'login' | 'register' | 'link'
  function startOAuth(provider, action) {
    var base = API_BASE;
    if (base.charAt(base.length - 1) === '/') base = base.slice(0, -1);
    var currentUrl = global.location.href.split('?')[0].split('#')[0];
    var redirectUri = encodeURIComponent(currentUrl + '?portal_key=' + PORTAL_KEY);
    var authUrl = base + '/api/portal/v1/' + PORTAL_KEY + '/auth/oauth/' + provider +
      '/authorize?action=' + action + '&redirect_uri=' + redirectUri;
    var t = getToken();
    if (action === 'link' && t) authUrl += '&session_token=' + encodeURIComponent(t);
    global.location.href = authUrl;
  }

  // Strip OAuth params from the URL after handling.
  function cleanOAuthParams() {
    try {
      var url = new URL(global.location.href);
      url.hash = '';
      global.history.replaceState({}, document.title, url.pathname + url.search);
    } catch (e) {}
  }

  // Inspect the URL hash for an OAuth callback. Returns one of:
  //   {type:'session', token}        - OAuth login/register succeeded
  //   {type:'error', message}        - OAuth failed
  //   {type:'success', message}      - account linked (already logged in)
  //   {type:'link_required', linkToken, provider, email}
  //   null                           - no OAuth callback present
  // Always cleans the URL when it handled something.
  function handleOAuthCallback() {
    var hash = global.location.hash.substring(1);
    if (!hash) return null;
    var p = new URLSearchParams(hash);

    var session = p.get('oauth_session');
    if (session) { cleanOAuthParams(); return { type: 'session', token: session }; }

    var error = p.get('oauth_error');
    if (error) { cleanOAuthParams(); return { type: 'error', message: decodeURIComponent(error) }; }

    var success = p.get('oauth_success');
    if (success) { cleanOAuthParams(); return { type: 'success', message: decodeURIComponent(success) }; }

    if (p.get('oauth_link_required') === 'true') {
      var linkToken = p.get('link_token');
      var provider = p.get('provider');
      var email = p.get('email');
      if (linkToken && provider) {
        cleanOAuthParams();
        return { type: 'link_required', linkToken: linkToken, provider: provider, email: email };
      }
    }
    return null;
  }

  // The API is not perfectly consistent about nesting; pull the token /
  // customer out of whichever shape we got. Checks flat, .data, .session, etc.
  function pickToken(d) {
    if (!d) return '';
    return d.token ||
      (d.session && d.session.token) ||
      d.session_token || d.access_token ||
      (d.data && (d.data.token || (d.data.session && d.data.session.token) || d.data.session_token)) ||
      '';
  }
  function pickCustomer(d) {
    if (!d) return null;
    return d.customer || d.user || d.profile ||
      (d.data && (d.data.customer || d.data.user || d.data.profile)) ||
      null;
  }

  // ---- small view utils (ported) ----
  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function getInitials(name) {
    name = String(name || '').trim();
    if (!name) return '?';
    var parts = name.split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function formatDuration(seconds) {
    seconds = Math.max(0, Math.floor(seconds || 0));
    if (seconds <= 0) return '0s';
    var d = Math.floor(seconds / 86400);
    var h = Math.floor((seconds % 86400) / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = seconds % 60;
    var parts = [];
    if (d > 0) parts.push(d + 'd');
    if (h > 0) parts.push(h + 'h');
    if (m > 0) parts.push(m + 'm');
    if (s > 0 && d === 0 && h === 0) parts.push(s + 's');
    return parts.join(' ') || '0s';
  }

  function formatTime(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatDate(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  global.NenyooAuth = {
    API_BASE: API_BASE,
    PORTAL_KEY: PORTAL_KEY,
    DISCORD: DISCORD,
    getToken: getToken, setToken: setToken, clearToken: clearToken,
    api: api,
    pickToken: pickToken,
    pickCustomer: pickCustomer,
    startOAuth: startOAuth,
    handleOAuthCallback: handleOAuthCallback,
    escapeHtml: escapeHtml,
    getInitials: getInitials,
    formatDuration: formatDuration,
    formatTime: formatTime,
    formatDate: formatDate
  };
})(window);
