// Mobile menu toggle
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btnMobile');
  const menu = document.getElementById('mobileMenu');
  if (btn && menu) {
    btn.addEventListener('click', () => {
      menu.classList.toggle('hidden');
    });
  }

  // Auth tabs (UI only)
  const tabs = document.querySelectorAll('.auth-tab');
  const signup = document.getElementById('signupForm');
  const signin = document.getElementById('signinForm');
  const params = new URLSearchParams(location.search);
  const defaultTab = params.get('tab');

  function activate(which) {
    tabs.forEach(t => {
      const isActive = t.dataset.tab === which;
      t.classList.toggle('bg-sky-600', isActive);
      t.classList.toggle('text-white', isActive);
      t.classList.toggle('border', !isActive);
    });
    if (signup && signin) {
      signup.classList.toggle('hidden', which !== 'signup');
      signin.classList.toggle('hidden', which !== 'signin');
    }
  }
  tabs.forEach(t => t.addEventListener('click', () => activate(t.dataset.tab)));
  if (defaultTab === 'signin') activate('signin'); else activate('signup');
});
