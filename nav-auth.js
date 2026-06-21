/* ===== Nenyoo — marketing-nav auth sync =====
   On any public page, if the visitor has a session token we swap the
   "Login / Get Access" buttons for a Profile pill that links to the
   dashboard. Self-contained (no auth.js needed): it reads the token and a
   cached {name, pic} that the dashboard writes on load. Stale cache is
   harmless — the dashboard re-validates the token on arrival. */
(function () {
  'use strict';
  var TOKEN_KEY = 'portalSessionToken';
  var PROFILE_KEY = 'nenyooProfile';

  function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  if (!getToken()) return; // logged out — leave the default buttons in place

  function getProfile() {
    try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}') || {}; } catch (e) { return {}; }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function initials(name) {
    name = String(name || '').trim();
    if (!name) return '·';
    var parts = name.split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function run() {
    var loginLink = document.querySelector('a[href="/login"]');
    if (!loginLink) return;                 // page has no marketing nav
    var group = loginLink.parentNode;
    var signupLink = group.querySelector('a[href="/signup"]');

    var prof = getProfile();
    var name = prof.name || 'Account';
    var pic = prof.pic || '';

    var avatar = pic
      ? '<span style="width:22px;height:22px;display:block;overflow:hidden;border:1px solid rgba(255,255,255,0.15);flex-shrink:0;"><img src="' + escapeHtml(pic) + '" alt="" style="width:100%;height:100%;object-fit:cover;display:block;"></span>'
      : '<span style="width:22px;height:22px;background:linear-gradient(180deg,#9a6cf3,#7c3aed);display:flex;align-items:center;justify-content:center;font-family:\'Space Grotesk\',sans-serif;font-weight:700;font-size:11px;color:#fff;flex-shrink:0;">' + escapeHtml(initials(name)) + '</span>';

    var pill = document.createElement('a');
    pill.href = '/dashboard';
    pill.title = 'Open dashboard';
    pill.style.cssText = 'cursor:pointer;display:flex;align-items:center;gap:9px;background:transparent;color:#ECEAF2;font-family:inherit;font-size:14px;font-weight:600;padding:8px 16px;';
    pill.innerHTML = avatar + '<span>' + escapeHtml(name) + '</span>';

    // Drop Login + Get Access, add the profile pill as the last nav item.
    loginLink.parentNode.removeChild(loginLink);
    if (signupLink) signupLink.parentNode.removeChild(signupLink);
    group.appendChild(pill);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
