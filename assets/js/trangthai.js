// assets/js/trangthai.js
(function () {
  // ===== CONFIG: Google Sheet =====
  const SPREADSHEET_ID = '1IT1mUdsHpvX3QdSt0XMtVhH8NCfI_hCAWF3Xbxiv_pM'; // sheet của bạn
  const LOG_SHEET_NAME = 'Sheet1';

  // ===== Ngưỡng (giống Apps Script) =====
  const TEMP_LOW = 15, TEMP_WARN = 30, TEMP_CRIT = 35;
  const HUM_WARN = 60, HUM_CRIT = 70;

  // ===== Biến global =====
  let gRows = [];        // tất cả log (đã parse + gắn band)
  let gLatestKey = null; // yyyyMMdd ngày mới nhất
  let gPrevKey = null;   // yyyyMMdd ngày liền trước
  let gNowRows = [];     // tối đa 20 điểm mới nhất của ngày hiện tại
  let gHistoryRows = []; // toàn bộ ngày trước hôm nay

  // ===== Label band =====
  function tempLabel(t) {
    if (t == null || t === '') return '';
    if (t >= TEMP_CRIT) return '🔥 ≥35° (quá nóng)';
    if (t >= TEMP_WARN) return '⚠️ 30–34.9° (cảnh báo)';
    if (t < TEMP_LOW)   return '❄️ <15° (quá lạnh)';
    return '✅ 15–29.9° (ổn định)';
  }
  function humLabel(h) {
    if (h == null || h === '') return '';
    if (h >= HUM_CRIT) return '💧 ≥70% (quá ẩm, nguy cơ nấm mốc)';
    if (h >= HUM_WARN) return '⚠️ 60–69.9% (cảnh báo)';
    return '✅ ≤60% (ổn định)';
  }

  function toNumber(x) {
    if (x == null || x === '') return null;
    if (typeof x === 'number') return x;
    if (typeof x === 'string') {
      const s = x.replace(',', '.').trim();
      const n = parseFloat(s);
      return Number.isNaN(n) ? null : n;
    }
    return null;
  }

  // ===== GViz đọc Sheet1 =====
  async function fetchLogRows() {
    const base = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq`;
    const url  = `${base}?tqx=out:json&sheet=${encodeURIComponent(LOG_SHEET_NAME)}`;

    const res = await fetch(url);
    const txt = await res.text();

    const m = txt.match(/\{.*\}/s);
    if (!m) throw new Error('Không parse được JSON từ GViz');
    const json = JSON.parse(m[0]);

    const rows = json.table?.rows || [];
    const out  = [];

    for (const r of rows) {
      const cells = r.c || [];
      const cTime = cells[0] || {};
      const cTemp = cells[1] || {};
      const cHum  = cells[2] || {};

      const ts  = parseGVizDate(cTime);
      const tsDisplay = cTime.f || (cTime.v ?? '');
      const temp = toNumber(cTemp.v);
      const hum  = toNumber(cHum.v);

      if (!ts || temp == null || hum == null) continue;

      const tBand = tempLabel(temp);
      const hBand = humLabel(hum);
      const key   = keyOf(ts); // yyyyMMdd

      out.push({ ts, tsDisplay, temp, hum, tempBand: tBand, humBand: hBand, key });
    }
    return out;
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

  function keyOf(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }
  function keyToDisplay(key) {
    if (!key || key.length !== 8) return key || '';
    return `${key.slice(0,4)}-${key.slice(4,6)}-${key.slice(6)}`;
  }

  function getLatestAndPrevKeys(rows) {
    const keys = Array.from(new Set(rows.map(r => r.key))).sort();
    const latestKey = keys.length ? keys[keys.length - 1] : null;
    const prevKey   = keys.length > 1 ? keys[keys.length - 2] : null;
    return { latestKey, prevKey, allKeys: keys };
  }

  function overallState(temp, hum) {
    if (temp == null && hum == null) return 'unknown';
    if ((temp != null && temp >= TEMP_CRIT) || (hum != null && hum >= HUM_CRIT)) return 'danger';
    if ((temp != null && temp >= TEMP_WARN) || (hum != null && hum >= HUM_WARN)) return 'warn';
    return 'ok';
  }

  function applyOverallBadge(level) {
    const el = document.getElementById('nowOverallBadge');
    if (!el) return;
    el.className = 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium';

    if (level === 'danger') {
      el.classList.add('border-rose-200', 'bg-rose-50', 'text-rose-700');
      el.textContent = 'Nguy hiểm';
    } else if (level === 'warn') {
      el.classList.add('border-amber-200', 'bg-amber-50', 'text-amber-700');
      el.textContent = 'Cần chú ý';
    } else if (level === 'ok') {
      el.classList.add('border-emerald-200', 'bg-emerald-50', 'text-emerald-700');
      el.textContent = 'Ổn định';
    } else {
      el.classList.add('border-slate-200', 'bg-slate-50', 'text-slate-600');
      el.textContent = 'Không rõ';
    }
  }

  function fmtNumber(v) {
    if (v == null || Number.isNaN(v)) return '—';
    return v.toFixed(1);
  }

  function renderTable(tbodyId, rows) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-4 text-center text-slate-400">Không có dữ liệu.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map((r, idx) => {
      const rowCls = idx % 2 ? 'bg-slate-50/50' : 'bg-white';
      return `
        <tr class="${rowCls}">
          <td class="px-4 py-1.5 whitespace-nowrap text-xs md:text-sm">${r.tsDisplay}</td>
          <td class="px-4 py-1.5 text-right">${fmtNumber(r.temp)}</td>
          <td class="px-4 py-1.5 text-xs">${r.tempBand}</td>
          <td class="px-4 py-1.5 text-right">${fmtNumber(r.hum)}</td>
          <td class="px-4 py-1.5 text-xs">${r.humBand}</td>
        </tr>`;
    }).join('');
  }

  // ==== Helpers filter band ====
  function matchTempBand(row, mode) {
    if (!mode) return true;
    const band = row.tempBand || '';
    if (mode === 'cold') return band.includes('❄️');
    if (mode === 'ok')   return band.includes('✅');
    if (mode === 'warn') return band.includes('⚠️');
    if (mode === 'hot')  return band.includes('🔥');
    return true;
  }
  function matchHumBand(row, mode) {
    if (!mode) return true;
    const band = row.humBand || '';
    if (mode === 'ok')   return band.includes('✅');
    if (mode === 'warn') return band.includes('⚠️');
    if (mode === 'wet')  return band.includes('💧');
    return true;
  }

  // ==== Switch view (Hiện giờ / Lịch sử) ====
  function switchView(view) {
    const nowSec = document.getElementById('statusNow');
    const hisSec = document.getElementById('statusHistory');
    const tabNow = document.querySelector('[data-view-tab="now"]');
    const tabHis = document.querySelector('[data-view-tab="history"]');

    if (!nowSec || !hisSec || !tabNow || !tabHis) return;

    const activeCls = ['bg-white', 'shadow-sm', 'border-slate-200', 'text-sky-700'];
    const inactiveCls = ['bg-transparent', 'border-transparent', 'text-slate-600'];

    if (view === 'history') {
      nowSec.classList.add('hidden');
      hisSec.classList.remove('hidden');

      tabNow.classList.remove(...activeCls);
      tabNow.classList.add(...inactiveCls);
      tabHis.classList.remove(...inactiveCls);
      tabHis.classList.add(...activeCls);
    } else {
      hisSec.classList.add('hidden');
      nowSec.classList.remove('hidden');

      tabHis.classList.remove(...activeCls);
      tabHis.classList.add(...inactiveCls);
      tabNow.classList.remove(...inactiveCls);
      tabNow.classList.add(...activeCls);
    }
  }

  // ==== Filter + search cho tab HIỆN GIỜ ====
  function setupNowControls() {
    const tempSel = document.getElementById('nowTempBandSelect');
    const humSel  = document.getElementById('nowHumBandSelect');
    const search  = document.getElementById('nowSearch');
    if (!tempSel || !humSel || !search) return;

    const handler = () => applyNowFilters();

    tempSel.addEventListener('change', handler);
    humSel.addEventListener('change', handler);
    search.addEventListener('input', () => {
      clearTimeout(applyNowFilters._timer);
      applyNowFilters._timer = setTimeout(handler, 200);
    });
  }

  function applyNowFilters() {
    const tempSel = document.getElementById('nowTempBandSelect');
    const humSel  = document.getElementById('nowHumBandSelect');
    const search  = document.getElementById('nowSearch');

    if (!tempSel || !humSel || !search) return;

    let rows = gNowRows.slice();
    const tMode = tempSel.value;
    const hMode = humSel.value;
    const q     = (search.value || '').trim().toLowerCase();

    rows = rows.filter(r => matchTempBand(r, tMode) && matchHumBand(r, hMode));

    if (q) {
      rows = rows.filter(r => {
        const tStr  = fmtNumber(r.temp);
        const hStr  = fmtNumber(r.hum);
        const tsStr = (r.tsDisplay || '').toLowerCase();
        return tsStr.includes(q) || tStr.includes(q) || hStr.includes(q);
      });
    }

    renderTable('nowTableBody', rows);
  }

  // ==== Filter + search cho tab LỊCH SỬ ====
  function setupHistoryControls() {
    const dateSel = document.getElementById('historyDateSelect');
    const tempSel = document.getElementById('historyTempBandSelect');
    const humSel  = document.getElementById('historyHumBandSelect');
    const search  = document.getElementById('historySearch');

    if (!dateSel || !tempSel || !humSel || !search) return;

    const dateCount = new Map(); // key -> số mẫu
    gHistoryRows.forEach(r => {
      dateCount.set(r.key, (dateCount.get(r.key) || 0) + 1);
    });
    const allKeys = Array.from(dateCount.keys()).sort();

    dateSel.innerHTML = '';

    // MỤC "TẤT CẢ" (gộp hôm qua + mọi ngày trước đó)
    const totalSamples = gHistoryRows.length;
    const optAll = document.createElement('option');
    optAll.value = 'all';
    optAll.textContent = `Tất cả (hôm qua + các ngày trước đó) — ${totalSamples} mẫu`;
    dateSel.appendChild(optAll);

    // option: Chỉ hôm qua (nếu có)
    if (gPrevKey && dateCount.has(gPrevKey)) {
      const optPrev = document.createElement('option');
      optPrev.value = 'prev';
      optPrev.textContent = `Chỉ hôm qua (${keyToDisplay(gPrevKey)})`;
      dateSel.appendChild(optPrev);
    }

    // option: từng ngày cụ thể
    allKeys.forEach(k => {
      const opt = document.createElement('option');
      opt.value = 'key:' + k;
      opt.textContent = `${keyToDisplay(k)} (${dateCount.get(k)} mẫu)`;
      dateSel.appendChild(opt);
    });

    // mặc định chọn "all"
    dateSel.value = 'all';

    const handler = () => applyHistoryFilters();
    dateSel.addEventListener('change', handler);
    tempSel.addEventListener('change', handler);
    humSel.addEventListener('change', handler);
    search.addEventListener('input', () => {
      clearTimeout(applyHistoryFilters._timer);
      applyHistoryFilters._timer = setTimeout(handler, 200);
    });
  }

  function applyHistoryFilters() {
    const dateSel = document.getElementById('historyDateSelect');
    const tempSel = document.getElementById('historyTempBandSelect');
    const humSel  = document.getElementById('historyHumBandSelect');
    const search  = document.getElementById('historySearch');
    const summary = document.getElementById('historySummary');

    if (!dateSel || !tempSel || !humSel || !search || !summary) return;

    let rows = gHistoryRows.slice();

    // lọc theo ngày
    const dateMode = dateSel.value || 'all';
    if (dateMode === 'prev' && gPrevKey) {
      rows = rows.filter(r => r.key === gPrevKey);
    } else if (dateMode.startsWith('key:')) {
      const key = dateMode.slice(4);
      rows = rows.filter(r => r.key === key);
    } // 'all' -> giữ nguyên

    // lọc band
    const tMode = tempSel.value;
    const hMode = humSel.value;
    rows = rows.filter(r => matchTempBand(r, tMode) && matchHumBand(r, hMode));

    // search
    const q = (search.value || '').trim().toLowerCase();
    if (q) {
      rows = rows.filter(r => {
        const tStr  = fmtNumber(r.temp);
        const hStr  = fmtNumber(r.hum);
        const tsStr = (r.tsDisplay || '').toLowerCase();
        return tsStr.includes(q) || tStr.includes(q) || hStr.includes(q);
      });
    }

    renderTable('historyTableBody', rows);

    let dateText;
    if (dateMode === 'all') {
      dateText = 'tất cả (hôm qua + các ngày trước đó)';
    } else if (dateMode === 'prev' && gPrevKey) {
      dateText = `chỉ hôm qua (${keyToDisplay(gPrevKey)})`;
    } else if (dateMode.startsWith('key:')) {
      dateText = `ngày ${keyToDisplay(dateMode.slice(4))}`;
    } else {
      dateText = 'không rõ';
    }

    summary.textContent = rows.length
      ? `${rows.length} mẫu, ${dateText}. Có thể lọc thêm bằng band nhiệt/ẩm hoặc ô tìm kiếm.`
      : `Không tìm thấy mẫu nào khớp điều kiện lọc (${dateText}).`;
  }

  // ==== Load + render data (dùng lại cho auto refresh) ====
  async function refreshDataOnce() {
    const rows = await fetchLogRows();
    if (!rows.length) throw new Error('Empty sheet');
    rows.sort((a, b) => a.ts - b.ts); // tăng dần theo thời gian
    gRows = rows;

    const { latestKey, prevKey } = getLatestAndPrevKeys(rows);
    gLatestKey = latestKey;
    gPrevKey   = prevKey;

    if (!latestKey) throw new Error('No latest day');

    // === HIỆN GIỜ ===
    const latestRows = rows.filter(r => r.key === latestKey);
    const latest20Desc = latestRows.slice(-20).reverse(); // 20 điểm mới nhất (từ mới đến cũ)
    gNowRows = latest20Desc;

    const latestPoint = latest20Desc[0] || latestRows[latestRows.length - 1];
    if (latestPoint) {
      const tsEl = document.getElementById('nowTimestamp');
      const tEl  = document.getElementById('nowTemp');
      const hEl  = document.getElementById('nowHum');
      const tbEl = document.getElementById('nowTempBand');
      const hbEl = document.getElementById('nowHumBand');

      if (tsEl) tsEl.textContent = latestPoint.tsDisplay;
      if (tEl)  tEl.textContent  = `${fmtNumber(latestPoint.temp)} °C`;
      if (hEl)  hEl.textContent  = `${fmtNumber(latestPoint.hum)} %`;
      if (tbEl) tbEl.textContent = latestPoint.tempBand;
      if (hbEl) hbEl.textContent = latestPoint.humBand;

      applyOverallBadge(overallState(latestPoint.temp, latestPoint.hum));
    }

    // Rerender bảng "hiện giờ" theo filter hiện tại
    applyNowFilters();

    // === LỊCH SỬ ===
    gHistoryRows = rows.filter(r => r.key !== latestKey); // chỉ hôm qua + trước đó
    applyHistoryFilters();
  }

  // ==== INIT ====
  async function init() {
    const view = new URLSearchParams(location.search).get('view') || 'now';
    switchView(view);

    const errBox = document.getElementById('statusError');

    try {
      // load lần đầu
      await refreshDataOnce();

      // gán sự kiện filter
      setupNowControls();
      setupHistoryControls();

      // Auto refresh mỗi 60s
      setInterval(() => {
        refreshDataOnce().catch(e => console.error('Auto refresh error', e));
      }, 60000);
    } catch (e) {
      console.error('Trạng thái: lỗi đọc sheet', e);
      if (errBox) errBox.classList.remove('hidden');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
