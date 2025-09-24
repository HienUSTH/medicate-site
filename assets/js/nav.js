// Mobile menu toggle + Dropdown controls
document.addEventListener('DOMContentLoaded', () => {
  // === Mobile menu ===
  const btn = document.getElementById('btnMobile');
  const menu = document.getElementById('mobileMenu');
  if (btn && menu) {
    btn.addEventListener('click', () => {
      menu.classList.toggle('hidden');
    });
  }

  // === Desktop dropdowns (hover tolerant + click to pin) ===
  // Cách dùng: bọc mỗi dropdown trong phần tử [data-dd="<id>"]
  // có .dd-toggle (button) và .dd-menu (panel).
  const DROPDOWN_CLOSE_DELAY = 200; // ms (giữ cầu Y-axis)
  document.querySelectorAll('[data-dd]').forEach(root => {
    const toggle = root.querySelector('.dd-toggle');
    const panel = root.querySelector('.dd-menu');
    if (!toggle || !panel) return;

    let pinned = false;      // giữ mở khi click tiêu đề
    let overToggle = false;  // đang hover toggle
    let overPanel = false;   // đang hover panel
    let timer = null;

    const open = () => {
      panel.classList.remove('hidden');
      toggle.setAttribute('aria-expanded', 'true');
    };

    const close = () => {
      if (pinned) return; // khi đã pin, không tự đóng
      panel.classList.add('hidden');
      toggle.setAttribute('aria-expanded', 'false');
    };

    const scheduleClose = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!pinned && !overToggle && !overPanel) close();
      }, DROPDOWN_CLOSE_DELAY);
    };

    // Hover handlers
    toggle.addEventListener('mouseenter', () => { overToggle = true; open(); });
    toggle.addEventListener('mouseleave', () => { overToggle = false; scheduleClose(); });
    panel.addEventListener('mouseenter', () => { overPanel = true; open(); });
    panel.addEventListener('mouseleave', () => { overPanel = false; scheduleClose(); });

    // Click để ghim/bỏ ghim
    toggle.addEventListener('click', (e) => {
      // Không điều hướng — chỉ bật/tắt dropdown
      e.preventDefault();
      pinned = !pinned;
      if (pinned) open(); else close();
    });

    // Click ra ngoài để đóng
    document.addEventListener('click', (e) => {
      if (!root.contains(e.target)) {
        pinned = false;
        close();
      }
    });

    // Đảm bảo khi focus bằng phím Tab cũng mở
    toggle.addEventListener('focus', open);
    toggle.addEventListener('blur', scheduleClose);
  });

  // === Auth tabs (UI only) ===
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
