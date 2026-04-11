(function () {
  const SUPABASE_URL = 'https://kbdqkvcmfkuthlbbnaac.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtiZHFrdmNtZmt1dGhsYmJuYWFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0OTczNzIsImV4cCI6MjA5MDA3MzM3Mn0.8dDVYCZyvTYRR7pkeleTiW1vv9ktNiPD8dml0DU4HDw';
  const CHECK_MS = 60000;
  const SNOOZE_MINUTES = 10;

  let sb = null;
  let lastState = 'unknown';
  let lastTsKey = '';

  function getClient() {
    if (!window.supabase) return null;
    if (!sb) {
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
    }
    return sb;
  }

  function formatNumber(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return n.toFixed(1);
  }

  function formatDateTime(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(d);
  }

  async function fetchLatestStatus() {
    const client = getClient();
    if (!client) return null;

    const userRes = await client.auth.getUser();
    const user = userRes?.data?.user || null;
    if (!user) return null;

    const { data, error } = await client
      .from('v_sensor_latest_status')
      .select('*')
      .eq('user_id', user.id)
      .order('recorded_at', { ascending: false })
      .limit(1);

    if (error) throw error;
    return data?.[0] || null;
  }

  function ensureAlertElement() {
    let root = document.getElementById('medicateGlobalAlert');
    if (root) return root;

    root = document.createElement('div');
    root.id = 'medicateGlobalAlert';
    root.className = 'hidden fixed z-50 bottom-4 right-4 max-w-xs rounded-2xl border bg-amber-50 px-4 py-3 shadow-lg text-xs md:text-sm text-amber-800';

    root.innerHTML = `
      <div class="flex items-start gap-2">
        <div class="mt-0.5" id="medicateGlobalAlertIcon">⚠️</div>
        <div class="space-y-1">
          <div id="medicateGlobalAlertTitle" class="font-semibold">Cảnh báo tủ thuốc</div>
          <div id="medicateGlobalAlertBody" class="leading-snug">
            Nhiệt độ / độ ẩm đang vượt ngưỡng an toàn.
          </div>
          <button id="medicateGlobalAlertClose"
                  type="button"
                  class="mt-1 text-[11px] underline opacity-80">
            Tạm ẩn trong 10 phút
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(root);

    const btnClose = root.querySelector('#medicateGlobalAlertClose');
    if (btnClose) {
      btnClose.addEventListener('click', () => {
        root.classList.add('hidden');
        const snoozeUntil = Date.now() + SNOOZE_MINUTES * 60 * 1000;
        try {
          localStorage.setItem('medicateAlertSnoozeUntil', String(snoozeUntil));
        } catch (_) {}
      });
    }

    return root;
  }

  function hideAlert() {
    const root = document.getElementById('medicateGlobalAlert');
    if (root) root.classList.add('hidden');
  }

  function showAlert(row) {
    const root = ensureAlertElement();
    const icon = root.querySelector('#medicateGlobalAlertIcon');
    const title = root.querySelector('#medicateGlobalAlertTitle');
    const body = root.querySelector('#medicateGlobalAlertBody');

    if (!root || !icon || !title || !body) return;

    if (row.alert_level_key === 'danger') {
      root.className = 'fixed z-50 bottom-4 right-4 max-w-xs rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 shadow-lg text-xs md:text-sm text-rose-800';
      icon.textContent = '🚨';
      title.textContent = 'Cảnh báo tủ thuốc';
    } else {
      root.className = 'fixed z-50 bottom-4 right-4 max-w-xs rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-lg text-xs md:text-sm text-amber-800';
      icon.textContent = '⚠️';
      title.textContent = 'Tủ thuốc cần chú ý';
    }

    body.innerHTML = `
      Tủ: <span class="font-medium">${row.cabinet_name || 'Tủ thuốc'}</span><br>
      Lúc: <span class="font-medium">${formatDateTime(row.recorded_at)}</span><br>
      Nhiệt độ: <span class="font-medium">${formatNumber(row.temperature)} °C</span><br>
      Độ ẩm: <span class="font-medium">${formatNumber(row.humidity)} %</span>
    `;

    root.classList.remove('hidden');
  }

  async function checkOnce() {
    try {
      let snoozeUntil = 0;
      try {
        snoozeUntil = Number(localStorage.getItem('medicateAlertSnoozeUntil') || '0');
      } catch (_) {}

      if (snoozeUntil && Date.now() < snoozeUntil) return;

      const row = await fetchLatestStatus();
      if (!row) {
        hideAlert();
        return;
      }

      if (row.device_online === false || row.recent_24h === false) {
        hideAlert();
        lastState = 'offline';
        lastTsKey = String(row.recorded_at || '');
        return;
      }

      const stateKey = row.alert_level_key || 'unknown';
      const tsKey = String(row.recorded_at || '');

      if (stateKey === 'safe' || stateKey === 'unknown') {
        hideAlert();
        lastState = stateKey;
        lastTsKey = tsKey;
        return;
      }

      if (stateKey === lastState && tsKey === lastTsKey) {
        return;
      }

      showAlert(row);
      lastState = stateKey;
      lastTsKey = tsKey;
    } catch (error) {
      console.error('Global status watcher error:', error);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    checkOnce();
    setInterval(checkOnce, CHECK_MS);
  });
})();
