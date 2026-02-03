// ==================== INFAMOUS COMMUNITY PORTAL ====================
// ProudlyAuthentication API Integration

// ==================== STATE ====================
let currentUser = null;
let sessionToken = localStorage.getItem('portalSessionToken') || '';
let currentCategoryId = null;
let currentThreadId = null;
let currentTicketId = null;
let pendingVerificationEmail = '';
let pendingResetEmail = '';
let chatRefreshInterval = null;
let currentConversationId = null;
let currentConvParticipant = null;
let currentUserCardUser = null;
let messagesRefreshInterval = null;
let currentAvatarUrl = '';
let memberSearchTimeout = null;
let usersCache = {};
let currentParentReplyId = null;
let currentParentReplyAuthor = null;
let subscriptionsCache = null; // Cache for subscriptions fetched from API
let cachedCategories = []; // Cache for forum categories (for reordering)
let oauthProviders = []; // OAuth providers enabled for this portal
let threadWatcherInterval = null; // Interval for thread watcher heartbeat
let badgeSystemEnabled = true; // Whether the badge system is enabled for this portal
const WATCHER_HEARTBEAT_MS = 30000; // Send heartbeat every 30 seconds

// ==================== CUSTOM DIALOG SYSTEM ====================
// Replaces native browser prompt() and confirm() with styled modals
let dialogResolve = null;

/**
 * Show a custom confirm dialog
 * @param {string} message - The confirmation message
 * @param {Object} options - Optional configuration
 * @returns {Promise<boolean>} - True if confirmed, false if cancelled
 */
async function showConfirm(message, options = {}) {
    return new Promise((resolve) => {
        dialogResolve = resolve;

        const {
            title = 'Confirm',
            icon = 'fa-question-circle',
            confirmText = 'Confirm',
            confirmIcon = 'fa-check',
            cancelText = 'Cancel',
            danger = false
        } = options;

        document.getElementById('dialogTitleText').textContent = title;
        document.getElementById('dialogIcon').className = `fas ${icon}`;
        document.getElementById('dialogMessage').textContent = message;
        document.getElementById('dialogInputContainer').style.display = 'none';
        document.getElementById('dialogOptionsContainer').style.display = 'none';
        document.getElementById('dialogConfirmText').textContent = confirmText;
        document.getElementById('dialogConfirmIcon').className = `fas ${confirmIcon}`;
        document.getElementById('dialogCancelBtn').textContent = cancelText;

        const confirmBtn = document.getElementById('dialogConfirmBtn');
        confirmBtn.className = danger ? 'btn btn-danger' : 'btn btn-primary';

        document.getElementById('dialogModal').classList.add('active');
        document.getElementById('dialogCancelBtn').focus();
    });
}

/**
 * Show a custom prompt dialog
 * @param {string} message - The prompt message
 * @param {Object} options - Optional configuration
 * @returns {Promise<string|null>} - The input value or null if cancelled
 */
async function showPrompt(message, options = {}) {
    return new Promise((resolve) => {
        dialogResolve = resolve;

        const {
            title = 'Input',
            icon = 'fa-edit',
            label = '',
            placeholder = '',
            defaultValue = '',
            confirmText = 'Submit',
            confirmIcon = 'fa-check',
            cancelText = 'Cancel'
        } = options;

        document.getElementById('dialogTitleText').textContent = title;
        document.getElementById('dialogIcon').className = `fas ${icon}`;
        document.getElementById('dialogMessage').textContent = message;
        document.getElementById('dialogInputContainer').style.display = 'block';
        document.getElementById('dialogOptionsContainer').style.display = 'none';
        document.getElementById('dialogInputLabel').textContent = label;

        const input = document.getElementById('dialogInput');
        input.placeholder = placeholder;
        input.value = defaultValue;

        document.getElementById('dialogConfirmText').textContent = confirmText;
        document.getElementById('dialogConfirmIcon').className = `fas ${confirmIcon}`;
        document.getElementById('dialogCancelBtn').textContent = cancelText;
        document.getElementById('dialogConfirmBtn').className = 'btn btn-primary';

        document.getElementById('dialogModal').classList.add('active');
        setTimeout(() => input.focus(), 100);
    });
}

/**
 * Show a custom choice dialog with multiple options
 * @param {string} message - The prompt message
 * @param {Array} choices - Array of {value, label} objects
 * @param {Object} options - Optional configuration
 * @returns {Promise<string|null>} - The selected value or null if cancelled
 */
async function showChoice(message, choices, options = {}) {
    return new Promise((resolve) => {
        dialogResolve = resolve;

        const {
            title = 'Choose Option',
            icon = 'fa-list',
            defaultValue = '',
            cancelText = 'Cancel'
        } = options;

        document.getElementById('dialogTitleText').textContent = title;
        document.getElementById('dialogIcon').className = `fas ${icon}`;
        document.getElementById('dialogMessage').textContent = message;
        document.getElementById('dialogInputContainer').style.display = 'none';

        const container = document.getElementById('dialogOptionsContainer');
        container.style.display = 'block';
        container.innerHTML = choices.map((choice, idx) => `
            <button class="btn btn-secondary choice-option" style="width: 100%; margin-bottom: 8px; text-align: left; padding: 12px 16px;"
                    onclick="selectChoice('${escapeHtml(choice.value || choice)}')" data-value="${escapeHtml(choice.value || choice)}">
                ${escapeHtml(choice.label || choice)}
            </button>
        `).join('');

        // Hide the confirm button for choice dialogs
        document.getElementById('dialogConfirmBtn').style.display = 'none';
        document.getElementById('dialogCancelBtn').textContent = cancelText;

        document.getElementById('dialogModal').classList.add('active');
    });
}

function selectChoice(value) {
    document.getElementById('dialogConfirmBtn').style.display = '';
    closeDialog(true, value);
}

function closeDialog(confirmed, choiceValue = null) {
    document.getElementById('dialogModal').classList.remove('active');
    document.getElementById('dialogConfirmBtn').style.display = '';

    if (dialogResolve) {
        const input = document.getElementById('dialogInput');
        const inputContainer = document.getElementById('dialogInputContainer');

        if (choiceValue !== null) {
            // Choice dialog
            dialogResolve(confirmed ? choiceValue : null);
        } else if (inputContainer.style.display !== 'none') {
            // Prompt dialog
            dialogResolve(confirmed ? input.value : null);
        } else {
            // Confirm dialog
            dialogResolve(confirmed);
        }
        dialogResolve = null;
    }
}

// ==================== SUBSCRIPTION CONFIGURATION ====================
// Fallback config used when API fails to load subscriptions
// Subscriptions are now fetched from the /subscriptions API endpoint
const SUBSCRIPTIONS_FALLBACK = [
    { key: '1', name: 'Subscription 1', description: 'Subscription type 1', image: '' },
    { key: '2', name: 'Subscription 2', description: 'Subscription type 2', image: '' },
    { key: '3', name: 'Subscription 3', description: 'Subscription type 3', image: '' },
];

// Fetch subscriptions from API and cache them
async function fetchSubscriptionsConfig() {
    // Return cached data if available
    if (subscriptionsCache !== null) {
        return subscriptionsCache;
    }

    try {
        const result = await api('GET', '/subscriptions');
        console.log('Subscriptions API response:', result);
        if (result.ok && result.data?.subscriptions && result.data.subscriptions.length > 0) {
            // Transform API response to match expected format
            subscriptionsCache = result.data.subscriptions.map(sub => ({
                key: sub.public_id,
                name: sub.display_name || sub.name || `Subscription ${sub.public_id}`,
                description: sub.description || '',
                image: sub.image || ''
            }));
            console.log('Loaded subscriptions from API:', subscriptionsCache);
            return subscriptionsCache;
        } else {
            console.warn('No subscriptions with public_id returned from API. Set public_id on subscriptions in admin panel.');
        }
    } catch (e) {
        console.warn('Failed to fetch subscriptions from API:', e);
    }

    // Return empty array if no subscriptions configured
    return [];
}

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', async () => {
    // Handle OAuth callback first (before other initialization)
    // This handles oauth_session, oauth_error, oauth_link_required query params
    const oauthHandled = await handleOAuthCallback();

    // Setup navigation
    document.querySelectorAll('.nav-tab').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = e.currentTarget.dataset.page;
            showPage(page);
        });
    });

    // Load portal info first
    await loadPortalInfo();

    // Check session (skip if OAuth callback already handled it)
    if (sessionToken && !oauthHandled) {
        await validateSession();
    }

    // Handle initial hash route
    handleHashRoute();

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashRoute);

    // Clean up thread watcher interval when leaving page
    // Note: Server automatically expires watchers after 5 minutes of inactivity
    window.addEventListener('beforeunload', () => {
        if (threadWatcherInterval) {
            clearInterval(threadWatcherInterval);
            threadWatcherInterval = null;
        }
    });
});

async function loadPortalInfo() {
    const result = await api('GET', '/info');

    if (result.ok && result.data.portal) {
        const portal = result.data.portal;

        // Update portal name
        if (portal.name) {
            document.getElementById('portalName').textContent = portal.name;
            document.title = portal.name + ' - Community Portal';
        }

        // Show banner if configured
        if (portal.banner && (portal.banner.title || portal.banner.image_url)) {
            const bannerEl = document.getElementById('portalBanner');
            const titleEl = document.getElementById('bannerTitle');
            const subtitleEl = document.getElementById('bannerSubtitle');
            const imageEl = document.getElementById('bannerImage');

            if (portal.banner.title) {
                titleEl.textContent = portal.banner.title;
                titleEl.style.display = '';
            } else {
                titleEl.style.display = 'none';
            }

            if (portal.banner.subtitle) {
                subtitleEl.textContent = portal.banner.subtitle;
                subtitleEl.style.display = '';
            } else {
                subtitleEl.style.display = 'none';
            }

            if (portal.banner.image_url) {
                imageEl.style.backgroundImage = `url(${portal.banner.image_url})`;
            }

            bannerEl.classList.add('active');
        }

        // Store settings
        window.portalSettings = portal.settings || {};

        // Show/hide Support tab
        const supportNav = document.getElementById('navSupport');
        if (portal.settings?.tickets_enabled !== false) {
            supportNav.style.display = '';
        }

        // Show social links
        const socialContainer = document.getElementById('socialLinks');
        const socialLinks = [];

        if (portal.settings?.discord_link) {
            socialLinks.push(`<a href="${escapeHtml(portal.settings.discord_link)}" target="_blank" rel="noopener" class="social-link" title="Discord"><i class="fab fa-discord"></i></a>`);
        }
        if (portal.settings?.twitter_link) {
            socialLinks.push(`<a href="${escapeHtml(portal.settings.twitter_link)}" target="_blank" rel="noopener" class="social-link" title="Twitter"><i class="fab fa-twitter"></i></a>`);
        }
        if (portal.settings?.youtube_link) {
            socialLinks.push(`<a href="${escapeHtml(portal.settings.youtube_link)}" target="_blank" rel="noopener" class="social-link" title="YouTube"><i class="fab fa-youtube"></i></a>`);
        }

        if (socialLinks.length > 0) {
            socialContainer.innerHTML = socialLinks.join('');
            socialContainer.style.display = 'flex';
        }

        // Store OAuth providers and render buttons
        oauthProviders = portal.oauth_providers || [];
        if (oauthProviders.length > 0) {
            renderOAuthButtons('loginOAuthButtons', 'loginOAuthDivider', 'login');
            renderOAuthButtons('registerOAuthButtons', 'registerOAuthDivider', 'register');
        }
    }
}

// ==================== API HELPERS ====================
function getApiUrl(endpoint) {
    const portalKey = document.getElementById('portalKey').value;
    let base = document.getElementById('apiUrl').value.trim();
    if (base.endsWith('/')) base = base.slice(0, -1);
    return `${base}/api/portal/v1/${portalKey}${endpoint}`;
}

function getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
    }
    return headers;
}

async function api(method, endpoint, body = null) {
    const url = getApiUrl(endpoint);
    const options = {
        method,
        headers: getHeaders()
    };
    if (body && method !== 'GET') {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(url, options);
        const data = await response.json();
        return { ok: response.ok, status: response.status, data };
    } catch (error) {
        console.error(`API error: ${error.message}`);
        return { ok: false, status: 0, data: { message: error.message } };
    }
}

// ==================== HASH ROUTING ====================
let skipHashUpdate = false;

function handleHashRoute() {
    const hash = window.location.hash.slice(1);
    if (!hash) {
        showPage('forum', false);
        return;
    }

    const parts = hash.split('/');
    const route = parts[0];
    const id = parts[1];

    skipHashUpdate = true;

    switch (route) {
        case 'forum':
            showPage('forum', false);
            break;
        case 'category':
            if (id) {
                currentCategoryId = parseInt(id);
                showPage('category', false);
                loadCategoryThreads(currentCategoryId);
            }
            break;
        case 'thread':
            if (id) {
                currentThreadId = parseInt(id);
                showPage('thread', false);
                loadThread(currentThreadId);
            }
            break;
        case 'profile':
            if (id) {
                showUserCardById(parseInt(id));
            } else {
                showPage('profile', false);
            }
            break;
        case 'user':
            if (id) {
                showUserCardById(parseInt(id));
            }
            break;
        case 'chat':
            showPage('chat', false);
            break;
        case 'messages':
            showPage('messages', false);
            break;
        case 'conversation':
            if (id) {
                currentConversationId = id;
                showPage('conversation', false);
            }
            break;
        case 'support':
            if (window.portalSettings?.tickets_enabled === false) {
                showPage('forum', false);
            } else {
                showPage('support', false);
            }
            break;
        case 'ticket':
            if (window.portalSettings?.tickets_enabled === false) {
                showPage('forum', false);
            } else if (id) {
                currentTicketId = parseInt(id);
                showPage('ticket', false);
                loadTicketDetail(currentTicketId);
            }
            break;
        case 'members':
            showPage('members', false);
            break;
        case 'search':
            if (id) {
                const searchQuery = decodeURIComponent(id);
                document.getElementById('globalSearchInput').value = searchQuery;
                document.getElementById('searchClearBtn').style.display = '';
                showPage('search', false);
                performSearch();
            } else {
                showPage('forum', false);
            }
            break;
        case 'login':
            showPage('login', false);
            break;
        case 'register':
            showPage('register', false);
            break;
        case 'forgot-password':
            showPage('forgot-password', false);
            break;
        case 'reset-password':
            showPage('reset-password', false);
            break;
        case 'reports':
            showPage('reports', false);
            break;
        case 'badges':
            showPage('badges', false);
            break;
        default:
            showPage('forum', false);
    }

    skipHashUpdate = false;
}

function updateHash(hash) {
    if (!skipHashUpdate) {
        history.pushState(null, '', '#' + hash);
    }
}

// ==================== PAGE NAVIGATION ====================
function showPage(page, updateUrl = true) {
    // Clear intervals
    if (chatRefreshInterval) {
        clearInterval(chatRefreshInterval);
        chatRefreshInterval = null;
    }
    if (messagesRefreshInterval) {
        clearInterval(messagesRefreshInterval);
        messagesRefreshInterval = null;
    }

    // Stop watching thread if navigating away from thread page
    if (page !== 'thread') {
        stopWatchingThread();
    }

    // Hide all pages
    document.querySelectorAll('.page-view').forEach(view => {
        view.classList.remove('active');
    });

    // Update nav tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.page === page ||
            (page === 'category' && tab.dataset.page === 'forum') ||
            (page === 'thread' && tab.dataset.page === 'forum') ||
            (page === 'conversation' && tab.dataset.page === 'messages') ||
            (page === 'ticket' && tab.dataset.page === 'support')) {
            tab.classList.add('active');
        }
    });

    // Show requested page
    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) {
        pageEl.classList.add('active');
    }

    // Update URL hash
    if (updateUrl) {
        updateHash(page);
    }

    // Load page data
    switch (page) {
        case 'forum':
            loadCategories();
            break;
        case 'chat':
            if (!currentUser) {
                showPage('login');
                return;
            }
            loadChat();
            break;
        case 'messages':
            if (!currentUser) {
                showPage('login');
                return;
            }
            loadConversations();
            break;
        case 'conversation':
            if (!currentUser) {
                showPage('login');
                return;
            }
            loadConversation(currentConversationId);
            break;
        case 'support':
            if (!currentUser) {
                showPage('login');
                return;
            }
            loadTickets();
            break;
        case 'members':
            if (!currentUser) {
                showPage('login');
                return;
            }
            loadOnlineMembers();
            break;
        case 'profile':
            if (!currentUser) {
                showPage('login');
                return;
            }
            loadProfile();
            break;
        case 'reports':
            if (!currentUser || !isPortalModerator()) {
                showPage('forum');
                return;
            }
            loadReports();
            break;
        case 'badges':
            loadAllBadges();
            break;
    }
}

// ==================== AUTHENTICATION ====================
async function validateSession() {
    const result = await api('GET', '/auth/session');
    if (result.ok && result.data.valid) {
        currentUser = result.data.customer;
        updateUIForUser();
    } else {
        sessionToken = '';
        localStorage.removeItem('portalSessionToken');
        currentUser = null;
        updateUIForGuest();
    }
}

async function login() {
    const username = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!username || !password) {
        showAlert('loginAlert', 'Please enter username and password', 'danger');
        return;
    }

    const btn = document.querySelector('#page-login .btn-primary');
    setButtonLoading(btn, true);

    const result = await api('POST', '/auth/login', { username, password });

    setButtonLoading(btn, false, '<i class="fas fa-sign-in-alt"></i> Sign In');

    if (result.ok) {
        if (result.data.requires_verification) {
            pendingVerificationEmail = username;
            showPage('verify');
            showAlert('verifyAlert', 'Please check your email for verification code', 'info');
        } else if (result.data.session?.token) {
            sessionToken = result.data.session.token;
            localStorage.setItem('portalSessionToken', sessionToken);
            currentUser = result.data.customer;
            updateUIForUser();
            showPage('forum');
            showToast('Welcome back!', 'success');
        }
    } else {
        // Check if email verification is required (user registered but didn't verify)
        if (result.data.verification_required || result.data.error_code === 'EMAIL_NOT_VERIFIED') {
            pendingVerificationEmail = username;
            showPage('verify');
            showAlert('verifyAlert', 'Please verify your email to continue. Enter the code sent to your email or request a new one.', 'info');
        } else {
            showAlert('loginAlert', result.data.message || 'Login failed', 'danger');
        }
    }
}

async function register() {
    const username = document.getElementById('registerUsername').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const passwordConfirm = document.getElementById('registerPasswordConfirm').value;

    if (!username || !email || !password) {
        showAlert('registerAlert', 'Please fill in all fields', 'danger');
        return;
    }

    if (password !== passwordConfirm) {
        showAlert('registerAlert', 'Passwords do not match', 'danger');
        return;
    }

    if (password.length < 8) {
        showAlert('registerAlert', 'Password must be at least 8 characters', 'danger');
        return;
    }

    const btn = document.querySelector('#page-register .btn-primary');
    setButtonLoading(btn, true);

    const result = await api('POST', '/auth/register', { username, email, password });

    setButtonLoading(btn, false, '<i class="fas fa-user-plus"></i> Create Account');

    if (result.ok) {
        pendingVerificationEmail = email;
        showPage('verify');
        showToast('Account created! Please verify your email.', 'success');

        // Show debug code if present (dev mode)
        if (result.data.debug_code) {
            setTimeout(() => {
                showAlert('verifyAlert', 'Dev mode - Code: ' + result.data.debug_code, 'info');
            }, 500);
        }
    } else {
        showAlert('registerAlert', result.data.message || 'Registration failed', 'danger');
    }
}

async function verifyEmail() {
    const code = document.getElementById('verifyCode').value.trim();

    if (!code) {
        showAlert('verifyAlert', 'Please enter the verification code', 'danger');
        return;
    }

    // Send as email if it contains @, otherwise as username
    const verifyBody = { code };
    if (pendingVerificationEmail.includes('@')) {
        verifyBody.email = pendingVerificationEmail;
    } else {
        verifyBody.username = pendingVerificationEmail;
    }

    const btn = document.querySelector('#page-verify .btn-primary');
    setButtonLoading(btn, true);

    const result = await api('POST', '/auth/register/verify', verifyBody);

    setButtonLoading(btn, false, '<i class="fas fa-check"></i> Verify');

    if (result.ok) {
        showToast('Email verified! You can now log in.', 'success');
        showPage('login');
    } else {
        showAlert('verifyAlert', result.data.message || 'Verification failed', 'danger');
    }
}

async function resendVerification() {
    // Send as email if it contains @, otherwise as username
    const resendBody = {};
    if (pendingVerificationEmail.includes('@')) {
        resendBody.email = pendingVerificationEmail;
    } else {
        resendBody.username = pendingVerificationEmail;
    }

    const btn = document.querySelector('#page-verify .btn-secondary');
    setButtonLoading(btn, true);

    const result = await api('POST', '/auth/register/resend', resendBody);

    setButtonLoading(btn, false, '<i class="fas fa-redo"></i> Resend Code');

    if (result.ok) {
        showToast('Verification email sent!', 'success');
        if (result.data.debug_code) {
            showAlert('verifyAlert', 'Dev mode - Code: ' + result.data.debug_code, 'info');
        }
    } else {
        showAlert('verifyAlert', result.data.message || 'Failed to resend code', 'danger');
    }
}

async function requestPasswordReset() {
    const identifier = document.getElementById('forgotPasswordIdentifier')?.value.trim() || pendingResetEmail;

    if (!identifier) {
        showAlert('forgotPasswordAlert', 'Please enter your email or username', 'danger');
        return;
    }

    pendingResetEmail = identifier;

    // Send as email if it contains @, otherwise as username
    const body = identifier.includes('@') ? { email: identifier } : { username: identifier };

    const btn = document.querySelector('#page-forgot-password .btn-primary');
    setButtonLoading(btn, true);

    const result = await api('POST', '/auth/password-reset/request', body);

    setButtonLoading(btn, false, '<i class="fas fa-envelope"></i> Send Reset Code');

    if (result.ok) {
        showPage('reset-password');
        showToast('Reset code sent!', 'success');

        // Show debug code if present (dev mode)
        if (result.data.debug_code) {
            setTimeout(() => {
                showAlert('resetPasswordAlert', 'Dev mode - Code: ' + result.data.debug_code, 'info');
            }, 500);
        }
    } else {
        showAlert('forgotPasswordAlert', result.data.message || 'Failed to send reset code', 'danger');
    }
}

async function confirmPasswordReset() {
    const code = document.getElementById('resetPasswordCode').value.trim();
    const new_password = document.getElementById('resetPasswordNew').value;

    if (!code) {
        showAlert('resetPasswordAlert', 'Please enter the reset code', 'danger');
        return;
    }

    if (!new_password) {
        showAlert('resetPasswordAlert', 'Please enter a new password', 'danger');
        return;
    }

    // Build body with email or username based on what was stored
    const body = {
        code,
        new_password,
        email: pendingResetEmail.includes('@') ? pendingResetEmail : undefined,
        username: !pendingResetEmail.includes('@') ? pendingResetEmail : undefined
    };

    const btn = document.querySelector('#page-reset-password .btn-primary');
    setButtonLoading(btn, true);

    const result = await api('POST', '/auth/password-reset/confirm', body);

    setButtonLoading(btn, false, '<i class="fas fa-key"></i> Reset Password');

    if (result.ok) {
        showToast('Password reset successfully!', 'success');
        pendingResetEmail = '';
        showPage('login');
    } else {
        showAlert('resetPasswordAlert', result.data.message || 'Failed to reset password', 'danger');
    }
}

async function logout() {
    await api('POST', '/auth/logout');
    sessionToken = '';
    localStorage.removeItem('portalSessionToken');
    currentUser = null;
    updateUIForGuest();
    showPage('forum');
    showToast('Logged out successfully', 'success');
}

function updateUIForUser() {
    document.getElementById('guestActions').style.display = 'none';
    document.getElementById('userDropdown').style.display = 'flex';
    document.getElementById('navMessages').style.display = '';
    document.getElementById('notificationBell').style.display = '';

    if (window.portalSettings?.tickets_enabled !== false) {
        document.getElementById('navSupport').style.display = '';
    }

    // Show reports tab for moderators and load pending count
    if (isPortalModerator()) {
        document.getElementById('navReports').style.display = '';
        loadPendingReportsCount();
    }

    // Check badge system status and update visibility
    checkBadgeSystemStatus();

    // Update header
    document.getElementById('headerUsername').textContent = currentUser.display_name || currentUser.username;
    const avatarEl = document.getElementById('headerAvatar');
    if (currentUser.profile_picture) {
        avatarEl.innerHTML = `<img src="${escapeHtml(currentUser.profile_picture)}" alt="Avatar">`;
    } else {
        avatarEl.textContent = getInitials(currentUser.display_name || currentUser.username);
    }

    // Load notification count
    loadUnreadNotificationCount();
}

function updateUIForGuest() {
    document.getElementById('guestActions').style.display = 'flex';
    document.getElementById('userDropdown').style.display = 'none';
    document.getElementById('navMessages').style.display = 'none';
    document.getElementById('notificationBell').style.display = 'none';
    document.getElementById('notificationsPanel').style.display = 'none';
    document.getElementById('navReports').style.display = 'none';
}

// ==================== OAUTH ====================

/**
 * Render OAuth provider buttons in a container
 * @param {string} containerId - ID of the container element
 * @param {string} dividerId - ID of the divider element
 * @param {string} action - 'login', 'register', or 'link'
 */
function renderOAuthButtons(containerId, dividerId, action) {
    const container = document.getElementById(containerId);
    const divider = document.getElementById(dividerId);

    if (!container || !oauthProviders || oauthProviders.length === 0) {
        return;
    }

    const buttons = oauthProviders.map(provider => {
        const actionText = action === 'login' ? 'Sign in' : action === 'register' ? 'Sign up' : 'Link';
        return `
            <button class="btn-oauth" onclick="startOAuth('${escapeHtml(provider.name)}', '${action}')" style="--provider-color: ${escapeHtml(provider.color)}">
                <i class="${escapeHtml(provider.icon)}"></i>
                <span>${actionText} with ${escapeHtml(provider.display_name)}</span>
            </button>
        `;
    }).join('');

    container.innerHTML = buttons;
    container.style.display = 'flex';

    if (divider) {
        divider.style.display = 'flex';
    }
}

/**
 * Initiate OAuth flow by redirecting to the authorize endpoint
 * @param {string} provider - Provider name (e.g., 'discord', 'google')
 * @param {string} action - 'login', 'register', or 'link'
 */
function startOAuth(provider, action) {
    const portalKey = document.getElementById('portalKey').value;
    let base = document.getElementById('apiUrl').value.trim();
    if (base.endsWith('/')) base = base.slice(0, -1);

    // Build redirect URI to return to current page
    const currentUrl = window.location.href.split('?')[0].split('#')[0];
    const redirectUri = encodeURIComponent(currentUrl + '?portal_key=' + portalKey);

    // Build authorize URL
    let authUrl = `${base}/api/portal/v1/${portalKey}/auth/oauth/${provider}/authorize?action=${action}&redirect_uri=${redirectUri}`;

    // For link action, include session token
    if (action === 'link' && sessionToken) {
        authUrl += `&session_token=${encodeURIComponent(sessionToken)}`;
    }

    // Redirect to OAuth provider
    window.location.href = authUrl;
}

/**
 * Handle OAuth callback by processing URL hash parameters
 * Called on page load to handle oauth_session, oauth_error, oauth_link_required
 * @returns {boolean} True if OAuth callback was handled
 */
async function handleOAuthCallback() {
    // Read from hash fragment (e.g., #oauth_session=xxx)
    const hash = window.location.hash.substring(1); // Remove the '#'
    if (!hash) return false;

    const urlParams = new URLSearchParams(hash);

    // Check for OAuth session token (successful OAuth login)
    const oauthSession = urlParams.get('oauth_session');
    if (oauthSession) {
        // Store session and validate
        sessionToken = oauthSession;
        localStorage.setItem('portalSessionToken', sessionToken);

        // Clean URL
        cleanOAuthParams();

        // Validate session and update UI
        await validateSession();
        showToast('Successfully signed in', 'success');
        showPage('forum');
        return true;
    }

    // Check for OAuth error
    const oauthError = urlParams.get('oauth_error');
    if (oauthError) {
        cleanOAuthParams();
        showToast(decodeURIComponent(oauthError), 'error');
        showPage('login');
        return true;
    }

    // Check for OAuth success message (e.g., account linked)
    const oauthSuccess = urlParams.get('oauth_success');
    if (oauthSuccess) {
        cleanOAuthParams();
        showToast(decodeURIComponent(oauthSuccess), 'success');
        // Refresh session to update UI (user was already logged in, just linked account)
        if (sessionToken) {
            await validateSession();
        }
        return true;
    }

    // Check for OAuth link required (email matches existing account)
    const linkRequired = urlParams.get('oauth_link_required');
    if (linkRequired === 'true') {
        const linkToken = urlParams.get('link_token');
        const provider = urlParams.get('provider');
        const email = urlParams.get('email');

        if (linkToken && provider) {
            cleanOAuthParams();
            showOAuthLinkModal(provider, email, linkToken);
            return true;
        }
    }

    return false;
}

/**
 * Clean OAuth-related hash parameters from URL
 */
function cleanOAuthParams() {
    // Remove the hash fragment entirely for a clean URL
    const url = new URL(window.location.href);
    url.hash = '';
    window.history.replaceState({}, document.title, url.pathname + url.search);
}

/**
 * Show the OAuth link confirmation modal
 * @param {string} provider - Provider name
 * @param {string} email - Email address from OAuth
 * @param {string} linkToken - Token for confirming the link
 */
function showOAuthLinkModal(provider, email, linkToken) {
    document.getElementById('oauthLinkProvider').textContent = provider;
    document.getElementById('oauthLinkToken').value = linkToken;
    document.getElementById('oauthLinkPassword').value = '';
    document.getElementById('oauthLinkAlert').innerHTML = '';

    const message = email
        ? `An account with email <strong>${escapeHtml(decodeURIComponent(email))}</strong> already exists. Enter your password to link your ${escapeHtml(provider)} account.`
        : `An account with this email already exists. Enter your password to link your ${escapeHtml(provider)} account.`;
    document.getElementById('oauthLinkMessage').innerHTML = message;

    document.getElementById('oauthLinkModal').classList.add('active');
    document.getElementById('oauthLinkPassword').focus();
}

/**
 * Close the OAuth link confirmation modal
 */
function closeOAuthLinkModal() {
    document.getElementById('oauthLinkModal').classList.remove('active');
}

/**
 * Confirm OAuth account link with password
 */
async function confirmOAuthLink() {
    const linkToken = document.getElementById('oauthLinkToken').value;
    const password = document.getElementById('oauthLinkPassword').value;

    if (!password) {
        showAlert('oauthLinkAlert', 'Please enter your password', 'error');
        return;
    }

    const result = await api('POST', '/auth/oauth/link', {
        link_token: linkToken,
        password: password
    });

    if (result.ok) {
        closeOAuthLinkModal();

        // Store session token
        if (result.data.session?.token) {
            sessionToken = result.data.session.token;
            localStorage.setItem('portalSessionToken', sessionToken);
        }

        // Update current user
        if (result.data.customer) {
            currentUser = result.data.customer;
            updateUIForUser();
        }

        showToast('Account linked successfully', 'success');
        showPage('forum');
    } else {
        showAlert('oauthLinkAlert', result.data.message || 'Failed to link account', 'error');
    }
}

/**
 * Get OAuth status for current user
 * @returns {Promise<Object>} OAuth status with links and available providers
 */
async function getOAuthStatus() {
    const result = await api('GET', '/auth/oauth/status');
    if (result.ok) {
        return result.data;
    }
    return { links: [], available_providers: [], has_password: true, can_unlink: true };
}

/**
 * Link a new OAuth provider to current account
 * @param {string} provider - Provider name to link
 */
function linkOAuthAccount(provider) {
    startOAuth(provider, 'link');
}

/**
 * Unlink an OAuth provider from current account
 * @param {string} provider - Provider name to unlink
 */
async function unlinkOAuthAccount(provider) {
    const confirmed = await showConfirm(`Are you sure you want to unlink your ${provider} account? You will no longer be able to log in using ${provider}.`, {
        title: 'Unlink Account',
        icon: 'fa-unlink',
        confirmText: 'Unlink',
        confirmIcon: 'fa-unlink',
        danger: true
    });
    if (!confirmed) return;

    const result = await api('POST', '/auth/oauth/unlink', { provider });

    if (result.ok) {
        showToast(`${provider} account unlinked`, 'success');
        // Refresh OAuth status display if on profile page
        if (document.getElementById('page-profile').classList.contains('active')) {
            loadOAuthStatusForProfile();
        }
    } else {
        showToast(result.data.message || 'Failed to unlink account', 'error');
    }
}

/**
 * Load and display OAuth status in profile page
 */
async function loadOAuthStatusForProfile() {
    const section = document.getElementById('profileOAuthStatus');
    if (!section) return;

    const cardBody = section.querySelector('.card-body');
    if (!cardBody) return;

    const status = await getOAuthStatus();

    if (oauthProviders.length === 0 && status.links.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';

    // Build linked accounts list
    const linkedProviders = new Set(status.links.map(l => l.provider));
    const allProviders = [...new Set([...oauthProviders.map(p => p.name), ...linkedProviders])];

    let html = '<div class="oauth-status-list">';

    for (const providerName of allProviders) {
        const link = status.links.find(l => l.provider === providerName);
        const providerInfo = oauthProviders.find(p => p.name === providerName) || {
            name: providerName,
            display_name: providerName.charAt(0).toUpperCase() + providerName.slice(1),
            icon: 'fas fa-link',
            color: '#666'
        };

        if (link) {
            // Provider is linked
            html += `
                <div class="oauth-status-item oauth-linked">
                    <div class="oauth-provider-info">
                        <i class="${escapeHtml(providerInfo.icon)}" style="color: ${escapeHtml(providerInfo.color)}"></i>
                        <span>${escapeHtml(providerInfo.display_name)}</span>
                    </div>
                    <div class="oauth-link-info">
                        <span class="oauth-linked-badge"><i class="fas fa-check"></i> Linked</span>
                        ${status.can_unlink ? `<button class="btn btn-sm btn-secondary" onclick="unlinkOAuthAccount('${escapeHtml(providerName)}')">Unlink</button>` : ''}
                    </div>
                </div>
            `;
        } else if (oauthProviders.find(p => p.name === providerName)) {
            // Provider is available but not linked
            html += `
                <div class="oauth-status-item">
                    <div class="oauth-provider-info">
                        <i class="${escapeHtml(providerInfo.icon)}" style="color: ${escapeHtml(providerInfo.color)}"></i>
                        <span>${escapeHtml(providerInfo.display_name)}</span>
                    </div>
                    <div class="oauth-link-info">
                        <button class="btn btn-sm btn-primary" onclick="linkOAuthAccount('${escapeHtml(providerName)}')">
                            <i class="fas fa-link"></i> Link
                        </button>
                    </div>
                </div>
            `;
        }
    }

    html += '</div>';

    if (!status.has_password && status.links.length === 1) {
        html += '<p class="oauth-warning"><i class="fas fa-exclamation-triangle"></i> Set a password before unlinking your only OAuth account.</p>';
    }

    cardBody.innerHTML = html;
}

// ==================== FORUM - CATEGORIES ====================
async function loadCategories() {
    const container = document.getElementById('categoryList');
    container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading forums...</div>';

    const result = await api('GET', '/forum/categories');

    if (result.ok) {
        const categories = result.data.categories || [];
        cachedCategories = categories; // Cache for reordering

        let html = '';

        // Admin toolbar for creating categories
        if (isPortalAdmin()) {
            html += `
                <div class="admin-toolbar">
                    <button class="btn btn-primary" onclick="showCreateCategoryModal()">
                        <i class="fas fa-plus"></i> Create Category
                    </button>
                </div>
            `;
        }

        if (categories.length === 0) {
            html += '<div class="empty-state"><i class="fas fa-comments"></i><h3>No Forums</h3><p>No forum categories have been created yet.</p></div>';
            container.innerHTML = html;
            return;
        }

        html += '<div class="node-list">';
        for (let i = 0; i < categories.length; i++) {
            const category = categories[i];
            const isFirst = i === 0;
            const isLast = i === categories.length - 1;

            // Admin edit/delete/move buttons (stopPropagation to prevent opening category)
            const adminActions = isPortalAdmin() ? `
                <div class="node-admin-actions" onclick="event.stopPropagation()">
                    <button class="admin-action-btn" onclick="moveCategoryUp(${category.id})" title="Move Up" ${isFirst ? 'disabled' : ''}>
                        <i class="fas fa-arrow-up"></i>
                    </button>
                    <button class="admin-action-btn" onclick="moveCategoryDown(${category.id})" title="Move Down" ${isLast ? 'disabled' : ''}>
                        <i class="fas fa-arrow-down"></i>
                    </button>
                    <button class="admin-action-btn" onclick="showEditCategoryModal(${category.id}, '${escapeHtml(category.name).replace(/'/g, "\\'")}', '${escapeHtml(category.description || '').replace(/'/g, "\\'")}')" title="Edit Category">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="admin-action-btn" onclick="deleteCategory(${category.id})" title="Delete Category">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            ` : '';

            html += `
                <div class="node-item" onclick="openCategory(${category.id})">
                    <div class="node-icon">
                        <i class="fas fa-${category.icon || 'comments'}"></i>
                    </div>
                    <div class="node-main">
                        <div class="node-title">${escapeHtml(category.name)}</div>
                        <div class="node-description">${escapeHtml(category.description || '')}</div>
                    </div>
                    <div class="node-stats">
                        <div>
                            <span class="node-stat-value">${category.thread_count || 0}</span>
                            Threads
                        </div>
                        <div>
                            <span class="node-stat-value">${category.post_count || 0}</span>
                            Posts
                        </div>
                    </div>
                    ${adminActions}
                </div>
            `;
        }
        html += '</div>';
        container.innerHTML = html;
    } else {
        // Check for login/membership required errors
        const errorCode = result.data.error_code;
        if (errorCode === 'LOGIN_REQUIRED') {
            showPage('login');
            return;
        } else if (errorCode === 'MEMBERSHIP_REQUIRED') {
            showRedeemKeyModal();
            return;
        }
        container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><h3>Error</h3><p>' + escapeHtml(result.data.message || 'Failed to load forums.') + '</p></div>';
    }

    // Also load recent activity
    loadRecentActivity();
}

async function loadRecentActivity() {
    const container = document.getElementById('recentActivityList');
    if (!container) return;

    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    const result = await api('GET', '/forum/recent-activity?limit=10');

    if (result.ok && result.data.activities) {
        const activities = result.data.activities;

        if (activities.length === 0) {
            container.innerHTML = '<div class="activity-empty">No recent activity</div>';
            return;
        }

        let html = '<div class="activity-list">';
        for (const activity of activities) {
            const timeAgo = formatTimeAgo(activity.created_at);

            if (activity.type === 'thread') {
                html += `
                    <div class="activity-item" onclick="openThread(${activity.id})">
                        <div class="activity-icon thread-icon"><i class="fas fa-comment-alt"></i></div>
                        <div class="activity-content">
                            <div class="activity-title">${escapeHtml(activity.title)}</div>
                            <div class="activity-meta">
                                <span class="activity-author">${escapeHtml(activity.author_name)}</span>
                                <span class="activity-time">${timeAgo}</span>
                            </div>
                        </div>
                    </div>
                `;
            } else if (activity.type === 'reply') {
                html += `
                    <div class="activity-item" onclick="openThread(${activity.thread_id})">
                        <div class="activity-icon reply-icon"><i class="fas fa-reply"></i></div>
                        <div class="activity-content">
                            <div class="activity-title">Re: ${escapeHtml(activity.thread_title)}</div>
                            <div class="activity-meta">
                                <span class="activity-author">${escapeHtml(activity.author_name)}</span>
                                <span class="activity-time">${timeAgo}</span>
                            </div>
                        </div>
                    </div>
                `;
            } else if (activity.type === 'member_joined') {
                const userId = activity.id;
                const avatar = activity.avatar
                    ? `<img src="${escapeHtml(activity.avatar)}" alt="Avatar" onerror="this.parentElement.innerHTML='${getInitials(activity.display_name)}'">`
                    : getInitials(activity.display_name);
                html += `
                    <div class="activity-item" onclick="showUserCardById(${userId})">
                        <div class="activity-icon member-icon"><i class="fas fa-user-plus"></i></div>
                        <div class="activity-content">
                            <div class="activity-title">${escapeHtml(activity.display_name)} joined</div>
                            <div class="activity-meta">
                                <span class="activity-author">New member</span>
                                <span class="activity-time">${timeAgo}</span>
                            </div>
                        </div>
                    </div>
                `;
            } else if (activity.type === 'badge_awarded') {
                const userId = activity.user_id;
                html += `
                    <div class="activity-item" onclick="showUserCardById(${userId})">
                        <div class="activity-icon badge-icon"><i class="fas fa-award"></i></div>
                        <div class="activity-content">
                            <div class="activity-title">${escapeHtml(activity.display_name)} earned ${escapeHtml(activity.badge_name)}</div>
                            <div class="activity-meta">
                                <span class="activity-author">Badge awarded</span>
                                <span class="activity-time">${timeAgo}</span>
                            </div>
                        </div>
                    </div>
                `;
            }
        }
        html += '</div>';
        container.innerHTML = html;
    } else {
        container.innerHTML = '<div class="activity-empty">Failed to load activity</div>';
    }
}

function formatTimeAgo(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}

function openCategory(categoryId) {
    currentCategoryId = categoryId;
    updateHash(`category/${categoryId}`);
    showPage('category', false);
    loadCategoryThreads(categoryId);
}

async function loadCategoryThreads(categoryId) {
    const container = document.getElementById('threadList');
    container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading threads...</div>';

    // Load category info
    const catResult = await api('GET', '/forum/categories');
    if (catResult.ok) {
        const categories = catResult.data.categories || [];
        // Use == for comparison to handle string/number type differences
        const category = categories.find(c => c.id == categoryId);
        if (category) {
            document.getElementById('categoryTitle').textContent = category.name;
            document.getElementById('categoryDescription').textContent = category.description || '';
            document.getElementById('categoryBreadcrumb').textContent = category.name;
        }
    }

    // Show create thread button if logged in
    document.getElementById('createThreadBtn').style.display = currentUser ? '' : 'none';

    // Load threads
    const result = await api('GET', `/forum/categories/${categoryId}/threads`);

    if (result.ok && result.data.threads) {
        if (result.data.threads.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-comments"></i><h3>No Threads</h3><p>Be the first to start a discussion!</p></div>';
            return;
        }

        let html = '';
        for (const thread of result.data.threads) {
            // API returns author_name, author_id, author_avatar directly on thread
            const authorId = thread.author_id || thread.author?.id;
            const authorName = thread.author_name || thread.author?.display_name || thread.author?.username || 'Unknown';
            const authorAvatar = thread.author_avatar || thread.author?.avatar || thread.author?.profile_picture || '';

            // Cache user data
            if (authorId) {
                usersCache[authorId] = {
                    id: authorId,
                    username: authorName,
                    display_name: authorName,
                    avatar: authorAvatar,
                    role: thread.author_role || thread.author?.role || ''
                };
            }

            const avatar = authorAvatar
                ? `<img src="${escapeHtml(authorAvatar)}" alt="Avatar" onerror="this.parentElement.textContent='${getInitials(authorName)}'">`
                : getInitials(authorName);

            const isPinned = thread.is_pinned;
            const pinType = thread.pin_type || (isPinned ? 'pinned' : 'none');
            const isAnnouncement = pinType === 'announcement';
            const threadRowClass = isAnnouncement ? 'thread-row thread-announcement' : (isPinned ? 'thread-row thread-pinned' : 'thread-row');

            let pinIndicator = '';
            if (isAnnouncement) {
                pinIndicator = '<span class="thread-pin-badge announcement"><i class="fas fa-bullhorn"></i> Announcement</span>';
            } else if (isPinned) {
                pinIndicator = '<span class="thread-pin-badge pinned"><i class="fas fa-thumbtack"></i> Pinned</span>';
            }

            html += `
                <div class="${threadRowClass}">
                    <div class="thread-icon" onclick="showUserCardById('${authorId}'); event.stopPropagation();" style="cursor: pointer;" title="View Profile">
                        ${typeof avatar === 'string' && avatar.startsWith('<img') ? avatar : avatar}
                    </div>
                    <div class="thread-main">
                        <a class="thread-title-link" onclick="openThread(${thread.id})">${escapeHtml(thread.title)}</a>
                        ${pinIndicator}
                        <div class="thread-meta">
                            by <a onclick="showUserCardById('${authorId}'); event.stopPropagation();" style="cursor: pointer;">${escapeHtml(authorName)}</a>
                            &bull; ${formatDate(thread.created_at)}
                        </div>
                    </div>
                    <div class="thread-stats">
                        <div>
                            <strong>${thread.replies_count || thread.reply_count || 0}</strong>
                            Replies
                        </div>
                        <div>
                            <strong>${thread.views_count || thread.view_count || 0}</strong>
                            Views
                        </div>
                    </div>
                    <div class="thread-latest">
                        ${thread.last_post ? `
                            <a onclick="showUserCardById('${thread.last_post.author_id || thread.last_post.author?.id}')" style="cursor: pointer;">${escapeHtml(thread.last_post.author_name || thread.last_post.author?.display_name || thread.last_post.author?.username || 'Unknown')}</a><br>
                            ${formatDate(thread.last_post.created_at)}
                        ` : '-'}
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
    } else {
        // Check for login/membership required errors
        const errorCode = result.data.error_code;
        if (errorCode === 'LOGIN_REQUIRED') {
            showPage('login');
            return;
        } else if (errorCode === 'MEMBERSHIP_REQUIRED') {
            showRedeemKeyModal();
            return;
        }
        container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><h3>Error</h3><p>' + escapeHtml(result.data.message || 'Failed to load threads.') + '</p></div>';
    }
}

// ==================== FORUM - THREADS ====================
function openThread(threadId) {
    currentThreadId = threadId;
    updateHash(`thread/${threadId}`);
    showPage('thread', false);
    loadThread(threadId);
}

async function likeThread(threadId) {
    if (!currentUser) {
        showToast('Please login to like posts', 'warning');
        return;
    }
    const result = await api('POST', `/forum/threads/${threadId}/like`);
    if (result.ok) {
        loadThread(threadId);
    } else {
        showToast(result.data?.message || 'Failed to like', 'error');
    }
}

async function likeReply(threadId, replyId) {
    if (!currentUser) {
        showToast('Please login to like posts', 'warning');
        return;
    }
    const result = await api('POST', `/forum/threads/${threadId}/replies/${replyId}/like`);
    if (result.ok) {
        loadThread(threadId);
    } else {
        showToast(result.data?.message || 'Failed to like', 'error');
    }
}

// Reaction types with their icons
const REACTION_TYPES = {
    'like': { icon: 'fa-thumbs-up', label: 'Like', emoji: '👍' },
    'love': { icon: 'fa-heart', label: 'Love', emoji: '❤️' },
    'helpful': { icon: 'fa-lightbulb', label: 'Helpful', emoji: '💡' },
    'insightful': { icon: 'fa-brain', label: 'Insightful', emoji: '🧠' },
    'funny': { icon: 'fa-face-laugh', label: 'Funny', emoji: '😂' }
};

function toggleReactionPicker(contentType, contentId, btn) {
    // Close any existing picker
    closeReactionPickers();

    if (!currentUser) {
        showToast('Please login to react', 'warning');
        return;
    }

    // Create picker
    const picker = document.createElement('div');
    picker.className = 'reaction-picker';
    picker.id = `reaction-picker-${contentType}-${contentId}`;

    let html = '';
    for (const [type, info] of Object.entries(REACTION_TYPES)) {
        html += `<button class="reaction-option" data-reaction="${type}" title="${info.label}">
            <span class="reaction-emoji">${info.emoji}</span>
        </button>`;
    }
    picker.innerHTML = html;

    // Position picker above the button
    const rect = btn.getBoundingClientRect();
    picker.style.position = 'fixed';
    picker.style.bottom = (window.innerHeight - rect.top + 5) + 'px';
    picker.style.left = rect.left + 'px';
    picker.style.zIndex = '10000';

    document.body.appendChild(picker);

    // Add click handlers
    picker.querySelectorAll('.reaction-option').forEach(opt => {
        opt.addEventListener('click', async (e) => {
            e.stopPropagation();
            const reaction = opt.dataset.reaction;
            await submitReaction(contentType, contentId, reaction);
            closeReactionPickers();
        });
    });

    // Close on outside click
    setTimeout(() => {
        document.addEventListener('click', closeReactionPickersHandler, { once: true });
    }, 10);
}

function closeReactionPickersHandler(e) {
    closeReactionPickers();
}

function closeReactionPickers() {
    document.querySelectorAll('.reaction-picker').forEach(p => p.remove());
}

async function submitReaction(contentType, contentId, reactionType) {
    let url;
    if (contentType === 'thread') {
        url = `/forum/threads/${contentId}/react`;
    } else {
        // contentId is "threadId:replyId"
        const [threadId, replyId] = contentId.split(':');
        url = `/forum/threads/${threadId}/replies/${replyId}/react`;
    }

    const result = await api('POST', url, { reaction_type: reactionType });
    if (result.ok) {
        // Reload thread to show updated reactions
        loadThread(currentThreadId);
    } else {
        showToast(result.data?.message || 'Failed to react', 'error');
    }
}

function renderReactions(reactions, userReaction, contentType, contentId) {
    // Check if reactions object has any non-zero counts
    let hasReactions = false;
    if (reactions) {
        for (const [type, count] of Object.entries(reactions)) {
            if (count > 0) {
                hasReactions = true;
                break;
            }
        }
    }

    if (!hasReactions) {
        return `<button class="reaction-btn" onclick="toggleReactionPicker('${contentType}', '${contentId}', this)">
            <i class="far fa-smile"></i> React
        </button>`;
    }

    let html = '<div class="reactions-display">';
    for (const [type, count] of Object.entries(reactions)) {
        if (count > 0 && REACTION_TYPES[type]) {
            const isActive = userReaction === type ? ' active' : '';
            html += `<span class="reaction-count${isActive}" onclick="submitReaction('${contentType}', '${contentId}', '${type}')" title="${REACTION_TYPES[type].label}">
                ${REACTION_TYPES[type].emoji} ${count}
            </span>`;
        }
    }
    html += `<button class="reaction-btn add-reaction" onclick="toggleReactionPicker('${contentType}', '${contentId}', this)" title="Add Reaction">
        <i class="fas fa-plus"></i>
    </button>`;
    html += '</div>';
    return html;
}

async function loadThread(threadId) {
    // Clear any reply-to state from previous thread
    cancelReplyTo();

    const container = document.getElementById('postList');
    container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading thread...</div>';

    const result = await api('GET', `/forum/threads/${threadId}`);

    if (result.ok && result.data.thread) {
        const thread = result.data.thread;
        console.log('Thread loaded:', thread, 'is_locked:', thread.is_locked, 'is_pinned:', thread.is_pinned);
        document.getElementById('threadTitle').textContent = thread.title;
        document.getElementById('threadBreadcrumb').textContent = thread.title;

        // Update category link
        if (thread.category_id || thread.category) {
            const catId = thread.category_id || thread.category?.id;
            const catName = thread.category_name || thread.category?.name || 'Category';
            document.getElementById('threadCategoryLink').textContent = catName;
            document.getElementById('threadCategoryLink').onclick = (e) => {
                e.preventDefault();
                openCategory(catId);
                return false;
            };
        }

        // Show reply section if logged in and thread is not locked
        const isLocked = thread.is_locked || thread.locked;
        const replySection = document.getElementById('replySection');
        if (isLocked) {
            replySection.style.display = 'none';
        } else {
            replySection.style.display = currentUser ? '' : 'none';
        }

        // Render the main thread post first
        let html = '';

        // Add moderation toolbar for moderators
        const isPinned = thread.is_pinned || thread.pinned;
        const pinType = thread.pin_type || (isPinned ? 'pinned' : 'none');
        const isAnnouncement = pinType === 'announcement';

        if (isPortalModerator()) {
            html += `
                <div class="thread-mod-toolbar">
                    <span class="mod-toolbar-label"><i class="fas fa-shield-alt"></i> Moderation:</span>
                    <button class="mod-btn ${isLocked ? 'active' : ''}" onclick="toggleThreadLock(${threadId})" title="${isLocked ? 'Unlock' : 'Lock'} Thread">
                        <i class="fas fa-${isLocked ? 'unlock' : 'lock'}"></i> ${isLocked ? 'Unlock' : 'Lock'}
                    </button>
                    <div class="mod-btn-group">
                        <button class="mod-btn ${isPinned ? 'active' : ''}" onclick="toggleThreadPin(${threadId})" title="${isPinned ? 'Unpin' : 'Pin'} Thread">
                            <i class="fas fa-thumbtack"></i> ${isPinned ? 'Unpin' : 'Pin'}
                        </button>
                        <select class="mod-pin-select" onchange="setThreadPinType(${threadId}, this.value)" title="Pin Type">
                            <option value="none" ${pinType === 'none' ? 'selected' : ''}>None</option>
                            <option value="pinned" ${pinType === 'pinned' ? 'selected' : ''}>Pinned</option>
                            <option value="announcement" ${pinType === 'announcement' ? 'selected' : ''}>Announcement</option>
                        </select>
                    </div>
                    <button class="mod-btn" onclick="showMoveThreadModal(${threadId})" title="Move Thread">
                        <i class="fas fa-arrows-alt"></i> Move
                    </button>
                    <button class="mod-btn mod-btn-danger" onclick="deleteThreadMod(${threadId})" title="Delete Thread">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            `;
        }

        // Show locked notice if thread is locked
        if (isLocked) {
            html += `
                <div class="thread-locked-notice">
                    <i class="fas fa-lock"></i> This thread is locked. No new replies can be posted.
                </div>
            `;
        }

        // Show pinned/announcement notice if thread is pinned
        if (isAnnouncement) {
            html += `
                <div class="thread-announcement-notice">
                    <i class="fas fa-bullhorn"></i> <strong>Announcement</strong> - This is an important announcement from the staff.
                </div>
            `;
        } else if (isPinned) {
            html += `
                <div class="thread-pinned-notice">
                    <i class="fas fa-thumbtack"></i> This thread is pinned.
                </div>
            `;
        }

        // Main thread author info (from thread object)
        const threadAuthorId = thread.author_id || thread.author?.id;
        const threadAuthorName = thread.author_name || thread.author?.display_name || thread.author?.username || 'Unknown';
        const threadAuthorAvatar = thread.author_avatar || thread.author?.avatar || thread.author?.profile_picture || '';
        const threadAuthorRole = thread.author_role || thread.author?.role || 'Member';

        // Cache thread author
        if (threadAuthorId) {
            usersCache[threadAuthorId] = {
                id: threadAuthorId,
                username: threadAuthorName,
                display_name: threadAuthorName,
                avatar: threadAuthorAvatar,
                role: threadAuthorRole
            };
        }

        const threadAvatar = threadAuthorAvatar
            ? `<img src="${escapeHtml(threadAuthorAvatar)}" alt="Avatar" onerror="this.parentElement.textContent='${getInitials(threadAuthorName)}'">`
            : getInitials(threadAuthorName);

        // Render main thread post
        const threadLikeCount = thread.like_count || 0;
        const threadLikedByUser = thread.liked_by_user || false;
        const threadReactions = thread.reactions || {};
        const threadUserReaction = thread.user_reaction || null;
        const threadReactionsHtml = renderReactions(threadReactions, threadUserReaction, 'thread', threadId);

        // Check if user can edit this thread (owner or moderator/admin)
        const isOwnThread = currentUser && threadAuthorId === `customer_${currentUser.id}`;
        const canEditThread = isOwnThread || isPortalModerator();

        // Build edited info for thread if it was edited
        let threadEditedInfo = '';
        if (thread.edited_by) {
            const editedByName = thread.edited_by_name || 'Staff';
            const editedAt = thread.updated_at ? formatDate(thread.updated_at) : '';
            const editorId = thread.edited_by;
            threadEditedInfo = `<div class="reply-edited-info" onclick="showEditHistory('thread', ${threadId})" style="cursor: pointer;" title="Click to view edit history"><i class="fas fa-pencil-alt"></i> Edited by <span class="edited-by-link" onclick="event.stopPropagation(); showUserCardById('${editorId}')">${escapeHtml(editedByName)}</span>${editedAt ? ' on ' + editedAt : ''} <i class="fas fa-history" style="margin-left: 4px; opacity: 0.6;"></i></div>`;
        }

        // Encode thread content for data attribute
        const encodedThreadContent = btoa(encodeURIComponent(thread.content || thread.body || ''));

        html += `
            <div class="message" data-thread-id="${threadId}" data-thread-title="${escapeHtml(thread.title || '')}" data-thread-content="${encodedThreadContent}">
                <div class="message-user">
                    <div class="message-avatar" onclick="showUserCardById('${threadAuthorId}')" style="cursor: pointer;" title="View Profile">
                        ${typeof threadAvatar === 'string' && threadAvatar.startsWith('<img') ? threadAvatar : threadAvatar}
                    </div>
                    <div class="message-username" onclick="showUserCardById('${threadAuthorId}')" style="cursor: pointer;" title="View Profile">${escapeHtml(threadAuthorName)}</div>
                    <div class="message-role ${getRoleClass(threadAuthorRole)}">${escapeHtml(threadAuthorRole)}</div>
                </div>
                <div class="message-content">
                    <div class="message-header">
                        <div class="message-date">${formatDate(thread.created_at)}</div>
                        ${canEditThread ? `
                        <div class="reply-actions">
                            <button class="reply-action-btn" onclick="showEditThreadModal(${threadId})" title="Edit Thread"><i class="fas fa-edit"></i></button>
                        </div>
                        ` : ''}
                    </div>
                    <div class="message-body">${parseBBCode(thread.content || thread.body || '')}</div>
                    ${threadEditedInfo}
                    <div class="message-footer">
                        ${threadReactionsHtml}
                        ${currentUser ? `<button class="report-btn" onclick="showReportModal('thread', '${threadId}')" title="Report this thread"><i class="fas fa-flag"></i></button>` : ''}
                    </div>
                </div>
            </div>
        `;

        // Render poll if exists
        if (thread.poll) {
            html += renderPoll(thread.poll);
        }

        // Render replies if any
        const replies = thread.replies || thread.posts || [];
        for (const reply of replies) {
            // Reply author info
            const authorId = reply.author_id || reply.author?.id;
            const authorName = reply.author_name || reply.author?.display_name || reply.author?.username || 'Unknown';
            const authorAvatar = reply.author_avatar || reply.author?.avatar || reply.author?.profile_picture || '';
            const authorRole = reply.author_role || reply.author?.role || 'Member';

            // Cache reply author
            if (authorId) {
                usersCache[authorId] = {
                    id: authorId,
                    username: authorName,
                    display_name: authorName,
                    avatar: authorAvatar,
                    role: authorRole
                };
            }

            const avatar = authorAvatar
                ? `<img src="${escapeHtml(authorAvatar)}" alt="Avatar" onerror="this.parentElement.textContent='${getInitials(authorName)}'">`
                : getInitials(authorName);

            const replyLikeCount = reply.like_count || 0;
            const replyLikedByUser = reply.liked_by_user || false;
            const replyReactions = reply.reactions || {};
            const replyUserReaction = reply.user_reaction || null;

            // Check if user can edit/delete this reply
            const isOwnReply = currentUser && authorId === `customer_${currentUser.id}`;
            const canEditReply = isOwnReply || isPortalModerator();
            const canDeleteReply = isOwnReply || isPortalModerator();

            // Build edited info if reply was edited (only show if edited_by is set)
            let editedInfo = '';
            if (reply.edited_by) {
                const editedByName = reply.edited_by_name || 'Staff';
                const editedAt = reply.updated_at ? formatDate(reply.updated_at) : '';
                const editorId = reply.edited_by;
                editedInfo = `<div class="reply-edited-info" onclick="showEditHistory('reply', ${reply.id}, ${threadId})" style="cursor: pointer;" title="Click to view edit history"><i class="fas fa-pencil-alt"></i> Edited by <span class="edited-by-link" onclick="event.stopPropagation(); showUserCardById('${editorId}')">${escapeHtml(editedByName)}</span>${editedAt ? ' on ' + editedAt : ''} <i class="fas fa-history" style="margin-left: 4px; opacity: 0.6;"></i></div>`;
            }

            // Encode content for data attribute
            const encodedContent = btoa(encodeURIComponent(reply.content || reply.body || ''));

            // Check for reply-to-reply indicator
            const replyMetadata = reply.metadata || {};
            const parentReplyAuthor = reply.parent_reply_author || replyMetadata.parent_reply_author;
            const parentReplyId = reply.parent_reply_id || replyMetadata.parent_reply_id;
            const replyingToInfo = parentReplyAuthor ? `<div class="replying-to-indicator"><i class="fas fa-reply"></i> Replying to <span class="replying-to-name">${escapeHtml(parentReplyAuthor)}</span></div>` : '';

            html += `
                <div class="message" data-reply-id="${reply.id}" data-reply-content="${encodedContent}" data-reply-author="${escapeHtml(authorName)}">
                    <div class="message-user">
                        <div class="message-avatar" onclick="showUserCardById('${authorId}')" style="cursor: pointer;" title="View Profile">
                            ${typeof avatar === 'string' && avatar.startsWith('<img') ? avatar : avatar}
                        </div>
                        <div class="message-username" onclick="showUserCardById('${authorId}')" style="cursor: pointer;" title="View Profile">${escapeHtml(authorName)}</div>
                        <div class="message-role ${getRoleClass(authorRole)}">${escapeHtml(authorRole)}</div>
                    </div>
                    <div class="message-content">
                        ${replyingToInfo}
                        <div class="message-header">
                            <div class="message-date">${formatDate(reply.created_at)}</div>
                            ${canEditReply || canDeleteReply ? `
                            <div class="reply-actions">
                                ${canEditReply ? `<button class="reply-action-btn" onclick="showEditReplyModal(${threadId}, ${reply.id})"><i class="fas fa-edit"></i></button>` : ''}
                                ${canDeleteReply ? `<button class="reply-action-btn reply-delete-btn" onclick="deleteReplyMod(${threadId}, ${reply.id})"><i class="fas fa-trash"></i></button>` : ''}
                            </div>
                            ` : ''}
                        </div>
                        <div class="message-body">${parseBBCode(reply.content || reply.body || '')}</div>
                        ${editedInfo}
                        <div class="message-footer">
                            ${renderReactions(replyReactions, replyUserReaction, 'reply', threadId + ':' + reply.id)}
                            ${currentUser ? `<button class="reply-to-btn" onclick="replyToReply(${reply.id}, '${escapeHtml(authorName).replace(/'/g, "\\'")}')"><i class="fas fa-reply"></i> Reply</button>` : ''}
                            ${currentUser ? `<button class="quote-btn" onclick="quoteReply(${reply.id})"><i class="fas fa-quote-right"></i> Quote</button>` : ''}
                            ${currentUser ? `<button class="report-btn" onclick="showReportModal('reply', '${threadId}:${reply.id}')" title="Report this reply"><i class="fas fa-flag"></i></button>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;

        // Add spoiler click handlers
        document.querySelectorAll('.bb-spoiler').forEach(el => {
            el.addEventListener('click', () => el.classList.toggle('revealed'));
        });

        // Start watching this thread
        startWatchingThread(threadId);

        // Highlight reported content if navigating from reports page
        highlightReportedContent();
    } else {
        // Check for login/membership required errors
        const errorCode = result.data.error_code;
        if (errorCode === 'LOGIN_REQUIRED') {
            showPage('login');
            return;
        } else if (errorCode === 'MEMBERSHIP_REQUIRED') {
            showRedeemKeyModal();
            return;
        }
        container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><h3>Error</h3><p>' + escapeHtml(result.data.message || 'Failed to load thread.') + '</p></div>';
    }
}

// ==================== THREAD WATCHERS ====================

/**
 * Start watching a thread (sends heartbeat to server)
 */
async function startWatchingThread(threadId) {
    // Stop any existing watcher
    stopWatchingThread();

    if (!currentUser || !threadId) {
        // Still fetch watchers for display even if not logged in
        await updateThreadWatchers(threadId);
        return;
    }

    // Send initial heartbeat
    await sendWatcherHeartbeat(threadId);

    // Set up interval for periodic heartbeats
    threadWatcherInterval = setInterval(() => {
        sendWatcherHeartbeat(threadId);
    }, WATCHER_HEARTBEAT_MS);
}

/**
 * Stop watching the current thread
 */
async function stopWatchingThread() {
    if (threadWatcherInterval) {
        clearInterval(threadWatcherInterval);
        threadWatcherInterval = null;
    }

    // Send unwatch request if logged in and was watching a thread
    if (currentUser && currentThreadId) {
        try {
            await api('DELETE', `/forum/threads/${currentThreadId}/watch`);
        } catch (e) {
            // Ignore errors when unwatching
        }
    }

    // Hide watchers display
    const watchersContainer = document.getElementById('threadWatchers');
    if (watchersContainer) {
        watchersContainer.style.display = 'none';
    }
}

/**
 * Send a heartbeat to keep the user in the watchers list
 */
async function sendWatcherHeartbeat(threadId) {
    if (!currentUser || !threadId) return;

    try {
        const result = await api('POST', `/forum/threads/${threadId}/watch`);
        if (result.ok) {
            renderThreadWatchers(result.data.watchers || []);
        }
    } catch (e) {
        console.warn('Failed to send watcher heartbeat:', e);
    }
}

/**
 * Fetch and update thread watchers display (for non-logged in users or initial load)
 */
async function updateThreadWatchers(threadId) {
    try {
        const result = await api('GET', `/forum/threads/${threadId}/watchers`);
        if (result.ok) {
            renderThreadWatchers(result.data.watchers || []);
        }
    } catch (e) {
        console.warn('Failed to fetch thread watchers:', e);
    }
}

/**
 * Render the thread watchers display
 */
function renderThreadWatchers(watchers) {
    const container = document.getElementById('threadWatchers');
    const countEl = document.getElementById('watchersCount');
    const avatarsEl = document.getElementById('watchersAvatars');

    if (!container || !countEl || !avatarsEl) return;

    if (!watchers || watchers.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'flex';
    countEl.textContent = watchers.length;

    // Show up to 10 avatars, with a "+N" indicator for more
    const maxDisplay = 10;
    const displayWatchers = watchers.slice(0, maxDisplay);
    const remaining = watchers.length - maxDisplay;

    let html = '';
    for (const watcher of displayWatchers) {
        const name = (watcher.user_name && watcher.user_name.trim()) || 'Unknown';
        const avatar = watcher.user_avatar && watcher.user_avatar.trim();
        const initials = getInitials(name);
        // Escape initials for use in HTML attribute (handle quotes and special chars)
        const safeInitials = initials.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const displayName = escapeHtml(name);
        const userId = watcher.user_id || '';

        if (avatar) {
            html += `<div class="watcher-avatar" title="${displayName}" onclick="showUserCardById('${userId}')">
                <img src="${escapeHtml(avatar)}" alt="" onerror="this.style.display='none'; this.parentElement.innerHTML='${safeInitials}';">
            </div>`;
        } else {
            html += `<div class="watcher-avatar" title="${displayName}" onclick="showUserCardById('${userId}')">${safeInitials}</div>`;
        }
    }

    if (remaining > 0) {
        html += `<div class="watchers-more">+${remaining}</div>`;
    }

    avatarsEl.innerHTML = html;
}

// ==================== CREATE THREAD ====================
function showCreateThreadModal() {
    if (!currentUser) {
        showPage('login');
        showToast('Please login to create a thread', 'warning');
        return;
    }
    document.getElementById('newThreadTitle').value = '';
    document.getElementById('newThreadContent').value = '';
    document.getElementById('createThreadModal').classList.add('active');
}

function hideCreateThreadModal() {
    document.getElementById('createThreadModal').classList.remove('active');
    resetPollForm();
}

async function createThread() {
    const title = document.getElementById('newThreadTitle').value.trim();
    const content = document.getElementById('newThreadContent').value.trim();

    if (!title || !content) {
        showToast('Please enter a title and message', 'warning');
        return;
    }

    // Build request body
    const requestBody = { title, content };

    // Add poll data if enabled
    const pollEnabled = document.getElementById('pollEnabled')?.checked;
    if (pollEnabled) {
        const pollQuestion = document.getElementById('pollQuestion')?.value.trim();
        const pollOptionInputs = document.querySelectorAll('#pollOptionsContainer .poll-option-input');
        const pollOptions = Array.from(pollOptionInputs)
            .map(input => input.value.trim())
            .filter(opt => opt.length > 0);
        const allowMultiple = document.getElementById('pollAllowMultiple')?.checked || false;

        if (pollQuestion && pollOptions.length >= 2) {
            requestBody.poll = {
                question: pollQuestion,
                options: pollOptions,
                allow_multiple: allowMultiple
            };
        } else if (pollQuestion || pollOptions.length > 0) {
            showToast('Poll requires a question and at least 2 options', 'warning');
            return;
        }
    }

    const btn = document.querySelector('#createThreadModal .btn-primary');
    setButtonLoading(btn, true);

    const result = await api('POST', `/forum/categories/${currentCategoryId}/threads`, requestBody);

    setButtonLoading(btn, false, 'Create Thread');

    if (result.ok && result.data.thread) {
        hideCreateThreadModal();
        resetPollForm();
        showToast('Thread created successfully!', 'success');

        // Check for newly awarded badges
        if (result.data.badges_awarded && result.data.badges_awarded.length > 0) {
            showBadgeAwardNotification(result.data.badges_awarded);
            // Update current user's badges
            if (currentUser) {
                currentUser.badges = currentUser.badges || [];
                currentUser.badges.push(...result.data.badges_awarded);
            }
        }

        openThread(result.data.thread.id);
    } else {
        showToast(result.data.message || 'Failed to create thread', 'error');
    }
}

// ==================== POLL FUNCTIONS ====================
function togglePollSection() {
    const pollEnabled = document.getElementById('pollEnabled').checked;
    const pollFields = document.getElementById('pollFields');
    if (pollFields) {
        pollFields.style.display = pollEnabled ? 'block' : 'none';
    }
}

function addPollOption() {
    const container = document.getElementById('pollOptionsContainer');
    const optionCount = container.querySelectorAll('.poll-option-row').length;
    if (optionCount >= 10) {
        showToast('Maximum 10 options allowed', 'warning');
        return;
    }
    const newRow = document.createElement('div');
    newRow.className = 'poll-option-row';
    newRow.innerHTML = `
        <input type="text" class="form-input poll-option-input" placeholder="Option ${optionCount + 1}">
        <button type="button" class="poll-option-remove" onclick="removePollOption(this)" title="Remove option"><i class="fas fa-times"></i></button>
    `;
    container.appendChild(newRow);
}

function removePollOption(btn) {
    const container = document.getElementById('pollOptionsContainer');
    const optionCount = container.querySelectorAll('.poll-option-row').length;
    if (optionCount <= 2) {
        showToast('Poll requires at least 2 options', 'warning');
        return;
    }
    btn.closest('.poll-option-row').remove();
}

function resetPollForm() {
    const pollEnabled = document.getElementById('pollEnabled');
    if (pollEnabled) pollEnabled.checked = false;
    const pollFields = document.getElementById('pollFields');
    if (pollFields) pollFields.style.display = 'none';
    const pollQuestion = document.getElementById('pollQuestion');
    if (pollQuestion) pollQuestion.value = '';
    const pollAllowMultiple = document.getElementById('pollAllowMultiple');
    if (pollAllowMultiple) pollAllowMultiple.checked = false;
    const container = document.getElementById('pollOptionsContainer');
    if (container) {
        container.innerHTML = `
            <div class="poll-option-row">
                <input type="text" class="form-input poll-option-input" placeholder="Option 1">
                <button type="button" class="poll-option-remove" onclick="removePollOption(this)" title="Remove option"><i class="fas fa-times"></i></button>
            </div>
            <div class="poll-option-row">
                <input type="text" class="form-input poll-option-input" placeholder="Option 2">
                <button type="button" class="poll-option-remove" onclick="removePollOption(this)" title="Remove option"><i class="fas fa-times"></i></button>
            </div>
        `;
    }
}

function renderPoll(poll) {
    if (!poll) return '';

    const hasVoted = poll.has_voted;
    const totalVotes = poll.total_votes || 0;
    const allowMultiple = poll.allow_multiple;
    const userVotes = poll.user_votes || [];

    let optionsHtml = '';
    for (const option of poll.options) {
        const isSelected = userVotes.includes(option.index);
        const percentage = option.percentage || 0;
        const voteCount = option.votes || 0;

        if (hasVoted || !currentUser) {
            // Show results view
            optionsHtml += `
                <div class="poll-option poll-option-result ${isSelected ? 'poll-option-selected' : ''}">
                    <div class="poll-option-bar" style="width: ${percentage}%"></div>
                    <div class="poll-option-content">
                        <span class="poll-option-text">${escapeHtml(option.text)}</span>
                        <span class="poll-option-stats">${voteCount} vote${voteCount !== 1 ? 's' : ''} (${percentage}%)</span>
                    </div>
                    ${isSelected ? '<i class="fas fa-check poll-option-check"></i>' : ''}
                </div>
            `;
        } else {
            // Show voting view
            const inputType = allowMultiple ? 'checkbox' : 'radio';
            optionsHtml += `
                <label class="poll-option poll-option-vote">
                    <input type="${inputType}" name="pollVote" value="${option.index}" class="poll-vote-input">
                    <span class="poll-option-text">${escapeHtml(option.text)}</span>
                </label>
            `;
        }
    }

    const canVote = currentUser && !hasVoted;

    return `
        <div class="poll-container" data-thread-id="${currentThreadId}">
            <div class="poll-header">
                <i class="fas fa-poll"></i>
                <span class="poll-question">${escapeHtml(poll.question)}</span>
            </div>
            <div class="poll-options">
                ${optionsHtml}
            </div>
            <div class="poll-footer">
                <span class="poll-total">${totalVotes} total vote${totalVotes !== 1 ? 's' : ''}</span>
                ${allowMultiple ? '<span class="poll-multi-hint">Multiple selections allowed</span>' : ''}
                ${canVote ? '<button class="btn btn-primary btn-sm poll-vote-btn" onclick="submitPollVote()"><i class="fas fa-vote-yea"></i> Vote</button>' : ''}
            </div>
        </div>
    `;
}

async function submitPollVote() {
    const pollContainer = document.querySelector('.poll-container');
    if (!pollContainer) return;

    const threadId = pollContainer.dataset.threadId || currentThreadId;
    const selectedInputs = pollContainer.querySelectorAll('.poll-vote-input:checked');

    if (selectedInputs.length === 0) {
        showToast('Please select an option', 'warning');
        return;
    }

    const options = Array.from(selectedInputs).map(input => parseInt(input.value));

    const voteBtn = pollContainer.querySelector('.poll-vote-btn');
    if (voteBtn) setButtonLoading(voteBtn, true);

    const result = await api('POST', `/forum/threads/${threadId}/poll/vote`, { options });

    if (voteBtn) setButtonLoading(voteBtn, false, '<i class="fas fa-vote-yea"></i> Vote');

    if (result.ok) {
        showToast('Vote recorded!', 'success');
        // Refresh the thread to show updated poll
        loadThread(parseInt(threadId));
    } else {
        showToast(result.data?.message || 'Failed to vote', 'error');
    }
}

// ==================== REPORT FUNCTIONS ====================
function showReportModal(contentType, contentId) {
    if (!currentUser) {
        showToast('Please login to report content', 'warning');
        return;
    }
    document.getElementById('reportContentType').value = contentType;
    document.getElementById('reportContentId').value = contentId;
    document.getElementById('reportReason').value = '';
    document.getElementById('reportDetails').value = '';
    document.getElementById('reportAlert').innerHTML = '';
    document.getElementById('reportModal').classList.add('active');
}

function hideReportModal() {
    document.getElementById('reportModal').classList.remove('active');
}

async function submitReport() {
    const contentType = document.getElementById('reportContentType').value;
    const contentId = document.getElementById('reportContentId').value;
    const reason = document.getElementById('reportReason').value;
    const details = document.getElementById('reportDetails').value.trim();

    if (!reason) {
        showToast('Please select a reason for your report', 'warning');
        return;
    }

    const btn = document.querySelector('#reportModal .btn-danger');
    setButtonLoading(btn, true);

    const result = await api('POST', '/reports', {
        content_type: contentType,
        content_id: contentId,
        reason: reason,
        details: details
    });

    setButtonLoading(btn, false, '<i class="fas fa-flag"></i> Submit Report');

    if (result.ok) {
        hideReportModal();
        showToast('Report submitted. Thank you for helping keep our community safe.', 'success');
    } else {
        showToast(result.data?.message || 'Failed to submit report', 'error');
    }
}

// ==================== REPORTS MANAGEMENT (Moderators) ====================
let currentReportsFilter = 'pending';

async function loadPendingReportsCount() {
    if (!currentUser || !isPortalModerator()) return;

    try {
        const result = await api('GET', '/reports?status=pending&limit=1');
        if (result.ok) {
            // The API returns reports array, we need to get the count
            // Make another call to get count or use a dedicated endpoint
            const countResult = await api('GET', '/reports?status=pending');
            if (countResult.ok) {
                const count = countResult.data.reports?.length || 0;
                const badge = document.getElementById('pendingReportsBadge');
                if (badge) {
                    badge.textContent = count;
                    badge.style.display = count > 0 ? '' : 'none';
                }
                // Also update the count on the reports page if visible
                const pageCount = document.getElementById('pendingReportsCount');
                if (pageCount) {
                    pageCount.textContent = count;
                }
            }
        }
    } catch (e) {
        console.warn('Failed to load pending reports count:', e);
    }
}

async function loadReports(status = 'pending') {
    currentReportsFilter = status;
    const container = document.getElementById('reportsList');
    container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading reports...</div>';

    // Update filter buttons
    document.querySelectorAll('.report-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.status === status);
    });

    const url = status ? `/reports?status=${status}` : '/reports';
    const result = await api('GET', url);

    if (result.ok) {
        const reports = result.data.reports || [];

        // Update pending count
        if (status === 'pending' || status === '') {
            const pendingCount = status === 'pending' ? reports.length : reports.filter(r => r.status === 'pending').length;
            document.getElementById('pendingReportsCount').textContent = pendingCount;
        }

        if (reports.length === 0) {
            container.innerHTML = `
                <div class="reports-empty">
                    <i class="fas fa-check-circle"></i>
                    <p>No ${status || ''} reports</p>
                </div>
            `;
            return;
        }

        let html = '';
        for (const report of reports) {
            html += renderReportItem(report);
        }
        container.innerHTML = html;
    } else {
        container.innerHTML = `<div class="reports-empty"><i class="fas fa-exclamation-triangle"></i><p>Failed to load reports</p></div>`;
    }
}

function filterReports(status) {
    loadReports(status);
}

function renderReportItem(report) {
    const reasonLabels = {
        'spam': 'Spam or Advertising',
        'harassment': 'Harassment or Bullying',
        'inappropriate': 'Inappropriate Content',
        'misinformation': 'Misinformation',
        'other': 'Other'
    };

    const statusClasses = {
        'pending': 'status-pending',
        'reviewed': 'status-reviewed',
        'resolved': 'status-resolved',
        'dismissed': 'status-dismissed'
    };

    const contentTypeIcons = {
        'thread': 'fa-comments',
        'reply': 'fa-reply',
        'chat': 'fa-message',
        'user': 'fa-user'
    };

    const reporterName = report.reporter_name || 'Unknown';
    const reasonLabel = reasonLabels[report.reason] || report.reason;
    const statusClass = statusClasses[report.status] || '';
    const contentIcon = contentTypeIcons[report.content_type] || 'fa-file';

    // Format date safely
    const dateDisplay = report.created_at ? formatDate(report.created_at) : '-';

    // Parse content_id for replies (format: "threadId:replyId")
    let displayContentId = report.content_id;
    let viewLink = '';
    if (report.content_type === 'thread') {
        viewLink = `<a href="#" class="report-view-link" onclick="viewReportedThread('${report.content_id}'); return false;"><i class="fas fa-external-link-alt"></i> View</a>`;
    } else if (report.content_type === 'reply' && report.content_id.includes(':')) {
        const [threadId, replyId] = report.content_id.split(':');
        displayContentId = `Reply #${replyId} in Thread #${threadId}`;
        viewLink = `<a href="#" class="report-view-link" onclick="viewReportedReply('${threadId}', '${replyId}'); return false;"><i class="fas fa-external-link-alt"></i> View</a>`;
    }

    return `
        <div class="report-item" data-report-id="${report.id}">
            <div class="report-header">
                <div class="report-meta">
                    <span class="report-type"><i class="fas ${contentIcon}"></i> ${report.content_type}</span>
                    <span class="report-reason">${escapeHtml(reasonLabel)}</span>
                    <span class="report-status ${statusClass}">${report.status}</span>
                </div>
                <div class="report-date">${dateDisplay}</div>
            </div>
            <div class="report-body">
                <div class="report-reporter">
                    <strong>Reported by:</strong> ${escapeHtml(reporterName)}
                </div>
                <div class="report-content-id">
                    <strong>Content:</strong> ${escapeHtml(displayContentId)}
                    ${viewLink}
                </div>
                ${report.details ? `<div class="report-details"><strong>Details:</strong> ${escapeHtml(report.details)}</div>` : ''}
                ${report.resolution_note ? `<div class="report-resolution"><strong>Resolution:</strong> ${escapeHtml(report.resolution_note)}</div>` : ''}
            </div>
            ${report.status === 'pending' || report.status === 'reviewed' ? `
            <div class="report-actions">
                <button class="btn btn-sm btn-secondary" onclick="updateReportStatus(${report.id}, 'reviewed')">
                    <i class="fas fa-eye"></i> Mark Reviewed
                </button>
                <button class="btn btn-sm btn-success" onclick="showResolveReportModal(${report.id})">
                    <i class="fas fa-check"></i> Resolve
                </button>
                <button class="btn btn-sm btn-danger" onclick="showDismissReportModal(${report.id})">
                    <i class="fas fa-times"></i> Dismiss
                </button>
            </div>
            ` : ''}
        </div>
    `;
}

let pendingHighlight = null; // {type: 'thread'|'reply', id: string}

function reportUserFromCard() {
    if (!currentUserCardUser) {
        showToast('User data not available', 'error');
        return;
    }
    hideUserCardModal();
    showReportModal('user', currentUserCardUser.id);
}

function viewReportedThread(threadId) {
    pendingHighlight = { type: 'thread', id: threadId };
    window.location.hash = `#thread/${threadId}`;
}

function viewReportedReply(threadId, replyId) {
    pendingHighlight = { type: 'reply', id: replyId };
    window.location.hash = `#thread/${threadId}`;
}

function highlightReportedContent() {
    if (!pendingHighlight) return;

    setTimeout(() => {
        let element = null;

        if (pendingHighlight.type === 'thread') {
            // Highlight the first message (main thread post)
            element = document.querySelector('#postList .message');
        } else if (pendingHighlight.type === 'reply') {
            // Find the reply by data-reply-id attribute
            element = document.querySelector(`#postList .message[data-reply-id="${pendingHighlight.id}"]`);
        }

        if (element) {
            // Scroll to element
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Add highlight animation
            element.classList.add('highlight-reported');

            // Remove highlight after animation
            setTimeout(() => {
                element.classList.remove('highlight-reported');
            }, 3000);
        }

        pendingHighlight = null;
    }, 300); // Wait for content to render
}

async function updateReportStatus(reportId, status, resolutionNote = '') {
    const result = await api('PUT', `/reports/${reportId}`, {
        status: status,
        resolution_note: resolutionNote
    });

    if (result.ok) {
        showToast('Report updated', 'success');
        loadReports(currentReportsFilter);
    } else {
        showToast(result.data?.message || 'Failed to update report', 'error');
    }
}

async function showResolveReportModal(reportId) {
    const note = await showPrompt('Add any notes about how this was resolved.', {
        title: 'Resolve Report',
        icon: 'fa-check-circle',
        label: 'Resolution Note (optional)',
        placeholder: 'e.g., Warned the user, removed content...',
        confirmText: 'Resolve',
        confirmIcon: 'fa-check'
    });
    if (note !== null) {
        updateReportStatus(reportId, 'resolved', note);
    }
}

async function showDismissReportModal(reportId) {
    const note = await showPrompt('Explain why this report is being dismissed.', {
        title: 'Dismiss Report',
        icon: 'fa-times-circle',
        label: 'Reason (optional)',
        placeholder: 'e.g., Not a violation, false report...',
        confirmText: 'Dismiss',
        confirmIcon: 'fa-times'
    });
    if (note !== null) {
        updateReportStatus(reportId, 'dismissed', note);
    }
}

// ==================== POST REPLY ====================
async function postReply() {
    const content = document.getElementById('replyContent').value.trim();

    if (!content) {
        showToast('Please enter a message', 'warning');
        return;
    }

    const btn = document.querySelector('#replySection .btn-primary');
    setButtonLoading(btn, true);

    // Build request body with optional parent_reply_id
    const requestBody = { content };
    if (currentParentReplyId) {
        requestBody.parent_reply_id = currentParentReplyId;
    }

    const result = await api('POST', `/forum/threads/${currentThreadId}/replies`, requestBody);

    setButtonLoading(btn, false, '<i class="fas fa-paper-plane"></i> Post Reply');

    if (result.ok) {
        document.getElementById('replyContent').value = '';
        cancelReplyTo();  // Clear the reply-to state
        showToast('Reply posted!', 'success');

        // Check for newly awarded badges
        if (result.data.badges_awarded && result.data.badges_awarded.length > 0) {
            showBadgeAwardNotification(result.data.badges_awarded);
            // Update current user's badges
            if (currentUser) {
                currentUser.badges = currentUser.badges || [];
                currentUser.badges.push(...result.data.badges_awarded);
            }
        }

        loadThread(currentThreadId);
    } else {
        showToast(result.data.message || 'Failed to post reply', 'error');
    }
}

// ==================== CHAT ====================
async function loadChat() {
    const container = document.getElementById('chatMessages');
    container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading chat...</div>';

    // Enable/disable input based on login status
    const chatInput = document.getElementById('chatInput');
    const chatSendBtn = document.getElementById('chatSendBtn');
    const chatGuestNotice = document.getElementById('chatGuestNotice');

    if (currentUser) {
        chatInput.disabled = false;
        chatSendBtn.disabled = false;
        chatInput.placeholder = 'Type a message...';
        chatGuestNotice.style.display = 'none';
    } else {
        chatInput.disabled = true;
        chatSendBtn.disabled = true;
        chatInput.placeholder = 'Login to chat...';
        chatGuestNotice.style.display = 'flex';
    }

    // Show moderator panel for moderators
    const modPanel = document.getElementById('chatModPanel');
    if (modPanel) {
        modPanel.style.display = isPortalModerator() ? '' : 'none';
    }

    await refreshChat();

    // Start auto-refresh
    chatRefreshInterval = setInterval(refreshChat, 5000);
}

async function refreshChat() {
    const result = await api('GET', '/chat/messages?limit=50');
    const container = document.getElementById('chatMessages');

    if (result.ok && result.data.messages) {
        if (result.data.messages.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-comments"></i><p>No messages yet. Start the conversation!</p></div>';
            return;
        }

        const messages = result.data.messages;
        let html = '';

        for (const msg of messages) {
            const sender = msg.sender || {};
            const senderId = msg.sender_id;
            const senderName = sender.display_name || sender.username || 'Unknown';

            // Cache user data
            if (senderId) {
                usersCache[senderId] = {
                    id: senderId,
                    username: sender.username || '',
                    display_name: sender.display_name || senderName,
                    avatar: sender.avatar || sender.profile_picture || '',
                    role: sender.role || ''
                };
            }

            const avatar = sender.avatar || sender.profile_picture
                ? `<img src="${escapeHtml(sender.avatar || sender.profile_picture)}" alt="Avatar">`
                : getInitials(senderName);

            // Check if user is muted (for visual indicator)
            const isMuted = msg.sender_muted || false;
            const mutedClass = isMuted ? 'chat-message-muted' : '';

            // Mod actions (only for moderators)
            const modActions = isPortalModerator() ? `
                <div class="chat-mod-actions">
                    <button class="chat-mod-btn" onclick="deleteChatMessage(${msg.id})" title="Delete Message">
                        <i class="fas fa-trash"></i>
                    </button>
                    <button class="chat-mod-btn" onclick="deleteUserMessages(${senderId})" title="Delete All User Messages">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                    <button class="chat-mod-btn" onclick="showMuteUserModal(${senderId}, '${escapeHtml(senderName)}')" title="Mute User">
                        <i class="fas fa-user-slash"></i>
                    </button>
                </div>
            ` : '';

            // Report button for logged-in users (not own messages)
            const isOwnMessage = currentUser && senderId === currentUser.id;
            const reportBtn = currentUser && !isOwnMessage ? `
                <button class="chat-report-btn" onclick="showReportModal('chat', '${msg.id}')" title="Report Message">
                    <i class="fas fa-flag"></i>
                </button>
            ` : '';

            html += `
                <div class="chat-message ${mutedClass}">
                    <div class="chat-avatar" onclick="showUserCardById(${senderId})">
                        ${typeof avatar === 'string' && avatar.startsWith('<img') ? avatar : avatar}
                    </div>
                    <div class="chat-content">
                        <div class="chat-header">
                            <span class="chat-username" onclick="showUserCardById(${senderId})">${escapeHtml(senderName)}</span>
                            ${isMuted ? '<span class="chat-muted-badge"><i class="fas fa-volume-mute"></i></span>' : ''}
                            <span class="chat-time">${formatTime(msg.created_at)}</span>
                            ${modActions}
                            ${reportBtn}
                        </div>
                        <div class="chat-text">${escapeHtml(msg.content || msg.message)}</div>
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
        container.scrollTop = container.scrollHeight;
    } else {
        // Check for login/membership required errors
        const errorCode = result.data?.error_code;
        if (errorCode === 'LOGIN_REQUIRED') {
            showPage('login');
            return;
        } else if (errorCode === 'MEMBERSHIP_REQUIRED') {
            showRedeemKeyModal();
            return;
        }
    }
}

async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const btn = document.getElementById('chatSendBtn');
    const message = input.value.trim();

    if (!message) return;
    if (!currentUser) {
        showToast('Please login to send messages', 'warning');
        return;
    }

    input.value = '';
    input.disabled = true;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    const result = await api('POST', '/chat/messages', { content: message });

    input.disabled = false;
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i>';

    if (result.ok) {
        showToast('Message sent', 'success');
        refreshChat();
    } else {
        showToast(result.data.message || 'Failed to send message', 'error');
        // Restore the message so user can retry
        input.value = message;
    }
}

// ==================== DIRECT MESSAGES ====================
async function loadConversations() {
    const container = document.getElementById('conversationList');
    container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading conversations...</div>';

    const result = await api('GET', '/messages/conversations');

    if (result.ok && result.data.conversations) {
        if (result.data.conversations.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-envelope"></i><h3>No Messages</h3><p>You have no conversations yet.</p></div>';
            return;
        }

        let html = '';
        for (const conv of result.data.conversations) {
            const participant = conv.participant || {};
            const convId = conv.conversation_id || conv.id;
            const avatar = participant.avatar || participant.profile_picture
                ? `<img src="${escapeHtml(participant.avatar || participant.profile_picture)}" alt="Avatar">`
                : getInitials(participant.display_name || participant.username || 'U');

            const lastMsg = conv.last_message;
            const preview = lastMsg
                ? (lastMsg.sender_id == currentUser.id ? 'You: ' : '') + (lastMsg.content || '')
                : 'No messages yet';

            html += `
                <div class="conversation-item ${conv.unread_count > 0 ? 'unread' : ''}" onclick="openConversation('${escapeHtml(convId)}', ${JSON.stringify(participant).replace(/"/g, '&quot;')})">
                    <div class="conversation-avatar" onclick="event.stopPropagation(); showUserCardById(${participant.id})" style="cursor: pointer;" title="View Profile">
                        ${typeof avatar === 'string' && avatar.startsWith('<img') ? avatar : avatar}
                    </div>
                    <div class="conversation-main">
                        <div class="conversation-name">${escapeHtml(participant.display_name || participant.username || 'Unknown')}</div>
                        <div class="conversation-preview">${escapeHtml(preview.substring(0, 50))}</div>
                    </div>
                    <div class="conversation-meta">
                        ${lastMsg ? formatDate(lastMsg.created_at) : ''}
                        ${conv.unread_count > 0 ? `<div class="conversation-unread-badge">${conv.unread_count}</div>` : ''}
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
    } else {
        // Check for login/membership required errors
        const errorCode = result.data?.error_code;
        if (errorCode === 'LOGIN_REQUIRED') {
            showPage('login');
            return;
        } else if (errorCode === 'MEMBERSHIP_REQUIRED') {
            showRedeemKeyModal();
            return;
        }
        container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><h3>Error</h3><p>' + escapeHtml(result.data?.message || 'Failed to load conversations.') + '</p></div>';
    }
}

function openConversation(conversationId, participant) {
    currentConversationId = conversationId;
    currentConvParticipant = participant;
    updateHash(`conversation/${conversationId}`);
    showPage('conversation', false);
    loadConversation(conversationId);
}

function openConvParticipantProfile() {
    if (currentConvParticipant && currentConvParticipant.id) {
        showUserCardById(currentConvParticipant.id);
    }
}

async function loadConversation(conversationId) {
    const container = document.getElementById('conversationMessages');

    // If no conversation ID but we have a participant, show empty state for new conversation
    if (!conversationId && currentConvParticipant) {
        document.getElementById('conversationBreadcrumb').textContent = currentConvParticipant.display_name || currentConvParticipant.username;
        document.getElementById('convHeaderName').textContent = currentConvParticipant.display_name || currentConvParticipant.username;
        const headerAvatar = document.getElementById('convHeaderAvatar');
        if (currentConvParticipant.avatar || currentConvParticipant.profile_picture) {
            headerAvatar.innerHTML = `<img src="${escapeHtml(currentConvParticipant.avatar || currentConvParticipant.profile_picture)}" alt="Avatar" style="width: 100%; height: 100%; object-fit: cover;">`;
        } else {
            headerAvatar.textContent = getInitials(currentConvParticipant.display_name || currentConvParticipant.username);
        }
        container.innerHTML = '<div class="empty-state"><i class="fas fa-comment-slash"></i><p>No messages yet. Send the first message!</p></div>';
        return;
    }

    if (!conversationId) {
        showPage('messages');
        return;
    }

    container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading messages...</div>';

    const result = await api('GET', `/messages/conversations/${conversationId}`);

    if (result.ok) {
        const conv = result.data;
        const p = conv.participant;
        currentConvParticipant = p;

        // Update header
        document.getElementById('conversationBreadcrumb').textContent = p.display_name || p.username;
        document.getElementById('convHeaderName').textContent = p.display_name || p.username;
        const headerAvatar = document.getElementById('convHeaderAvatar');
        if (p.avatar || p.profile_picture) {
            headerAvatar.innerHTML = `<img src="${escapeHtml(p.avatar || p.profile_picture)}" alt="Avatar" style="width: 100%; height: 100%; object-fit: cover;">`;
        } else {
            headerAvatar.textContent = getInitials(p.display_name || p.username);
        }

        // Render messages
        const messages = conv.messages || [];
        if (messages.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-comment-slash"></i><p>No messages yet. Send the first message!</p></div>';
        } else {
            let html = '';
            for (const msg of messages) {
                const isMe = msg.is_mine || msg.sender_id === currentUser?.id;
                const sender = msg.sender || {};
                const name = isMe ? 'You' : (sender.display_name || sender.username || p.display_name || p.username);

                html += `
                    <div class="chat-message" style="${isMe ? 'flex-direction: row-reverse;' : ''}">
                        <div class="chat-content" style="max-width: 70%; ${isMe ? 'text-align: right;' : ''}">
                            <div style="font-size: 0.75rem; color: var(--muted-text); margin-bottom: 4px;">
                                <strong>${escapeHtml(name)}</strong>
                                <span style="margin-left: 8px;">${formatTime(msg.created_at)}</span>
                            </div>
                            <div style="background: ${isMe ? 'var(--primary)' : 'rgba(255,255,255,0.05)'}; padding: 12px 16px; border-radius: var(--radius-md); ${isMe ? 'color: white;' : ''}">
                                ${escapeHtml(msg.content)}
                            </div>
                        </div>
                    </div>
                `;
            }
            container.innerHTML = html;
            container.scrollTop = container.scrollHeight;
        }

        // Mark as read
        await api('POST', `/messages/conversations/${conversationId}/read`);
    } else {
        showToast(result.data.message || 'Failed to load conversation', 'error');
        showPage('messages');
    }
}

async function sendDM() {
    const input = document.getElementById('dmInput');
    const btn = document.querySelector('#page-conversation .btn-primary');
    const content = input.value.trim();

    if (!content || !currentConvParticipant) return;

    input.value = '';
    input.disabled = true;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    const result = await api('POST', '/messages', {
        recipient_id: currentConvParticipant.id,
        content
    });

    input.disabled = false;
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i>';

    if (result.ok) {
        // Update conversation ID if this was a new conversation
        if (result.data.conversation_id) {
            currentConversationId = result.data.conversation_id;
        }
        loadConversation(currentConversationId);
    } else {
        showToast(result.data.message || 'Failed to send message', 'error');
    }
}

// ==================== MEMBERS ====================
async function loadOnlineMembers() {
    const container = document.getElementById('membersList');
    container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading members...</div>';

    const result = await api('GET', '/members?online=true&limit=50');

    if (result.ok && result.data.members) {
        document.getElementById('membersOnlineCount').textContent = result.data.members.length;
        renderMembers(result.data.members);
    } else {
        // Check for login/membership required errors
        const errorCode = result.data?.error_code;
        if (errorCode === 'LOGIN_REQUIRED') {
            showPage('login');
            return;
        } else if (errorCode === 'MEMBERSHIP_REQUIRED') {
            showRedeemKeyModal();
            return;
        }
        container.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><h3>No Members Online</h3></div>';
    }
}

function renderMembers(members) {
    const container = document.getElementById('membersList');

    if (members.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><h3>No Members Found</h3></div>';
        return;
    }

    let html = '';
    for (const member of members) {
        // Cache user data
        if (member.id) {
            usersCache[member.id] = {
                id: member.id,
                username: member.username || '',
                display_name: member.display_name || member.username || '',
                avatar: member.avatar || member.profile_picture || '',
                role: member.role || ''
            };
        }

        const avatar = member.avatar || member.profile_picture
            ? `<img src="${escapeHtml(member.avatar || member.profile_picture)}" alt="Avatar">`
            : getInitials(member.display_name || member.username);

        html += `
            <div class="member-card" onclick="showUserCardById(${member.id})">
                <div class="member-avatar">
                    ${typeof avatar === 'string' && avatar.startsWith('<img') ? avatar : avatar}
                </div>
                <div class="member-info">
                    <div class="member-name">${escapeHtml(member.display_name || member.username)}</div>
                    <div class="member-role">${escapeHtml(member.role || 'Member')}</div>
                </div>
                <div class="member-status"></div>
            </div>
        `;
    }
    container.innerHTML = html;
}

function onMemberSearchInput() {
    clearTimeout(memberSearchTimeout);
    const query = document.getElementById('memberSearchInput').value.trim();

    if (query.length < 3) {
        if (query.length === 0) {
            loadOnlineMembers();
        }
        return;
    }

    memberSearchTimeout = setTimeout(async () => {
        const result = await api('GET', `/members?q=${encodeURIComponent(query)}&limit=30`);
        if (result.ok && result.data.members) {
            renderMembers(result.data.members);
        }
    }, 300);
}

// ==================== SUPPORT TICKETS ====================
async function loadTickets() {
    const container = document.getElementById('ticketList');
    container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading tickets...</div>';

    const result = await api('GET', '/support/tickets');

    if (result.ok && result.data.tickets) {
        if (result.data.tickets.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-ticket-alt"></i><h3>No Tickets</h3><p>You haven\'t created any support tickets yet.</p></div>';
            return;
        }

        let html = '';
        for (const ticket of result.data.tickets) {
            const statusClass = ticket.status?.toLowerCase() || 'open';
            html += `
                <div class="ticket-item" onclick="openTicket(${ticket.id})">
                    <div class="ticket-status ${statusClass}"></div>
                    <div class="ticket-main">
                        <div class="ticket-subject">${escapeHtml(ticket.subject)}</div>
                        <div class="ticket-meta">#${ticket.id} &bull; ${formatDate(ticket.created_at)}</div>
                    </div>
                    <span class="ticket-badge ${statusClass}">${ticket.status || 'Open'}</span>
                </div>
            `;
        }
        container.innerHTML = html;
    } else {
        // Check for login/membership required errors
        const errorCode = result.data?.error_code;
        if (errorCode === 'LOGIN_REQUIRED') {
            showPage('login');
            return;
        } else if (errorCode === 'MEMBERSHIP_REQUIRED') {
            showRedeemKeyModal();
            return;
        }
        container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><h3>Error</h3><p>' + escapeHtml(result.data?.message || 'Failed to load tickets.') + '</p></div>';
    }
}

function openTicket(ticketId) {
    currentTicketId = ticketId;
    updateHash(`ticket/${ticketId}`);
    showPage('ticket', false);
    loadTicketDetail(ticketId);
}

async function loadTicketDetail(ticketId) {
    const container = document.getElementById('ticketMessages');
    container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading ticket...</div>';

    const result = await api('GET', `/support/tickets/${ticketId}`);

    if (result.ok && result.data.ticket) {
        const ticket = result.data.ticket;
        document.getElementById('ticketSubject').textContent = ticket.subject;
        document.getElementById('ticketBreadcrumb').textContent = `#${ticket.id}`;
        document.getElementById('ticketCategory').textContent = ticket.category || '';

        const statusEl = document.getElementById('ticketStatus');
        const statusClass = ticket.status?.toLowerCase() || 'open';
        statusEl.textContent = ticket.status || 'Open';
        statusEl.className = `ticket-badge ${statusClass}`;

        // Show/hide reply section based on status
        const replySection = document.getElementById('ticketReplySection');
        const isClosed = ticket.status?.toLowerCase() === 'closed';
        replySection.style.display = isClosed ? 'none' : '';

        // Render staff controls if user is staff
        let html = '';
        if (isPortalStaff()) {
            const priorityOptions = ['low', 'normal', 'high', 'urgent'].map(p =>
                `<option value="${p}" ${ticket.priority === p ? 'selected' : ''}>${p.charAt(0).toUpperCase() + p.slice(1)}</option>`
            ).join('');

            const statusOptions = ['open', 'waiting', 'resolved', 'closed'].map(s =>
                `<option value="${s}" ${ticket.status === s ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`
            ).join('');

            const categoryOptions = ['general', 'billing', 'technical', 'account', 'other'].map(c =>
                `<option value="${c}" ${ticket.category === c ? 'selected' : ''}>${c.charAt(0).toUpperCase() + c.slice(1)}</option>`
            ).join('');

            html += `
                <div class="ticket-staff-controls">
                    <div class="form-row">
                        <label>Priority</label>
                        <select class="form-input" onchange="updateTicketPriority(${ticketId}, this.value)">
                            ${priorityOptions}
                        </select>
                    </div>
                    <div class="form-row">
                        <label>Category</label>
                        <select class="form-input" onchange="updateTicketCategory(${ticketId}, this.value)">
                            ${categoryOptions}
                        </select>
                    </div>
                    <div class="form-row">
                        <label>Status</label>
                        <select class="form-input" onchange="updateTicketStatus(${ticketId}, this.value)">
                            ${statusOptions}
                        </select>
                    </div>
                    ${isClosed ? `
                        <div class="form-row" style="display: flex; align-items: flex-end;">
                            <button class="btn btn-primary btn-sm" onclick="reopenTicket(${ticketId})">
                                <i class="fas fa-redo"></i> Reopen Ticket
                            </button>
                        </div>
                    ` : ''}
                </div>
            `;
        }

        // Render messages
        const messages = ticket.messages || [ticket];

        for (const msg of messages) {
            const author = msg.author || {};
            const isStaff = author.role === 'admin' || author.role === 'moderator' || msg.is_staff;
            const authorName = author.display_name || author.username || 'Support';
            const profilePicture = author.profile_picture;
            const authorId = author.id || msg.author_id;

            // Render avatar with image or initials
            let avatarContent;
            if (profilePicture) {
                avatarContent = `<img src="${escapeHtml(profilePicture)}" alt="${escapeHtml(authorName)}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
            } else {
                avatarContent = getInitials(authorName);
            }

            // Make clickable if we have an author ID
            const onClickAttr = authorId ? `onclick="showUserCardById(${authorId})"` : '';
            const clickableStyle = authorId ? 'cursor: pointer;' : '';

            html += `
                <div class="message">
                    <div class="message-user" style="background: ${isStaff ? 'rgba(225, 29, 72, 0.05)' : 'rgba(255,255,255,0.01)'};">
                        <div class="message-avatar" ${onClickAttr} title="${authorId ? 'View Profile' : ''}" style="background: ${isStaff ? 'var(--primary)' : 'var(--info)'}; overflow: hidden; ${clickableStyle}">
                            ${avatarContent}
                        </div>
                        <div class="message-username" ${onClickAttr} style="${clickableStyle}" title="${authorId ? 'View Profile' : ''}">${escapeHtml(authorName)}</div>
                        <div class="message-role ${isStaff ? 'admin' : ''}">${isStaff ? 'Staff' : 'User'}</div>
                    </div>
                    <div class="message-content">
                        <div class="message-header">
                            <div class="message-date">${formatDate(msg.created_at)}</div>
                        </div>
                        <div class="message-body">${escapeHtml(msg.content || msg.body)}</div>
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
    } else {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><h3>Error</h3><p>Failed to load ticket.</p></div>';
    }
}

function showCreateTicketModal() {
    document.getElementById('ticketSubjectInput').value = '';
    document.getElementById('ticketCategoryInput').value = '';
    document.getElementById('ticketBodyInput').value = '';
    document.getElementById('createTicketAlert').innerHTML = '';
    document.getElementById('createTicketModal').classList.add('active');
}

function hideCreateTicketModal() {
    document.getElementById('createTicketModal').classList.remove('active');
}

async function createTicket() {
    const subject = document.getElementById('ticketSubjectInput').value.trim();
    const category = document.getElementById('ticketCategoryInput').value;
    const body = document.getElementById('ticketBodyInput').value.trim();

    if (!subject || !body) {
        showAlert('createTicketAlert', 'Please fill in all required fields', 'danger');
        return;
    }

    const btn = document.querySelector('#createTicketModal .btn-primary');
    setButtonLoading(btn, true);

    const result = await api('POST', '/support/tickets', { subject, category, body });

    setButtonLoading(btn, false, '<i class="fas fa-paper-plane"></i> Submit Ticket');

    if (result.ok && result.data.ticket) {
        hideCreateTicketModal();
        showToast('Ticket created successfully!', 'success');
        openTicket(result.data.ticket.id);
    } else {
        showAlert('createTicketAlert', result.data.message || 'Failed to create ticket', 'danger');
    }
}

async function replyToTicket() {
    const content = document.getElementById('ticketReplyContent').value.trim();

    if (!content) {
        showToast('Please enter a message', 'warning');
        return;
    }

    const btn = document.querySelector('#ticketReplySection .btn-primary');
    setButtonLoading(btn, true);

    const result = await api('POST', `/support/tickets/${currentTicketId}/reply`, { body: content });

    setButtonLoading(btn, false, '<i class="fas fa-paper-plane"></i> Send Reply');

    if (result.ok) {
        document.getElementById('ticketReplyContent').value = '';
        showToast('Reply sent!', 'success');
        loadTicketDetail(currentTicketId);
    } else {
        showToast(result.data.message || 'Failed to send reply', 'error');
    }
}

async function closeTicket() {
    const confirmed = await showConfirm('Are you sure you want to close this ticket? This will mark it as resolved.', {
        title: 'Close Ticket',
        icon: 'fa-ticket-alt',
        confirmText: 'Close Ticket',
        confirmIcon: 'fa-check'
    });
    if (!confirmed) return;

    const result = await api('POST', `/support/tickets/${currentTicketId}/close`);

    if (result.ok) {
        showToast('Ticket closed', 'success');
        showPage('support');
    } else {
        showToast(result.data?.message || 'Failed to close ticket', 'error');
    }
}

// ==================== PROFILE ====================
async function loadProfile() {
    if (!currentUser) return;

    // Refresh user data from profile endpoint (includes badges/reputation)
    const result = await api('GET', '/profile');
    if (result.ok && result.data.profile) {
        // Merge profile data into currentUser
        Object.assign(currentUser, result.data.profile);

        // Update badge system enabled state from profile response
        if (result.data.profile.badge_system_enabled !== undefined) {
            badgeSystemEnabled = result.data.profile.badge_system_enabled;
            updateBadgeVisibility();
        }
    }

    // Update profile display
    const avatarEl = document.getElementById('profileAvatar');
    if (currentUser.profile_picture) {
        avatarEl.innerHTML = `<img src="${escapeHtml(currentUser.profile_picture)}" alt="Avatar">`;
    } else {
        avatarEl.textContent = getInitials(currentUser.display_name || currentUser.username);
    }

    document.getElementById('profileName').textContent = currentUser.display_name || currentUser.username;
    document.getElementById('profileUsername').textContent = '@' + currentUser.username;
    document.getElementById('profileRole').textContent = currentUser.role || 'Member';
    document.getElementById('profilePosts').textContent = currentUser.post_count || 0;
    document.getElementById('profileThreads').textContent = currentUser.thread_count || 0;
    document.getElementById('profileReputation').textContent = badgeSystemEnabled ? (currentUser.reputation || 0) : 0;
    document.getElementById('profileJoined').textContent = formatDate(currentUser.created_at || currentUser.join_date);
    document.getElementById('profileBio').textContent = currentUser.bio || 'No bio set.';

    // Load badges (only if badge system is enabled)
    if (badgeSystemEnabled) {
        loadProfileBadges();
    }

    // Load subscriptions
    loadSubscriptions();

    // Load friends
    loadFriends();

    // Load HWID state
    loadHwidState();

    // Load OAuth status
    loadOAuthStatusForProfile();

    // Load blocked users
    loadBlockedUsers();
}

// ==================== BADGES ====================

/**
 * Render badges as HTML
 * @param {Array} badges - Array of badge objects
 * @param {boolean} compact - If true, render in compact mode (for user card)
 * @returns {string} HTML string
 */
function renderBadges(badges, compact = false) {
    if (!badges || !Array.isArray(badges) || badges.length === 0) {
        return compact ? '' : '<div class="badges-empty">No badges earned yet</div>';
    }

    let html = '';
    for (const badge of badges) {
        const icon = badge.icon || 'fa-award';
        const color = badge.color || '#8b5cf6';
        const name = escapeHtml(badge.name || 'Badge');
        const description = escapeHtml(badge.description || '');
        const awardedAt = badge.awarded_at ? formatDate(badge.awarded_at) : '';

        if (compact) {
            html += `
                <div class="badge-item badge-compact" style="--badge-color: ${color}" title="${name}: ${description}">
                    <i class="fas ${icon}"></i>
                </div>
            `;
        } else {
            html += `
                <div class="badge-item" style="--badge-color: ${color}">
                    <div class="badge-icon">
                        <i class="fas ${icon}"></i>
                    </div>
                    <div class="badge-info">
                        <div class="badge-name">${name}</div>
                        <div class="badge-description">${description}</div>
                        ${awardedAt ? `<div class="badge-date">Earned ${awardedAt}</div>` : ''}
                    </div>
                </div>
            `;
        }
    }
    return html;
}

/**
 * Load and display badges on the profile page
 */
function loadProfileBadges() {
    const container = document.getElementById('profileBadgesList');
    if (!container) return;

    const badges = currentUser.badges || [];
    container.innerHTML = renderBadges(badges, false);
}

/**
 * Show a special notification when badges are awarded
 */
function showBadgeAwardNotification(badges) {
    if (!badges || badges.length === 0) return;

    for (const badge of badges) {
        const icon = badge.icon || 'fa-award';
        const color = badge.color || '#8b5cf6';
        const name = badge.name || 'Badge';

        // Create a special badge toast
        const toast = document.createElement('div');
        toast.className = 'toast toast-badge';
        toast.innerHTML = `
            <div class="toast-badge-icon" style="background: ${color}">
                <i class="fas ${icon}"></i>
            </div>
            <div class="toast-badge-content">
                <div class="toast-badge-title">Badge Earned!</div>
                <div class="toast-badge-name">${escapeHtml(name)}</div>
            </div>
        `;
        document.body.appendChild(toast);

        // Trigger animation
        setTimeout(() => toast.classList.add('show'), 10);

        // Remove after delay
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }
}

/**
 * Load all available badges for the badges page
 */
async function loadAllBadges() {
    const container = document.getElementById('allBadgesList');
    if (!container) return;

    container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading badges...</div>';

    const result = await api('GET', '/badges');

    if (result.ok && result.data.badges) {
        // Check if badge system is enabled
        badgeSystemEnabled = result.data.badge_system_enabled !== false;
        updateBadgeVisibility();

        if (!badgeSystemEnabled) {
            container.innerHTML = '<div class="badges-empty"><i class="fas fa-award"></i><p>Badge system is currently disabled</p></div>';
            return;
        }

        const badges = result.data.badges;

        if (badges.length === 0) {
            container.innerHTML = '<div class="badges-empty"><i class="fas fa-award"></i><p>No badges available yet</p></div>';
            return;
        }

        let html = '';
        for (const badge of badges) {
            const icon = badge.icon || 'fa-award';
            const color = badge.color || '#8b5cf6';
            const name = escapeHtml(badge.name || 'Badge');
            const description = escapeHtml(badge.description || '');
            const criteria = escapeHtml(badge.criteria || '');

            // Check if current user has this badge
            const userHasBadge = currentUser?.badges?.some(b => b.id === badge.id || b.name === badge.name);

            html += `
                <div class="all-badge-item ${userHasBadge ? 'badge-earned' : 'badge-locked'}" style="--badge-color: ${color}">
                    <div class="all-badge-icon">
                        <i class="fas ${icon}"></i>
                        ${userHasBadge ? '<span class="badge-checkmark"><i class="fas fa-check"></i></span>' : '<span class="badge-lock"><i class="fas fa-lock"></i></span>'}
                    </div>
                    <div class="all-badge-info">
                        <div class="all-badge-name">${name}</div>
                        <div class="all-badge-description">${description}</div>
                        ${criteria ? `<div class="all-badge-criteria"><i class="fas fa-info-circle"></i> ${criteria}</div>` : ''}
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
    } else {
        container.innerHTML = '<div class="badges-empty"><i class="fas fa-exclamation-triangle"></i><p>Failed to load badges</p></div>';
    }
}

/**
 * Update visibility of badge-related UI elements based on badge system state
 */
function updateBadgeVisibility() {
    // Hide/show badges nav tab
    const badgesNavTab = document.querySelector('.nav-tab[data-page="badges"]');
    if (badgesNavTab) {
        badgesNavTab.style.display = badgeSystemEnabled ? '' : 'none';
    }

    // Hide/show profile badges section
    const profileBadgesSection = document.getElementById('profileBadgesSection');
    if (profileBadgesSection) {
        profileBadgesSection.style.display = badgeSystemEnabled ? '' : 'none';
    }

    // Hide/show user card badges
    const userCardBadges = document.getElementById('userCardBadges');
    if (userCardBadges) {
        userCardBadges.style.display = badgeSystemEnabled ? '' : 'none';
    }
}

/**
 * Check if badge system is enabled for this portal and update UI accordingly
 */
async function checkBadgeSystemStatus() {
    const result = await api('GET', '/badges');
    if (result.ok) {
        badgeSystemEnabled = result.data.badge_system_enabled !== false;
        updateBadgeVisibility();
    }
}

// ==================== GLOBAL SEARCH ====================
let searchDebounceTimer = null;
let lastSearchQuery = '';
let lastSearchResults = null;

/**
 * Handle search input with debounce
 */
function onSearchInput() {
    const input = document.getElementById('globalSearchInput');
    const clearBtn = document.getElementById('searchClearBtn');
    const query = input.value.trim();

    // Show/hide clear button
    clearBtn.style.display = query.length > 0 ? '' : 'none';

    // Debounce search
    clearTimeout(searchDebounceTimer);
    if (query.length >= 2) {
        searchDebounceTimer = setTimeout(() => {
            performSearch();
        }, 300);
    }
}

/**
 * Clear search input and go back
 */
function clearSearch() {
    const input = document.getElementById('globalSearchInput');
    const clearBtn = document.getElementById('searchClearBtn');
    input.value = '';
    clearBtn.style.display = 'none';
    lastSearchQuery = '';
    lastSearchResults = null;
    showPage('forum');
}

/**
 * Perform global search
 */
async function performSearch() {
    const input = document.getElementById('globalSearchInput');
    const query = input.value.trim();

    if (query.length < 2) {
        showToast('Please enter at least 2 characters to search', 'warning');
        return;
    }

    if (query === lastSearchQuery && lastSearchResults) {
        // Use cached results
        showPage('search', false);
        return;
    }

    lastSearchQuery = query;

    // Show search page with loading state
    showPage('search', false);
    updateHash(`search/${encodeURIComponent(query)}`);

    document.getElementById('searchResultsSubtitle').textContent = `Searching for "${query}"...`;
    document.getElementById('searchResults').innerHTML = '<div class="loading"><div class="spinner"></div>Searching...</div>';

    const result = await api('GET', `/search?q=${encodeURIComponent(query)}&type=all&limit=20`);

    if (result.ok && result.data.results) {
        lastSearchResults = result.data.results;
        renderSearchResults(result.data.results);
    } else {
        document.getElementById('searchResults').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-circle"></i>
                <h3>Search Failed</h3>
                <p>${escapeHtml(result.data.message || 'An error occurred while searching')}</p>
            </div>
        `;
    }
}

/**
 * Render search results
 */
function renderSearchResults(results, filterType = 'all') {
    const container = document.getElementById('searchResults');
    const subtitle = document.getElementById('searchResultsSubtitle');

    const threads = results.threads || [];
    const posts = results.posts || [];
    const users = results.users || [];

    // Update counts in filter buttons
    document.getElementById('searchThreadsCount').textContent = threads.length > 0 ? `(${threads.length})` : '';
    document.getElementById('searchPostsCount').textContent = posts.length > 0 ? `(${posts.length})` : '';
    document.getElementById('searchUsersCount').textContent = users.length > 0 ? `(${users.length})` : '';

    const totalCount = threads.length + posts.length + users.length;
    subtitle.textContent = `Found ${totalCount} result${totalCount !== 1 ? 's' : ''} for "${results.query}"`;

    if (totalCount === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <h3>No Results Found</h3>
                <p>Try different keywords or check your spelling</p>
            </div>
        `;
        return;
    }

    let html = '';

    // Filter results based on type
    const showThreads = filterType === 'all' || filterType === 'threads';
    const showPosts = filterType === 'all' || filterType === 'posts';
    const showUsers = filterType === 'all' || filterType === 'users';

    // Render users
    if (showUsers && users.length > 0) {
        html += '<div class="search-section"><h3 class="search-section-title"><i class="fas fa-users"></i> Users</h3>';
        for (const user of users) {
            const avatar = user.profile_picture
                ? `<img src="${escapeHtml(user.profile_picture)}" alt="Avatar" onerror="this.parentElement.textContent='${getInitials(user.username)}'">`
                : getInitials(user.display_name || user.username);

            html += `
                <div class="search-result-item search-result-user" onclick="showUserCardById(${user.id})">
                    <div class="search-result-avatar">
                        ${typeof avatar === 'string' && avatar.startsWith('<img') ? avatar : avatar}
                    </div>
                    <div class="search-result-content">
                        <div class="search-result-title">${escapeHtml(user.display_name || user.username)}</div>
                        <div class="search-result-meta">@${escapeHtml(user.username)} &bull; ${escapeHtml(user.role || 'Member')}</div>
                    </div>
                </div>
            `;
        }
        html += '</div>';
    }

    // Render threads
    if (showThreads && threads.length > 0) {
        html += '<div class="search-section"><h3 class="search-section-title"><i class="fas fa-comment-alt"></i> Threads</h3>';
        for (const thread of threads) {
            html += `
                <div class="search-result-item search-result-thread" onclick="openThread(${thread.id})">
                    <div class="search-result-icon"><i class="fas fa-comment-alt"></i></div>
                    <div class="search-result-content">
                        <div class="search-result-title">${escapeHtml(thread.title)}</div>
                        <div class="search-result-snippet">${highlightSearchTerm(escapeHtml(thread.snippet), lastSearchQuery)}</div>
                        <div class="search-result-meta">
                            by ${escapeHtml(thread.author_name)} &bull; ${formatTimeAgo(thread.created_at)} &bull; ${thread.replies_count || 0} replies
                        </div>
                    </div>
                </div>
            `;
        }
        html += '</div>';
    }

    // Render posts
    if (showPosts && posts.length > 0) {
        html += '<div class="search-section"><h3 class="search-section-title"><i class="fas fa-reply"></i> Posts</h3>';
        for (const post of posts) {
            html += `
                <div class="search-result-item search-result-post" onclick="openThread(${post.thread_id})">
                    <div class="search-result-icon"><i class="fas fa-reply"></i></div>
                    <div class="search-result-content">
                        <div class="search-result-title">Re: ${escapeHtml(post.thread_title)}</div>
                        <div class="search-result-snippet">${highlightSearchTerm(escapeHtml(post.snippet), lastSearchQuery)}</div>
                        <div class="search-result-meta">
                            by ${escapeHtml(post.author_name)} &bull; ${formatTimeAgo(post.created_at)}
                        </div>
                    </div>
                </div>
            `;
        }
        html += '</div>';
    }

    container.innerHTML = html;
}

/**
 * Filter search results by type
 */
function filterSearchResults(type) {
    // Update active state of filter buttons
    document.querySelectorAll('.search-filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === type);
    });

    if (lastSearchResults) {
        renderSearchResults(lastSearchResults, type);
    }
}

/**
 * Highlight search term in text
 */
function highlightSearchTerm(text, term) {
    if (!term) return text;
    const regex = new RegExp(`(${escapeRegExp(term)})`, 'gi');
    return text.replace(regex, '<mark class="search-highlight">$1</mark>');
}

/**
 * Escape special regex characters
 */
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function loadSubscriptions() {
    const container = document.getElementById('subscriptionsList');
    if (!container) return;

    // Show loading state
    container.innerHTML = '<p style="color: var(--muted-text);"><i class="fas fa-spinner fa-spin"></i> Loading subscriptions...</p>';

    // Fetch available subscriptions from API
    const subscriptionsConfig = await fetchSubscriptionsConfig();

    // Get user's owned subscriptions (public_ids)
    // subscription_types contains the public_ids the user owns
    const subscriptionTypes = currentUser.subscription_types || currentUser.subscriptions || [];
    const subscriptionGrants = currentUser.subscription_grants || [];

    // Build list of owned subscription keys (from both subscription_types and active grants)
    const ownedKeys = [
        ...subscriptionTypes,
        ...subscriptionGrants
            .filter(grant => grant.status === 'active')
            .map(grant => grant.public_id || grant.name)
    ];

    if (subscriptionsConfig.length === 0) {
        container.innerHTML = '<p style="color: var(--muted-text);">No subscriptions configured for this portal.</p>';
        return;
    }

    let html = '';
    for (const sub of subscriptionsConfig) {
        const isOwned = ownedKeys.some(key =>
            String(key).toLowerCase() === String(sub.key).toLowerCase()
        );

        html += `
            <div class="subscription-card ${isOwned ? 'owned' : 'locked'}" ${!isOwned ? 'onclick="showRedeemKeyModal()"' : ''}>
                ${sub.image
                    ? `<img src="${escapeHtml(sub.image)}" alt="${escapeHtml(sub.name)}" class="subscription-image" onerror="this.outerHTML='<div class=\\'subscription-image-placeholder\\'><i class=\\'fas fa-crown\\'></i></div>'">`
                    : `<div class="subscription-image-placeholder"><i class="fas fa-crown"></i></div>`
                }
                <div class="subscription-info">
                    <div class="subscription-name">${escapeHtml(sub.name)}</div>
                    <div class="subscription-description">${escapeHtml(sub.description)}</div>
                    <div class="subscription-status ${isOwned ? 'owned' : 'locked'}">
                        <i class="fas fa-${isOwned ? 'check-circle' : 'lock'}"></i>
                        ${isOwned ? 'Owned' : 'Locked'}
                    </div>
                </div>
                ${!isOwned ? `
                    <div class="subscription-overlay">
                        <div class="subscription-overlay-text">
                            <i class="fas fa-key"></i> Redeem Key
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    container.innerHTML = html;
}

async function loadHwidState() {
    const result = await api('GET', '/auth/session');

    if (result.ok && result.data.customer) {
        const hwidState = result.data.customer.hwid_state;
        const hwidPolicy = result.data.customer.hwid_policy;

        if (hwidPolicy && hwidPolicy.enabled) {
            document.getElementById('hwidSection').style.display = '';

            // Status with cooldown time remaining
            const status = hwidState ? hwidState.status : 'unknown';
            let statusText = status;
            if (status === 'eligible') {
                statusText = 'Ready to Reset';
            } else if (status === 'cooldown') {
                const remaining = hwidState.cooldown_remaining_seconds || 0;
                statusText = `Cooldown (${formatDuration(remaining)} remaining)`;
            } else if (status === 'disabled') {
                statusText = 'Disabled';
            }
            document.getElementById('currentHwid').textContent = statusText;

            // Resets used count
            if (hwidState) {
                const used = hwidState.manual_reset_count || 0;
                document.getElementById('hwidResets').textContent = used.toString();
            }

            // Show/hide reset button based on can_reset
            const canReset = hwidState && hwidState.can_reset;
            document.getElementById('resetHwidBtn').style.display = canReset ? '' : 'none';
        } else {
            document.getElementById('hwidSection').style.display = 'none';
        }
    }
}

/**
 * Format seconds into a human-readable duration (e.g., "2h 30m", "45m", "30s")
 */
function formatDuration(seconds) {
    if (seconds <= 0) return '0s';

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 && days === 0 && hours === 0) parts.push(`${secs}s`);

    return parts.join(' ') || '0s';
}

async function loadFriends() {
    // Check if we're on the profile page (elements exist)
    const friendsListEl = document.getElementById('friendsList');
    const friendRequestsSection = document.getElementById('friendRequestsSection');
    const friendRequestsList = document.getElementById('friendRequestsList');
    const sentRequestsSection = document.getElementById('sentRequestsSection');
    const sentRequestsList = document.getElementById('sentRequestsList');

    if (!friendsListEl) return; // Not on profile page

    // Load friend requests (cache-bust to ensure fresh data)
    const requestsResult = await api('GET', `/friends/requests?_=${Date.now()}`);

    // Handle incoming requests
    const incomingRequests = requestsResult.data?.requests || [];
    if (requestsResult.ok && incomingRequests.length > 0) {
        if (friendRequestsSection) friendRequestsSection.style.display = '';
        let requestsHtml = '';
        for (const request of incomingRequests) {
            const sender = request.sender || {};
            requestsHtml += `
                <div class="friend-request">
                    <div class="friend-request-avatar" style="cursor: pointer;" onclick="showUserCardById(${sender.id})">
                        ${sender.profile_picture
                            ? `<img src="${escapeHtml(sender.profile_picture)}" alt="Avatar">`
                            : getInitials(sender.display_name || sender.username)}
                    </div>
                    <div class="friend-request-info" style="cursor: pointer;" onclick="showUserCardById(${sender.id})">
                        <div class="friend-request-name">${escapeHtml(sender.display_name || sender.username)}</div>
                        <div class="friend-request-time">${formatDate(request.created_at)}</div>
                    </div>
                    <div class="friend-request-actions">
                        <button class="btn btn-success btn-sm" onclick="acceptFriendRequest(${sender.id})">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="declineFriendRequest(${sender.id})">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            `;
        }
        if (friendRequestsList) friendRequestsList.innerHTML = requestsHtml;
    } else {
        if (friendRequestsSection) friendRequestsSection.style.display = 'none';
    }

    // Handle outgoing/sent requests
    const outgoingRequests = requestsResult.data?.outgoing || [];
    if (requestsResult.ok && outgoingRequests.length > 0) {
        if (sentRequestsSection) sentRequestsSection.style.display = '';
        let sentHtml = '';
        for (const request of outgoingRequests) {
            const recipient = request.recipient || request;
            const recipientId = recipient.id || request.recipient_id;
            sentHtml += `
                <div class="friend-request">
                    <div class="friend-request-avatar" style="cursor: pointer;" onclick="showUserCardById(${recipientId})">
                        ${recipient.profile_picture
                            ? `<img src="${escapeHtml(recipient.profile_picture)}" alt="Avatar">`
                            : getInitials(recipient.display_name || recipient.username)}
                    </div>
                    <div class="friend-request-info" style="cursor: pointer;" onclick="showUserCardById(${recipientId})">
                        <div class="friend-request-name">${escapeHtml(recipient.display_name || recipient.username)}</div>
                        <div class="friend-request-time" style="color: var(--warning);">Pending</div>
                    </div>
                    <div class="friend-request-actions">
                        <button class="btn btn-danger btn-sm" onclick="cancelFriendRequest(${recipientId})" title="Cancel Request">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            `;
        }
        if (sentRequestsList) sentRequestsList.innerHTML = sentHtml;
    } else {
        if (sentRequestsSection) sentRequestsSection.style.display = 'none';
    }

    // Load friends list (cache-bust to ensure fresh data)
    const friendsResult = await api('GET', `/friends?_=${Date.now()}`);
    if (friendsResult.ok && friendsResult.data.friends?.length > 0) {
        let friendsHtml = '<div class="members-grid" style="padding: 0;">';
        for (const friend of friendsResult.data.friends) {
            friendsHtml += `
                <div class="member-card" onclick="showUserCardById(${friend.id})">
                    <div class="member-avatar">
                        ${friend.profile_picture
                            ? `<img src="${escapeHtml(friend.profile_picture)}" alt="Avatar">`
                            : getInitials(friend.display_name || friend.username)}
                    </div>
                    <div class="member-info">
                        <div class="member-name">${escapeHtml(friend.display_name || friend.username)}</div>
                        <div class="member-role">${escapeHtml(friend.role || 'Member')}</div>
                    </div>
                </div>
            `;
        }
        friendsHtml += '</div>';
        friendsListEl.innerHTML = friendsHtml;
    } else {
        friendsListEl.innerHTML = '<div class="empty-state"><i class="fas fa-user-friends"></i><p>No friends yet</p></div>';
    }
}

async function acceptFriendRequest(userId, btn) {
    if (!btn) btn = event?.target?.closest('button');
    if (btn) setButtonLoading(btn, true);

    const result = await api('POST', '/friends/accept', { user_id: userId });

    if (btn) setButtonLoading(btn, false, '<i class="fas fa-check"></i>');

    if (result.ok) {
        showToast('Friend request accepted!', 'success');
        loadFriends();
    } else {
        showToast(result.data.message || 'Failed to accept request', 'error');
    }
}

async function declineFriendRequest(userId, btn) {
    if (!btn) btn = event?.target?.closest('button');
    if (btn) setButtonLoading(btn, true);

    const result = await api('POST', '/friends/reject', { user_id: userId });

    if (btn) setButtonLoading(btn, false, '<i class="fas fa-times"></i>');

    if (result.ok) {
        showToast('Friend request declined', 'info');
        loadFriends();
    } else {
        showToast(result.data.message || 'Failed to decline request', 'error');
    }
}

async function cancelFriendRequest(userId, btn) {
    if (!btn) btn = event?.target?.closest('button');
    if (btn) setButtonLoading(btn, true);

    const result = await api('POST', '/friends/cancel', { user_id: userId });

    if (btn) setButtonLoading(btn, false, '<i class="fas fa-times"></i>');

    if (result.ok) {
        showToast('Friend request canceled', 'info');
        loadFriends();
    } else {
        showToast(result.data.message || 'Failed to cancel request', 'error');
    }
}

// ==================== USER CARD ====================
function showUserCardById(userId) {
    // Always fetch fresh data to get current friendship status
    fetchAndShowUserCard(userId);
}

async function fetchAndShowUserCard(userId) {
    // Extract numeric ID if in format "customer_123"
    const numericId = userId.toString().replace('customer_', '');

    // Try the /users/ endpoint first (works with numeric IDs)
    let result = await api('GET', `/users/${numericId}`);

    // Fallback to /profile/ endpoint if /users/ fails
    if (!result.ok) {
        result = await api('GET', `/profile/${userId}`);
    }

    if (result.ok && result.data.profile) {
        const profile = result.data.profile;
        usersCache[userId] = {
            id: userId,
            username: profile.username || '',
            display_name: profile.display_name || profile.username || '',
            avatar: profile.avatar || profile.profile_picture || '',
            role: profile.role || '',
            bio: profile.bio || '',
            badges: profile.badges || [],
            reputation: profile.reputation || 0
        };
        showUserCard(usersCache[userId], result.data.friendship_status);
    } else {
        showToast('Failed to load user profile', 'error');
    }
}

async function showUserCardByUsername(username) {
    // Try to find in cache first by username
    for (const key in usersCache) {
        const user = usersCache[key];
        if (user.username && user.username.toLowerCase() === username.toLowerCase()) {
            showUserCard(user);
            return;
        }
    }

    // Fetch by username
    const result = await api('GET', `/users/by-username/${encodeURIComponent(username)}`);
    if (result.ok && result.data.profile) {
        const profile = result.data.profile;
        const userId = profile.id || `customer_${profile.customer_id}`;
        usersCache[userId] = {
            id: userId,
            username: profile.username || '',
            display_name: profile.display_name || profile.username || '',
            avatar: profile.avatar || profile.profile_picture || '',
            role: profile.role || '',
            bio: profile.bio || '',
            badges: profile.badges || [],
            reputation: profile.reputation || 0
        };
        showUserCard(usersCache[userId], result.data.friendship_status);
    } else {
        showToast('User not found', 'error');
    }
}

function showUserCard(user, friendshipStatus) {
    if (!user || !user.id) {
        showToast('User data not available', 'error');
        return;
    }

    currentUserCardUser = user;

    const avatarEl = document.getElementById('userCardAvatar');
    if (user.avatar || user.profile_picture) {
        avatarEl.innerHTML = `<img src="${escapeHtml(user.avatar || user.profile_picture)}" alt="Avatar" style="width: 100%; height: 100%; object-fit: cover;">`;
    } else {
        avatarEl.textContent = getInitials(user.display_name || user.username);
    }

    document.getElementById('userCardName').textContent = user.display_name || user.username;
    document.getElementById('userCardUsername').textContent = '@' + user.username;
    document.getElementById('userCardRole').textContent = user.role || 'Member';

    // Display badges in user card (only if badge system is enabled)
    const badgesContainer = document.getElementById('userCardBadges');
    if (badgesContainer) {
        if (!badgeSystemEnabled) {
            badgesContainer.innerHTML = '';
            badgesContainer.style.display = 'none';
        } else {
            const badges = user.badges || [];
            if (badges.length > 0) {
                badgesContainer.innerHTML = renderBadges(badges, true);
                badgesContainer.style.display = '';
            } else {
                badgesContainer.innerHTML = '';
                badgesContainer.style.display = 'none';
            }
        }
    }

    if (user.bio) {
        document.getElementById('userCardBio').textContent = user.bio;
        document.getElementById('userCardBio').style.display = '';
    } else {
        document.getElementById('userCardBio').style.display = 'none';
    }

    // Show/hide actions based on if it's the current user
    const isSelf = currentUser && currentUser.id == user.id;
    document.getElementById('userCardActions').style.display = isSelf ? 'none' : '';
    document.getElementById('userCardSelfNote').style.display = isSelf ? '' : 'none';

    // Update friend button based on friendship status
    const friendBtn = document.getElementById('userCardFriendBtn');
    friendBtn.disabled = false;

    if (friendshipStatus === 'friends') {
        friendBtn.innerHTML = '<i class="fas fa-user-minus"></i> Remove Friend';
        friendBtn.className = 'btn btn-danger btn-sm';
    } else if (friendshipStatus === 'request_received') {
        friendBtn.innerHTML = '<i class="fas fa-check"></i> Accept Request';
        friendBtn.className = 'btn btn-success btn-sm';
    } else if (friendshipStatus === 'request_sent') {
        friendBtn.innerHTML = '<i class="fas fa-times"></i> Cancel Request';
        friendBtn.className = 'btn btn-warning btn-sm';
    } else {
        friendBtn.innerHTML = '<i class="fas fa-user-plus"></i> Add Friend';
        friendBtn.className = 'btn btn-secondary btn-sm';
    }

    // Update block button state
    const blockBtn = document.getElementById('userCardBlockBtn');
    if (blockBtn) {
        if (isSelf || !currentUser) {
            blockBtn.style.display = 'none';
        } else {
            blockBtn.style.display = '';
            updateBlockButtonState();
        }
    }

    document.getElementById('userCardModal').classList.add('active');

    // Fetch full profile for friendship status and block status if not provided
    if (!friendshipStatus && !isSelf && currentUser) {
        fetchUserFriendshipStatus(user.id);
    }
}

async function fetchUserFriendshipStatus(userId) {
    const result = await api('GET', `/users/${userId}`);
    if (result.ok) {
        // Update friendship status
        if (result.data.friendship_status) {
            const friendBtn = document.getElementById('userCardFriendBtn');
            const status = result.data.friendship_status;

            friendBtn.disabled = false;
            if (status === 'friends') {
                friendBtn.innerHTML = '<i class="fas fa-user-minus"></i> Remove Friend';
                friendBtn.className = 'btn btn-danger btn-sm';
            } else if (status === 'request_received') {
                friendBtn.innerHTML = '<i class="fas fa-check"></i> Accept Request';
                friendBtn.className = 'btn btn-success btn-sm';
            } else if (status === 'request_sent') {
                friendBtn.innerHTML = '<i class="fas fa-times"></i> Cancel Request';
                friendBtn.className = 'btn btn-warning btn-sm';
            } else {
                friendBtn.innerHTML = '<i class="fas fa-user-plus"></i> Add Friend';
                friendBtn.className = 'btn btn-secondary btn-sm';
            }
        }

        // Update block status
        if (currentUserCardUser && result.data.is_blocked !== undefined) {
            currentUserCardUser.is_blocked = result.data.is_blocked;
            updateBlockButtonState();
        }
    }
}

function hideUserCardModal() {
    document.getElementById('userCardModal').classList.remove('active');
    currentUserCardUser = null;
}

async function toggleFriendFromCard() {
    if (!currentUser) {
        showPage('login');
        return;
    }

    if (!currentUserCardUser) return;

    const friendBtn = document.getElementById('userCardFriendBtn');
    const isFriend = friendBtn.innerHTML.includes('Remove Friend');
    const isAcceptRequest = friendBtn.innerHTML.includes('Accept Request');
    const isCancelRequest = friendBtn.innerHTML.includes('Cancel Request');
    const originalHtml = friendBtn.innerHTML;

    friendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    friendBtn.disabled = true;

    if (isFriend) {
        const result = await api('DELETE', `/friends/${currentUserCardUser.id}`);
        if (result.ok) {
            showToast('Friend removed', 'info');
            friendBtn.innerHTML = '<i class="fas fa-user-plus"></i> Add Friend';
            friendBtn.className = 'btn btn-secondary btn-sm';
            friendBtn.disabled = false;
            // Refresh friends list on profile page
            loadFriends();
        } else {
            friendBtn.innerHTML = originalHtml;
            friendBtn.disabled = false;
            showToast(result.data.message || 'Failed to remove friend', 'error');
        }
    } else if (isAcceptRequest) {
        const result = await api('POST', '/friends/accept', { user_id: currentUserCardUser.id });
        if (result.ok) {
            showToast('Friend request accepted!', 'success');
            friendBtn.innerHTML = '<i class="fas fa-user-minus"></i> Remove Friend';
            friendBtn.className = 'btn btn-danger btn-sm';
            friendBtn.disabled = false;
            // Refresh friends list on profile page
            loadFriends();
        } else {
            friendBtn.innerHTML = originalHtml;
            friendBtn.disabled = false;
            showToast(result.data.message || 'Failed to accept request', 'error');
        }
    } else if (isCancelRequest) {
        const result = await api('POST', '/friends/cancel', { user_id: currentUserCardUser.id });
        if (result.ok) {
            showToast('Friend request canceled', 'info');
            friendBtn.innerHTML = '<i class="fas fa-user-plus"></i> Add Friend';
            friendBtn.className = 'btn btn-secondary btn-sm';
            friendBtn.disabled = false;
            // Refresh friends list on profile page
            loadFriends();
        } else {
            friendBtn.innerHTML = originalHtml;
            friendBtn.disabled = false;
            showToast(result.data.message || 'Failed to cancel request', 'error');
        }
    } else {
        const result = await api('POST', '/friends/request', { user_id: currentUserCardUser.id });
        if (result.ok) {
            showToast('Friend request sent!', 'success');
            friendBtn.innerHTML = '<i class="fas fa-times"></i> Cancel Request';
            friendBtn.className = 'btn btn-warning btn-sm';
            friendBtn.disabled = false;
            // Refresh friends list on profile page
            loadFriends();
        } else {
            friendBtn.innerHTML = originalHtml;
            friendBtn.disabled = false;
            showToast(result.data?.message || 'Failed to send request', 'error');
        }
    }
}

let messageRecipient = null;

// ==================== USER BLOCKING ====================

/**
 * Toggle block status from user card modal
 */
async function toggleBlockFromCard() {
    if (!currentUser) {
        showPage('login');
        return;
    }

    if (!currentUserCardUser) return;

    const blockBtn = document.getElementById('userCardBlockBtn');
    const originalHtml = blockBtn.innerHTML;
    blockBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    blockBtn.disabled = true;

    const isCurrentlyBlocked = currentUserCardUser.is_blocked;
    const action = isCurrentlyBlocked ? 'unblock' : 'block';

    const result = await api('POST', '/users/block', {
        user_id: currentUserCardUser.id,
        action: action
    });

    if (result.ok) {
        currentUserCardUser.is_blocked = !isCurrentlyBlocked;
        updateBlockButtonState();
        showToast(result.data.message || (action === 'block' ? 'User blocked' : 'User unblocked'), 'success');

        // Refresh blocked users list on profile page if visible
        if (document.getElementById('page-profile').classList.contains('active')) {
            loadBlockedUsers();
        }
    } else {
        blockBtn.innerHTML = originalHtml;
        blockBtn.disabled = false;
        showToast(result.data?.message || 'Failed to ' + action + ' user', 'error');
    }
}

/**
 * Update the block button text/style based on current block status
 */
function updateBlockButtonState() {
    const blockBtn = document.getElementById('userCardBlockBtn');
    const messageBtn = document.getElementById('userCardMessageBtn');

    if (!blockBtn || !currentUserCardUser) return;

    const isBlocked = currentUserCardUser.is_blocked;

    if (isBlocked) {
        blockBtn.innerHTML = '<i class="fas fa-ban"></i> Unblock';
        blockBtn.className = 'btn btn-warning btn-sm';
        // Disable message button if user is blocked
        if (messageBtn) {
            messageBtn.disabled = true;
            messageBtn.title = 'You have blocked this user';
        }
    } else {
        blockBtn.innerHTML = '<i class="fas fa-ban"></i> Block';
        blockBtn.className = 'btn btn-secondary btn-sm';
        if (messageBtn) {
            messageBtn.disabled = false;
            messageBtn.title = '';
        }
    }

    blockBtn.disabled = false;
}

/**
 * Block a user by ID (used from various places)
 */
async function blockUser(userId) {
    if (!currentUser) {
        showToast('Please login to block users', 'warning');
        return false;
    }

    const result = await api('POST', '/users/block', {
        user_id: userId,
        action: 'block'
    });

    if (result.ok) {
        showToast('User blocked', 'success');
        return true;
    } else {
        showToast(result.data?.message || 'Failed to block user', 'error');
        return false;
    }
}

/**
 * Unblock a user by ID
 */
async function unblockUser(userId) {
    if (!currentUser) {
        showToast('Please login to unblock users', 'warning');
        return false;
    }

    const result = await api('POST', '/users/block', {
        user_id: userId,
        action: 'unblock'
    });

    if (result.ok) {
        showToast('User unblocked', 'success');
        return true;
    } else {
        showToast(result.data?.message || 'Failed to unblock user', 'error');
        return false;
    }
}

/**
 * Load blocked users list for profile page
 */
async function loadBlockedUsers() {
    const container = document.getElementById('blockedUsersList');
    if (!container) return;

    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    const result = await api('GET', '/users/blocked');

    if (result.ok) {
        const blockedUsers = result.data.blocked_users || [];

        if (blockedUsers.length === 0) {
            container.innerHTML = '<div class="empty-state-small"><i class="fas fa-check-circle"></i><p>No blocked users</p></div>';
            return;
        }

        let html = '';
        for (const user of blockedUsers) {
            const avatar = user.profile_picture
                ? `<img src="${escapeHtml(user.profile_picture)}" alt="Avatar">`
                : getInitials(user.display_name || user.username);

            html += `
                <div class="blocked-user-item">
                    <div class="blocked-user-avatar">
                        ${typeof avatar === 'string' && avatar.startsWith('<img') ? avatar : avatar}
                    </div>
                    <div class="blocked-user-info">
                        <div class="blocked-user-name">${escapeHtml(user.display_name || user.username)}</div>
                        <div class="blocked-user-username">@${escapeHtml(user.username)}</div>
                    </div>
                    <button class="btn btn-secondary btn-sm" onclick="unblockUserFromList(${user.id})">
                        <i class="fas fa-unlock"></i> Unblock
                    </button>
                </div>
            `;
        }
        container.innerHTML = html;
    } else {
        container.innerHTML = '<div class="empty-state-small"><i class="fas fa-exclamation-circle"></i><p>Failed to load blocked users</p></div>';
    }
}

/**
 * Unblock user from the blocked users list
 */
async function unblockUserFromList(userId) {
    const success = await unblockUser(userId);
    if (success) {
        loadBlockedUsers();
    }
}

function startConversationWithUser() {
    if (!currentUser) {
        showPage('login');
        return;
    }

    if (!currentUserCardUser) return;

    // Save recipient before hiding modal (which clears currentUserCardUser)
    messageRecipient = { ...currentUserCardUser };

    hideUserCardModal();

    document.getElementById('sendMsgRecipientName').textContent = messageRecipient.display_name || messageRecipient.username;
    document.getElementById('sendMsgRecipientUsername').textContent = '@' + messageRecipient.username;

    const avatarEl = document.getElementById('sendMsgRecipientAvatar');
    if (messageRecipient.avatar || messageRecipient.profile_picture) {
        avatarEl.innerHTML = `<img src="${escapeHtml(messageRecipient.avatar || messageRecipient.profile_picture)}" alt="Avatar" style="width: 100%; height: 100%; object-fit: cover;">`;
    } else {
        avatarEl.textContent = getInitials(messageRecipient.display_name || messageRecipient.username);
    }

    document.getElementById('newMessageContent').value = '';
    document.getElementById('sendMessageAlert').innerHTML = '';
    document.getElementById('sendMessageModal').classList.add('active');
}

function hideSendMessageModal() {
    document.getElementById('sendMessageModal').classList.remove('active');
}

async function sendNewMessage() {
    const content = document.getElementById('newMessageContent').value.trim();

    if (!content) {
        showAlert('sendMessageAlert', 'Please enter a message', 'warning');
        return;
    }

    if (!messageRecipient) {
        showAlert('sendMessageAlert', 'No recipient selected', 'danger');
        return;
    }

    const btn = document.querySelector('#sendMessageModal .btn-primary');
    setButtonLoading(btn, true);

    const result = await api('POST', '/messages', {
        recipient_id: messageRecipient.id,
        content
    });

    setButtonLoading(btn, false, '<i class="fas fa-paper-plane"></i> Send');

    if (result.ok) {
        hideSendMessageModal();
        showToast('Message sent!', 'success');

        // Set conversation data and navigate
        currentConversationId = result.data.conversation_id;
        currentConvParticipant = messageRecipient;
        showPage('conversation');
    } else {
        showAlert('sendMessageAlert', result.data.message || 'Failed to send message', 'danger');
    }
}

// ==================== AVATAR ====================
function showAvatarModal() {
    if (!currentUser) return;

    currentAvatarUrl = currentUser.profile_picture || '';
    document.getElementById('avatarUrlInput').value = currentAvatarUrl;
    document.getElementById('avatarModalAlert').innerHTML = '';

    previewAvatar();
    document.getElementById('avatarModal').classList.add('active');
}

function hideAvatarModal() {
    document.getElementById('avatarModal').classList.remove('active');
}

function previewAvatar() {
    const url = document.getElementById('avatarUrlInput').value.trim();
    const preview = document.getElementById('avatarPreview');
    const initial = document.getElementById('avatarPreviewInitial');

    if (url) {
        preview.innerHTML = `<img src="${escapeHtml(url)}" alt="Preview" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.parentElement.innerHTML='<span>${getInitials(currentUser?.display_name || currentUser?.username || 'U')}</span>'">`;
    } else {
        preview.innerHTML = `<span>${getInitials(currentUser?.display_name || currentUser?.username || 'U')}</span>`;
    }
}

function clearAvatar() {
    document.getElementById('avatarUrlInput').value = '';
    previewAvatar();
}

async function saveAvatar() {
    const url = document.getElementById('avatarUrlInput').value.trim();

    const btn = document.querySelector('#avatarModal .btn-primary');
    setButtonLoading(btn, true);

    const result = await api('PUT', '/profile', { profile_picture: url || null });

    setButtonLoading(btn, false, '<i class="fas fa-save"></i> Save');

    if (result.ok) {
        currentUser.profile_picture = url || null;
        hideAvatarModal();
        showToast('Avatar updated!', 'success');
        loadProfile();
        updateUIForUser();
    } else {
        showAlert('avatarModalAlert', result.data.message || 'Failed to update avatar', 'danger');
    }
}

// ==================== EDIT BIO ====================
function showEditBioModal() {
    document.getElementById('editBioInput').value = currentUser?.bio || '';
    document.getElementById('editBioAlert').innerHTML = '';
    document.getElementById('editBioModal').classList.add('active');
}

function hideEditBioModal() {
    document.getElementById('editBioModal').classList.remove('active');
}

async function saveBio() {
    const bio = document.getElementById('editBioInput').value.trim();

    const btn = document.querySelector('#editBioModal .btn-primary');
    setButtonLoading(btn, true);

    const result = await api('PUT', '/profile', { bio });

    setButtonLoading(btn, false, '<i class="fas fa-save"></i> Save');

    if (result.ok) {
        currentUser.bio = bio;
        hideEditBioModal();
        showToast('Bio updated!', 'success');
        loadProfile();
    } else {
        showAlert('editBioAlert', result.data.message || 'Failed to update bio', 'danger');
    }
}

// ==================== HWID ====================
async function resetHwid() {
    const confirmed = await showConfirm('This will reset your hardware ID, allowing you to log in from a different device.', {
        title: 'Reset HWID',
        icon: 'fa-desktop',
        confirmText: 'Reset HWID',
        confirmIcon: 'fa-sync'
    });
    if (!confirmed) return;

    const btn = document.getElementById('resetHwidBtn');
    setButtonLoading(btn, true);

    const result = await api('POST', '/auth/hwid/reset');

    setButtonLoading(btn, false, '<i class="fas fa-redo"></i> Reset HWID');

    if (result.ok) {
        showToast('HWID reset successfully!', 'success');
        loadHwidState();
    } else {
        showToast(result.data.message || 'Failed to reset HWID', 'error');
    }
}

// ==================== REDEEM KEY ====================
function showRedeemKeyModal() {
    document.getElementById('redeemKeyInput').value = '';
    document.getElementById('redeemKeyAlert').innerHTML = '';
    document.getElementById('redeemKeyModal').classList.add('active');
}

function hideRedeemKeyModal() {
    document.getElementById('redeemKeyModal').classList.remove('active');
}

async function redeemLicenseKey() {
    const key = document.getElementById('redeemKeyInput').value.trim();

    if (!key) {
        showAlert('redeemKeyAlert', 'Please enter a license key', 'danger');
        return;
    }

    const btn = document.querySelector('#redeemKeyModal .btn-primary');
    setButtonLoading(btn, true);

    const result = await api('POST', '/auth/redeem-key', { key });

    setButtonLoading(btn, false, '<i class="fas fa-check"></i> Redeem Key');

    if (result.ok) {
        hideRedeemKeyModal();
        showToast('License key redeemed successfully!', 'success');
        // Refresh session and subscriptions
        await validateSession();
        loadSubscriptions();
    } else {
        showAlert('redeemKeyAlert', result.data.message || 'Invalid license key', 'danger');
    }
}

// ==================== BBCODE ====================
function insertBBCode(textareaId, tag) {
    const textarea = document.getElementById(textareaId);
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end);

    let newText;
    if (tag === 'list') {
        if (selectedText) {
            const items = selectedText.split('\n').map(line => '[*]' + line.trim()).join('\n');
            newText = '[list]\n' + items + '\n[/list]';
        } else {
            newText = '[list]\n[*]Item 1\n[*]Item 2\n[/list]';
        }
    } else {
        newText = `[${tag}]${selectedText}[/${tag}]`;
    }

    textarea.value = text.substring(0, start) + newText + text.substring(end);
    textarea.focus();
    textarea.setSelectionRange(start + newText.length, start + newText.length);
}

async function insertBBCodeUrl(textareaId) {
    const url = await showPrompt('Enter the URL you want to link to.', {
        title: 'Insert Link',
        icon: 'fa-link',
        label: 'URL',
        placeholder: 'https://example.com',
        confirmText: 'Insert',
        confirmIcon: 'fa-plus'
    });
    if (url) {
        const textarea = document.getElementById(textareaId);
        const start = textarea.selectionStart;
        const text = textarea.value;
        const selectedText = text.substring(textarea.selectionStart, textarea.selectionEnd) || url;

        const newText = `[url=${url}]${selectedText}[/url]`;
        textarea.value = text.substring(0, start) + newText + text.substring(textarea.selectionEnd);
        textarea.focus();
    }
}

async function insertBBCodeImg(textareaId) {
    const url = await showPrompt('Enter the image URL to embed.', {
        title: 'Insert Image',
        icon: 'fa-image',
        label: 'Image URL',
        placeholder: 'https://example.com/image.png',
        confirmText: 'Insert',
        confirmIcon: 'fa-plus'
    });
    if (url) {
        const textarea = document.getElementById(textareaId);
        const start = textarea.selectionStart;
        const text = textarea.value;

        const newText = `[img]${url}[/img]`;
        textarea.value = text.substring(0, start) + newText + text.substring(textarea.selectionEnd);
        textarea.focus();
    }
}

async function insertBBCodeSize(textareaId) {
    const sizeChoice = await showChoice('Select the text size:', [
        { value: 'sm', label: 'Small' },
        { value: 'md', label: 'Medium' },
        { value: 'lg', label: 'Large' },
        { value: 'xl', label: 'Extra Large' },
        { value: 'xxl', label: 'Huge' }
    ], {
        title: 'Text Size',
        icon: 'fa-text-height'
    });
    if (!sizeChoice) return;

    const size = sizeChoice;

    const textarea = document.getElementById(textareaId);
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end) || 'text';

    const newText = `[size=${size}]${selectedText}[/size]`;
    textarea.value = text.substring(0, start) + newText + text.substring(end);
    textarea.focus();
}

async function insertBBCodeColor(textareaId) {
    const colorChoice = await showPrompt('Enter a color name or hex code.', {
        title: 'Text Color',
        icon: 'fa-palette',
        label: 'Color',
        placeholder: 'red, blue, #ff0000, #3b82f6',
        defaultValue: 'red',
        confirmText: 'Apply',
        confirmIcon: 'fa-check'
    });
    if (!colorChoice) return;

    const color = colorChoice.trim();

    const textarea = document.getElementById(textareaId);
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end) || 'text';

    const newText = `[color=${color}]${selectedText}[/color]`;
    textarea.value = text.substring(0, start) + newText + text.substring(end);
    textarea.focus();
}

function parseBBCode(text) {
    if (!text) return '';

    let html = escapeHtml(text);

    // Basic formatting
    html = html.replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '<strong class="bb-bold">$1</strong>');
    html = html.replace(/\[i\]([\s\S]*?)\[\/i\]/gi, '<em class="bb-italic">$1</em>');
    html = html.replace(/\[u\]([\s\S]*?)\[\/u\]/gi, '<span class="bb-underline">$1</span>');
    html = html.replace(/\[s\]([\s\S]*?)\[\/s\]/gi, '<span class="bb-strike">$1</span>');

    // Code
    html = html.replace(/\[code\]([\s\S]*?)\[\/code\]/gi, '<pre class="bb-code">$1</pre>');

    // Quote with author
    html = html.replace(/\[quote=([^\]]+)\]([\s\S]*?)\[\/quote\]/gi, '<blockquote class="bb-quote"><div class="bb-quote-author"><i class="fas fa-quote-left"></i> $1 wrote:</div><div class="bb-quote-content">$2</div></blockquote>');
    // Quote without author
    html = html.replace(/\[quote\]([\s\S]*?)\[\/quote\]/gi, '<blockquote class="bb-quote"><div class="bb-quote-content">$1</div></blockquote>');

    // Spoiler
    html = html.replace(/\[spoiler\]([\s\S]*?)\[\/spoiler\]/gi, '<span class="bb-spoiler">$1</span>');

    // Size with named values or numeric
    const sizeMap = {
        'xs': 10, 'xsmall': 10,
        'sm': 12, 'small': 12,
        'md': 14, 'medium': 14,
        'lg': 18, 'large': 18,
        'xl': 22, 'xlarge': 22,
        'xxl': 26, 'xxlarge': 26,
        'huge': 30
    };
    html = html.replace(/\[size=([^\]]+)\]([\s\S]*?)\[\/size\]/gi, function(match, size, text) {
        let fontSize;
        const sizeLower = size.toLowerCase().trim();
        if (sizeMap[sizeLower]) {
            fontSize = sizeMap[sizeLower];
        } else if (/^\d+$/.test(size)) {
            fontSize = Math.min(36, Math.max(8, parseInt(size)));
        } else {
            fontSize = 14; // default
        }
        return '<span style="font-size: ' + fontSize + 'px;">' + text + '</span>';
    });

    // Color
    html = html.replace(/\[color=([a-zA-Z]+|#[0-9a-fA-F]{3,6})\]([\s\S]*?)\[\/color\]/gi, '<span style="color: $1">$2</span>');

    // URL
    html = html.replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, '<a href="$1" target="_blank" rel="noopener">$2</a>');
    html = html.replace(/\[url\]([\s\S]*?)\[\/url\]/gi, '<a href="$1" target="_blank" rel="noopener">$1</a>');

    // Image
    html = html.replace(/\[img\]([\s\S]*?)\[\/img\]/gi, '<img src="$1" class="bb-img" alt="Image" onerror="this.style.display=\'none\'">');

    // Auto-embed image URLs (URLs ending with image extensions) that aren't already in img tags
    html = html.replace(/(?<!src="|href=")(https?:\/\/[^\s<>"]+\.(?:jpg|jpeg|png|gif|webp|bmp|svg))(?![^<]*<\/(?:a|img)>)/gi, '<img src="$1" class="bb-img" alt="Image" onerror="this.style.display=\'none\'">');

    // List
    html = html.replace(/\[list\]([\s\S]*?)\[\/list\]/gi, (match, content) => {
        const items = content.split(/\[\*\]/).filter(item => item.trim());
        return '<ul>' + items.map(item => `<li>${item.trim()}</li>`).join('') + '</ul>';
    });

    // YouTube BBCode - extract video ID from various formats
    html = html.replace(/\[youtube\]([\s\S]*?)\[\/youtube\]/gi, (match, content) => {
        const videoId = extractYouTubeId(content.trim());
        if (videoId) {
            return `<div class="bb-youtube"><iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
        }
        return match;
    });

    // Auto-embed YouTube URLs (not already in tags)
    html = html.replace(/(?<!src="|href="|">)(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})(?:[^\s<]*)?)/gi, (match, url, videoId) => {
        return `<div class="bb-youtube"><iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
    });

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    // @mentions - make them clickable
    html = html.replace(/@([a-zA-Z0-9_-]{3,30})/g, '<span class="mention-link" onclick="showUserCardByUsername(\'$1\')">@$1</span>');

    return html;
}

// ==================== LOADING STATES ====================
function setButtonLoading(button, loading, originalHtml = null) {
    if (typeof button === 'string') {
        button = document.querySelector(button);
    }
    if (!button) return;

    if (loading) {
        button.dataset.originalHtml = button.innerHTML;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
        button.disabled = true;
    } else {
        button.innerHTML = originalHtml || button.dataset.originalHtml || button.innerHTML;
        button.disabled = false;
    }
}

function setFormLoading(formId, loading) {
    const form = document.getElementById(formId);
    if (!form) return;

    const inputs = form.querySelectorAll('input, textarea, select');
    const buttons = form.querySelectorAll('button');

    inputs.forEach(input => input.disabled = loading);
    buttons.forEach(btn => {
        if (loading) {
            btn.dataset.originalHtml = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Please wait...';
            btn.disabled = true;
        } else {
            btn.innerHTML = btn.dataset.originalHtml || btn.innerHTML;
            btn.disabled = false;
        }
    });
}

// ==================== UTILITIES ====================
function extractYouTubeId(input) {
    if (!input) return null;
    // If it's already just a video ID (11 characters)
    if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
        return input;
    }
    // Extract from various YouTube URL formats
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
        /^([a-zA-Z0-9_-]{11})$/
    ];
    for (const pattern of patterns) {
        const match = input.match(pattern);
        if (match) return match[1];
    }
    return null;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getInitials(name) {
    if (!name || typeof name !== 'string') return 'U';
    // Remove non-letter characters and get first letters of words
    const cleaned = name.trim().replace(/[^a-zA-Z\s]/g, '');
    if (!cleaned) return 'U';
    const initials = cleaned.split(/\s+/).filter(n => n.length > 0).map(n => n[0]).join('').substring(0, 2).toUpperCase();
    return initials || 'U';
}

function getRoleClass(role) {
    if (!role) return '';
    const r = role.toLowerCase();
    if (r === 'admin' || r === 'administrator') return 'admin';
    if (r === 'mod' || r === 'moderator') return 'moderator';
    if (r === 'vip' || r === 'premium') return 'vip';
    return '';
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    // Check for invalid date
    if (isNaN(date.getTime())) return '-';
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ==================== MODERATION HELPERS ====================
function isPortalModerator() {
    if (!currentUser) return false;
    const role = (currentUser.role || '').toLowerCase();
    return role === 'admin' || role === 'moderator';
}

function isPortalAdmin() {
    if (!currentUser) return false;
    const role = (currentUser.role || '').toLowerCase();
    return role === 'admin';
}

function isPortalStaff() {
    if (!currentUser) return false;
    const role = (currentUser.role || '').toLowerCase();
    return ['admin', 'moderator', 'support', 'staff'].includes(role);
}

// ==================== FORUM MODERATION ====================
async function toggleThreadLock(threadId) {
    if (!isPortalModerator()) {
        showToast('Moderator access required', 'error');
        return;
    }

    const result = await api('POST', `/forum/threads/${threadId}/lock`);
    if (result.ok) {
        showToast(result.data.message || 'Thread lock toggled', 'success');
        loadThread(threadId);
    } else {
        showToast(result.data?.message || 'Failed to toggle lock', 'error');
    }
}

async function toggleThreadPin(threadId) {
    if (!isPortalModerator()) {
        showToast('Moderator access required', 'error');
        return;
    }

    const result = await api('POST', `/forum/threads/${threadId}/pin`);
    if (result.ok) {
        showToast(result.data.message || 'Thread pin toggled', 'success');
        loadThread(threadId);
    } else {
        showToast(result.data?.message || 'Failed to toggle pin', 'error');
    }
}

async function setThreadPinType(threadId, pinType) {
    if (!isPortalModerator()) {
        showToast('Moderator access required', 'error');
        return;
    }

    const result = await api('POST', `/forum/threads/${threadId}/pin`, { pin_type: pinType });
    if (result.ok) {
        showToast(result.data.message || `Thread ${pinType === 'none' ? 'unpinned' : 'set as ' + pinType}`, 'success');
        loadThread(threadId);
    } else {
        showToast(result.data?.message || 'Failed to update pin type', 'error');
    }
}

function showMoveThreadModal(threadId) {
    if (!isPortalModerator()) {
        showToast('Moderator access required', 'error');
        return;
    }
    document.getElementById('moveThreadId').value = threadId;
    loadCategoriesForMove();
    document.getElementById('moveThreadModal').classList.add('active');
}

function hideMoveThreadModal() {
    document.getElementById('moveThreadModal').classList.remove('active');
}

async function loadCategoriesForMove() {
    const select = document.getElementById('moveThreadCategory');
    select.innerHTML = '<option value="">Loading...</option>';

    const result = await api('GET', '/forum/categories');
    if (result.ok && result.data.categories) {
        let html = '<option value="">Select category...</option>';
        for (const cat of result.data.categories) {
            html += `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`;
            if (cat.children) {
                for (const child of cat.children) {
                    html += `<option value="${child.id}">&nbsp;&nbsp;${escapeHtml(child.name)}</option>`;
                }
            }
        }
        select.innerHTML = html;
    } else {
        select.innerHTML = '<option value="">Failed to load categories</option>';
    }
}

async function moveThread() {
    const threadId = document.getElementById('moveThreadId').value;
    const categoryId = document.getElementById('moveThreadCategory').value;

    if (!categoryId) {
        showToast('Please select a category', 'warning');
        return;
    }

    const result = await api('POST', `/forum/threads/${threadId}/move`, { category_id: parseInt(categoryId) });
    if (result.ok) {
        showToast('Thread moved successfully', 'success');
        hideMoveThreadModal();
        loadThread(parseInt(threadId));
    } else {
        showToast(result.data?.message || 'Failed to move thread', 'error');
    }
}

async function deleteThreadMod(threadId) {
    if (!isPortalModerator()) {
        showToast('Moderator access required', 'error');
        return;
    }
    const confirmed = await showConfirm('Are you sure you want to delete this thread? All replies will also be deleted. This cannot be undone.', {
        title: 'Delete Thread',
        icon: 'fa-trash-alt',
        confirmText: 'Delete Thread',
        confirmIcon: 'fa-trash',
        danger: true
    });
    if (!confirmed) return;

    const result = await api('DELETE', `/forum/threads/${threadId}`);
    if (result.ok) {
        showToast('Thread deleted', 'success');
        // Navigate back to category if we have one, otherwise forum
        if (currentCategoryId) {
            openCategory(currentCategoryId);
        } else {
            showPage('forum');
        }
    } else {
        showToast(result.data?.message || 'Failed to delete thread', 'error');
    }
}

// ==================== THREAD EDITING ====================
function showEditThreadModal(threadId) {
    document.getElementById('editThreadId').value = threadId;

    // Get title and content from data attributes
    const threadEl = document.querySelector(`.message[data-thread-id="${threadId}"]`);
    let title = '';
    let content = '';
    if (threadEl) {
        title = threadEl.dataset.threadTitle || '';
        const encodedContent = threadEl.dataset.threadContent;
        if (encodedContent) {
            try {
                content = decodeURIComponent(atob(encodedContent));
            } catch (e) {
                console.error('Failed to decode thread content:', e);
            }
        }
    }

    document.getElementById('editThreadTitle').value = title;
    document.getElementById('editThreadContent').value = content;
    document.getElementById('editThreadModal').classList.add('active');
}

function hideEditThreadModal() {
    document.getElementById('editThreadModal').classList.remove('active');
}

async function saveEditedThread() {
    const threadId = document.getElementById('editThreadId').value;
    const title = document.getElementById('editThreadTitle').value.trim();
    const content = document.getElementById('editThreadContent').value.trim();

    if (!title && !content) {
        showToast('Title or content is required', 'warning');
        return;
    }

    const payload = {};
    if (title) payload.title = title;
    if (content) payload.content = content;

    const result = await api('PUT', `/forum/threads/${threadId}`, payload);
    if (result.ok) {
        showToast('Thread updated', 'success');
        hideEditThreadModal();
        // Reload the thread to show updated content
        loadThread(parseInt(threadId));
    } else {
        showToast(result.data?.message || 'Failed to update thread', 'error');
    }
}

// ==================== REPLY MODERATION ====================
function showEditReplyModal(threadId, replyId) {
    document.getElementById('editReplyThreadId').value = threadId;
    document.getElementById('editReplyId').value = replyId;

    // Get content from data attribute
    const replyEl = document.querySelector(`.message[data-reply-id="${replyId}"]`);
    let content = '';
    if (replyEl) {
        const encodedContent = replyEl.dataset.replyContent;
        if (encodedContent) {
            try {
                content = decodeURIComponent(atob(encodedContent));
            } catch (e) {
                console.error('Failed to decode reply content:', e);
            }
        }
    }

    document.getElementById('editReplyContent').value = content;
    document.getElementById('editReplyModal').classList.add('active');
}

function hideEditReplyModal() {
    document.getElementById('editReplyModal').classList.remove('active');
}

async function saveEditedReply() {
    const threadId = document.getElementById('editReplyThreadId').value;
    const replyId = document.getElementById('editReplyId').value;
    const content = document.getElementById('editReplyContent').value.trim();

    if (!content) {
        showToast('Content is required', 'warning');
        return;
    }

    const result = await api('PUT', `/forum/threads/${threadId}/replies/${replyId}`, { content });
    if (result.ok) {
        showToast('Reply updated', 'success');
        hideEditReplyModal();
        // Reload the thread to show updated content
        loadThread(parseInt(threadId));
    } else {
        showToast(result.data?.message || 'Failed to update reply', 'error');
    }
}

// Edit History Functions
async function showEditHistory(contentType, contentId, threadId = null) {
    const modal = document.getElementById('editHistoryModal');
    const container = document.getElementById('editHistoryContent');
    if (!modal || !container) return;

    container.innerHTML = '<div class="loading"><div class="spinner"></div> Loading history...</div>';
    modal.classList.add('active');

    let url;
    if (contentType === 'thread') {
        url = `/forum/threads/${contentId}/history`;
    } else {
        url = `/forum/threads/${threadId}/replies/${contentId}/history`;
    }

    const result = await api('GET', url);

    if (result.ok && result.data.history) {
        const history = result.data.history;

        if (history.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-history"></i><h3>No Edit History</h3><p>This post has not been edited.</p></div>';
            return;
        }

        let html = '<div class="edit-history-list">';
        for (const entry of history) {
            const editDate = formatDate(entry.edited_at);
            html += `
                <div class="edit-history-item">
                    <div class="edit-history-header">
                        <span class="edit-history-date">${editDate}</span>
                        <span class="edit-history-editor">by ${escapeHtml(entry.edited_by_name || 'Unknown')}</span>
                    </div>
                    ${entry.previous_title ? `<div class="edit-history-title"><strong>Previous Title:</strong> ${escapeHtml(entry.previous_title)}</div>` : ''}
                    <div class="edit-history-content">${escapeHtml(entry.previous_content).substring(0, 500)}${entry.previous_content.length > 500 ? '...' : ''}</div>
                    ${entry.edit_reason ? `<div class="edit-history-reason"><i class="fas fa-info-circle"></i> ${escapeHtml(entry.edit_reason)}</div>` : ''}
                </div>
            `;
        }
        html += '</div>';
        container.innerHTML = html;
    } else {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><h3>Error</h3><p>Failed to load edit history.</p></div>';
    }
}

function hideEditHistoryModal() {
    const modal = document.getElementById('editHistoryModal');
    if (modal) modal.classList.remove('active');
}

async function deleteReplyMod(threadId, replyId) {
    const confirmed = await showConfirm('Are you sure you want to delete this reply? This cannot be undone.', {
        title: 'Delete Reply',
        icon: 'fa-trash-alt',
        confirmText: 'Delete Reply',
        confirmIcon: 'fa-trash',
        danger: true
    });
    if (!confirmed) return;

    const result = await api('DELETE', `/forum/threads/${threadId}/replies/${replyId}`);
    if (result.ok) {
        showToast('Reply deleted', 'success');
        // Remove the reply from the DOM or reload thread
        const replyEl = document.querySelector(`.message[data-reply-id="${replyId}"]`);
        if (replyEl) {
            replyEl.remove();
        } else {
            loadThread(parseInt(threadId));
        }
    } else {
        showToast(result.data?.message || 'Failed to delete reply', 'error');
    }
}

function quoteReply(replyId) {
    if (!currentUser) {
        showToast('Please login to reply', 'warning');
        return;
    }

    const replyEl = document.querySelector(`.message[data-reply-id="${replyId}"]`);
    if (!replyEl) {
        showToast('Reply not found', 'error');
        return;
    }

    // Get content and author from data attributes
    const encodedContent = replyEl.dataset.replyContent;
    const author = replyEl.dataset.replyAuthor || 'Unknown';

    let content = '';
    if (encodedContent) {
        try {
            content = decodeURIComponent(atob(encodedContent));
        } catch (e) {
            console.error('Failed to decode reply content:', e);
        }
    }

    // Build quote BBCode
    const quoteText = `[quote=${author}]${content}[/quote]\n\n`;

    // Insert into reply textarea
    const textarea = document.getElementById('replyContent');
    if (textarea) {
        textarea.value = quoteText + textarea.value;
        textarea.focus();
        // Scroll to reply section
        textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function replyToReply(replyId, authorName) {
    if (!currentUser) {
        showToast('Please login to reply', 'warning');
        return;
    }

    currentParentReplyId = replyId;
    currentParentReplyAuthor = authorName;

    // Show the replying-to indicator above the textarea
    const indicator = document.getElementById('replyingToIndicator');
    if (indicator) {
        indicator.innerHTML = `<i class="fas fa-reply"></i> Replying to <strong>${escapeHtml(authorName)}</strong> <button class="cancel-reply-to" onclick="cancelReplyTo()"><i class="fas fa-times"></i></button>`;
        indicator.style.display = 'flex';
    }

    // Focus and scroll to reply textarea
    const textarea = document.getElementById('replyContent');
    if (textarea) {
        textarea.focus();
        textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function cancelReplyTo() {
    currentParentReplyId = null;
    currentParentReplyAuthor = null;

    const indicator = document.getElementById('replyingToIndicator');
    if (indicator) {
        indicator.style.display = 'none';
        indicator.innerHTML = '';
    }
}

// ==================== CATEGORY MANAGEMENT ====================
function showCreateCategoryModal() {
    if (!isPortalAdmin()) {
        showToast('Admin access required', 'error');
        return;
    }
    document.getElementById('newCategoryName').value = '';
    document.getElementById('newCategoryDescription').value = '';
    document.getElementById('newCategoryParent').value = '';
    document.getElementById('newCategoryViewPerm').value = 'view_all';
    document.getElementById('newCategoryPostPerm').value = 'post_members';
    loadCategoriesForParent();
    document.getElementById('createCategoryModal').classList.add('active');
}

function hideCreateCategoryModal() {
    document.getElementById('createCategoryModal').classList.remove('active');
}

async function loadCategoriesForParent() {
    const select = document.getElementById('newCategoryParent');
    select.innerHTML = '<option value="">None (Top Level)</option>';

    const result = await api('GET', '/forum/categories');
    if (result.ok && result.data.categories) {
        for (const cat of result.data.categories) {
            select.innerHTML += `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`;
        }
    }
}

async function createCategory() {
    const name = document.getElementById('newCategoryName').value.trim();
    const description = document.getElementById('newCategoryDescription').value.trim();
    const parentId = document.getElementById('newCategoryParent').value || null;
    const viewPerm = document.getElementById('newCategoryViewPerm').value;
    const postPerm = document.getElementById('newCategoryPostPerm').value;

    if (!name) {
        showToast('Category name is required', 'warning');
        return;
    }

    const result = await api('POST', '/forum/categories', {
        name,
        description,
        parent_id: parentId ? parseInt(parentId) : null,
        view_permission: viewPerm,
        post_permission: postPerm
    });

    if (result.ok) {
        showToast('Category created successfully', 'success');
        hideCreateCategoryModal();
        loadCategories();
    } else {
        showToast(result.data?.message || 'Failed to create category', 'error');
    }
}

async function deleteCategory(categoryId) {
    if (!isPortalAdmin()) {
        showToast('Admin access required', 'error');
        return;
    }

    const confirmed = await showConfirm('Are you sure you want to delete this category? All threads within it will also be deleted. This cannot be undone.', {
        title: 'Delete Category',
        icon: 'fa-folder-minus',
        confirmText: 'Delete Category',
        confirmIcon: 'fa-trash',
        danger: true
    });
    if (!confirmed) return;

    const result = await api('DELETE', `/forum/categories/${categoryId}`);
    if (result.ok) {
        showToast('Category deleted successfully', 'success');
        loadCategories();
    } else {
        showToast(result.data?.message || 'Failed to delete category', 'error');
    }
}

function showEditCategoryModal(categoryId, name, description) {
    if (!isPortalAdmin()) {
        showToast('Admin access required', 'error');
        return;
    }
    document.getElementById('editCategoryId').value = categoryId;
    document.getElementById('editCategoryName').value = name;
    document.getElementById('editCategoryDescription').value = description;
    document.getElementById('editCategoryModal').classList.add('active');
}

function hideEditCategoryModal() {
    document.getElementById('editCategoryModal').classList.remove('active');
}

async function editCategory() {
    const categoryId = document.getElementById('editCategoryId').value;
    const name = document.getElementById('editCategoryName').value.trim();
    const description = document.getElementById('editCategoryDescription').value.trim();

    if (!name) {
        showToast('Category name is required', 'warning');
        return;
    }

    const result = await api('PUT', `/forum/categories/${categoryId}`, {
        name,
        description
    });

    if (result.ok) {
        showToast('Category updated successfully', 'success');
        hideEditCategoryModal();
        loadCategories();
    } else {
        showToast(result.data?.message || 'Failed to update category', 'error');
    }
}

async function moveCategoryUp(categoryId) {
    if (!isPortalAdmin()) {
        showToast('Admin access required', 'error');
        return;
    }

    const idx = cachedCategories.findIndex(c => c.id === categoryId);
    if (idx <= 0) return;

    // Swap positions
    const positions = cachedCategories.map((cat, i) => ({
        id: cat.id,
        position: i === idx ? idx - 1 : (i === idx - 1 ? idx : i)
    }));

    const result = await api('POST', '/forum/categories/reorder', { positions });
    if (result.ok) {
        showToast('Category moved up', 'success');
        loadCategories();
    } else {
        showToast(result.data?.message || 'Failed to move category', 'error');
    }
}

async function moveCategoryDown(categoryId) {
    if (!isPortalAdmin()) {
        showToast('Admin access required', 'error');
        return;
    }

    const idx = cachedCategories.findIndex(c => c.id === categoryId);
    if (idx < 0 || idx >= cachedCategories.length - 1) return;

    // Swap positions
    const positions = cachedCategories.map((cat, i) => ({
        id: cat.id,
        position: i === idx ? idx + 1 : (i === idx + 1 ? idx : i)
    }));

    const result = await api('POST', '/forum/categories/reorder', { positions });
    if (result.ok) {
        showToast('Category moved down', 'success');
        loadCategories();
    } else {
        showToast(result.data?.message || 'Failed to move category', 'error');
    }
}

// ==================== NOTIFICATIONS ====================
let notificationsPanelOpen = false;

function toggleNotificationsPanel() {
    const panel = document.getElementById('notificationsPanel');
    notificationsPanelOpen = !notificationsPanelOpen;

    if (notificationsPanelOpen) {
        panel.style.display = '';
        loadNotifications();
        // Close when clicking outside
        setTimeout(() => {
            document.addEventListener('click', closeNotificationsPanelOnClickOutside);
        }, 10);
    } else {
        panel.style.display = 'none';
        document.removeEventListener('click', closeNotificationsPanelOnClickOutside);
    }
}

function closeNotificationsPanelOnClickOutside(e) {
    const panel = document.getElementById('notificationsPanel');
    const bell = document.getElementById('notificationBell');
    if (!panel.contains(e.target) && !bell.contains(e.target)) {
        panel.style.display = 'none';
        notificationsPanelOpen = false;
        document.removeEventListener('click', closeNotificationsPanelOnClickOutside);
    }
}

async function loadNotifications() {
    const list = document.getElementById('notificationsList');
    list.innerHTML = '<div class="notifications-empty"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

    const result = await api('GET', '/notifications?limit=20');

    if (result.ok && result.data.notifications) {
        const notifications = result.data.notifications;

        if (notifications.length === 0) {
            list.innerHTML = '<div class="notifications-empty">No notifications yet</div>';
            return;
        }

        let html = '';
        for (const notif of notifications) {
            const iconClass = notif.type === 'mention' ? 'mention' : '';
            const icon = notif.type === 'mention' ? 'fa-at' : 'fa-bell';
            const unreadClass = notif.is_read ? '' : 'unread';

            html += `
                <div class="notification-item ${unreadClass}" onclick="openNotification(${notif.id}, '${escapeHtml(notif.link || '')}')">
                    <div class="notification-icon ${iconClass}">
                        <i class="fas ${icon}"></i>
                    </div>
                    <div class="notification-content">
                        <div class="notification-message">${escapeHtml(notif.message)}</div>
                        <div class="notification-time">${formatDate(notif.created_at)}</div>
                    </div>
                </div>
            `;
        }
        list.innerHTML = html;
    } else {
        list.innerHTML = '<div class="notifications-empty">Failed to load notifications</div>';
    }
}

async function loadUnreadNotificationCount() {
    if (!currentUser) return;

    const result = await api('GET', '/notifications/unread-count');

    if (result.ok) {
        const count = result.data.unread_count || 0;
        const badge = document.getElementById('notificationBadge');

        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = '';
        } else {
            badge.style.display = 'none';
        }
    }
}

async function openNotification(notificationId, link) {
    // Mark as read
    await api('POST', `/notifications/${notificationId}/read`);

    // Close panel
    document.getElementById('notificationsPanel').style.display = 'none';
    notificationsPanelOpen = false;

    // Update badge
    loadUnreadNotificationCount();

    // Navigate to link
    if (link) {
        // Parse the link - e.g., /forum/thread/123
        const threadMatch = link.match(/\/forum\/thread\/(\d+)/);
        if (threadMatch) {
            const threadId = parseInt(threadMatch[1]);
            currentThreadId = threadId;
            showPage('thread');
            loadThread(threadId);
        }
    }
}

async function markAllNotificationsRead() {
    const result = await api('POST', '/notifications/read-all');

    if (result.ok) {
        showToast('All notifications marked as read', 'success');
        loadNotifications();
        loadUnreadNotificationCount();
    } else {
        showToast('Failed to mark notifications as read', 'error');
    }
}

// ==================== CHAT MODERATION ====================
function toggleMutedUsersPanel() {
    const panel = document.getElementById('mutedUsersPanel');
    const toggle = document.getElementById('mutedUsersToggle');
    if (panel.style.display === 'none') {
        panel.style.display = '';
        toggle.innerHTML = '<i class="fas fa-chevron-up"></i>';
        loadMutedUsers();
    } else {
        panel.style.display = 'none';
        toggle.innerHTML = '<i class="fas fa-chevron-down"></i>';
    }
}

async function deleteChatMessage(messageId) {
    if (!isPortalModerator()) {
        showToast('Moderator access required', 'error');
        return;
    }

    const confirmed = await showConfirm('Are you sure you want to delete this message?', {
        title: 'Delete Message',
        icon: 'fa-trash-alt',
        confirmText: 'Delete',
        confirmIcon: 'fa-trash',
        danger: true
    });
    if (!confirmed) return;

    const result = await api('DELETE', `/chat/messages/${messageId}`);
    if (result.ok) {
        showToast('Message deleted', 'success');
        refreshChat();
    } else {
        showToast(result.data?.message || 'Failed to delete message', 'error');
    }
}

async function muteUser(participantKey, reason = '') {
    if (!isPortalModerator()) {
        showToast('Moderator access required', 'error');
        return;
    }

    const result = await api('POST', `/chat/participants/${participantKey}/mute`, { reason });
    if (result.ok) {
        showToast('User muted', 'success');
    } else {
        showToast(result.data?.message || 'Failed to mute user', 'error');
    }
}

async function unmuteUser(participantKey) {
    if (!isPortalModerator()) {
        showToast('Moderator access required', 'error');
        return;
    }

    const result = await api('DELETE', `/chat/participants/${participantKey}/mute`);
    if (result.ok) {
        showToast('User unmuted', 'success');
        loadMutedUsers();
    } else {
        showToast(result.data?.message || 'Failed to unmute user', 'error');
    }
}

async function loadMutedUsers() {
    const container = document.getElementById('mutedUsersList');
    if (!container) return;

    container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading...</div>';

    const result = await api('GET', '/chat/muted');
    if (result.ok && result.data.muted) {
        if (result.data.muted.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No muted users</p></div>';
            return;
        }

        let html = '';
        for (const user of result.data.muted) {
            html += `
                <div class="muted-user-item">
                    <span class="muted-user-name">${escapeHtml(user.label || user.username || user.key)}</span>
                    <span class="muted-user-reason">${user.reason ? escapeHtml(user.reason) : 'No reason'}</span>
                    <span class="muted-user-date">${formatDate(user.muted_at)}</span>
                    <button class="btn btn-sm btn-danger" onclick="unmuteUser('${escapeHtml(user.key)}')">
                        <i class="fas fa-user-check"></i> Unmute
                    </button>
                </div>
            `;
        }
        container.innerHTML = html;
    } else {
        container.innerHTML = '<div class="empty-state"><p>Failed to load muted users</p></div>';
    }
}

async function deleteUserMessages(participantKey) {
    if (!isPortalModerator()) {
        showToast('Moderator access required', 'error');
        return;
    }

    const confirmed = await showConfirm('Are you sure you want to delete all messages from this user? This cannot be undone.', {
        title: 'Delete All Messages',
        icon: 'fa-trash-alt',
        confirmText: 'Delete All',
        confirmIcon: 'fa-trash',
        danger: true
    });
    if (!confirmed) return;

    const result = await api('DELETE', `/chat/participants/${participantKey}/messages`);
    if (result.ok) {
        showToast(`Deleted ${result.data.deleted_count} messages`, 'success');
        refreshChat();
    } else {
        showToast(result.data?.message || 'Failed to delete messages', 'error');
    }
}

function showMuteUserModal(userId, username) {
    if (!isPortalModerator()) {
        showToast('Moderator access required', 'error');
        return;
    }
    document.getElementById('muteUserId').value = userId;
    document.getElementById('muteUserName').textContent = username || 'User';
    document.getElementById('muteUserReason').value = '';
    document.getElementById('muteUserModal').classList.add('active');
}

function hideMuteUserModal() {
    document.getElementById('muteUserModal').classList.remove('active');
}

async function confirmMuteUser() {
    const userId = document.getElementById('muteUserId').value;
    const reason = document.getElementById('muteUserReason').value.trim();

    await muteUser(userId, reason);
    hideMuteUserModal();
}

// ==================== TICKET MANAGEMENT ====================
async function updateTicketPriority(ticketId, priority) {
    if (!isPortalStaff()) {
        showToast('Staff access required', 'error');
        return;
    }

    const result = await api('PATCH', `/support/tickets/${ticketId}`, { priority });
    if (result.ok) {
        showToast('Priority updated', 'success');
    } else {
        showToast(result.data?.message || 'Failed to update priority', 'error');
    }
}

async function updateTicketCategory(ticketId, category) {
    if (!isPortalStaff()) {
        showToast('Staff access required', 'error');
        return;
    }

    const result = await api('PATCH', `/support/tickets/${ticketId}`, { category });
    if (result.ok) {
        showToast('Category updated', 'success');
    } else {
        showToast(result.data?.message || 'Failed to update category', 'error');
    }
}

async function updateTicketStatus(ticketId, status) {
    if (!isPortalStaff()) {
        showToast('Staff access required', 'error');
        return;
    }

    const result = await api('PATCH', `/support/tickets/${ticketId}`, { status });
    if (result.ok) {
        showToast('Status updated', 'success');
        loadTicket(ticketId);
    } else {
        showToast(result.data?.message || 'Failed to update status', 'error');
    }
}

async function reopenTicket(ticketId) {
    if (!isPortalStaff()) {
        showToast('Staff access required', 'error');
        return;
    }

    const result = await api('POST', `/support/tickets/${ticketId}/reopen`);
    if (result.ok) {
        showToast('Ticket reopened', 'success');
        loadTicket(ticketId);
    } else {
        showToast(result.data?.message || 'Failed to reopen ticket', 'error');
    }
}

// ==================== ALERTS & TOASTS ====================
function showAlert(containerId, message, type) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const icon = type === 'success' ? 'check-circle' : type === 'danger' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle';

    container.innerHTML = `
        <div class="alert alert-${type}">
            <i class="fas fa-${icon}"></i>
            ${escapeHtml(message)}
        </div>
    `;
}

function copyLinkToClipboard(hash) {
    const url = window.location.origin + window.location.pathname + '#' + hash;
    navigator.clipboard.writeText(url).then(() => {
        showToast('Link copied to clipboard!', 'success');
    }).catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = url;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showToast('Link copied to clipboard!', 'success');
    });
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icon = type === 'success' ? 'check' : type === 'error' ? 'times' : type === 'warning' ? 'exclamation' : 'info';

    toast.innerHTML = `
        <div class="toast-icon">
            <i class="fas fa-${icon}"></i>
        </div>
        <div class="toast-message">${escapeHtml(message)}</div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}
