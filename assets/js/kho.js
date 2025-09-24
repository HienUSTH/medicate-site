// ===== CONFIG =====
const FILE_ID = '1ZsRkVHNq5XKV-0R6abUW3zlleBZqjXqjJzaDu90AneI';
const CSV_URLS = {
  MedData:       `https://docs.google.com/spreadsheets/d/${FILE_ID}/export?format=csv&gid=0`,
  DanhMucSearch: `https://docs.google.com/spreadsheets/d/${FILE_ID}/export?format=csv&gid=1041829227`
};

// ===== UTILS =====
function parseCSV(url) {
  return fetch(url).then(r => r.text()).then(t => Papa.parse(t, { header: true, skipEmptyLines: true }).data);
}
const nn = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/\s+/g,' ').trim();

function normalizeStatus(s='') {
  const x = nn(s);
  if (x.includes('het han') || /expired/i.test(s)) return 'Hết hạn';
  if (x.includes('sap het han')) return 'Sắp hết hạn';
  if (x.includes('con han')) return 'Còn hạn';
  return s.trim();
}
function statusBadge(status) {
  const map = {
    'Hết hạn'     : 'bg-rose-100 text-rose-700 border-rose-200',
    'Sắp hết hạn' : 'bg-amber-100 text-amber-800 border-amber-200',
    'Còn hạn'     : 'bg-emerald-100 text-emerald-700 border-emerald-200'
  };
  const dot = status==='Hết hạn' ? 'bg-rose-500'
           : status==='Sắp hết hạn' ? 'bg-amber-500'
           : status==='Còn hạn' ? 'bg-emerald-500' : 'bg-slate-400';
  return `<span class="inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1 rounded-full border ${map[status]||'bg-slate-100'}">
    <span class="inline-block w-1.5 h-1.5 rounded-full ${dot}"></span>${status}
  </span>`;
}

// Parse ngày + “coerce” ngày sai về cuối tháng
function parseVNDate(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  if (/^\d{3,5}$/.test(s)) { const base=dayjs('1899-12-30'); return base.add(parseInt(s,10),'day'); }
  if (/^\d{4}-\d{2}-\d{2}([T\s]\d{2}:\d{2}(:\d{2})?)?/.test(s)) { const d=dayjs(s); if(d.isValid()) return d; }
  const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (m) {
    let [,dd,mm,yy] = m.map(Number);
    if (yy < 100) yy += 2000;
    mm = Math.max(1, Math.min(12, mm));
    const first = dayjs(`${yy}-${String(mm).padStart(2,'0')}-01`);
    const maxDay = first.daysInMonth();
    dd = Math.max(1, Math.min(maxDay, dd)); // 31/09 -> 30/09
    const d = dayjs(`${yy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`);
    if (d.isValid()) return d;
  }
  const formats = ['DD/MM/YYYY','D/M/YYYY','DD-MM-YYYY','D-M-YYYY','DD/MM/YY','D/M/YY','M/D/YYYY','MM/DD/YYYY','YYYY-MM-DD'];
  for (const f of formats) { const d = dayjs(s, f, true); if (d.isValid()) return d; }
  return null;
}
const fmtDaysLeft = v => (v===''||v==null||Number.isNaN(v)) ? '' : (v<0 ? `quá hạn ${Math.abs(v)} ngày` : `${v} ngày`);

// ===== STATE =====
let RAW = { MedData: [], DanhMucSearch: [] };
let VIEW = [];
let CHIP_BASE = new Map();
let CATALOG = [];        // {ten, alias, has:boolean}
let showMissingOnly = false;

// ===== LOAD =====
async function loadAll() {
  const [med, dm] = await Promise.all([ parseCSV(CSV_URLS.MedData), parseCSV(CSV_URLS.DanhMucSearch) ]);
  const today = dayjs().startOf('day');

  RAW.MedData = med.map(r => {
    const hsd = parseVNDate(r['HSD']);
    const ngayNhap = parseVNDate(r['NGÀY NHẬP'] || r['Ngày nhập'] || r['NGAY NHAP']);
    const soLuong = Number(String(r['SỐ LƯỢNG']||r['Số lượng']||r['SO LUONG']).replace(/[^\d.-]/g,'')) || 0;

    const daysLeftNum = hsd ? hsd.endOf('day').diff(today, 'day') : null;

    let trangThai;
    if (typeof daysLeftNum === 'number') {
      if (daysLeftNum < 0)       trangThai = 'Hết hạn';
      else if (daysLeftNum <=30) trangThai = 'Sắp hết hạn';
      else                       trangThai = 'Còn hạn';
    } else {
      trangThai = normalizeStatus((r['TRẠNG THÁI'] || r['TRANG THAI'] || '').trim()) || 'Còn hạn';
    }

    return {
      ten: r['TÊN THUỐC GỐC'] || r['TEN THUOC GOC'] || r['Tên thuốc gốc'] || '',
      alias: r['ALIAS'] || '',
      soLuong,
      hsd: hsd ? hsd.format('DD/MM/YYYY') : (r['HSD']||''),
      ngayNhap: ngayNhap ? ngayNhap.format('DD/MM/YYYY') : (r['NGÀY NHẬP'] || r['Ngày nhập'] || ''),
      trangThai,
      daysLeft: typeof daysLeftNum === 'number' ? daysLeftNum : ''
    };
  });

  RAW.DanhMucSearch = dm.map(r => ({
    ten: r['TÊN THUỐC GỐC'] || r['TEN THUOC GOC'] || r['Tên thuốc gốc'] || r['Ten'] || '',
    alias: r['ALIAS'] || r['Alias'] || ''
  }));

  buildCatalogAndCoverage();
  applyFilters();
  renderCatalog();
}

// ===== CATALOG + COVERAGE =====
function buildCatalogAndCoverage() {
  const setKho = new Set(RAW.MedData.map(x => nn(x.ten)).filter(Boolean));

  CATALOG = RAW.DanhMucSearch
    .filter(x => x.ten && x.ten.trim())
    .map(x => ({ ...x, has: setKho.has(nn(x.ten)) }));

  const total = CATALOG.length;
  const have  = CATALOG.filter(x => x.has).length;
  const coverage = total ? Math.round((have/total)*100) : 0;
  const badge = document.getElementById('coverageBadge');
  if (badge) badge.textContent = `Coverage: ${coverage}% (${have}/${total})`;
}

function renderCatalog() {
  const list = document.getElementById('catalogList');
  if (!list) return;

  const data = showMissingOnly ? CATALOG.filter(x => !x.has) : CATALOG;
  if (!data.length) {
    list.innerHTML = `<div class="text-sm text-slate-500 py-2">Không có mục nào.</div>`;
    return;
  }
  list.innerHTML = data.map(x => `
    <div class="px-3 py-1.5 rounded-lg border text-slate-800 ${x.has ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50'}" title="${x.ten}">
      ${x.ten}
    </div>
  `).join('');
}

// ===== FILTER + RENDER TABLE =====
function getActiveFilter() {
  const el = document.querySelector('.filter-chip.active');
  return el?.dataset.filter || 'all';
}
function applyFilters() {
  const q = nn(document.getElementById('searchInput')?.value || '');
  const mode = getActiveFilter();

  VIEW = RAW.MedData.filter(row => {
    const hay = `${nn(row.ten)} ${nn(row.alias)}`;
    if (q && !hay.includes(q)) return false;
    if (mode === 'ok'      && row.trangThai !== 'Còn hạn') return false;
    if (mode === 'soon'    && row.trangThai !== 'Sắp hết hạn') return false;
    if (mode === 'expired' && row.trangThai !== 'Hết hạn') return false;
    if (mode === 'low'     && !(Number(row.soLuong) <= 5)) return false;
    return true;
  });

  renderTable();
}
function renderTable() {
  const tbody = document.getElementById('tableBody');
  if (!tbody) return;

  if (!VIEW.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-slate-500">Không có dữ liệu</td></tr>`;
    return;
  }

  tbody.innerHTML = VIEW.map((r, i) => `
    <tr class="${i%2 ? 'bg-white' : 'bg-slate-50/40'} hover:bg-sky-50 transition-colors">
      <td class="py-2.5 px-3"><div class="max-w-[28ch] truncate" title="${r.ten||''}">${r.ten||''}</div></td>
      <td class="py-2.5 px-3"><div class="max-w-[24ch] truncate text-slate-600" title="${r.alias||''}">${r.alias||''}</div></td>
      <td class="py-2.5 px-3 text-right tabular-nums whitespace-nowrap">${r.soLuong}</td>
      <td class="py-2.5 px-3 whitespace-nowrap">${r.hsd||''}</td>
      <td class="py-2.5 px-3 whitespace-nowrap">${r.ngayNhap||''}</td>
      <td class="py-2.5 px-3 text-center whitespace-nowrap">${statusBadge(r.trangThai)}</td>
      <td class="py-2.5 px-3 text-right tabular-nums whitespace-nowrap">${fmtDaysLeft(r.daysLeft)}</td>
    </tr>
  `).join('');
}

// ===== CHIP COLOR =====
const CHIP_ACTIVE = {
  all:     'bg-sky-600 text-white border-sky-600',
  ok:      'bg-emerald-600 text-white border-emerald-600',
  soon:    'bg-amber-500 text-white border-amber-500',
  expired: 'bg-rose-600 text-white border-rose-600',
  low:     'bg-sky-600 text-white border-sky-600'
};
function setActiveChip(btn) {
  document.querySelectorAll('.filter-chip').forEach(b => {
    const base = CHIP_BASE.get(b) || b.className;
    CHIP_BASE.set(b, base.replace(/\s?active\b/, ''));
    b.className = CHIP_BASE.get(b);
  });
  const mode = btn.dataset.filter;
  btn.className = (CHIP_BASE.get(btn) || btn.className) + ' active ' + (CHIP_ACTIVE[mode] || CHIP_ACTIVE.all);
}

// ===== EVENTS =====
function initEvents() {
  document.querySelectorAll('.filter-chip').forEach(b => CHIP_BASE.set(b, b.className));
  document.querySelectorAll('.filter-chip').forEach(btn => btn.addEventListener('click', () => { setActiveChip(btn); applyFilters(); }));
  const def = document.querySelector('.filter-chip[data-filter="all"]'); if (def) setActiveChip(def);

  document.getElementById('searchInput')?.addEventListener('input', applyFilters);

  const btnToggle = document.getElementById('btnToggleMissing');
  if (btnToggle) {
    btnToggle.addEventListener('click', () => {
      showMissingOnly = !showMissingOnly;
      btnToggle.textContent = showMissingOnly ? 'Hiện tất cả' : 'Xem mục thiếu';
      renderCatalog();
    });
  }
}

initEvents();
loadAll();
