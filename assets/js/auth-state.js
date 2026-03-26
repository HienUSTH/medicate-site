const SUPABASE_URL = 'https://kbdqkvcmfkuthlbbnaac.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtiZHFrdmNtZmt1dGhsYmJuYWFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0OTczNzIsImV4cCI6MjA5MDA3MzM3Mn0.8dDVYCZyvTYRR7pkeleTiW1vv9ktNiPD8dml0DU4HDw';

window.medicateSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

const sb = window.medicateSupabase;

function formatDate(value) {
  if (!value) return 'Chưa có';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Chưa có';
  return d.toLocaleDateString('vi-VN');
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function show(el) {
  if (el) el.classList.remove('hidden');
}

function hide(el) {
  if (el) el.classList.add('hidden');
}

async function getProfile(userId) {
  const { data, error } = await sb
    .from('profiles')
    .select('username, full_name, email, created_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('PROFILE_LOAD_ERROR', error);
    return null;
  }

  return data;
}

function applyLoggedOutUI() {
  document.querySelectorAll('[data-auth="guest"]').forEach(show);
  document.querySelectorAll('[data-auth="user"]').forEach(hide);

  setText('desktopUserLabel', 'Người dùng');
  setText('mobileUserLabel', 'Người dùng');
  setText('accountName', 'Chưa đăng nhập');
  setText('accountEmail', '—');
  setText('accountCreatedAt', '—');
  setText('accountNameMobile', 'Chưa đăng nhập');
  setText('accountEmailMobile', '—');
  setText('accountCreatedAtMobile', '—');
}

function applyLoggedInUI(profile, session) {
  const displayName =
    profile?.full_name?.trim() ||
    profile?.username?.trim() ||
    session?.user?.user_metadata?.username ||
    session?.user?.email?.split('@')[0] ||
    'Tài khoản';

  const email = profile?.email || session?.user?.email || '—';
  const createdAt = formatDate(profile?.created_at || session?.user?.created_at);

  document.querySelectorAll('[data-auth="guest"]').forEach(hide);
  document.querySelectorAll('[data-auth="user"]').forEach(show);

  setText('desktopUserLabel', displayName);
  setText('mobileUserLabel', displayName);
  setText('accountName', displayName);
  setText('accountEmail', email);
  setText('accountCreatedAt', createdAt);
  setText('accountNameMobile', displayName);
  setText('accountEmailMobile', email);
  setText('accountCreatedAtMobile', createdAt);
}

async function refreshAuthUI() {
  const { data, error } = await sb.auth.getSession();

  if (error) {
    console.error('SESSION_ERROR', error);
    applyLoggedOutUI();
    return;
  }

  const session = data.session;
  if (!session?.user) {
    applyLoggedOutUI();
    return;
  }

  const profile = await getProfile(session.user.id);
  applyLoggedInUI(profile, session);
}

async function signOutUser() {
  const { error } = await sb.auth.signOut();
  if (error) {
    console.error('SIGNOUT_ERROR', error);
    alert('Đăng xuất chưa thành công. Vui lòng thử lại.');
    return;
  }
  window.location.href = 'index.html';
}

function bindLogoutButtons() {
  document.querySelectorAll('[data-action="logout"]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      await signOutUser();
    });
  });
}

function bindDeletePlaceholders() {
  document.querySelectorAll('[data-action="delete-account"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      alert('Tính năng xóa tài khoản sẽ được thêm ở bước sau.');
    });
  });
}

sb.auth.onAuthStateChange(async () => {
  await refreshAuthUI();
});

document.addEventListener('DOMContentLoaded', async () => {
  bindLogoutButtons();
  bindDeletePlaceholders();
  await refreshAuthUI();
});
