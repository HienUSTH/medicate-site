// nav.js — chỉ xử lý dropdown & mobile cho header HIỆN CÓ.
// Không tạo/chèn thêm header để tránh “hai tầng header”.

document.addEventListener('DOMContentLoaded', () => {
  // --- Mobile menu toggle ---
  const mobileBtn  = document.getElementById('btnMobile');
  const mobileMenu = document.getElementById('mobileMenu');
  if (mobileBtn && mobileMenu) {
    mobileBtn.addEventListener('click', () => {
      mobileMenu.classList.toggle('hidden');
    });
  }

  // --- Dropdowns (hover mở, click để ghim; click ra ngoài để đóng) ---
  const DROPDOWN_CLOSE_DELAY = 160; // ms
  document.querySelectorAll('[data-dd]').forEach(root => {
    const toggle = root.querySelector('.dd-toggle');
    const menu   = root.querySelector('.dd-menu');
    if (!toggle || !menu) return;

    let pinned = false;
    let overToggle = false;
    let overMenu = false;
    let timer = null;

    const open = () => {
      menu.classList.remove('hidden');
      toggle.setAttribute('aria-expanded', 'true');
    };
    const close = () => {
      if (pinned) return; // đã ghim thì không tự đóng
      menu.classList.add('hidden');
      toggle.setAttribute('aria-expanded', 'false');
    };
    const scheduleClose = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!pinned && !overToggle && !overMenu) close();
      }, DROPDOWN_CLOSE_DELAY);
    };

    // Hover
    toggle.addEventListener('mouseenter', () => { overToggle = true; open(); });
    toggle.addEventListener('mouseleave', () => { overToggle = false; scheduleClose(); });
    menu  .addEventListener('mouseenter', () => { overMenu = true; open(); });
    menu  .addEventListener('mouseleave', () => { overMenu = false; scheduleClose(); });

    // Click để ghim/bỏ ghim
    toggle.addEventListener('click', (e) => {
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

    // Hỗ trợ bàn phím
    toggle.addEventListener('focus', open);
    toggle.addEventListener('blur', scheduleClose);
  });

  // --- Link behavior ---
  // Không set target="_blank" => mặc định mở cùng tab như yêu cầu.
  // Nếu có link nào đang để target="_blank" (lỡ tay), ta bỏ đi:
  document.querySelectorAll('a[target="_blank"]').forEach(a => a.removeAttribute('target'));
});

// --- Active nav highlighter ---
(function () {
  const ACTIVE_DESKTOP = ['text-sky-700', 'font-medium'];
  const ACTIVE_MOBILE  = ['bg-sky-50'];

  function mark(el, classes) {
    if (!el) return;
    classes.forEach(c => el.classList.add(c));
  }

  function run() {
    // ví dụ: "thietbi.html?cat=cam-bien"
    const path = location.pathname.split('/').pop() || 'index.html';
    const pathWithQuery = (location.pathname.split('/').pop() || 'index.html') + location.search;

    // 1) Link thường trong navbar (Trang chủ, Kho thuốc, …)
    document.querySelectorAll('nav a[href]').forEach(a => {
      const href = a.getAttribute('href').split('?')[0];
      if (href === path) mark(a, ACTIVE_DESKTOP);
    });

    // 2) Mobile menu
    document.querySelectorAll('#mobileMenu a[href]').forEach(a => {
      const href = a.getAttribute('href').split('?')[0];
      if (href === path) mark(a, ACTIVE_MOBILE);
    });

    // 3) Trường hợp “Thiết bị” là nút (không phải <a>)
    if (/^thietbi\.html/i.test(path)) {
      const btnDevices = document.querySelector('[data-dd="devices"] .dd-toggle');
      mark(btnDevices, ACTIVE_DESKTOP);

      // mobile: mở nhóm “Thiết bị” & tô mục “Tất cả”
      const details = Array.from(document.querySelectorAll('#mobileMenu details'))
        .find(d => /thiết bị/i.test(d.querySelector('summary')?.textContent || ''));
      if (details) details.open = true;
      const firstLink = document.querySelector('#mobileMenu a[href^="thietbi.html"]');
      mark(firstLink, ACTIVE_MOBILE);
    }

    // 4) Trường hợp “Trạng thái” (nếu sau này cần)
    if (/^trangthai\.html/i.test(path)) {
      const btnStatus = document.querySelector('[data-dd="status"] .dd-toggle');
      mark(btnStatus, ACTIVE_DESKTOP);
    }
  }

  document.addEventListener('DOMContentLoaded', run);
})();

// === Inject theme.css & apply theme to all pages ===
(function () {
  // 1) Load CSS
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'assets/css/theme.css?v=3';
  document.head.appendChild(link);

  // 2) Theme helpers
  const THEMES = ['ocean','mint','midnight','coral','slate']; // + default(:root)
  function applyTheme(name){
    const html = document.documentElement;
    ['theme-ocean','theme-mint','theme-midnight','theme-coral','theme-slate']
      .forEach(c => html.classList.remove(c));
    if (name && THEMES.includes(name)) html.classList.add(`theme-${name}`);
    localStorage.setItem('medicate_theme', name || '');
  }

  const urlTheme = new URLSearchParams(location.search).get('theme');
  const savedTheme = localStorage.getItem('medicate_theme') || '';
  applyTheme(urlTheme || savedTheme || '');

  // 3) Decorate header/mobile + active-nav highlight (giữ logic cũ nếu có)
  document.addEventListener('DOMContentLoaded', () => {
    const header = document.querySelector('header');
    const mobile = document.getElementById('mobileMenu');
    if (header) header.classList.add('nav-themed');
    if (mobile) mobile.classList.add('nav-themed');

    // Active marker cơ bản
    const path = location.pathname.split('/').pop() || 'index.html';
    const mark = (el)=> el && el.classList.add('is-active');

    document.querySelectorAll('nav a[href]').forEach(a=>{
      const href = a.getAttribute('href').split('?')[0];
      if (href === path) mark(a);
    });
    document.querySelectorAll('#mobileMenu a[href]').forEach(a=>{
      const href = a.getAttribute('href').split('?')[0];
      if (href === path) mark(a);
    });
    if (/^thietbi\.html/i.test(path)) mark(document.querySelector('[data-dd="devices"] .dd-toggle'));
    if (/^trangthai\.html/i.test(path)) mark(document.querySelector('[data-dd="status"] .dd-toggle'));

    // 4) Theme switcher: có nhãn "Theme:" + style gọn, phù hợp navbar
    const nav = document.querySelector('header nav') || header;
    if (nav) {
      const wrap = document.createElement('div');
      wrap.className = 'hidden md:flex items-center gap-2 ml-2 pl-2 border-l';
      wrap.style.borderColor = 'var(--nav-border)';

      wrap.innerHTML = `
        <span class="text-sm" style="color:var(--nav-muted)">Theme:</span>
        <div class="relative">
          <select id="themeSelect"
            class="appearance-none border rounded-lg pl-3 pr-8 py-1.5 text-sm"
            style="border-color:var(--nav-border); color:var(--nav-muted); background:linear-gradient(180deg, var(--nav-bg-from), var(--nav-bg-to));">
            <option value="">Default</option>
            <option value="ocean">Ocean</option>
            <option value="mint">Mint</option>
            <option value="midnight">Midnight</option>
            <option value="coral">Coral</option>
            <option value="slate">Slate</option>
          </select>
          <!-- caret -->
          <svg viewBox="0 0 24 24" width="18" height="18"
               style="position:absolute;right:8px;top:50%;transform:translateY(-50%);opacity:.7;color:var(--nav-muted)"
               fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m6 9 6 6 6-6"/></svg>
        </div>
      `;
      nav.appendChild(wrap);

      const select = wrap.querySelector('#themeSelect');
      select.value = urlTheme || savedTheme || '';
      select.addEventListener('change', e => applyTheme(e.target.value));
    }
  });
})();
