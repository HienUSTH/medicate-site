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
