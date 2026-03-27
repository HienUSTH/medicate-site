const SUPABASE_URL = 'https://kbdqkvcmfkuthlbbnaac.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtiZHFrdmNtZmt1dGhsYmJuYWFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0OTczNzIsImV4cCI6MjA5MDA3MzM3Mn0.8dDVYCZyvTYRR7pkeleTiW1vv9ktNiPD8dml0DU4HDw';

const AUTH_URL_KEYS = [
  'access_token',
  'refresh_token',
  'expires_at',
  'expires_in',
  'token_type',
  'code',
  'token_hash',
  'error',
  'error_code',
  'error_description',
  'provider_token',
  'provider_refresh_token'
];

const sb = window.medicateSupabase || window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

window.medicateSupabase = sb;

let bootPromise = null;
let authSubscription = null;
let profileCache = {
  userId: null,
  data: null
};

function setAllText(selectors, value) {
  const list = Array.isArray(selectors) ? selectors : [selectors];
  list.forEach((selector) => {
    document.querySelectorAll(selector).forEach((el) => {
      el.textContent = value;
    });
  });
}

function show(el) {
  if (el) el.classList.remove('hidden');
}

function hide(el) {
  if (el) el.classList.add('hidden');
}

function showAll(selector) {
  document.querySelectorAll(selector).forEach(show);
}

function hideAll(selector) {
  document.querySelectorAll(selector).forEach(hide);
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date);
}

function clearProfileCache() {
  profileCache = { userId: null, data: null };
}

async function getProfile(userId, force = false) {
  if (!userId) return null;

  if (!force && profileCache.userId === userId) {
    return profileCache.data;
  }

  const { data, error } = await sb
    .from('profiles')
    .select('username, full_name, email, created_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('PROFILE_LOAD_ERROR', error);
    if (profileCache.userId === userId) return profileCache.data;
    return null;
  }

  profileCache = { userId, data: data || null };
  return data || null;
}

function getDisplayName(profile, session) {
  return (
    profile?.full_name?.trim() ||
    profile?.username?.trim() ||
    session?.user?.user_metadata?.full_name?.trim?.() ||
    session?.user?.user_metadata?.username?.trim?.() ||
    session?.user?.email?.split('@')[0] ||
    'Tài khoản'
  );
}

function getEmail(profile, session) {
  return profile?.email || session?.user?.email || '—';
}

function getCreatedAt(profile, session) {
  return formatDate(profile?.created_at || session?.user?.created_at);
}

function applyLoggedOutUI() {
  showAll('[data-auth="guest"]');
  hideAll('[data-auth="user"]');

  setAllText(['[data-auth-user-label]', '#userMenuLabel', '#mobileUserSummary'], 'Người dùng');
  setAllText(['[data-auth-name]', '#accountName', '#accountNameMobile'], 'Chưa đăng nhập');
  setAllText(['[data-auth-email]', '#accountEmail', '#accountEmailMobile'], '—');
  setAllText(['[data-auth-created]', '#accountCreatedAt', '#accountCreatedAtMobile'], '—');

  document.body.dataset.authState = 'guest';
}

function applyLoggedInUI(profile, session) {
  const displayName = getDisplayName(profile, session);
  const email = getEmail(profile, session);
  const createdAt = getCreatedAt(profile, session);

  hideAll('[data-auth="guest"]');
  showAll('[data-auth="user"]');

  setAllText(['[data-auth-user-label]', '#userMenuLabel', '#mobileUserSummary'], displayName);
  setAllText(['[data-auth-name]', '#accountName', '#accountNameMobile'], displayName);
  setAllText(['[data-auth-email]', '#accountEmail', '#accountEmailMobile'], email);
  setAllText(['[data-auth-created]', '#accountCreatedAt', '#accountCreatedAtMobile'], createdAt);

  document.body.dataset.authState = 'user';
}

function getAuthUrlState() {
  const url = new URL(window.location.href);
  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : '';
  const hashParams = hash && hash.includes('=') ? new URLSearchParams(hash) : null;

  const hasStrongSearchAuth = AUTH_URL_KEYS.some((key) => url.searchParams.has(key));
  const hasStrongHashAuth = AUTH_URL_KEYS.some((key) => hashParams?.has(key));
  const shouldStripSearchType = url.searchParams.has('type') && (hasStrongSearchAuth || hasStrongHashAuth);
  const shouldStripHashType = Boolean(hashParams?.has('type') && (hasStrongSearchAuth || hasStrongHashAuth));

  return {
    url,
    hashParams,
    hasAuth: hasStrongSearchAuth || hasStrongHashAuth,
    shouldStripSearchType,
    shouldStripHashType
  };
}

function urlHasAuthParams() {
  return getAuthUrlState().hasAuth;
}

function cleanAuthParamsFromUrl() {
  const { url, hashParams, hasAuth, shouldStripSearchType, shouldStripHashType } = getAuthUrlState();

  if (!hasAuth && !shouldStripSearchType && !shouldStripHashType) {
    return;
  }

  let changed = false;

  AUTH_URL_KEYS.forEach((key) => {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  });

  if (shouldStripSearchType) {
    url.searchParams.delete('type');
    changed = true;
  }

  if (hashParams) {
    let hashChanged = false;

    AUTH_URL_KEYS.forEach((key) => {
      if (hashParams.has(key)) {
        hashParams.delete(key);
        hashChanged = true;
      }
    });

    if (shouldStripHashType && hashParams.has('type')) {
      hashParams.delete('type');
      hashChanged = true;
    }

    if (hashChanged) {
      const nextHash = hashParams.toString();
      url.hash = nextHash ? `#${nextHash}` : '';
      changed = true;
    }
  }

  if (changed) {
    history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  }
}

async function tryHandleTokenHashRedirect() {
  const url = new URL(window.location.href);
  const tokenHash = url.searchParams.get('token_hash');
  const rawType = (url.searchParams.get('type') || '').trim().toLowerCase();

  if (!tokenHash) return false;

  const tryTypes = [];
  if (rawType) tryTypes.push(rawType);

  if ((rawType === 'signup' || rawType === 'magiclink') && !tryTypes.includes('email')) {
    tryTypes.push('email');
  }

  if (tryTypes.length === 0) {
    tryTypes.push('email');
  }

  let lastError = null;

  for (const type of tryTypes) {
    const { error } = await sb.auth.verifyOtp({
      token_hash: tokenHash,
      type
    });

    if (!error) {
      cleanAuthParamsFromUrl();
      return true;
    }

    lastError = error;
  }

  if (lastError) {
    console.error('OTP_VERIFY_ERROR', lastError);
  }

  return false;
}

async function refreshAuthUI(options = {}) {
  const { session: sessionOverride, forceProfile = false } = options;
  let session = sessionOverride;

  if (typeof session === 'undefined') {
    const { data, error } = await sb.auth.getSession();

    if (error) {
      console.error('SESSION_ERROR', error);
      clearProfileCache();
      applyLoggedOutUI();
      return;
    }

    session = data.session;
  }

  if (!session?.user) {
    clearProfileCache();
    applyLoggedOutUI();
    return;
  }

  const profile = await getProfile(session.user.id, forceProfile);
  applyLoggedInUI(profile, session);

  if (urlHasAuthParams()) {
    cleanAuthParamsFromUrl();
  }
}

async function signOutUser() {
  const { error } = await sb.auth.signOut();

  if (error) {
    console.error('SIGNOUT_ERROR', error);
    alert('Đăng xuất chưa thành công. Vui lòng thử lại.');
    return;
  }

  clearProfileCache();
  applyLoggedOutUI();
  window.location.replace('index.html');
}

function bindLogoutButtons() {
  document.querySelectorAll('[data-action="logout"]').forEach((btn) => {
    if (btn.dataset.boundLogout === '1') return;
    btn.dataset.boundLogout = '1';

    btn.addEventListener('click', async (event) => {
      event.preventDefault();
      await signOutUser();
    });
  });
}

function bindDeletePlaceholders() {
  document.querySelectorAll('[data-action="delete-account"]').forEach((btn) => {
    if (btn.dataset.boundDeleteAccount === '1') return;
    btn.dataset.boundDeleteAccount = '1';

    btn.addEventListener('click', (event) => {
      event.preventDefault();
      alert('Tính năng xóa tài khoản sẽ được thêm ở bước sau.');
    });
  });
}

function bindAuthListeners() {
  if (authSubscription) return;

  const { data } = sb.auth.onAuthStateChange((event, session) => {
    window.setTimeout(() => {
      if (event === 'SIGNED_OUT') {
        clearProfileCache();
      }

      const shouldForceProfile = event === 'SIGNED_IN' || event === 'USER_UPDATED';
      refreshAuthUI({
        session,
        forceProfile: shouldForceProfile
      }).catch((error) => {
        console.error('AUTH_STATE_REFRESH_ERROR', error);
      });
    }, 0);
  });

  authSubscription = data?.subscription || null;
}

async function boot() {
  if (bootPromise) return bootPromise;

  bootPromise = (async () => {
    bindLogoutButtons();
    bindDeletePlaceholders();
    bindAuthListeners();
    applyLoggedOutUI();

    await tryHandleTokenHashRedirect();
    await refreshAuthUI({ forceProfile: true });
  })();

  return bootPromise;
}

window.medicateAuthState = {
  supabase: sb,
  refresh: (forceProfile = true) => refreshAuthUI({ forceProfile }),
  signOut: signOutUser,
  getSession: () => sb.auth.getSession(),
  getCachedProfile: () => profileCache.data
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    boot().catch((error) => {
      console.error('AUTH_BOOT_ERROR', error);
      applyLoggedOutUI();
    });
  });
} else {
  boot().catch((error) => {
    console.error('AUTH_BOOT_ERROR', error);
    applyLoggedOutUI();
  });
}
