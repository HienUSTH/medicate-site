// assets/js/reminder-watcher.js
// Theo dõi các nhắc uống thuốc sắp đến giờ và hiện popup nhỏ ở góc màn hình.
(function () {
  // Cùng URL với REMINDER_API_URL trong kho.js
  const REMINDER_API_URL = 'https://script.google.com/macros/s/AKfycbzEbdOvYWKrA3CC0K52u048UBJiGmrDrNtl_xKU234WNAqhDPgs-f7nrwFJ7VrCINSH/exec';

  const WINDOW_MS = 60 * 1000; // +/- 1 phút quanh thời điểm NextDue
  let shownKeys = new Set();

  function loadShown() {
    try {
      const raw = localStorage.getItem('medicateReminderShown') || '[]';
      const arr = JSON.parse(raw);
      shownKeys = new Set(Array.isArray(arr) ? arr : []);
    } catch (_) {
      shownKeys = new Set();
    }
  }

  function saveShown() {
    try {
      localStorage.setItem('medicateReminderShown', JSON.stringify(Array.from(shownKeys)));
    } catch (_) {}
  }

  function ensureRoot() {
    let root = document.getElementById('medicateReminderAlert');
    if (root) return root;

    root = document.createElement('div');
    root.id = 'medicateReminderAlert';
    root.className = 'hidden fixed z-50 bottom-4 right-4 max-w-xs bg-sky-50 border border-sky-200 px-4 py-3 shadow-lg text-xs md:text-sm text-sky-900 rounded-2xl';

    root.innerHTML = `
      <div class="flex items-start gap-2">
        <div class="mt-0.5" id="medicateReminderIcon">⏰</div>
        <div class="space-y-1">
          <div id="medicateReminderTitle" class="font-semibold">Đến giờ uống thuốc</div>
          <div id="medicateReminderBody" class="leading-snug">
            Đã tới giờ uống thuốc theo lịch.
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(root);
    return root;
  }

  function showAlertForItem(item) {
    const root = ensureRoot();
    const titleEl = root.querySelector('#medicateReminderTitle');
    const bodyEl  = root.querySelector('#medicateReminderBody');

    const name  = item.drugName || 'thuốc';
    const dose  = item.doseText || '';
    const time  = item.timeOfDay || '';
    const when  = item.nextDue || '';

    if (titleEl) {
      titleEl.textContent = `Đến giờ uống: ${name}`;
    }
    if (bodyEl) {
      const parts = [];
      if (time) parts.push(`Giờ: ${time}`);
      if (dose) parts.push(`Liều: ${dose}`);
      if (when) parts.push(`(${when})`);
      bodyEl.textContent = parts.join(' • ');
    }

    root.classList.remove('hidden');

    setTimeout(() => {
      root.classList.add('hidden');
    }, 15000);
  }

  async function checkReminders() {
    if (!REMINDER_API_URL || REMINDER_API_URL.includes('XXX')) return;

    try {
      const params = new URLSearchParams({
        mode: 'list-reminders',
        onlyActive: 'true'
      });

      const res = await fetch(REMINDER_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });

      const json = await res.json().catch(() => null);
      if (!json || !json.ok) return;

      const items = json.items || [];
      if (!items.length) return;

      const now = Date.now();

      for (const it of items) {
        if (!it.nextDue) continue;
        const d = new Date(it.nextDue);
        if (Number.isNaN(d.getTime())) continue;

        const diff = Math.abs(d.getTime() - now);
        if (diff > WINDOW_MS) continue;

        const key = `${it.id}|${it.nextDue}`;
        if (shownKeys.has(key)) continue;

        showAlertForItem(it);
        shownKeys.add(key);
      }

      saveShown();
    } catch (e) {
      console.error('Reminder watcher error:', e);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadShown();
    checkReminders();
    setInterval(checkReminders, 15000);
  });
})();
