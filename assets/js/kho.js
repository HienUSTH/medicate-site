/***********************
 * KHO – Bảng + Danh mục + Local AI + ADD/SỬA/XOÁ + THÙNG RÁC + OVERRIDE + REMINDERS
 ***********************/

/* ===== CONFIG ===== */
const FILE_ID = '1ZsRkVHNq5XKV-0R6abUW3zlleBZqjXqjJzaDu90AneI';
const CSV_URLS = {
  MedData:       `https://docs.google.com/spreadsheets/d/${FILE_ID}/export?format=csv&gid=0`,
  DanhMucSearch: `https://docs.google.com/spreadsheets/d/${FILE_ID}/export?format=csv&gid=1041829227`
};

// ===== REMINDER API (Google Apps Script Web App) =====
// Thay URL này bằng URL Web App (đuôi /exec) của Apps Script Reminders
const REMINDER_API_URL = 'https://script.google.com/macros/s/AKfycbzEbdOvYWKrA3CC0K52u048UBJiGmrDrNtl_xKU234WNAqhDPgs-f7nrwFJ7VrCINSH/exec';
let CURRENT_REMINDER_KEY = null;

async function callReminderApi(mode, payload) {
  if (!REMINDER_API_URL || REMINDER_API_URL.includes('XXX')) {
    throw new Error('Bạn chưa cấu hình REMINDER_API_URL trong kho.js');
  }
  const params = new URLSearchParams({ mode, ...payload });
  const res = await fetch(REMINDER_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  return res.json();
}

// ===== LOCAL STORAGE KEYS =====
const LS_KHO_CUSTOM = 'MEDICATE_KHO_CUSTOM_V1';     // list custom thuốc
const LS_KHO_OVR    = 'MEDICATE_KHO_OVERRIDE_V1';   // map key -> {hidden, alias, soLuong, hsd, ngayNhap}
const LS_KHO_TRASH  = 'MEDICATE_KHO_TRASH_V1';      // list events (delete/edit)

/* ===== UTILS ===== */
function parseCSV(url){
  return fetch(url)
    .then(r => r.text())
    .then(t => Papa.parse(t, { header:true, skipEmptyLines:true }).data);
}

const nn = s => String(s ?? '')
  .toLowerCase()
  .normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/đ/g,'d')
  .replace(/[^\w\s]/g,' ').replace(/\s+/g,' ').trim();

function parseVNDate(raw){
  if (raw == null) return null;
  let s = String(raw).trim(); if (!s) return null;

  // Excel serial
  if (/^\d{3,5}$/.test(s)){
    const base = dayjs('1899-12-30');
    return base.add(parseInt(s,10),'day');
  }

  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}/.test(s)){
    const d=dayjs(s);
    if (d.isValid()) return d;
  }

  // dd/mm/yyyy
  const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (m){
    let [,dd,mm,yy] = m.map(Number);
    if (yy < 100) yy += 2000;
    mm = Math.max(1, Math.min(12, mm));
    const first = dayjs(`${yy}-${String(mm).padStart(2,'0')}-01`);
    dd = Math.max(1, Math.min(first.daysInMonth(), dd));
    const d = dayjs(`${yy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`);
    if (d.isValid()) return d;
  }

  const fs=['DD/MM/YYYY','D/M/YYYY','DD-MM-YYYY','D-M-YYYY','YYYY-MM-DD'];
  for (const f of fs){
    const d=dayjs(s,f,true);
    if(d.isValid()) return d;
  }
  return null;
}

const fmtDaysLeft = v => (v===''||v==null)
  ? ''
  : (v<=0 ? `quá hạn ${Math.abs(v)} ngày` : `${v} ngày`);

const fmtVN = (d) => {
  const x = parseVNDate(d);
  return x ? x.format('DD/MM/YYYY') : '';
};

const sum = a => a.reduce((s,x)=>s+(Number(x)||0),0);

function statusFromDaysLeft(d){
  if (d==null) return 'Còn hạn';
  if (d<=0) return 'Hết hạn';
  if (d<=30) return 'Sắp hết hạn';
  return 'Còn hạn';
}

function rowKeyOf(r){
  // Khóa ổn định cho override/trash (áp dụng cả sheet & custom)
  return `${nn(r.ten)}|${nn(r.alias)}|${fmtVN(r.hsd)}|${fmtVN(r.ngayNhap)}|${r._src||'unknown'}`;
}

function deepClone(o){ return JSON.parse(JSON.stringify(o)); }

function cryptoRandomId(){
  try{
    const c = (typeof self!=='undefined' && self.crypto) || (typeof window!=='undefined' && window.crypto) || null;
    if (c && c.getRandomValues){
      const a=new Uint8Array(16); c.getRandomValues(a);
      return Array.from(a).map(x=>x.toString(16).padStart(2,'0')).join('');
    }
  }catch{}
  return 'id-'+Math.random().toString(36).slice(2);
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

/* ===== STATE ===== */
let RAW = { MedData:[], DanhMucSearch:[] }; // sau khi merge override & custom
let SHEET_ROWS = [];   // bản gốc từ sheet (để tính key)
let VIEW = [];
let CATALOG = [];
let NAME_INDEX = [];
let showMissingOnly = false;
let CHIP_BASE = new Map();
let MAX_QTY = 0;

/* ===== STORAGE ===== */
function loadCustom(){
  try{ return JSON.parse(localStorage.getItem(LS_KHO_CUSTOM)||'[]'); }catch{ return []; }
}
function saveCustom(list){
  try{ localStorage.setItem(LS_KHO_CUSTOM, JSON.stringify(list||[])); }catch{}
}

function loadOvr(){
  try{ return JSON.parse(localStorage.getItem(LS_KHO_OVR)||'{}'); }catch{ return {}; }
}
function saveOvr(map){
  try{ localStorage.setItem(LS_KHO_OVR, JSON.stringify(map||{})); }catch{}
}

function loadTrash(){
  try{ return JSON.parse(localStorage.getItem(LS_KHO_TRASH)||'[]'); }catch{ return []; }
}
function saveTrash(list){
  try{ localStorage.setItem(LS_KHO_TRASH, JSON.stringify(list||[])); }catch{}
}

function pushTrash(evt){
  const list = loadTrash();
  list.unshift({ ts:new Date().toISOString(), ...evt });
  saveTrash(list);
}

/* ===== LOAD ALL (Sheets + localStorage) ===== */
async function loadAll() {
  try {
    const today = dayjs().startOf('day');

    // 1) Tải MedData (kho chính) – BẮT BUỘC PHẢI CÓ
    let med = [];
    try {
      med = await parseCSV(CSV_URLS.MedData);
    } catch (err) {
      console.error('Lỗi tải MedData:', err);
    }

    // Nếu không tải được MedData -> báo lỗi ra bảng, dừng hẳn
    if (!Array.isArray(med) || !med.length) {
      const tbody = document.getElementById('tableBody');
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" class="text-center py-6 text-slate-500">
              Không tải được dữ liệu kho từ Google Sheets.<br>
              Hãy kiểm tra lại <b>FILE_ID</b>, <b>gid</b> và quyền chia sẻ (Anyone with the link &quot;Viewer&quot;).
            </td>
          </tr>`;
      }
      return;
    }

    // 2) Tải DanhMucSearch – nếu lỗi thì chỉ mất phần Catalog, bảng kho vẫn chạy
    let dm = [];
    try {
      dm = await parseCSV(CSV_URLS.DanhMucSearch);
    } catch (err) {
      console.warn('Lỗi tải DanhMucSearch (Catalog):', err);
      dm = [];
    }

    // Parse sheet rows (base)
    SHEET_ROWS = med.map(r => {
      const hsd      = parseVNDate(r['HSD']);
      const ngayNhap = parseVNDate(r['NGÀY NHẬP'] || r['Ngày nhập'] || r['NGAY NHAP']);
      const soLuong  = Number(String(r['SỐ LƯỢNG'] || r['Số lượng'] || r['SO LUONG']).replace(/[^\d.-]/g, '')) || 0;

      return {
        ten:       r['TÊN THUỐC GỐC'] || r['TEN THUOC GOC'] || r['Tên thuốc gốc'] || '',
        alias:     r['ALIAS'] || '',
        soLuong,
        hsd:       hsd ? hsd.format('DD/MM/YYYY') : (r['HSD'] || ''),
        ngayNhap:  ngayNhap ? ngayNhap.format('DD/MM/YYYY') : (r['NGÀY NHẬP'] || r['Ngày nhập'] || ''),
        _src:      'sheet'
      };
    });

    // Apply overrides (ẩn / sửa cục bộ)
    const OVR = loadOvr(); // key -> patch/hidden
    const appliedSheet = [];
    for (const r of SHEET_ROWS) {
      const base  = deepClone(r);
      const key   = rowKeyOf(base);
      const patch = OVR[key];

      if (patch && patch.hidden) continue; // bị ẩn (xóa mềm)
      if (patch) {
        if (patch.alias    != null) base.alias    = patch.alias;
        if (patch.soLuong  != null) base.soLuong  = patch.soLuong;
        if (patch.hsd      != null) base.hsd      = fmtVN(patch.hsd)      || patch.hsd;
        if (patch.ngayNhap != null) base.ngayNhap = fmtVN(patch.ngayNhap) || patch.ngayNhap;
      }
      appliedSheet.push(base);
    }

    // Tính status/days cho sheet sau override
    const medRows = appliedSheet.map(r => {
      const hsd = parseVNDate(r.hsd);
      const d   = hsd ? hsd.startOf('day').diff(today, 'day') : null;
      return {
        ...r,
        daysLeft:  (d == null) ? '' : d,
        trangThai: statusFromDaysLeft(d)
      };
    });

    // Custom (thuốc manual do bạn thêm)
    const customRaw  = loadCustom();
    const customRows = customRaw.map(x => {
      const h = parseVNDate(x.hsd);
      const n = parseVNDate(x.ngayNhap);
      const d = h ? h.startOf('day').diff(today, 'day') : null;
      return {
        ten:       x.ten || '',
        alias:     x.alias || '',
        soLuong:   Number(x.soLuong) || 0,
        hsd:       h ? h.format('DD/MM/YYYY') : (x.hsd || ''),
        ngayNhap:  n ? n.format('DD/MM/YYYY') : (x.ngayNhap || ''),
        daysLeft:  (d == null) ? '' : d,
        trangThai: statusFromDaysLeft(d),
        _src:      'custom',
        _id:       x._id || null
      };
    });

    // Gán _id nếu thiếu
    for (const it of customRows) {
      if (!it._id) {
        it._id = cryptoRandomId();
      }
    }
    // Đồng bộ _id ngược về storage
    if (customRows.length) {
      const reSave = customRows.map(({ ten, alias, soLuong, hsd, ngayNhap, _id }) => ({
        ten,
        alias,
        soLuong,
        hsd,
        ngayNhap,
        _id
      }));
      saveCustom(reSave);
    }

    // Gộp sheet + custom
    RAW.MedData = [...medRows, ...customRows];

    // Setup slider SL
    MAX_QTY = RAW.MedData.reduce((m, x) => Math.max(m, Number(x.soLuong) || 0), 0);
    const slider = document.getElementById('qtySlider');
    const qtyVal = document.getElementById('qtyVal');
    if (slider && qtyVal) {
      slider.min   = 0;
      slider.max   = String(MAX_QTY || 0);
      slider.value = String(MAX_QTY || 0);
      qtyVal.textContent = slider.value;
    }

    // Danh mục tra cứu (Catalog) – nếu dm rỗng thì để []
    RAW.DanhMucSearch = Array.isArray(dm)
      ? dm.map(r => ({
          ten:   r['TÊN THUỐC GỐC'] || r['TEN THUOC GOC'] || r['Tên thuốc gốc'] || '',
          alias: r['ALIAS'] || ''
        }))
      : [];

    // Build UI
    buildCatalog();
    buildNameIndex();
    applyFilters();   // renderTable() được gọi trong đây
    renderCatalog();

    setupRandomOneChip();
    setupRandomPairChip();
  } catch (err) {
    console.error('loadAll() lỗi:', err);
    const tbody = document.getElementById('tableBody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center py-6 text-rose-600">
            Lỗi khi xử lý dữ liệu kho: ${escapeHtml(err.message || String(err))}
          </td>
        </tr>`;
    }
  }
}

/* ===== CATALOG ===== */
function buildCatalog(){
  const setKho = new Set(RAW.MedData.map(x=>nn(x.ten)).filter(Boolean));
  CATALOG = RAW.DanhMucSearch
    .filter(x=>x.ten)
    .map(x=>({...x,has:setKho.has(nn(x.ten))}));

  const total = CATALOG.length;
  const have  = CATALOG.filter(x=>x.has).length;
  const cov   = total ? Math.round(have/total*100) : 0;
  const badge = document.getElementById('coverageBadge');
  if (badge) badge.textContent=`Coverage: ${cov}% (${have}/${total})`;
}

function renderCatalog(){
  const list=document.getElementById('catalogList'); if(!list) return;
  const data=showMissingOnly?CATALOG.filter(x=>!x.has):CATALOG;
  list.innerHTML=data.map(x=>`<div class="px-3 py-1.5 rounded-lg border ${x.has?'bg-emerald-50 border-emerald-200':'bg-slate-50'}">${escapeHtml(x.ten)}</div>`).join('');
}

/* ===== NAME INDEX (AI) ===== */
const STOPWORDS = new Set([
  'thuoc','cac','nhung','va','hoac','trong','ngay','thang','nam','con','het','han','sap',
  'hsd','sl','so','luong','ton','kho','danh','sach','nao','nhap','ma','code','sp','la',
  'nhieu','it','duoi','tren','<=','>=','<','>','=','trong vong'
]);

function buildNameIndex(){
  const seen=new Map();

  for(const it of CATALOG){
    const canon=nn(it.ten); if(!canon) continue;
    const e=seen.get(canon)||{canon,display:it.ten,aliasSet:new Set(),has:it.has};
    if(it.alias){
      it.alias.split(/[\/,;]/).map(x=>x.trim()).filter(Boolean).forEach(a=>e.aliasSet.add(nn(a)));
    }
    seen.set(canon,e);
  }
  for(const r of RAW.MedData){
    const canon=nn(r.ten); if(!canon) continue;
    const e=seen.get(canon)||{canon,display:r.ten,aliasSet:new Set(),has:true};
    if(r.alias){
      r.alias.split(/[\/,;]/).map(x=>x.trim()).filter(Boolean).forEach(a=>e.aliasSet.add(nn(a)));
    }
    e.has=true;
    seen.set(canon,e);
  }
  NAME_INDEX = Array.from(seen.values());
}

function findNamesInQuery(raw,maxN=8){
  const s=nn(raw);
  const hits=[];
  for(const it of NAME_INDEX){
    const ok = s.includes(it.canon) || Array.from(it.aliasSet).some(a=>a && s.includes(a));
    if(ok) hits.push({canonical:it.display,canon:it.canon,has:it.has,score:0});
  }
  if(!hits.length){
    if(/\bvitamin\b/.test(s) && !/\bvitamin\s*(c|b6)\b/.test(s)){
      NAME_INDEX.filter(x=>x.canon.startsWith('vitamin ')).forEach(it=>hits.push({canonical:it.display,canon:it.canon,has:it.has,score:0}));
    }
    const tokens=s.split(' ').filter(t=>t.length>=5 && !STOPWORDS.has(t));
    const seenTok=new Set();
    for(const tok of tokens){
      if(seenTok.has(tok)) continue; seenTok.add(tok);
      for(const it of NAME_INDEX){
        const d=Math.min(
          lev(tok,it.canon),
          ...Array.from(it.aliasSet).map(a=>lev(tok,a))
        );
        if(d<=2) hits.push({canonical:it.display,canon:it.canon,has:it.has,score:100-d});
      }
    }
  }
  const seenC=new Set(), out=[];
  for(const h of hits){
    if(!seenC.has(h.canon)){
      seenC.add(h.canon);
      out.push(h);
      if(out.length>=maxN) break;
    }
  }
  return out;
}

function lev(a,b){
  const m=a.length,n=b.length; if(!m)return n; if(!n)return m;
  const d=new Array(n+1); for(let j=0;j<=n;j++) d[j]=j;
  for(let i=1;i<=m;i++){
    let p=d[0]; d[0]=i;
    for(let j=1;j<=n;j++){
      const t=d[j];
      d[j]=Math.min(d[j]+1,d[j-1]+1,p+(a[i-1]===b[j-1]?0:1));
      p=t;
    }
  }
  return d[n];
}

/* ===== STATUS BADGE ===== */
function statusBadge(st){
  const map = {
    'Hết hạn':'bg-rose-100 text-rose-700 border-rose-200',
    'Sắp hết hạn':'bg-amber-100 text-amber-800 border-amber-200',
    'Còn hạn':'bg-emerald-100 text-emerald-700 border-emerald-200'
  };
  const dot = st==='Hết hạn'
    ? 'bg-rose-500'
    : st==='Sắp hết hạn'
      ? 'bg-amber-500'
      : 'bg-emerald-500';
  return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${map[st]||'bg-slate-100'}">
    <span class="inline-block w-1.5 h-1.5 rounded-full ${dot}"></span>${st}</span>`;
}

/* ===== FILTER & TABLE RENDER ===== */
function getActiveFilter(){
  const el=document.querySelector('.filter-chip.active');
  return el?.dataset.filter || 'all';
}

function applyFilters(){
  const q=nn(document.getElementById('searchInput')?.value||'');
  const mode=getActiveFilter();
  const slider=document.getElementById('qtySlider');
  const thr=slider?Number(slider.value):Infinity;

  VIEW = RAW.MedData.filter(row=>{
    const hay=`${nn(row.ten)} ${nn(row.alias)}`;
    if(q && !hay.includes(q)) return false;
    if(mode==='ok'      && row.trangThai!=='Còn hạn')      return false;
    if(mode==='soon'    && row.trangThai!=='Sắp hết hạn')  return false;
    if(mode==='expired' && row.trangThai!=='Hết hạn')      return false;
    if(Number(row.soLuong)>thr) return false;
    return true;
  });
  renderTable();
}

function renderTable(){
  const tbody = document.getElementById('tableBody');
  if (!tbody) return;

  if (!VIEW.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-6 text-slate-500">
          Không có dữ liệu
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = VIEW.map((r,i)=>{
    const key = rowKeyOf(r);
    const isManual = r._src === 'custom';
    const badge = statusBadge(r.trangThai || '');
    return `
    <tr class="${i%2 ? 'bg-white' : 'bg-slate-50/40'} hover:bg-sky-50">
      <td class="py-2.5 px-3">
        ${escapeHtml(r.ten || '')}
        ${isManual
          ? `<span class="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full ml-1">manual</span>`
          : ''}
      </td>
      <td class="py-2.5 px-3 bg-sky-50/50">
        <div class="truncate max-w-[28ch] text-slate-700" title="${escapeHtml(r.alias || '')}">
          ${escapeHtml(r.alias || '')}
        </div>
      </td>
      <td class="py-2.5 px-3 text-right bg-slate-50 mono">${r.soLuong}</td>
      <td class="py-2.5 px-3 whitespace-nowrap bg-indigo-50/40 mono">${escapeHtml(r.hsd || '')}</td>
      <td class="py-2.5 px-3 whitespace-nowrap bg-indigo-50/20 mono">${escapeHtml(r.ngayNhap || '')}</td>
      <td class="py-2.5 px-3 text-center whitespace-nowrap">${badge}</td>
      <td class="py-2.5 px-3 text-right whitespace-nowrap bg-slate-50/60 mono">
        ${fmtDaysLeft(r.daysLeft)}
        <div class="mt-1 flex justify-end gap-1">
          <button class="btn text-xs px-2 py-1 rounded border border-sky-300 text-sky-700 hover:bg-sky-50"
                  data-action="reminder" data-key="${encodeURIComponent(key)}">
            Nhắc
          </button>
          <button class="btn text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50"
                  data-action="edit" data-key="${encodeURIComponent(key)}">
            Sửa
          </button>
          <button class="btn text-xs px-2 py-1 rounded border border-rose-300 text-rose-700 hover:bg-rose-50"
                  data-action="del"  data-key="${encodeURIComponent(key)}">
            Xoá
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');

  // wire buttons
  tbody.querySelectorAll('button[data-action="edit"]').forEach(b=>b.addEventListener('click', onEditRow));
  tbody.querySelectorAll('button[data-action="del"]').forEach(b=>b.addEventListener('click', onDeleteRow));
  tbody.querySelectorAll('button[data-action="reminder"]').forEach(b=>b.addEventListener('click', onReminderClick));
}

/* ===== EDIT / DELETE / BULK ===== */
/* ===== EDIT / DELETE / BULK ===== */
let CURRENT_EDIT_KEY = null;
let CURRENT_EDIT_ROW = null;

function findRowByKey(key){
  return RAW.MedData.find(r=>rowKeyOf(r)===key);
}

function findOriginalSheetRowByKey(key){
  return SHEET_ROWS.find(r => rowKeyOf(r) === key) || null;
}

function onEditRow(e){
  const key = decodeURIComponent(e.currentTarget.dataset.key);
  const r = findRowByKey(key);
  if (!r) {
    alert('Không tìm thấy bản ghi.');
    return;
  }
  openEditModal(r, key);
}

function openEditModal(row, key){
  CURRENT_EDIT_KEY = key;
  CURRENT_EDIT_ROW = row;

  const modal = document.getElementById('editModal');
  if (!modal) {
    alert('Không tìm thấy khung sửa thuốc (editModal).');
    return;
  }

  const nameEl      = document.getElementById('editDrugName');
  const aliasEl     = document.getElementById('editAlias');
  const slEl        = document.getElementById('editSL');
  const hsdEl       = document.getElementById('editHSD');
  const ngayNhapEl  = document.getElementById('editNgayNhap');
  const statusEl    = document.getElementById('editStatus');

  if (nameEl)     nameEl.value     = row.ten || row.alias || '';
  if (aliasEl)    aliasEl.value    = row.alias || '';
  if (slEl)       slEl.value       = row.soLuong != null ? String(row.soLuong) : '';
  if (hsdEl)      hsdEl.value      = row.hsd || '';
  if (ngayNhapEl) ngayNhapEl.value = row.ngayNhap || '';
  if (statusEl) {
    statusEl.textContent = '';
    statusEl.className = 'text-xs text-slate-500';
  }

  modal.classList.remove('hidden');
}

function closeEditModal(){
  const modal = document.getElementById('editModal');
  if (modal) modal.classList.add('hidden');
  CURRENT_EDIT_KEY = null;
  CURRENT_EDIT_ROW = null;
}

function applyPatchToRow(row, key, patch){
  if (!patch || Object.keys(patch).length === 0) return;

  if (row._src === 'custom') {
    const list = loadCustom();
    const idx = list.findIndex(x =>
      (row._id && x._id === row._id) ||
      (nn(x.ten) === nn(row.ten) && nn(x.alias) === nn(row.alias) &&
       fmtVN(x.hsd) === fmtVN(row.hsd) && fmtVN(x.ngayNhap) === fmtVN(row.ngayNhap))
    );
    if (idx >= 0) {
      const before  = { ...list[idx] };
      const updated = { ...list[idx] };
      if (patch.alias    != null) updated.alias    = patch.alias;
      if (patch.soLuong  != null) updated.soLuong  = patch.soLuong;
      if (patch.hsd      != null) updated.hsd      = patch.hsd;
      if (patch.ngayNhap != null) updated.ngayNhap = patch.ngayNhap;
      list[idx] = updated;
      saveCustom(list);
      pushTrash({ type:'custom', action:'edit', before, after:updated });
    }
  } else {
    const ovr     = loadOvr();
    const cur     = ovr[key] || {};
    const before  = findOriginalSheetRowByKey(key);
    const updated = { ...cur, ...patch };
    ovr[key] = updated;
    saveOvr(ovr);
    pushTrash({ type:'sheet', action:'edit', key, before, after:updated });
  }
}

function saveEditFromModal(){
  const statusEl = document.getElementById('editStatus');

  if (!CURRENT_EDIT_ROW || !CURRENT_EDIT_KEY) {
    if (statusEl) {
      statusEl.textContent = 'Không xác định được thuốc để sửa.';
      statusEl.className = 'text-xs text-rose-600';
    }
    return;
  }

  const aliasEl     = document.getElementById('editAlias');
  const slEl        = document.getElementById('editSL');
  const hsdEl       = document.getElementById('editHSD');
  const ngayNhapEl  = document.getElementById('editNgayNhap');

  const aliasStr    = aliasEl ? aliasEl.value : '';
  const slStr       = slEl ? slEl.value : '';
  const hsdStr      = hsdEl ? hsdEl.value : '';
  const ngayNhapStr = ngayNhapEl ? ngayNhapEl.value : '';

  const patch = {};

  if (aliasStr.trim() !== '' && aliasStr.trim() !== (CURRENT_EDIT_ROW.alias || '')) {
    patch.alias = aliasStr.trim();
  }

  if (slStr.trim() !== '') {
    const n = Number(slStr.replace(/[^\d.-]/g, ''));
    if (!Number.isNaN(n)) {
      patch.soLuong = n;
    }
  }

  if (hsdStr.trim() !== '' && hsdStr.trim() !== (CURRENT_EDIT_ROW.hsd || '')) {
    patch.hsd = hsdStr.trim();
  }

  if (ngayNhapStr.trim() !== '' && ngayNhapStr.trim() !== (CURRENT_EDIT_ROW.ngayNhap || '')) {
    patch.ngayNhap = ngayNhapStr.trim();
  }

  if (!Object.keys(patch).length) {
    if (statusEl) {
      statusEl.textContent = 'Không có thay đổi nào để lưu.';
      statusEl.className = 'text-xs text-slate-500';
    }
    return;
  }

  applyPatchToRow(CURRENT_EDIT_ROW, CURRENT_EDIT_KEY, patch);

  if (statusEl) {
    statusEl.textContent = 'Đã lưu thay đổi.';
    statusEl.className = 'text-xs text-emerald-600';
  }

  closeEditModal();
  loadAll();
}


function onDeleteRow(e){
  const key=decodeURIComponent(e.currentTarget.dataset.key);
  const r=findRowByKey(key); if(!r) return alert('Không tìm thấy bản ghi.');
  if(!confirm(`Xoá bản ghi này?\n${r.ten} (${r.alias||'không alias'})`)) return;

  if(r._src==='custom'){
    // remove from custom list
    const list=loadCustom();
    const idx=list.findIndex(x=>
      (x._id && r._id && x._id===r._id) ||
      (nn(x.ten)===nn(r.ten) && nn(x.alias)===nn(r.alias) &&
       fmtVN(x.hsd)===fmtVN(r.hsd) && fmtVN(x.ngayNhap)===fmtVN(r.ngayNhap))
    );
    if(idx>=0){
      const removed=list.splice(idx,1)[0];
      saveCustom(list);
      pushTrash({ type:'custom', action:'delete', before:removed });
    }
  }else{
    // sheet: override hidden=true
    const ovr=loadOvr();
    const cur=ovr[key]||{};
    if(cur.hidden!==true){
      const before=findOriginalSheetRowByKey(key);
      ovr[key]={...cur, hidden:true};
      saveOvr(ovr);
      pushTrash({ type:'sheet', action:'delete', key, before });
    }
  }
  loadAll();
}

// Xoá tất cả bản ghi đang lọc
function onBulkDelete(){
  if (!VIEW.length){
    alert('Không có bản ghi nào trong bộ lọc hiện tại.');
    return;
  }
  if (!confirm(`Xoá tất cả ${VIEW.length} bản ghi đang hiển thị (ẩn khỏi kho)?`)) return;

  const ovr = loadOvr();
  let changedOvr = false;

  const customList = loadCustom();
  let changedCustom = false;

  for (const r of VIEW){
    if (r._src === 'custom'){
      const idx = customList.findIndex(x =>
        (r._id && x._id === r._id) ||
        (nn(x.ten)===nn(r.ten) && nn(x.alias)===nn(r.alias) &&
         fmtVN(x.hsd)===fmtVN(r.hsd) && fmtVN(x.ngayNhap)===fmtVN(r.ngayNhap))
      );
      if (idx >= 0){
        const removed = customList.splice(idx,1)[0];
        pushTrash({ type:'custom', action:'delete', before: removed });
        changedCustom = true;
      }
    } else {
      const key = rowKeyOf(r);
      const cur = ovr[key] || {};
      if (!cur.hidden){
        const before = findOriginalSheetRowByKey(key);
        ovr[key] = { ...cur, hidden:true };
        pushTrash({ type:'sheet', action:'delete', key, before });
        changedOvr = true;
      }
    }
  }

  if (changedOvr)    saveOvr(ovr);
  if (changedCustom) saveCustom(customList);

  loadAll();
}

/* ===== REMINDER MODAL (Nhắc uống thuốc) ===== */
function onReminderClick(e){
  const key = decodeURIComponent(e.currentTarget.dataset.key || '');
  const row = findRowByKey(key);
  if (!row) {
    alert('Không tìm thấy bản ghi thuốc.');
    return;
  }
  openReminderModal(row, key);
}

// thêm một input giờ uống trong ngày vào modal
function addReminderTimeRow(initialValue){
  const container = document.getElementById('remTimesContainer');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'flex items-center gap-2 rem-time-row';

  const input = document.createElement('input');
  input.type = 'time';
  input.className = 'rem-time-input flex-1 px-3 py-2 rounded-lg border border-slate-300';
  if (initialValue) input.value = initialValue;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn px-2 py-1 rounded-full border border-slate-300 text-xs hover:bg-slate-50';
  btn.textContent = 'X';
  btn.addEventListener('click', () => row.remove());

  row.appendChild(input);
  row.appendChild(btn);
  container.appendChild(row);
}

function openReminderModal(row, key){
  CURRENT_REMINDER_KEY = key;

  const modal         = document.getElementById('reminderModal');
  const drugName      = document.getElementById('remDrugName');
  const doseText      = document.getElementById('remDoseText');
  const emailInp      = document.getElementById('remEmail');
  const repSel        = document.getElementById('remRepeatType');
  const statusEl      = document.getElementById('remStatus');
  const timeContainer = document.getElementById('remTimesContainer');
  const existingList  = document.getElementById('remExistingList');

  if (!modal) return;

  if (drugName) drugName.value = row.ten || row.alias || '';
  if (doseText) doseText.value = '';
  if (emailInp && !emailInp.value) emailInp.value = 'hiennhm.23bi14156@usth.edu.vn';
  if (repSel) repSel.value = 'daily';
  if (statusEl) {
    statusEl.textContent = '';
    statusEl.className = 'text-xs text-slate-500';
  }
  if (existingList) existingList.innerHTML = '';
  if (timeContainer) {
    timeContainer.innerHTML = '';
    // tạm thời có 1 dòng trống; sẽ được ghi đè nếu có giờ cũ
    addReminderTimeRow('');
  }

  modal.classList.remove('hidden');

  // tải danh sách nhắc (để hiển thị & prefill giờ)
  loadRemindersForDrug(key);
  prefillReminderTimesForDrug(key);
}

function closeReminderModal(){
  const modal = document.getElementById('reminderModal');
  if (modal) modal.classList.add('hidden');
  CURRENT_REMINDER_KEY = null;
}

// load danh sách các giờ đã được hẹn cho một thuốc (theo DrugKey)
async function loadRemindersForDrug(key){
  const listEl = document.getElementById('remExistingList');
  if (!listEl) return;
  try {
    listEl.textContent = 'Đang tải danh sách nhắc...';

    const json = await callReminderApi('list-reminders', {
      key,
      onlyActive: 'true'
    });

    if (!json.ok) {
      listEl.textContent = json.error || 'Không tải được danh sách nhắc.';
      return;
    }

    const items = json.items || [];
    if (!items.length) {
      listEl.textContent = 'Chưa có giờ nào đang được nhắc cho thuốc này.';
      return;
    }

    listEl.innerHTML = items.map(it => {
      const t   = it.timeOfDay || '';
      const rep = it.repeatType === 'daily' ? 'Hàng ngày' : 'Một lần';
      const next = it.nextDue
        ? ` - lần tới: ${it.nextDue.substring(11,16)} ${it.nextDue.substring(0,10)}`
        : '';
      const dose = it.doseText
        ? `<div class="text-[11px] text-slate-600">${escapeHtml(it.doseText)}</div>`
        : '';
      return `
        <div class="flex items-center justify-between gap-2 text-xs border rounded-lg px-2 py-1 bg-slate-50">
          <div>
            <div><span class="font-semibold">${t}</span> • ${rep}${next}</div>
            ${dose}
          </div>
          <button type="button"
                  class="btn px-2 py-1 rounded border border-rose-300 text-rose-700 hover:bg-rose-50 text-[11px]"
                  data-rem-id="${it.id}">
            Hủy
          </button>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('button[data-rem-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-rem-id') || '';
        if (!id) return;
        if (!confirm('Hủy nhắc giờ này?')) return;
        try {
          await callReminderApi('cancel-reminder', { id });
          await loadRemindersForDrug(key);
          await loadGlobalReminders();
        } catch (err) {
          alert('Không hủy được nhắc: ' + (err.message || err));
        }
      });
    });
  } catch (err) {
    console.error(err);
    listEl.textContent = 'Lỗi khi tải danh sách nhắc.';
  }
}

// Prefill các input giờ trong modal theo các nhắc hiện có (nếu muốn sửa)
async function prefillReminderTimesForDrug(key){
  const container = document.getElementById('remTimesContainer');
  if (!container) return;

  try {
    const json = await callReminderApi('list-reminders', {
      key,
      onlyActive: 'true'
    });
    if (!json.ok) return;
    const items = (json.items || []).slice().sort((a,b) =>
      (a.timeOfDay || '').localeCompare(b.timeOfDay || '')
    );
    if (!items.length) return;

    container.innerHTML = '';
    items.forEach(it => addReminderTimeRow(it.timeOfDay || ''));
  } catch (err) {
    console.error('prefillReminderTimesForDrug error', err);
  }
}

// lưu nhiều giờ nhắc từ modal
// lưu nhiều giờ nhắc từ modal (ghi đè toàn bộ giờ cũ của thuốc)
async function saveReminderFromModal(){
  const statusEl = document.getElementById('remStatus');
  if (!CURRENT_REMINDER_KEY) {
    if (statusEl) {
      statusEl.textContent = 'Không xác định được thuốc để nhắc.';
      statusEl.className = 'text-xs text-rose-600';
    }
    return;
  }

  const key        = CURRENT_REMINDER_KEY;
  const drugName   = (document.getElementById('remDrugName')?.value || '').trim();
  const doseText   = (document.getElementById('remDoseText')?.value || '').trim();
  const email      = (document.getElementById('remEmail')?.value || '').trim();
  const repeatType = (document.getElementById('remRepeatType')?.value || 'daily').trim();

  const timeInputs = Array.from(document.querySelectorAll('.rem-time-input'));
  const times = timeInputs.map(inp => (inp.value || '').trim()).filter(Boolean);

  if (!times.length) {
    if (statusEl) {
      statusEl.textContent = 'Bạn chưa nhập giờ uống nào.';
      statusEl.className = 'text-xs text-rose-600';
    }
    return;
  }

  try {
    if (statusEl) {
      statusEl.textContent = 'Đang cập nhật các giờ nhắc...';
      statusEl.className = 'text-xs text-slate-500';
    }

    // 1) Xoá toàn bộ nhắc cũ của thuốc này (ghi đè)
    try {
      const cur = await callReminderApi('list-reminders', {
        key,
        onlyActive: 'true'
      });
      if (cur && cur.ok && Array.isArray(cur.items)) {
        const ids = cur.items.map(it => it.id).filter(Boolean);
        if (ids.length) {
          await Promise.all(ids.map(id => callReminderApi('cancel-reminder', { id })));
        }
      }
    } catch (err2) {
      console.warn('Không xoá được nhắc cũ, vẫn tiếp tục lưu nhắc mới', err2);
    }

    // 2) Tạo lại toàn bộ giờ mới
    const promises = times.map(timeOfDay =>
      callReminderApi('save-reminder', {
        key,
        drugName,
        doseText,
        timeOfDay,
        repeatType,
        email
      })
    );

    const results = await Promise.all(promises);
    const failed = results.find(r => !r || !r.ok);
    if (failed) {
      throw new Error(failed.error || 'Một số giờ nhắc không lưu được.');
    }

    if (statusEl) {
      statusEl.textContent = 'Đã lưu các giờ nhắc.';
      statusEl.className = 'text-xs text-emerald-600';
    }

    await loadRemindersForDrug(key);
    await loadGlobalReminders();
  } catch (err) {
    console.error(err);
    if (statusEl) {
      statusEl.textContent = 'Lỗi khi lưu nhắc: ' + (err.message || err);
      statusEl.className = 'text-xs text-rose-600';
    }
  }
}

// box tổng hợp các thuốc đang được nhắc (bên phải)
// box tổng hợp các thuốc đang được nhắc (bên phải)
async function loadGlobalReminders(){
  const listEl = document.getElementById('globalRemindersList');
  if (!listEl) return;

  // helper: chuẩn hoá hiển thị giờ
  const fmtTime = (raw) => {
    if (!raw) return '';
    const s = String(raw);
    // đã là HH:mm thì dùng luôn
    if (/^\d{1,2}:\d{2}$/.test(s)) return s.padStart(5, '0');
    // nếu là ISO 1899... thì parse
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    }
    return s;
  };

  try {
    listEl.textContent = 'Đang tải...';

    const json = await callReminderApi('list-reminders', {
      onlyActive: 'true'
    });

    if (!json.ok) {
      listEl.textContent = json.error || 'Không tải được danh sách.';
      return;
    }

    const items = json.items || [];
    if (!items.length) {
      listEl.textContent = 'Chưa có thuốc nào được nhắc.';
      return;
    }

    // Nhóm theo tên thuốc
    const groups = {};
    items.forEach(it => {
      const name = it.drugName || '(chưa đặt tên)';
      if (!groups[name]) groups[name] = [];
      groups[name].push(it);
    });

    listEl.innerHTML = Object.keys(groups).map(name => {
      const arr = groups[name].slice().sort((a,b) =>
        (a.timeOfDay || '').localeCompare(b.timeOfDay || '')
      );
      const timesStr = arr.map(it => fmtTime(it.timeOfDay || '')).join(', ');
      const key = arr[0]?.drugKey || '';

      return `
        <button type="button"
                class="w-full text-left border rounded-lg px-2 py-1 bg-slate-50 mb-1 hover:bg-sky-50"
                data-rem-key="${escapeHtml(key)}"
                data-rem-name="${escapeHtml(name)}">
          <div class="text-[13px] font-semibold">${escapeHtml(name)}</div>
          <div class="text-[11px] text-slate-600">Giờ: ${escapeHtml(timesStr)}</div>
          <div class="text-[10px] text-sky-700 mt-0.5">Bấm để sửa/thêm giờ nhắc</div>
        </button>
      `;
    }).join('');

    // click vào box -> mở modal nhắc cho thuốc đó
    listEl.querySelectorAll('button[data-rem-key]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key  = btn.getAttribute('data-rem-key')  || '';
        const name = btn.getAttribute('data-rem-name') || '';
        if (!key) return;
        // fake row chỉ cần tên cho hiển thị
        const fakeRow = { ten: name };
        openReminderModal(fakeRow, key);
      });
    });
  } catch (err) {
    console.error(err);
    listEl.textContent = 'Lỗi khi tải danh sách nhắc.';
  }
}

/* ===== TRASH MODAL ===== */
function openTrash(){
  const modal=document.getElementById('trashModal');
  const body=document.getElementById('trashBody');
  if(!modal||!body) return;
  const list=loadTrash();

  if(!list.length){
    body.innerHTML=`<tr><td colspan="5" class="px-3 py-3 text-slate-500">Thùng rác trống</td></tr>`;
  }else{
    body.innerHTML=list.map((ev,idx)=>{
      const when=new Date(ev.ts).toLocaleString();
      const type=ev.type==='custom'?'Manual':'Sheets';
      const act=ev.action==='delete'?'Xoá': (ev.action==='edit'?'Sửa':'—');
      const name = (ev.before?.ten || ev.after?.ten || ev.key || '');
      const alias = (ev.before?.alias || ev.after?.alias || '');
      return `<tr class="${idx%2?'bg-white':'bg-slate-50/50'}">
        <td class="px-3 py-2 whitespace-nowrap">${when}</td>
        <td class="px-3 py-2">${type}</td>
        <td class="px-3 py-2">${escapeHtml(name)} <span class="text-slate-500">/ ${escapeHtml(alias)}</span></td>
        <td class="px-3 py-2">${act}</td>
        <td class="px-3 py-2 text-right">
          ${ev.action==='delete'?`<button class="btn text-xs px-2 py-1 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50" data-tr-restore="${idx}">Khôi phục</button>`:''}
          <button class="btn text-xs px-2 py-1 rounded border border-rose-300 text-rose-700 hover:bg-rose-50" data-tr-purge="${idx}">Xoá vĩnh viễn</button>
        </td>
      </tr>`;
    }).join('');
  }

  // wire
  body.querySelectorAll('[data-tr-restore]').forEach(b=>b.addEventListener('click', (e)=>{
    const idx=Number(e.currentTarget.dataset.trRestore);
    restoreTrash(idx);
  }));
  body.querySelectorAll('[data-tr-purge]').forEach(b=>b.addEventListener('click', (e)=>{
    const idx=Number(e.currentTarget.dataset.trPurge);
    purgeTrash(idx);
  }));

  modal.classList.remove('hidden');
}
function closeTrash(){
  document.getElementById('trashModal')?.classList.add('hidden');
}
function restoreTrash(index){
  const list=loadTrash(); const ev=list[index]; if(!ev) return;
  if(ev.type==='custom'){
    if(ev.action==='delete' && ev.before){
      const cur=loadCustom(); cur.push(ev.before); saveCustom(cur);
    }
  }else if(ev.type==='sheet'){
    if(ev.action==='delete'){
      const ovr=loadOvr();
      if(ovr[ev.key]){
        delete ovr[ev.key].hidden;
        if(Object.keys(ovr[ev.key]).length===0) delete ovr[ev.key];
        saveOvr(ovr);
      }
    }
  }
  // remove event
  list.splice(index,1); saveTrash(list);
  openTrash(); // rerender
  loadAll();
}
function purgeTrash(index){
  const list=loadTrash(); list.splice(index,1); saveTrash(list);
  openTrash();
}
function emptyTrash(){
  if(!confirm('Xoá vĩnh viễn toàn bộ thùng rác?')) return;
  saveTrash([]); openTrash();
}

/* ===== LOCAL AI (Kho) ===== */
function parseFlexibleDays(s){
  const n=nn(s);
  let m=n.match(/\b(\d+(?:[.,]\d+)?)\s*(ngay|day|d)\b/); if(m) return Math.round(Number(m[1].replace(',','.')));
  m=n.match(/\b(\d+(?:[.,]\d+)?)\s*(tuan|week|w)\b/);    if(m) return Math.round(Number(m[1].replace(',','.'))*7);
  m=n.match(/\b(\d+(?:[.,]\d+)?)\s*(thang|month|m)\b/);  if(m) return Math.round(Number(m[1].replace(',','.'))*30);
  m=n.match(/\b(\d+(?:[.,]\d+)?)\s*(nam|year|y|yr|yrs)\b/); if(m) return Math.round(Number(m[1].replace(',','.'))*365);
  return null;
}
function parseDaysCompare(s){
  const n=nn(s);
  if (/(<=|≤|\btrong\b|\bduoi\b|\bnho hon\b|\bit hon\b|\btoi da\b|\bkhoang\b|\bkhoảng\b)/.test(n)) return '<=';
  if (/(>=|≥|\btren\b|\blon hon\b|\bhon\b|\bnhi(ieu|ều)\s*hon\b|\btoi thieu\b)/.test(n)) return '>=';
  if (/<\s*\d/.test(s)) return '<';
  if (/>\s*\d/.test(s)) return '>';
  return '<=';
}
function parseDaysIntent(s0){
  let s=' '+nn(s0)+' ';
  s=s.replace(/\bden han\b/g,'het han').replace(/\bden hsd\b/g,'het han').replace(/\bqh\b/g,'qua han');
  const days=parseFlexibleDays(s);
  const cmp=parseDaysCompare(s);
  if (/\bqua han\b/.test(s)) return days!=null?{mode:'overdue',cmp,days}:{need:true,hint:'quá hạn'};
  if (/\b(het han|hsd|sap het han)\b/.test(s) && days!=null) return {mode:'to_expiry',cmp,days};
  if (/\bsap het han\b/.test(s) && days==null) return {mode:'to_expiry',cmp:'<=',days:30};
  if (/\bcon han\b/.test(s) && days!=null) return {mode:'to_expiry',cmp,days};
  return null;
}
function parseQtyIntent(s){
  const n=nn(s);
  const m1=n.match(/\bsl\s*(<=|>=|<|>|=)?\s*(\d+)\b/); if(m1) return {cmp:(m1[1]||'<='),value:Number(m1[2])};
  const m2=n.match(/\b(duoi|nho hon|it hon|toi da)\s*(\d+)\b/); if(m2) return {cmp:'<=',value:Number(m2[2])};
  const m3=n.match(/\b(tren|lon hon|hon|toi thieu)\s*(\d+)\b/);  if(m3) return {cmp:'>=',value:Number(m3[2])};
  return null;
}
function parseFieldSelect(s){
  const n=nn(s); const f=[];
  if (/\balias\b/.test(n)) f.push('alias');
  if (/\b(sl|so luong|ton)\b/.test(n)) f.push('sl');
  if (/\b(hsd|han|han su dung|expiry)\b/.test(n)) f.push('hsd');
  if (/\b(ngay nhap|nhap)\b/.test(n)) f.push('ngay');
  if (/\b(trang thai|status|tt)\b/.test(n)) f.push('trangthai');
  if (/\b(con (ngay)|days left|con bao nhieu ngay|bao nhieu ngay)\b/.test(n)) f.push('daysleft');
  return f;
}
function parseSortIntent(s){
  const n=nn(s); let key=null, dir=null;
  if (/\b(hsd|han|expiry)\b/.test(n)) key='hsd';
  else if (/\b(sl|so luong|ton)\b/.test(n)) key='sl';
  else if (/\b(ten|name)\b/.test(n)) key='name';
  if (/\b(giam dan|desc|muon nhat|lon nhat|muon)\b/.test(n)) dir='desc';
  else if (/\b(tang dan|asc|som nhat|nho nhat|som)\b/.test(n)) dir='asc';
  if (/\b(sap xep|theo thu tu|order|sort)\b/.test(n) || key || dir) return {key:key||'name', dir:dir||'asc'};
  return null;
}
function cmp(x,op,y){
  if(op==='<=')return x<=y;
  if(op==='<') return x<y;
  if(op==='>=')return x>=y;
  if(op==='>') return x>y;
  if(op==='=') return x===y;
  return true;
}

function filterRowsByCriteria(c){
  const today=dayjs().startOf('day');
  return RAW.MedData.filter(r=>{
    if (c.names?.length){
      const ok=c.names.some(n=>nn(r.ten).includes(n)||nn(r.alias).includes(n));
      if(!ok) return false;
    }
    if (c.days){
      if(!r.hsd) return false;
      const d=parseVNDate(r.hsd)?.startOf('day').diff(today,'day'); if(d==null) return false;
      if (c.days.mode==='to_expiry'){
        if(d<=0) return false;
        if(!cmp(d,c.days.cmp,c.days.days)) return false;
      }
      if (c.days.mode==='overdue'){
        if(d>0) return false;
        const over=Math.abs(d);
        if(!cmp(over,c.days.cmp,c.days.days)) return false;
      }
    }
    if (c.state){
      if (c.state==='expired' && r.trangThai!=='Hết hạn') return false;
      if (c.state==='soon'    && r.trangThai!=='Sắp hết hạn') return false;
      if (c.state==='ok'      && r.trangThai!=='Còn hạn') return false;
    }
    if (c.qty && !cmp(Number(r.soLuong)||0,c.qty.cmp,c.qty.value)) return false;
    return true;
  });
}

function renderFieldsTable(rows, fields){
  const heads=['TÊN THUỐC', ...fields.map(k=>{
    if(k==='alias') return 'ALIAS';
    if(k==='sl') return 'SỐ LƯỢNG';
    if(k==='hsd') return 'HSD';
    if(k==='ngay') return 'NGÀY NHẬP';
    if(k==='trangthai') return 'TRẠNG THÁI';
    if(k==='daysleft') return 'CÒN (ngày)';
    return k.toUpperCase();
  })];
  const body=rows.map(r=>{
    return [r.ten, ...fields.map(k=>{
      if(k==='alias') return r.alias||'';
      if(k==='sl') return String(r.soLuong);
      if(k==='hsd') return r.hsd||'';
      if(k==='ngay') return r.ngayNhap||'';
      if(k==='trangthai') return r.trangThai||'';
      if(k==='daysleft') return r.daysLeft===''?'':String(r.daysLeft);
      return '';
    })];
  });
  return { headers:heads, rows:body };
}

function localAnswer(qRaw){
  const q=String(qRaw||'').trim(); if(!q) return { ok:true, type:'text', content:'Bạn hãy nhập câu hỏi nhé.' };
  const nameHits=findNamesInQuery(q,16);
  let namesCanon=nameHits.map(h=>h.canon);

  const s=nn(q);
  const daysIntent=parseDaysIntent(q);
  const qtyIntent=parseQtyIntent(q);
  const fieldsWant=parseFieldSelect(q);
  const sortWant=parseSortIntent(q);

  let state=null;
  if (/\bqua han\b/.test(s)) state='expired';
  else if (/\bsap het han\b/.test(s)) state='soon';
  else if (/\bcon han\b/.test(s)) state='ok';
  const listy=/\b(cac|danh sach|liet ke|thuoc nao)\b/.test(s);
  const useDays=(daysIntent && daysIntent.need && !listy)? null : daysIntent;
  if (daysIntent && daysIntent.need && !listy){
    return { ok:true, type:'text', content:`Bạn đang hỏi về "${daysIntent.hint}" nhưng chưa nêu mốc ngày. Ví dụ: "hết HSD trong 14 ngày", "quá hạn ≥ 7 ngày".` };
  }

  if (namesCanon.length && /\b(con bao nhieu|bao nhieu|co trong kho)\b/.test(s)){
    const rows=filterRowsByCriteria({ names:namesCanon });
    if(!rows.length) return { ok:true, type:'text', content:`${nameHits.map(h=>h.canonical).join(', ')} — chưa có trong kho.` };
    const byName=new Map();
    for(const r of rows){
      const v=byName.get(r.ten)||{ten:r.ten,sl:0,earliest:null};
      v.sl+=(Number(r.soLuong)||0);
      const h=parseVNDate(r.hsd); if(h && (!v.earliest||h.isBefore(v.earliest))) v.earliest=h;
      byName.set(r.ten,v);
    }
    const lines=Array.from(byName.values()).map(v=>`${v.ten}: SL ${v.sl}${v.earliest?`, HSD sớm nhất ${v.earliest.format('DD/MM/YYYY')}`:''}`);
    return { ok:true, type:'text', content: lines.join('\n') };
  }

  const criteria={ names:namesCanon, days:useDays||null, qty:qtyIntent||null, state };
  let rows=filterRowsByCriteria(criteria);

  if(!rows.length){
    if(namesCanon.length){
      const inStockCanon=new Set(RAW.MedData.map(r=>nn(r.ten)));
      const missing=nameHits.filter(x=>!inStockCanon.has(x.canon)).map(x=>x.canonical);
      if(missing.length) return { ok:true, type:'text', content:`Không tìm thấy lô phù hợp. ${missing.join(', ')} — hiện chưa có trong kho.` };
    }
    const bits=[];
    if (criteria.state==='expired') bits.push('Hết hạn');
    if (criteria.state==='soon')    bits.push('Sắp hết hạn');
    if (criteria.state==='ok')      bits.push('Còn hạn');
    if (criteria.days){
      bits.push(criteria.days.mode==='to_expiry'
        ? `Tới HSD ≤ ${criteria.days.days} ngày`
        : `Quá HSD ≤ ${criteria.days.days} ngày`);
    }
    if (criteria.qty){
      bits.push(`SL ${criteria.qty.cmp} ${criteria.qty.value}`);
    }
    return { ok:true, type:'text', content:`Không có kết quả phù hợp${bits.length?' — '+bits.join(' — '):''}.` };
  }

  if(sortWant){
    if(sortWant.key==='hsd'){
      const today=dayjs().startOf('day');
      rows.sort((a,b)=>{
        const da=parseVNDate(a.hsd)?.startOf('day').diff(today,'day') ?? 1e9;
        const db=parseVNDate(b.hsd)?.startOf('day').diff(today,'day') ?? 1e9;
        return sortWant.dir==='asc'
          ? (da-db || a.ten.localeCompare(b.ten))
          : (db-da || a.ten.localeCompare(b.ten));
      });
    }else if(sortWant.key==='sl'){
      rows.sort((a,b)=> sortWant.dir==='asc'
        ? ((Number(a.soLuong)||0)-(Number(b.soLuong)||0))
        : ((Number(b.soLuong)||0)-(Number(a.soLuong)||0)));
    }else{
      rows.sort((a,b)=> sortWant.dir==='asc'
        ? a.ten.localeCompare(b.ten)
        : b.ten.localeCompare(a.ten));
    }
  }else{
    const askHSD = !!criteria.days || !!criteria.state || /\b(hsd|han|het han|sap het han|qua han)\b/.test(s);
    if(askHSD){
      const today=dayjs().startOf('day');
      rows.sort((a,b)=>{
        const da=parseVNDate(a.hsd)?.startOf('day').diff(today,'day') ?? 1e9;
        const db=parseVNDate(b.hsd)?.startOf('day').diff(today,'day') ?? 1e9;
        return da-db || String(a.ten).localeCompare(String(b.ten));
      });
    }else{
      rows.sort((a,b)=>String(a.ten).localeCompare(b.ten) || String(a.hsd).localeCompare(b.hsd));
    }
  }

  if (fieldsWant.length){
    const table=renderFieldsTable(rows, fieldsWant);
    const ttl=`${nameHits.map(h=>h.canonical).join(' + ') || 'Kết quả'} — ${rows.length} lô`;
    return { ok:true, type:'table', title:ttl, headers:table.headers, rows:table.rows };
  }

  const wantSummary = /\b(tong|tong hop|gom|gop|aggregate|sum)\b/.test(s) || /: *sl *,? *hsd/i.test(q);
  if (wantSummary){
    const byName=new Map();
    for(const r of rows){
      const v=byName.get(r.ten)||{ten:r.ten,tongSL:0,earliest:null,latest:null,alias:new Set()};
      v.tongSL+=(Number(r.soLuong)||0);
      const h=parseVNDate(r.hsd); if(h && (!v.earliest||h.isBefore(v.earliest))) v.earliest=h;
      const n=parseVNDate(r.ngayNhap); if(n && (!v.latest||n.isAfter(v.latest))) v.latest=n;
      if(r.alias) v.alias.add(r.alias);
      byName.set(r.ten,v);
    }
    const headers=['TÊN THUỐC','ALIAS','SỐ LƯỢNG (tổng)','HSD (sớm nhất)','NGÀY NHẬP (gần nhất)'];
    const out=Array.from(byName.values())
      .sort((a,b)=>a.ten.localeCompare(b.ten))
      .map(v=>[
        v.ten,
        Array.from(v.alias).slice(0,1).join(', '),
        String(v.tongSL),
        v.earliest? v.earliest.format('DD/MM/YYYY'):'',
        v.latest?   v.latest.format('DD/MM/YYYY'):''
      ]);
    const ttl=`${nameHits.map(h=>h.canonical).join(' + ') || 'Tổng hợp'} — ${out.length} tên, tổng SL ${sum(out.map(r=>Number(r[2])||0))}`;
    return { ok:true, type:'table', title:ttl, headers, rows:out };
  }

  const headers=['TÊN THUỐC','ALIAS','SỐ LƯỢNG','HSD','NGÀY NHẬP','TRẠNG THÁI','CÒN (ngày)'];
  const out=rows.map(r=>[
    r.ten,
    r.alias,
    String(r.soLuong),
    r.hsd,
    r.ngayNhap,
    r.trangThai,
    (r.daysLeft===''?'':String(r.daysLeft))
  ]);
  const ttl=`${nameHits.map(h=>h.canonical).join(' + ') || 'Kết quả'} — ${rows.length} lô / ${new Set(rows.map(r=>r.ten)).size} tên, tổng SL ${sum(rows.map(r=>Number(r.soLuong)||0))}`;
  return { ok:true, type:'table', title:ttl, headers, rows:out };
}

/* ===== CHAT UI (kho – hiện tại chỉ dùng nội bộ, HTML chưa bật) ===== */
const chatList = () => document.getElementById('chatList');
const chatInput = () => document.getElementById('chatInput');

function pushUser(text){
  const list = chatList(); if (!list) return;
  list.insertAdjacentHTML('beforeend',
    `<div class="flex justify-end"><div class="chat-bubble chat-user">${escapeHtml(text)}</div></div>`);
  list.scrollTop = list.scrollHeight;
}
function pushLoading(){
  const list = chatList(); if (!list) return '';
  const id='ld-'+Date.now();
  list.insertAdjacentHTML('beforeend',
    `<div id="${id}" class="flex"><div class="chat-bubble chat-bot">Đang xử lý…</div></div>`);
  list.scrollTop = list.scrollHeight;
  return id;
}
function replaceLoading(id, html){
  const el=document.getElementById(id); if(!el) return;
  el.outerHTML=`<div class="flex"><div class="chat-bubble chat-bot w-full">${html}</div></div>`;
}
function renderAns(ans){
  if(ans.type==='text')
    return `<div class="whitespace-pre-wrap leading-relaxed">${escapeHtml(ans.content||'')}</div>`;
  if(ans.type==='table'){
    const thead=(ans.headers||[]).map(h=>`<th class="px-2 py-1.5 text-left border-b bg-slate-50">${escapeHtml(h)}</th>`).join('');
    const rows=(ans.rows||[]).map((r,i)=>
      `<tr class="${i%2?'bg-white':'bg-slate-50/40'}">${
        r.map((c,idx)=>`<td class="px-2 py-1.5 ${idx===2||idx===6?'text-right mono':''}">
          ${escapeHtml(String(c??''))}
        </td>`).join('')
      }</tr>`).join('');
    return `<div class="font-medium mb-2">${escapeHtml(ans.title||'Kết quả')}</div>
            <div class="overflow-auto max-h-[40vh] rounded-lg border">
              <table class="w-full text-[13px]">
                <thead><tr>${thead}</tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>`;
  }
  return `<div>${escapeHtml(JSON.stringify(ans))}</div>`;
}
function sendKhoQuery(text){
  const inp = chatInput();
  const q=(text ?? (inp?.value || '')).trim();
  if(!q) return;
  pushUser(q);
  if (inp) inp.value='';

  const id=pushLoading();
  const ans=localAnswer(q);
  replaceLoading(id, renderAns(ans));
}

/* ===== RANDOM CHIPS (cho chat, HTML hiện đang tắt) ===== */
function setupRandomOneChip(){
  const btn=document.getElementById('chipRandOne'); if(!btn) return;
  const pool=Array.from(new Set(RAW.MedData.map(r=>r.ten).filter(Boolean)));
  if(!pool.length){
    btn.textContent='Tên ngẫu nhiên: (trống)';
    btn.dataset.q='';
    btn.disabled=true;
    return;
  }
  const name=pool[Math.floor(Math.random()*pool.length)];
  btn.textContent=`${name}: SL, HSD`;
  btn.dataset.q=`${name}: SL, HSD`;
}
function setupRandomPairChip(){
  const btn=document.getElementById('chipRandPair'); if(!btn||!CATALOG.length) return;
  const pool=CATALOG.map(x=>x.ten).filter(Boolean);
  const a=pool[Math.floor(Math.random()*pool.length)];
  let b=a; while(b===a) b=pool[Math.floor(Math.random()*pool.length)];
  btn.textContent=`${a} + ${b}`; btn.dataset.q=`${a}, ${b}: SL, HSD; tổng`;
}

/* ===== FORM ADD DRUG (manual) ===== */
function wireAddForm(){
  const form      = document.getElementById('formAddDrug');
  const tenInp    = document.getElementById('addTen');
  const aliasInp  = document.getElementById('addAlias');
  const slInp     = document.getElementById('addSL');
  const hsdInp    = document.getElementById('addHSD');
  const ngayInp   = document.getElementById('addNgayNhap');
  const msg       = document.getElementById('addMsg');
  const btnClear  = document.getElementById('btnClearAdd');

  if (!form) return;

  form.addEventListener('submit', e => {
    e.preventDefault();
    const ten = (tenInp?.value || '').trim();
    if (!ten){
      if (msg){
        msg.textContent = 'Tên thuốc là bắt buộc.';
        msg.className   = 'text-xs text-rose-600';
      }
      return;
    }
    const alias    = (aliasInp?.value || '').trim();
    const slStr    = (slInp?.value || '').trim();
    const sl       = Number(slStr.replace(/[^\d.-]/g,'')) || 0;
    const hsd      = (hsdInp?.value || '').trim();
    const ngayNhap = (ngayInp?.value || '').trim();

    const list = loadCustom();
    const item = {
      ten,
      alias,
      soLuong: sl,
      hsd,
      ngayNhap,
      _id: cryptoRandomId()
    };
    list.push(item);
    saveCustom(list);

    if (msg){
      msg.textContent = 'Đã thêm thuốc manual.';
      msg.className   = 'text-xs text-emerald-600';
    }
    form.reset();
    loadAll();
  });

  if (btnClear){
    btnClear.addEventListener('click', () => {
      form.reset();
      if (msg){
        msg.textContent = '';
        msg.className   = 'text-xs text-slate-600';
      }
    });
  }
}

/* ===== EVENTS ===== */
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
  // Filter chips (Tất cả / Còn hạn / Sắp hết hạn / Hết hạn)
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

  // Ô search
  document.getElementById('searchInput')
    ?.addEventListener('input', applyFilters);

  // Slider SL
  const slider = document.getElementById('qtySlider');
  const qtyVal = document.getElementById('qtyVal');
  if (slider && qtyVal) {
    slider.addEventListener('input', () => {
      qtyVal.textContent = slider.value;
      applyFilters();
    });
  }

  // Nút "Xem mục thiếu" của danh mục thuốc
  const btnToggle = document.getElementById('btnToggleMissing');
  if (btnToggle) {
    btnToggle.addEventListener('click', () => {
      showMissingOnly = !showMissingOnly;
      btnToggle.textContent = showMissingOnly ? 'Hiện tất cả' : 'Xem mục thiếu';
      renderCatalog();
    });
    btnToggle.textContent = 'Xem mục thiếu';
  }

  // Bulk delete + Thùng rác
  document.getElementById('btnBulkDelete')
    ?.addEventListener('click', onBulkDelete);
  document.getElementById('btnOpenTrash')
    ?.addEventListener('click', openTrash);
  document.getElementById('btnCloseTrash')
    ?.addEventListener('click', closeTrash);
  document.getElementById('btnEmptyTrash')
    ?.addEventListener('click', emptyTrash);
  // Modal SỬA THUỐC
  document.getElementById('btnCloseEdit')
    ?.addEventListener('click', (e) => {
      e.preventDefault();
      closeEditModal();
    });
  document.getElementById('btnSaveEdit')
    ?.addEventListener('click', (e) => {
      e.preventDefault();
      saveEditFromModal();
    });

  // Modal NHẮC UỐNG THUỐC
  document.getElementById('btnCloseReminder')
    ?.addEventListener('click', (e) => {
      e.preventDefault();
      closeReminderModal();
    });
  document.getElementById('btnSaveReminder')
    ?.addEventListener('click', (e) => {
      e.preventDefault();
      saveReminderFromModal();
    });
  document.getElementById('btnAddRemTime')
    ?.addEventListener('click', (e) => {
      e.preventDefault();
      addReminderTimeRow('');
    });

  // Box “Thuốc đang được nhắc” bên phải
  document.getElementById('btnReloadGlobalReminders')
    ?.addEventListener('click', (e) => {
      e.preventDefault();
      loadGlobalReminders();
    });

  // Chat kho (HTML hiện đang không có chat, nên các id này có thể null)
  document.getElementById('btnSend')
    ?.addEventListener('click', () => sendKhoQuery());
  chatInput()
    ?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendKhoQuery();
      }
    });
  document.querySelectorAll('.chip-q').forEach(b => {
    b.addEventListener('click', () => {
      sendKhoQuery(b.dataset.q || b.textContent || '');
    });
  });

  // Form thêm thuốc manual
  wireAddForm();

  // Tải box tổng hợp các thuốc đang được nhắc
  loadGlobalReminders();
}

/* ===== BOOT ===== */
document.addEventListener('DOMContentLoaded', () => {
  try {
    initEvents();
    loadAll();          // gọi load dữ liệu từ Google Sheets
  } catch (err) {
    console.error('Kho – boot error:', err);
  }

  // Tab “Tra cứu thuốc” ở pane phải (file thuoc.js)
  if (typeof window.wireTabsForThuoc === 'function') {
    window.wireTabsForThuoc();
  }
});
