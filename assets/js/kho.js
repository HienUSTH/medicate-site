/***********************
 * KHO – Bảng + Danh mục + Local AI + ADD/SỬA/XOÁ + THÙNG RÁC + OVERRIDE
 ***********************/

/* ===== CONFIG ===== */
const FILE_ID = '1ZsRkVHNq5XKV-0R6abUW3zlleBZqjXqjJzaDu90AneI';
const CSV_URLS = {
  MedData:       `https://docs.google.com/spreadsheets/d/${FILE_ID}/export?format=csv&gid=0`,
  DanhMucSearch: `https://docs.google.com/spreadsheets/d/${FILE_ID}/export?format=csv&gid=1041829227`
};
const LS_KHO_CUSTOM = 'MEDICATE_KHO_CUSTOM_V1';
const LS_KHO_OVR    = 'MEDICATE_KHO_OVERRIDE_V1'; // map key -> {hidden, alias, soLuong, hsd, ngayNhap}
const LS_KHO_TRASH  = 'MEDICATE_KHO_TRASH_V1';    // list events

/* ===== UTILS ===== */
function parseCSV(url){ return fetch(url).then(r=>r.text()).then(t=>Papa.parse(t,{header:true,skipEmptyLines:true}).data); }
const nn = s => String(s ?? '').toLowerCase()
  .normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/đ/g,'d')
  .replace(/[^\w\s]/g,' ').replace(/\s+/g,' ').trim();

function parseVNDate(raw){
  if (raw == null) return null;
  let s = String(raw).trim(); if (!s) return null;
  if (/^\d{3,5}$/.test(s)){ const base=dayjs('1899-12-30'); return base.add(parseInt(s,10),'day'); }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)){ const d=dayjs(s); if(d.isValid()) return d; }
  const m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (m){ let[,dd,mm,yy]=m.map(Number); if(yy<100) yy+=2000; mm=Math.max(1,Math.min(12,mm));
    const first=dayjs(`${yy}-${String(mm).padStart(2,'0')}-01`);
    dd=Math.max(1,Math.min(first.daysInMonth(),dd));
    const d=dayjs(`${yy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`); if(d.isValid()) return d;
  }
  const fs=['DD/MM/YYYY','D/M/YYYY','DD-MM-YYYY','D-M-YYYY','YYYY-MM-DD'];
  for (const f of fs){ const d=dayjs(s,f,true); if(d.isValid()) return d; }
  return null;
}
const fmtDaysLeft=v=>(v===''||v==null)?'':(v<=0?`quá hạn ${Math.abs(v)} ngày`:`${v} ngày`);
const fmtVN=(d)=>{ const x=parseVNDate(d); return x?x.format('DD/MM/YYYY'):''; };
const sum=a=>a.reduce((s,x)=>s+(Number(x)||0),0);
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

/* ===== STATE ===== */
let RAW={ MedData:[], DanhMucSearch:[] }; // sau khi merge override & custom
let SHEET_ROWS=[];   // bản gốc từ sheet (để tính key)
let VIEW=[];
let CATALOG=[];
let NAME_INDEX=[];   // <-- chỉ khai báo 1 lần ở đây
let showMissingOnly=false;
let CHIP_BASE=new Map();
let MAX_QTY=0;

/* ===== STORAGE ===== */
function loadCustom(){ try{ return JSON.parse(localStorage.getItem(LS_KHO_CUSTOM)||'[]'); }catch{ return []; } }
function saveCustom(list){ try{ localStorage.setItem(LS_KHO_CUSTOM, JSON.stringify(list||[])); }catch{} }

function loadOvr(){ try{ return JSON.parse(localStorage.getItem(LS_KHO_OVR)||'{}'); }catch{ return {}; } }
function saveOvr(map){ try{ localStorage.setItem(LS_KHO_OVR, JSON.stringify(map||{})); }catch{} }

function loadTrash(){ try{ return JSON.parse(localStorage.getItem(LS_KHO_TRASH)||'[]'); }catch{ return []; } }
function saveTrash(list){ try{ localStorage.setItem(LS_KHO_TRASH, JSON.stringify(list||[])); }catch{} }

function pushTrash(evt){
  const list=loadTrash();
  list.unshift({ ts:new Date().toISOString(), ...evt });
  saveTrash(list);
}

/* ===== LOAD ===== */
async function loadAll(){
  const [med,dm]=await Promise.all([parseCSV(CSV_URLS.MedData),parseCSV(CSV_URLS.DanhMucSearch)]);
  const today=dayjs().startOf('day');

  // Parse sheet rows (base)
  SHEET_ROWS = med.map(r=>{
    const hsd=parseVNDate(r['HSD']);
    const ngayNhap=parseVNDate(r['NGÀY NHẬP']||r['Ngày nhập']||r['NGAY NHAP']);
    const soLuong=Number(String(r['SỐ LƯỢNG']||r['Số lượng']||r['SO LUONG']).replace(/[^\d.-]/g,''))||0;
    return {
      ten:r['TÊN THUỐC GỐC']||r['TEN THUOC GOC']||r['Tên thuốc gốc']||'',
      alias:r['ALIAS']||'',
      soLuong,
      hsd:hsd?hsd.format('DD/MM/YYYY'):(r['HSD']||''),
      ngayNhap:ngayNhap?ngayNhap.format('DD/MM/YYYY'):(r['NGÀY NHẬP']||r['Ngày nhập']||''),
      _src:'sheet'
    };
  });

  // Apply overrides
  const OVR = loadOvr(); // key -> patch/hidden
  const appliedSheet = [];
  for (const r of SHEET_ROWS){
    const base = deepClone(r);
    const key = rowKeyOf(base);
    const patch = OVR[key];
    if (patch && patch.hidden) continue; // bị ẩn (xóa mềm)
    if (patch){
      if (patch.alias!=null)    base.alias = patch.alias;
      if (patch.soLuong!=null)  base.soLuong = patch.soLuong;
      if (patch.hsd!=null)      base.hsd = fmtVN(patch.hsd)||patch.hsd;
      if (patch.ngayNhap!=null) base.ngayNhap = fmtVN(patch.ngayNhap)||patch.ngayNhap;
    }
    appliedSheet.push(base);
  }

  // Tính status/days cho sheet sau override
  const medRows = appliedSheet.map(r=>{
    const hsd=parseVNDate(r.hsd);
    const d = hsd? hsd.startOf('day').diff(today,'day') : null;
    return { ...r, daysLeft:(d==null)?'':d, trangThai:statusFromDaysLeft(d) };
  });

  // Custom
  const customRaw = loadCustom();
  const customRows = customRaw.map(x=>{
    const h = parseVNDate(x.hsd); const n = parseVNDate(x.ngayNhap);
    const d = h ? h.startOf('day').diff(today,'day') : null;
    return {
      ten: x.ten||'',
      alias: x.alias||'',
      soLuong: Number(x.soLuong)||0,
      hsd: h? h.format('DD/MM/YYYY') : (x.hsd||''),
      ngayNhap: n? n.format('DD/MM/YYYY') : (x.ngayNhap||''),
      daysLeft: (d==null)?'':d,
      trangThai: statusFromDaysLeft(d),
      _src:'custom',
      _id: x._id || null
    };
  });

  // Gán _id nếu thiếu
  for (const it of customRows){
    if (!it._id){ it._id = cryptoRandomId(); }
  }
  // đồng bộ _id ngược về storage
  if (customRows.length){
    const reSave = customRows.map(({ten,alias,soLuong,hsd,ngayNhap,_id})=>({ten,alias,soLuong,hsd,ngayNhap,_id}));
    saveCustom(reSave);
  }

  RAW.MedData=[...medRows, ...customRows];

  MAX_QTY=RAW.MedData.reduce((m,x)=>Math.max(m,Number(x.soLuong)||0),0);
  const slider=document.getElementById('qtySlider'), qtyVal=document.getElementById('qtyVal');
  if(slider&&qtyVal){ slider.min=0; slider.max=String(MAX_QTY||0); slider.value=String(MAX_QTY||0); qtyVal.textContent=slider.value; }

  RAW.DanhMucSearch=dm.map(r=>({ten:r['TÊN THUỐC GỐC']||r['TEN THUOC GOC']||r['Tên thuốc gốc']||'', alias:r['ALIAS']||''}));

  buildCatalog(); buildNameIndex(); applyFilters(); renderCatalog();

  setupRandomOneChip(); setupRandomPairChip();
}

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

/* ===== CATALOG ===== */
function buildCatalog(){
  const setKho=new Set(RAW.MedData.map(x=>nn(x.ten)).filter(Boolean));
  CATALOG=RAW.DanhMucSearch.filter(x=>x.ten).map(x=>({...x,has:setKho.has(nn(x.ten))}));
  const total=CATALOG.length, have=CATALOG.filter(x=>x.has).length;
  const cov=total?Math.round(have/total*100):0;
  const badge=document.getElementById('coverageBadge'); if(badge) badge.textContent=`Coverage: ${cov}% (${have}/${total})`;
}
function renderCatalog(){
  const list=document.getElementById('catalogList'); if(!list) return;
  const data=showMissingOnly?CATALOG.filter(x=>!x.has):CATALOG;
  list.innerHTML=data.map(x=>`<div class="px-3 py-1.5 rounded-lg border ${x.has?'bg-emerald-50 border-emerald-200':'bg-slate-50'}">${x.ten}</div>`).join('');
}

/* ===== NAME INDEX (AI) ===== */
const STOPWORDS=new Set(['thuoc','cac','nhung','va','hoac','trong','ngay','thang','nam','con','het','han','sap','hsd','sl','so','luong','ton','kho','danh','sach','nao','nhap','ma','code','sp','la','nhieu','it','duoi','tren','<=','>=','<','>','=','trong vong']);
function buildNameIndex(){
  const seen=new Map();
  for(const it of CATALOG){
    const canon=nn(it.ten); if(!canon) continue;
    const e=seen.get(canon)||{canon,display:it.ten,aliasSet:new Set(),has:it.has};
    if(it.alias) it.alias.split(/[\/,;]/).map(x=>x.trim()).filter(Boolean).forEach(a=>e.aliasSet.add(nn(a)));
    seen.set(canon,e);
  }
  for(const r of RAW.MedData){
    const canon=nn(r.ten); if(!canon) continue;
    const e=seen.get(canon)||{canon,display:r.ten,aliasSet:new Set(),has:true};
    if(r.alias) r.alias.split(/[\/,;]/).map(x=>x.trim()).filter(Boolean).forEach(a=>e.aliasSet.add(nn(a)));
    e.has=true; seen.set(canon,e);
  }
  NAME_INDEX=Array.from(seen.values());
}
function findNamesInQuery(raw,maxN=8){
  const s=nn(raw);
  const hits=[];
  for(const it of NAME_INDEX){
    const ok=s.includes(it.canon) || Array.from(it.aliasSet).some(a=>a && s.includes(a));
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
        const d=Math.min(lev(tok,it.canon),...Array.from(it.aliasSet).map(a=>lev(tok,a)));
        if(d<=2) hits.push({canonical:it.display,canon:it.canon,has:it.has,score:100-d});
      }
    }
  }
  const seenC=new Set(), out=[];
  for(const h of hits){ if(!seenC.has(h.canon)){ seenC.add(h.canon); out.push(h); if(out.length>=maxN) break; } }
  return out;
}
function lev(a,b){ const m=a.length,n=b.length; if(!m)return n; if(!n)return m;
  const d=new Array(n+1); for(let j=0;j<=n;j++) d[j]=j;
  for(let i=1;i<=m;i++){ let p=d[0]; d[0]=i; for(let j=1;j<=n;j++){ const t=d[j];
    d[j]=Math.min(d[j]+1,d[j-1]+1,p+(a[i-1]===b[j-1]?0:1)); p=t; } }
  return d[n];
}

/* ===== STATUS BADGE ===== */
function statusBadge(st){
  const map={'Hết hạn':'bg-rose-100 text-rose-700 border-rose-200','Sắp hết hạn':'bg-amber-100 text-amber-800 border-amber-200','Còn hạn':'bg-emerald-100 text-emerald-700 border-emerald-200'};
  const dot=st==='Hết hạn'?'bg-rose-500':st==='Sắp hết hạn'?'bg-amber-500':'bg-emerald-500';
  return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${map[st]||'bg-slate-100'}"><span class="inline-block w-1.5 h-1.5 rounded-full ${dot}"></span>${st}</span>`;
}

/* ===== FILTER & TABLE RENDER ===== */
function getActiveFilter(){ const el=document.querySelector('.filter-chip.active'); return el?.dataset.filter||'all'; }
function applyFilters(){
  const q=nn(document.getElementById('searchInput')?.value||'');
  const mode=getActiveFilter();
  const slider=document.getElementById('qtySlider'); const thr=slider?Number(slider.value):Infinity;

  VIEW=RAW.MedData.filter(row=>{
    const hay=`${nn(row.ten)} ${nn(row.alias)}`;
    if(q && !hay.includes(q)) return false;
    if(mode==='ok'&&row.trangThai!=='Còn hạn') return false;
    if(mode==='soon'&&row.trangThai!=='Sắp hết hạn') return false;
    if(mode==='expired'&&row.trangThai!=='Hết hạn') return false;
    if(Number(row.soLuong)>thr) return false;
    return true;
  });
  renderTable();
}
function renderTable(){
  const tbody=document.getElementById('tableBody'); if(!tbody) return;
  if(!VIEW.length){ tbody.innerHTML=`<tr><td colspan="7" class="text-center py-6 text-slate-500">Không có dữ liệu</td></tr>`; return; }
  tbody.innerHTML=VIEW.map((r,i)=>{
    const key=rowKeyOf(r);
    const isManual=r._src==='custom';
    return `
    <tr class="${i%2?'bg-white':'bg-slate-50/40'} hover:bg-sky-50">
      <td class="py-2.5 px-3">
        ${r.ten}
        ${isManual?` <span class="text-[11px] text-emerald-700 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded-full ml-1">manual</span>`:''}
      </td>
      <td class="py-2.5 px-3 bg-sky-50/50"><div class="truncate max-w-[28ch] text-slate-700" title="${r.alias}">${r.alias}</div></td>
      <td class="py-2.5 px-3 text-right bg-slate-50">${r.soLuong}</td>
      <td class="py-2.5 px-3 whitespace-nowrap bg-indigo-50/40">${r.hsd}</td>
      <td class="py-2.5 px-3 whitespace-nowrap bg-indigo-50/20">${r.ngayNhap}</td>
      <td class="py-2.5 px-3 text-center whitespace-nowrap">${statusBadge(r.trangThai)}</td>
      <td class="py-2.5 px-3 text-right whitespace-nowrap bg-slate-50/60 mono">
        ${fmtDaysLeft(r.daysLeft)}
        <div class="mt-1 flex justify-end gap-1">
          <button class="btn text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-100" data-action="edit" data-key="${encodeURIComponent(key)}">Sửa</button>
          <button class="btn text-xs px-2 py-1 rounded border border-rose-300 text-rose-700 hover:bg-rose-50" data-action="del"  data-key="${encodeURIComponent(key)}">Xoá</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  // wire buttons
  tbody.querySelectorAll('button[data-action="edit"]').forEach(b=>b.addEventListener('click',onEditRow));
  tbody.querySelectorAll('button[data-action="del"]').forEach(b=>b.addEventListener('click',onDeleteRow));
}

/* ===== EDIT / DELETE / BULK ===== */
function findRowByKey(key){
  return RAW.MedData.find(r=>rowKeyOf(r)===key);
}

function onEditRow(e){
  const key=decodeURIComponent(e.currentTarget.dataset.key);
  const r=findRowByKey(key); if(!r) return alert('Không tìm thấy bản ghi.');
  openEditModal(r, key);
}

function onDeleteRow(e){
  const key=decodeURIComponent(e.currentTarget.dataset.key);
  const r=findRowByKey(key); if(!r) return alert('Không tìm thấy bản ghi.');
  if(!confirm(`Xoá bản ghi này?\n${r.ten} (${r.alias||'không alias'})`)) return;

  if(r._src==='custom'){
    // remove from custom list
    const list=loadCustom();
    const idx=list.findIndex(x=>(x._id && r._id && x._id===r._id) || (nn(x.ten)===nn(r.ten) && nn(x.alias)===nn(r.alias) && fmtVN(x.hsd)===fmtVN(r.hsd) && fmtVN(x.ngayNhap)===fmtVN(r.ngayNhap)));
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

function onBulkDelete(){
  if(!VIEW.length) return alert('Không có bản ghi trong bộ lọc hiện tại.');
  if(!confirm(`Xoá ${VIEW.length} bản ghi đang hiển thị?`)) return;
  const ovr=loadOvr();

  // xoá custom trong VIEW
  const customList=loadCustom();
  const survivors = customList.filter(x=>{
    return !VIEW.some(r=>{
      if(r._src!=='custom') return false;
      return (x._id && r._id && x._id===r._id) || (nn(x.ten)===nn(r.ten) && nn(x.alias)===nn(r.alias) && fmtVN(x.hsd)===fmtVN(r.hsd) && fmtVN(x.ngayNhap)===fmtVN(r.ngayNhap));
    });
  });
  // ghi vào thùng rác các custom bị xoá
  customList.forEach(x=>{
    const removed = VIEW.find(r=>{
      if(r._src!=='custom') return false;
      return (x._id && r._id && x._id===r._id) || (nn(x.ten)===nn(r.ten) && nn(x.alias)===nn(r.alias) && fmtVN(x.hsd)===fmtVN(r.hsd) && fmtVN(x.ngayNhap)===fmtVN(r.ngayNhap));
    });
    if(removed) pushTrash({ type:'custom', action:'delete', before:x });
  });
  saveCustom(survivors);

  // xoá sheet bằng override
  for (const r of VIEW){
    if(r._src==='custom') continue;
    const key=rowKeyOf(r);
    const cur=ovr[key]||{};
    if(cur.hidden!==true){
      const before=findOriginalSheetRowByKey(key);
      ovr[key]={...cur, hidden:true};
      pushTrash({ type:'sheet', action:'delete', key, before });
    }
  }
  saveOvr(ovr);

  loadAll();
}

function findOriginalSheetRowByKey(key){
  return SHEET_ROWS.find(r=>rowKeyOf(r)===key) || null;
}

/* ===== EDIT MODAL ===== */
function openEditModal(row, key){
  const wrap=document.createElement('div');
  wrap.className='modal-backdrop';
  wrap.innerHTML=`
    <div class="bg-white w-[min(680px,92vw)] rounded-2xl shadow-2xl border border-slate-200 p-4">
      <div class="flex items-center gap-3 mb-3">
        <div class="text-lg font-semibold">Sửa thông tin</div>
        <button class="btn ml-auto px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-sm" data-x="close">Đóng</button>
      </div>
      <form class="space-y-2">
        <div>
          <label class="text-sm">Tên thuốc gốc <span class="text-rose-500">*</span></label>
          <input name="ten" value="${escapeHtml(row.ten)}" class="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring focus:ring-sky-200" ${row._src==='sheet'?'':'autofocus'}/>
          <p class="text-xs text-slate-500 mt-1">${row._src==='sheet'?'(Tên gốc có thể sửa: sẽ tạo override)': '(Manual: sửa trực tiếp)'}</p>
        </div>
        <div>
          <label class="text-sm">Alias</label>
          <input name="alias" value="${escapeHtml(row.alias||'')}" class="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring focus:ring-sky-200"/>
        </div>
        <div class="grid grid-cols-3 gap-2">
          <div>
            <label class="text-sm">Số lượng</label>
            <input name="soLuong" type="number" min="0" value="${Number(row.soLuong)||0}" class="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring focus:ring-sky-200"/>
          </div>
          <div>
            <label class="text-sm">HSD (DD/MM/YYYY)</label>
            <input name="hsd" value="${escapeHtml(row.hsd||'')}" class="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring focus:ring-sky-200"/>
          </div>
          <div>
            <label class="text-sm">Ngày nhập (DD/MM/YYYY)</label>
            <input name="ngayNhap" value="${escapeHtml(row.ngayNhap||'')}" class="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring focus:ring-sky-200"/>
          </div>
        </div>

        ${row._src==='sheet'?`
          <div class="p-2 rounded-lg bg-slate-50 text-xs text-slate-600">
            Sửa mục từ Sheets sẽ được lưu dưới dạng <b>override</b> cục bộ (không viết ngược lên Sheets).
          </div>
        `:''}

        <div class="pt-2 flex items-center gap-2">
          <button class="btn px-3 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-700" data-x="save">Lưu</button>
          <button class="btn px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50" data-x="cancel">Huỷ</button>
          <span class="ml-auto text-xs text-slate-500">${row._src==='custom'?'Manual':'Sheets (override)'}</span>
        </div>
      </form>
    </div>`;
  document.body.appendChild(wrap);

  const close=()=>wrap.remove();
  wrap.addEventListener('click',(e)=>{ if(e.target===wrap) close(); });
  wrap.querySelector('[data-x="close"]').addEventListener('click',close);
  wrap.querySelector('[data-x="cancel"]').addEventListener('click',(e)=>{ e.preventDefault(); close(); });

  wrap.querySelector('[data-x="save"]').addEventListener('click',(e)=>{
    e.preventDefault();
    const f = e.currentTarget.closest('form');
    const ten = f.ten.value.trim();
    const alias = f.alias.value.trim();
    const soLuong = Number(f.soLuong.value||0);
    const hsdStr = f.hsd.value.trim();
    const ngayStr = f.ngayNhap.value.trim();

    if(!ten){ alert('Tên thuốc gốc là bắt buộc'); return; }
    if(soLuong<0 || Number.isNaN(soLuong)){ alert('Số lượng không hợp lệ'); return; }
    if(hsdStr && !parseVNDate(hsdStr)){ alert('HSD không hợp lệ (DD/MM/YYYY)'); return; }
    if(ngayStr && !parseVNDate(ngayStr)){ alert('Ngày nhập không hợp lệ (DD/MM/YYYY)'); return; }

    if(row._src==='custom'){
      const list=loadCustom();
      const idx=list.findIndex(x=>x._id===row._id);
      if(idx>=0){
        const before=deepClone(list[idx]);
        list[idx]={...list[idx], ten, alias, soLuong, hsd: fmtVN(hsdStr)||hsdStr, ngayNhap: fmtVN(ngayStr)||ngayStr};
        saveCustom(list);
        pushTrash({ type:'custom', action:'edit', before, after:deepClone(list[idx]) });
      }
    }else{
      const ovr=loadOvr();
      const patch=ovr[key]||{};
      const before=findRowByKey(key); // sau override hiện tại
      const after={...before, ten, alias, soLuong, hsd: fmtVN(hsdStr)||hsdStr, ngayNhap: fmtVN(ngayStr)||ngayStr};
      // Lưu override
      ovr[key]={ ...patch, alias, soLuong, hsd: after.hsd, ngayNhap: after.ngayNhap };
      saveOvr(ovr);
      pushTrash({ type:'sheet', action:'edit', key, before: {ten:before.ten, alias:patch.alias??before.alias, soLuong:patch.soLuong??before.soLuong, hsd:patch.hsd??before.hsd, ngayNhap:patch.ngayNhap??before.ngayNhap}, after: {ten:after.ten, alias:after.alias, soLuong:after.soLuong, hsd:after.hsd, ngayNhap:after.ngayNhap} });
    }
    close();
    loadAll();
  });
}

/* ===== ADD MANUAL (Form ở sidebar) ===== */
function wireAddForm(){
  const f = document.getElementById('formAddDrug'); if(!f) return;
  const elTen = document.getElementById('addTen');
  const elAlias = document.getElementById('addAlias');
  const elSL = document.getElementById('addSL');
  const elHSD = document.getElementById('addHSD');
  const elNgay = document.getElementById('addNgayNhap');
  const msg = document.getElementById('addMsg');
  const btnClear = document.getElementById('btnClearAdd');

  const setMsg = (t, ok=true)=>{
    if(!msg) return;
    msg.textContent = t || '';
    msg.className = 'text-xs ml-auto ' + (ok ? 'text-emerald-700' : 'text-rose-600');
    if(t) setTimeout(()=>{ msg.textContent=''; }, 2500);
  };

  btnClear?.addEventListener('click', ()=>{
    elTen.value=''; elAlias.value=''; elSL.value=''; elHSD.value=''; elNgay.value='';
    setMsg('Đã xoá form');
  });

  f.addEventListener('submit', (e)=>{
    e.preventDefault();
    const ten = String(elTen.value||'').trim();
    const alias = String(elAlias.value||'').trim();
    const soLuong = Number(elSL.value||0);
    const hsdStr = String(elHSD.value||'').trim();
    const ngayStr = String(elNgay.value||'').trim();

    if(!ten){ setMsg('Tên thuốc gốc là bắt buộc', false); elTen.focus(); return; }
    if(soLuong<0 || Number.isNaN(soLuong)){ setMsg('Số lượng không hợp lệ', false); elSL.focus(); return; }
    if(hsdStr && !parseVNDate(hsdStr)){ setMsg('HSD không hợp lệ (DD/MM/YYYY)', false); elHSD.focus(); return; }
    if(ngayStr && !parseVNDate(ngayStr)){ setMsg('Ngày nhập không hợp lệ (DD/MM/YYYY)', false); elNgay.focus(); return; }

    const list = loadCustom();
    const item = {
      _id: cryptoRandomId(),
      ten, alias, soLuong,
      hsd: fmtVN(hsdStr)||hsdStr,
      ngayNhap: fmtVN(ngayStr)||ngayStr,
      createdAt: new Date().toISOString()
    };
    list.push(item);
    saveCustom(list);

    setMsg('Đã thêm vào kho (cục bộ)');
    elTen.value=''; elAlias.value=''; elSL.value=''; elHSD.value=''; elNgay.value='';
    loadAll();
  });
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
      const ovr=loadOvr(); if(ovr[ev.key]){ delete ovr[ev.key].hidden; if(Object.keys(ovr[ev.key]).length===0) delete ovr[ev.key]; saveOvr(ovr); }
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
function cmp(x,op,y){ if(op==='<=')return x<=y; if(op==='<')return x<y; if(op==='>=')return x>=y; if(op==='>')return x>y; if(op==='=')return x===y; return true; }

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
      if (c.days.mode==='to_expiry'){ if(d<=0) return false; if(!cmp(d,c.days.cmp,c.days.days)) return false; }
      if (c.days.mode==='overdue'){ if(d>0) return false; const over=Math.abs(d); if(!cmp(over,c.days.cmp,c.days.days)) return false; }
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
  const fieldsWant=parseFieldSelect(q); // <-- giữ một lần duy nhất
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
    if (criteria.days){ bits.push(criteria.days.mode==='to_expiry'?`Tới HSD ≤ ${criteria.days.days} ngày`:`Quá HSD ≤ ${criteria.days.days} ngày`); }
    if (criteria.qty){ bits.push(`SL ${criteria.qty.cmp} ${criteria.qty.value}`); }
    return { ok:true, type:'text', content:`Không có kết quả phù hợp${bits.length?' — '+bits.join(' — '):''}.` };
  }

  if(sortWant){
    if(sortWant.key==='hsd'){
      const today=dayjs().startOf('day');
      rows.sort((a,b)=>{
        const da=parseVNDate(a.hsd)?.startOf('day').diff(today,'day') ?? 1e9;
        const db=parseVNDate(b.hsd)?.startOf('day').diff(today,'day') ?? 1e9;
        return sortWant.dir==='asc' ? (da-db || a.ten.localeCompare(b.ten)) : (db-da || a.ten.localeCompare(b.ten));
      });
    }else if(sortWant.key==='sl'){
      rows.sort((a,b)=> sortWant.dir==='asc' ? ((Number(a.soLuong)||0)-(Number(b.soLuong)||0)) : ((Number(b.soLuong)||0)-(Number(a.soLuong)||0)) );
    }else{
      rows.sort((a,b)=> sortWant.dir==='asc' ? a.ten.localeCompare(b.ten) : b.ten.localeCompare(a.ten) );
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
    const out=Array.from(byName.values()).sort((a,b)=>a.ten.localeCompare(b.ten)).map(v=>[
      v.ten, Array.from(v.alias).slice(0,1).join(', '), String(v.tongSL),
      v.earliest? v.earliest.format('DD/MM/YYYY'):'', v.latest? v.latest.format('DD/MM/YYYY'):''
    ]);
    const ttl=`${nameHits.map(h=>h.canonical).join(' + ') || 'Tổng hợp'} — ${out.length} tên, tổng SL ${sum(out.map(r=>Number(r[2])||0))}`;
    return { ok:true, type:'table', title:ttl, headers, rows:out };
  }

  const headers=['TÊN THUỐC','ALIAS','SỐ LƯỢNG','HSD','NGÀY NHẬP','TRẠNG THÁI','CÒN (ngày)'];
  const out=rows.map(r=>[r.ten,r.alias,String(r.soLuong),r.hsd,r.ngayNhap,r.trangThai,(r.daysLeft===''?'':String(r.daysLeft))]);
  const ttl=`${nameHits.map(h=>h.canonical).join(' + ') || 'Kết quả'} — ${rows.length} lô / ${new Set(rows.map(r=>r.ten)).size} tên, tổng SL ${sum(rows.map(r=>Number(r.soLuong)||0))}`;
  return { ok:true, type:'table', title:ttl, headers, rows:out };
}

/* ===== CHAT UI ===== */
const chatList=()=>document.getElementById('chatList');
const chatInput=()=>document.getElementById('chatInput');
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
function pushUser(text){ chatList().insertAdjacentHTML('beforeend', `<div class="flex justify-end"><div class="chat-bubble chat-user">${escapeHtml(text)}</div></div>`); chatList().scrollTop=chatList().scrollHeight; }
function pushLoading(){ const id='ld-'+Date.now(); chatList().insertAdjacentHTML('beforeend', `<div id="${id}" class="flex"><div class="chat-bubble chat-bot">Đang xử lý…</div></div>`); chatList().scrollTop=chatList().scrollHeight; return id; }
function replaceLoading(id, html){ const el=document.getElementById(id); if(!el) return; el.outerHTML=`<div class="flex"><div class="chat-bubble chat-bot w-full">${html}</div></div>`; }
function renderAns(ans){
  if(ans.type==='text') return `<div class="whitespace-pre-wrap leading-relaxed">${escapeHtml(ans.content||'')}</div>`;
  if(ans.type==='table'){
    const thead=(ans.headers||[]).map(h=>`<th class="px-2 py-1.5 text-left border-b bg-slate-50">${escapeHtml(h)}</th>`).join('');
    const rows=(ans.rows||[]).map((r,i)=>`<tr class="${i%2?'bg-white':'bg-slate-50/40'}">${r.map((c,idx)=>`<td class="px-2 py-1.5 ${idx===2||idx===6?'text-right mono':''}">${escapeHtml(String(c??''))}</td>`).join('')}</tr>`).join('');
    return `<div class="font-medium mb-2">${escapeHtml(ans.title||'Kết quả')}</div><div class="overflow-auto max-h-[40vh] rounded-lg border"><table class="w-full text-[13px]"><thead><tr>${thead}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  return `<div>${escapeHtml(JSON.stringify(ans))}</div>`;
}
function sendKhoQuery(text){
  const q=(text??chatInput().value).trim(); if(!q) return;
  pushUser(q); chatInput().value='';
  const id=pushLoading(); const ans=localAnswer(q); replaceLoading(id, renderAns(ans));
}

/* ===== RANDOM CHIPS ===== */
function setupRandomOneChip(){
  const btn=document.getElementById('chipRandOne'); if(!btn) return;
  const pool=Array.from(new Set(RAW.MedData.map(r=>r.ten).filter(Boolean)));
  if(!pool.length){ btn.textContent='Tên ngẫu nhiên: (trống)'; btn.dataset.q=''; btn.disabled=true; return; }
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

/* ===== EVENTS ===== */
function initEvents(){
  document.querySelectorAll('.filter-chip').forEach(b=>CHIP_BASE.set(b,b.className));
  document.querySelectorAll('.filter-chip').forEach(btn=>btn.addEventListener('click',()=>{ setActiveChip(btn); applyFilters(); }));
  const def=document.querySelector('.filter-chip[data-filter="all"]'); if(def) setActiveChip(def);
  document.getElementById('searchInput')?.addEventListener('input', applyFilters);

  const btnToggle=document.getElementById('btnToggleMissing');
  if(btnToggle){ btnToggle.addEventListener('click',()=>{ showMissingOnly=!showMissingOnly; btnToggle.textContent=showMissingOnly?'Hiện tất cả':'Xem mục thiếu'; renderCatalog(); }); }

  const slider=document.getElementById('qtySlider'), qtyVal=document.getElementById('qtyVal');
  if(slider&&qtyVal){ slider.addEventListener('input',()=>{ qtyVal.textContent=slider.value; applyFilters(); }); }

  document.getElementById('btnSend')?.addEventListener('click',()=>sendKhoQuery());
  chatInput()?.addEventListener('keydown',(e)=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); sendKhoQuery(); } });
  document.querySelectorAll('.chip-q').forEach(b=>b.addEventListener('click',()=>sendKhoQuery(b.dataset.q||b.textContent||'')));

  document.getElementById('tabKho')?.addEventListener('click',()=>{
    document.getElementById('tabKho').setAttribute('aria-pressed','true');
    document.getElementById('tabThuoc').setAttribute('aria-pressed','false');
    document.getElementById('chatKho').classList.remove('hidden');
    document.getElementById('chatThuoc').classList.add('hidden');
  });

  // Bulk delete + Trash modal
  document.getElementById('btnBulkDelete')?.addEventListener('click', onBulkDelete);
  document.getElementById('btnOpenTrash')?.addEventListener('click', openTrash);
  document.getElementById('btnCloseTrash')?.addEventListener('click', closeTrash);
  document.getElementById('btnEmptyTrash')?.addEventListener('click', emptyTrash);

  wireAddForm();
}
const CHIP_ACTIVE={all:'bg-sky-600 text-white border-sky-600',ok:'bg-emerald-600 text-white border-emerald-600',soon:'bg-amber-500 text-white border-amber-500',expired:'bg-rose-600 text-white border-rose-600'};
function setActiveChip(btn){
  document.querySelectorAll('.filter-chip').forEach(b=>{ const base=CHIP_BASE.get(b)||b.className; CHIP_BASE.set(b,base.replace(/\s?active\b/,'')); b.className=CHIP_BASE.get(b); });
  btn.className=(CHIP_BASE.get(btn)||btn.className)+' active '+(CHIP_ACTIVE[btn.dataset.filter]||CHIP_ACTIVE.all);
}

/* ===== BOOT ===== */
initEvents();
loadAll();

// ensure tabs for drug panel
document.addEventListener('DOMContentLoaded', () => {
  if (typeof window.wireTabsForThuoc === 'function') {
    window.wireTabsForThuoc();
  }
});
