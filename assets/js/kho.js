/***********************
 * KHO – BẢN ỔN ĐỊNH RÚT GỌN
 * Chỉ đọc MedData và hiển thị bảng
 ***********************/

const MEDDATA_FILE_ID = '10zl4y1Yoj7tuOPH6zZQIKWlbwOJL0fahVK0A1r_86eQ';
const MEDDATA_GID     = '305557211';

const CSV_URL = `https://docs.google.com/spreadsheets/d/${MEDDATA_FILE_ID}/export?format=csv&gid=${MEDDATA_GID}`;

let RAW_ROWS = [];
let VIEW_ROWS = [];
let MAX_QTY = 0;
const CHIP_BASE = new Map();

function parseCSV(url){
  const bust = (url.includes('?') ? '&' : '?') + '_ts=' + Date.now();
  return fetch(url + bust, { cache: 'no-store' })
    .then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    })
    .then(t => Papa.parse(t, { header: true, skipEmptyLines: true }).data);
}

function nn(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normHdr(s){
  return String(s ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu,'')
    .replace(/đ/g,'d')
    .replace(/[^\w\s]/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

function getByHeader(row, names){
  const entries = Object.entries(row || {});
  for (const wanted of names) {
    const nw = normHdr(wanted);
    for (const [k, v] of entries) {
      if (normHdr(k) === nw) return v;
    }
  }
  return '';
}

function parseVNDate(raw){
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;

  if (/^\d{3,5}$/.test(s)){
    const base = dayjs('1899-12-30');
    return base.add(parseInt(s,10),'day').startOf('day');
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(s)){
    const d = dayjs(s);
    if (d.isValid()) return d.startOf('day');
  }

  const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (m){
    let dd = Number(m[1]);
    let mm = Number(m[2]);
    let yy = Number(m[3]);

    if (yy < 100) yy += 2000;
    mm = Math.max(1, Math.min(12, mm));

    const first = dayjs(`${yy}-${String(mm).padStart(2,'0')}-01`);
    dd = Math.max(1, Math.min(first.daysInMonth(), dd));

    const d = dayjs(`${yy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`);
    if (d.isValid()) return d.startOf('day');
  }

  const fs = ['DD/MM/YYYY','D/M/YYYY','DD-MM-YYYY','D-M-YYYY','YYYY-MM-DD'];
  for (const f of fs){
    const d = dayjs(s, f, true);
    if (d.isValid()) return d.startOf('day');
  }

  return null;
}

function statusFromDaysLeft(d){
  if (d == null) return 'Còn hạn';
  if (d <= 0) return 'Hết hạn';
  if (d <= 30) return 'Sắp hết hạn';
  return 'Còn hạn';
}

function fmtDaysLeft(v){
  if (v === '' || v == null) return '';
  return v <= 0 ? `quá hạn ${Math.abs(v)} ngày` : `${v} ngày`;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[m]));
}

function renderError(msg){
  const tbody = document.getElementById('tableBody');
  if (!tbody) return;
  tbody.innerHTML = `
    <tr>
      <td colspan="7" class="text-center py-6 text-rose-600">
        ${escapeHtml(msg)}
      </td>
    </tr>
  `;
}

async function loadAll() {
  try {
    const today = dayjs().startOf('day');
    const med = await parseCSV(CSV_URL);

    if (!Array.isArray(med) || !med.length) {
      renderError('Không tải được dữ liệu từ Google Sheets. Hãy kiểm tra FILE_ID, gid và quyền chia sẻ "Anyone with the link - Viewer".');
      return;
    }

    RAW_ROWS = med.map((r) => {
      const tenRaw      = getByHeader(r, ['TÊN THUỐC GỐC', 'TEN THUOC GOC', 'Tên thuốc gốc']);
      const aliasRaw    = getByHeader(r, ['ALIAS']);
      const soLuongRaw  = getByHeader(r, ['SỐ LƯỢNG', 'SO LUONG', 'Số lượng']);
      const hsdRaw      = getByHeader(r, ['HSD']);
      const maSpRaw     = getByHeader(r, ['MÃ SẢN PHẨM', 'MA SAN PHAM', 'Mã sản phẩm']);
      const ngayNhapRaw = getByHeader(r, ['NGÀY NHẬP', 'NGAY NHAP', 'Ngày nhập']);

      const ten = String(tenRaw || '').trim();
      const alias = String(aliasRaw || '').trim();
      const soLuong = Number(String(soLuongRaw || '').replace(/[^\d.-]/g, '')) || 0;
      const hsd = parseVNDate(hsdRaw);
      const ngayNhap = parseVNDate(ngayNhapRaw);

      const daysLeft = hsd ? hsd.diff(today, 'day') : null;

      return {
        ten,
        alias,
        soLuong,
        hsd: hsd ? hsd.format('DD/MM/YYYY') : String(hsdRaw || '').trim(),
        ngayNhap: ngayNhap ? ngayNhap.format('DD/MM/YYYY') : String(ngayNhapRaw || '').trim(),
        maSp: String(maSpRaw || '').trim(),
        daysLeft: daysLeft == null ? '' : daysLeft,
        trangThai: statusFromDaysLeft(daysLeft)
      };
    }).filter(x => x.ten);

    MAX_QTY = RAW_ROWS.reduce((m, x) => Math.max(m, Number(x.soLuong) || 0), 0);

    const slider = document.getElementById('qtySlider');
    const qtyVal = document.getElementById('qtyVal');
    if (slider && qtyVal) {
      slider.min = 0;
      slider.max = String(MAX_QTY || 0);
      slider.value = String(MAX_QTY || 0);
      qtyVal.textContent = slider.value;
    }

    applyFilters();

  } catch (err) {
    console.error('loadAll error:', err);
    renderError('Lỗi khi xử lý dữ liệu kho: ' + (err.message || String(err)));
  }
}

function statusBadge(st){
  const map = {
    'Hết hạn':'bg-rose-100 text-rose-700 border-rose-200',
    'Sắp hết hạn':'bg-amber-100 text-amber-800 border-amber-200',
    'Còn hạn':'bg-emerald-100 text-emerald-700 border-emerald-200'
  };
  const dot = st === 'Hết hạn'
    ? 'bg-rose-500'
    : st === 'Sắp hết hạn'
      ? 'bg-amber-500'
      : 'bg-emerald-500';

  return `
    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${map[st] || 'bg-slate-100'}">
      <span class="inline-block w-1.5 h-1.5 rounded-full ${dot}"></span>${st}
    </span>
  `;
}

function getActiveFilter(){
  const el = document.querySelector('.filter-chip.active');
  return el?.dataset.filter || 'all';
}

function applyFilters(){
  const q = nn(document.getElementById('searchInput')?.value || '');
  const mode = getActiveFilter();
  const slider = document.getElementById('qtySlider');
  const thr = slider ? Number(slider.value) : Infinity;

  VIEW_ROWS = RAW_ROWS.filter(row => {
    const hay = `${nn(row.ten)} ${nn(row.alias)}`;

    if (q && !hay.includes(q)) return false;
    if (mode === 'ok'      && row.trangThai !== 'Còn hạn')      return false;
    if (mode === 'soon'    && row.trangThai !== 'Sắp hết hạn')  return false;
    if (mode === 'expired' && row.trangThai !== 'Hết hạn')      return false;
    if (Number(row.soLuong) > thr) return false;

    return true;
  });

  renderTable();
}

function renderTable(){
  const tbody = document.getElementById('tableBody');
  if (!tbody) return;

  if (!VIEW_ROWS.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-6 text-slate-500">
          Không có dữ liệu
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = VIEW_ROWS.map((r, i) => `
    <tr class="${i % 2 ? 'bg-white' : 'bg-slate-50/40'} hover:bg-sky-50">
      <td class="py-2.5 px-3">${escapeHtml(r.ten || '')}</td>
      <td class="py-2.5 px-3 bg-sky-50/50">
        <div class="truncate max-w-[28ch] text-slate-700" title="${escapeHtml(r.alias || '')}">
          ${escapeHtml(r.alias || '')}
        </div>
      </td>
      <td class="py-2.5 px-3 text-right bg-slate-50 mono">${r.soLuong}</td>
      <td class="py-2.5 px-3 whitespace-nowrap bg-indigo-50/40 mono">${escapeHtml(r.hsd || '')}</td>
      <td class="py-2.5 px-3 whitespace-nowrap bg-indigo-50/20 mono">${escapeHtml(r.ngayNhap || '')}</td>
      <td class="py-2.5 px-3 text-center whitespace-nowrap">${statusBadge(r.trangThai || '')}</td>
      <td class="py-2.5 px-3 text-right whitespace-nowrap bg-slate-50/60 mono">
        ${fmtDaysLeft(r.daysLeft)}
      </td>
    </tr>
  `).join('');
}

const CHIP_ACTIVE = {
  all:     'bg-sky-600 text-white border-sky-600',
  ok:      'bg-emerald-600 text-white border-emerald-600',
  soon:    'bg-amber-500 text-white border-amber-500',
  expired: 'bg-rose-600 text-white border-rose-600'
};

function setActiveChip(btn){
  document.querySelectorAll('.filter-chip').forEach(b => {
    const base = CHIP_BASE.get(b) || b.className;
    CHIP_BASE.set(b, base.replace(/\s?active\b/, ''));
    b.className = CHIP_BASE.get(b);
  });

  btn.className = (CHIP_BASE.get(btn) || btn.className) +
    ' active ' + (CHIP_ACTIVE[btn.dataset.filter] || CHIP_ACTIVE.all);
}

function initEvents(){
  document.querySelectorAll('.filter-chip').forEach(b => {
    CHIP_BASE.set(b, b.className);
  });

  document.querySelectorAll('.filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      setActiveChip(btn);
      applyFilters();
    });
  });

  const def = document.querySelector('.filter-chip[data-filter="all"]');
  if (def) setActiveChip(def);

  document.getElementById('searchInput')
    ?.addEventListener('input', applyFilters);

  const slider = document.getElementById('qtySlider');
  const qtyVal = document.getElementById('qtyVal');
  if (slider && qtyVal) {
    slider.addEventListener('input', () => {
      qtyVal.textContent = slider.value;
      applyFilters();
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initEvents();
  loadAll();

  setInterval(() => {
    if (!document.hidden) loadAll();
  }, 15000);

  if (typeof window.wireTabsForThuoc === 'function') {
    window.wireTabsForThuoc();
  }
});
