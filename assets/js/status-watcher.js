// assets/js/status-watcher.js
// Theo dõi nhiệt/ẩm mới nhất từ Google Sheets và hiển thị cảnh báo nhỏ
// ở mọi trang (index, kho, thiết bị, trạng thái, ...).
(function () {
  const SPREADSHEET_ID = '1IT1mUdsHpvX3QdSt0XMtVhH8NCfI_hCAWF3Xbxiv_pM';
  const LOG_SHEET_NAME = 'Sheet1';

  // Ngưỡng giống Apps Script
  const TEMP_LOW = 15, TEMP_WARN = 30, TEMP_CRIT = 35;
  const HUM_WARN = 60, HUM_CRIT = 70;

  // Lưu trạng thái lần trước để tránh spam
  let lastState = 'unknown';   // 'ok' | 'warn' | 'danger'
  let lastTsKey = '';          // chuỗi timestamp hiển thị/ISO của lần cảnh báo gần nhất

  // Snooze: không hiện lại alert trong một khoảng thời gian
  const SNOOZE_MINUTES = 10;

  function overallState(temp, hum) {
    if (temp == null && hum == null) return 'unknown';
    if ((temp != null && temp >= TEMP_CRIT) || (hum != null && hum >= HUM_CRIT)) return 'danger';
    if ((temp != null && temp >= TEMP_WARN) || (hum != null && hum >= HUM_WARN)) return 'warn';
    return 'ok';
  }

  function fmtNumber(v) {
    if (v == null || Number.isNaN(v)) return '—';
    return v.toFixed(1);
  }

  function parseGVizDate(cell) {
    if (!cell) return null;
    const v = cell.v;

    if (typeof v === 'string' && /^Date\(/.test(v)) {
      const nums = v.match(/\d+/g);
      if (!nums) return null;
      const [y, m, d, hh = 0, mm = 0, ss = 0] = nums.map(Number);
      return new Date(y, m, d, hh, mm, ss);
    }

    if (v instanceof Date) return v;
    if (typeof v === 'number') {
      const ms = Math.round((v - 25569) * 86400 * 1000);
      return new Date(ms);
    }
    if (typeof v === 'string') {
      const s = v.trim();
      const hasZ = /Z$/i.test(s);
      let d = new Date(s);
      if (Number.isNaN(d.getTime())) return null;
      if (hasZ) d = new Date(d.getTime() + 7 * 3600 * 1000); // UTC->VN(+7)
      return d;
    }
    return null;
  }

  async function fetchLatestSample() {
    const base = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq`;
    const tq   = encodeURIComponent('select A,B,C order by A desc limit 1');
    const url  = `${base}?tqx=out:json&sheet=${encodeURIComponent(LOG_SHEET_NAME)}&tq=${tq}`;

    const res = await fetch(url);
    const txt = await res.text();
    const m = txt.match(/\{.*\}/s);
    if (!m) throw new Error('Không parse được JSON từ GViz');
    const json = JSON.parse(m[0]);
    const rows = json.table?.rows || [];
    if (!rows.length) return null;

    const r = rows[0];
    const cells = r.c || [];
    const cTime = cells[0] || {};
    const cTemp = cells[1] || {};
    const cHum  = cells[2] || {};

    const ts  = parseGVizDate(cTime);
    const tsDisplay = cTime.f || (cTime.v ?? '');
    const temp = typeof cTemp.v === 'number' ? cTemp.v : parseFloat(String(cTemp.v || '').replace(',', '.'));
    const hum  = typeof cHum.v === 'number' ? cHum.v : parseFloat(String(cHum.v || '').replace(',', '.'));

    if (!ts || Number.isNaN(temp) || Number.isNaN(hum)) return null;

    return {
      ts,
      tsDisplay,
      temp,
      hum,
      state: overallState(temp, hum)
    };
  }

  // Tạo / lấy element alert dùng chung
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
                  class="mt-1 text-[11px] underline text-amber-800/80">
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

  function showAlert(sample) {
    const root  = ensureAlertElement();
    const icon  = root.querySelector('#medicateGlobalAlertIcon');
    const title = root.querySelector('#medicateGlobalAlertTitle');
    const body  = root.querySelector('#medicateGlobalAlertBody');

    if (!sample || !root || !icon || !title || !body) return;

    const { state, temp, hum, tsDisplay } = sample;

    if (state === 'danger') {
      root.className = 'fixed z-50 bottom-4 right-4 max-w-xs rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 shadow-lg text-xs md:text-sm text-rose-800';
      icon.textContent = '🚨';
      title.textContent = 'Nguy hiểm: tủ thuốc vượt ngưỡng!';
    } else if (state === 'warn') {
      root.className = 'fixed z-50 bottom-4 right-4 max-w-xs rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-lg text-xs md:text-sm text-amber-800';
      icon.textContent = '⚠️';
      title.textContent = 'Cảnh báo: tủ thuốc cần chú ý';
    } else {
      // state ok -> ẩn
      hideAlert();
      return;
    }

    body.innerHTML = `
      Thời gian: <span class="font-medium">${tsDisplay}</span><br>
      Nhiệt độ: <span class="font-medium">${fmtNumber(temp)} °C</span><br>
      Độ ẩm: <span class="font-medium">${fmtNumber(hum)} %</span>
    `;

    root.classList.remove('hidden');
  }

  function hideAlert() {
    const root = document.getElementById('medicateGlobalAlert');
    if (root) root.classList.add('hidden');
  }

  async function checkOnce() {
    try {
      const sample = await fetchLatestSample();
      if (!sample) return;

      const { state, tsDisplay } = sample;

      // nếu đang snooze thì bỏ qua
      let snoozeUntil = 0;
      try {
        snoozeUntil = Number(localStorage.getItem('medicateAlertSnoozeUntil') || '0');
      } catch (_) {}
      if (snoozeUntil && Date.now() < snoozeUntil) {
        return;
      }

      if (state === 'ok') {
        hideAlert();
        lastState = 'ok';
        lastTsKey = tsDisplay;
        return;
      }

      // chỉ hiện nếu có thay đổi so với lần cảnh báo trước
      if (state === lastState && tsDisplay === lastTsKey) {
        return;
      }

      showAlert(sample);
      lastState = state;
      lastTsKey = tsDisplay;
    } catch (e) {
      console.error('Global status watcher error:', e);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    // kiểm tra ngay khi mở trang
    checkOnce();
    // sau đó 60s kiểm tra lại một lần
    setInterval(checkOnce, 60000);
  });
})();
