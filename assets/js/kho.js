/***********************
 * KHO – Bảng + Danh mục + Local AI (stabilized)
 * (Giữ nguyên baseline; chỉ thêm chip "Tình trạng: <thuốc>")
 ***********************/

/* ===== CONFIG ===== */
const FILE_ID = '1ZsRkVHNq5XKV-0R6abUW3zlleBZqjXqjJzaDu90AneI';
const CSV_URLS = {
  MedData:       `https://docs.google.com/spreadsheets/d/${FILE_ID}/export?format=csv&gid=0`,
  DanhMucSearch: `https://docs.google.com/spreadsheets/d/${FILE_ID}/export?format=csv&gid=1041829227`
};

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
const sum=a=>a.reduce((s,x)=>s+(Number(x)||0),0);
function statusBadge(st){
  const map={'Hết hạn':'bg-rose-100 text-rose-700 border-rose-200','Sắp hết hạn':'bg-amber-100 text-amber-800 border-amber-200','Còn hạn':'bg-emerald-100 text-emerald-700 border-emerald-200'};
  const dot=st==='Hết hạn'?'bg-rose-500':st==='Sắp hết hạn'?'bg-amber-500':'bg-emerald-500';
  return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${map[st]||'bg-slate-100'}"><span class="inline-block w-1.5 h-1.5 rounded-full ${dot}"></span>${st}</span>`;
}

// Levenshtein fuzzy
function lev(a,b){ const m=a.length,n=b.length; if(!m) return n; if(!n) return m;
  const d=new Array(n+1); for(let j=0;j<=n;j++) d[j]=j;
  for(let i=1;i<=m;i++){ let p=d[0]; d[0]=i; for(let j=1;j<=n;j++){ const t=d[j];
    d[j]=Math.min(d[j]+1,d[j-1]+1,p+(a[i-1]===b[j-1]?0:1)); p=t; } }
  return d[n];
}

/* ===== STATE ===== */
let RAW={ MedData:[], DanhMucSearch:[] };
let VIEW=[];
let CATALOG=[];
let NAME_INDEX=[];
let showMissingOnly=false;
let CHIP_BASE=new Map();
let MAX_QTY=0;

const STOPWORDS=new Set(['thuoc','cac','nhung','va','hoac','trong','ngay','thang','nam','con','het','han','sap','hsd','sl','so','luong','ton','kho','danh','sach','nao','nhap','ma','code','sp','la','nhieu','it','duoi','tren','<=','>=','<','>','=','trong vong']);

/* ===== LOAD ===== */
async function loadAll(){
  const [med,dm]=await Promise.all([parseCSV(CSV_URLS.MedData),parseCSV(CSV_URLS.DanhMucSearch)]);
  const today=dayjs().startOf('day');

  RAW.MedData=med.map(r=>{
    const hsd=parseVNDate(r['HSD']);
    const ngayNhap=parseVNDate(r['NGÀY NHẬP']||r['Ngày nhập']||r['NGAY NHAP']);
    const soLuong=Number(String(r['SỐ LƯỢNG']||r['Số lượng']||r['SO LUONG']).replace(/[^\d.-]/g,''))||0;
    const d=hsd?hsd.startOf('day').diff(today,'day'):null; // 0 = hết hạn
    const trangThai=(d==null)?'Còn hạn':(d<=0?'Hết hạn':(d<=30?'Sắp hết hạn':'Còn hạn'));
    return {
      ten:r['TÊN THUỐC GỐC']||r['TEN THUOC GOC']||r['Tên thuốc gốc']||'',
      alias:r['ALIAS']||'',
      soLuong,
      hsd:hsd?hsd.format('DD/MM/YYYY'):(r['HSD']||''),
      ngayNhap:ngayNhap?ngayNhap.format('DD/MM/YYYY'):(r['NGÀY NHẬP']||r['Ngày nhập']||''),
      daysLeft:(d==null)?'':d,
      trangThai
    };
  });

  MAX_QTY=RAW.MedData.reduce((m,x)=>Math.max(m,Number(x.soLuong)||0),0);
  const slider=document.getElementById('qtySlider'), qtyVal=document.getElementById('qtyVal');
  if(slider&&qtyVal){ slider.min=0; slider.max=String(MAX_QTY||0); slider.value=String(MAX_QTY||0); qtyVal.textContent=slider.value; }

  RAW.DanhMucSearch=dm.map(r=>({ten:r['TÊN THUỐC GỐC']||r['TEN THUOC GOC']||r['Tên thuốc gốc']||'', alias:r['ALIAS']||''}));
  buildCatalog(); buildNameIndex(); applyFilters(); renderCatalog();
  setupRandomOneChip();      // NEW
  setupRandomPairChip();     // existing
}

/* ===== CATALOG ===== */
function buildCatalog(){
  const setKho=new Set(RAW.MedData.map(x=>nn(x.ten)).filter(Boolean));
  CATALOG=RAW.DanhMucSearch.filter(x=>x.ten).map(x=>({...x,has:setKho.has(nn(x.ten))}));
  const total=CATALOG.length, have=CATALOG.filter(x=>x.has).length;
  const cov = total?Math.round(have/total*100):0;
  const badge=document.getElementById('coverageBadge'); if(badge) badge.textContent=`Coverage: ${cov}% (${have}/${total})`;
}
function renderCatalog(){
  const list=document.getElementById('catalogList'); if(!list) return;
  const data=showMissingOnly?CATALOG.filter(x=>!x.has):CATALOG;
  list.innerHTML=data.map(x=>`<div class="px-3 py-1.5 rounded-lg border ${x.has?'bg-emerald-50 border-emerald-200':'bg-slate-50'}">${x.ten}</div>`).join('');
}

/* ===== NAME INDEX ===== */
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
  const s=nn(raw); const hits=[];
  for(const it of NAME_INDEX){
    const yes = s.includes(it.canon) || Array.from(it.aliasSet).some(a=>a&&s.includes(a));
    if(yes) hits.push({canonical:it.display,canon:it.canon,has:it.has,score:0});
  }
  if(!hits.length){
    const tokens=s.split(' ').filter(t=>t.length>=5 && !STOPWORDS.has(t));
    let best=null;
    for(const tok of tokens){
      for(const it of NAME_INDEX){
        const d=Math.min(lev(tok,it.canon),...Array.from(it.aliasSet).map(a=>lev(tok,a)));
        if(d<=2){ if(!best||d<best.d) best={it,d,token:tok}; }
      }
    }
    if(best) hits.push({canonical:best.it.display,canon:best.it.canon,has:best.it.has,score:100-best.d});
  }
  const seen=new Set(), out=[];
  for(const h of hits){ if(!seen.has(h.canon)){ seen.add(h.canon); out.push(h); if(out.length>=maxN) break; } }
  return out;
}

/* ===== TABLE FILTER (UI) ===== */
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
  tbody.innerHTML=VIEW.map((r,i)=>`
    <tr class="${i%2?'bg-white':'bg-slate-50/40'} hover:bg-sky-50">
      <td class="py-2.5 px-3">${r.ten}</td>
      <td class="py-2.5 px-3 bg-sky-50/50"><div class="truncate max-w-[28ch] text-slate-700" title="${r.alias}">${r.alias}</div></td>
      <td class="py-2.5 px-3 text-right bg-slate-50">${r.soLuong}</td>
      <td class="py-2.5 px-3 whitespace-nowrap bg-indigo-50/40">${r.hsd}</td>
      <td class="py-2.5 px-3 whitespace-nowrap bg-indigo-50/20">${r.ngayNhap}</td>
      <td class="py-2.5 px-3 text-center whitespace-nowrap">${statusBadge(r.trangThai)}</td>
      <td class="py-2.5 px-3 text-right bg-slate-50/60">${fmtDaysLeft(r.daysLeft)}</td>
    </tr>
  `).join('');
}

/* ===== CHIPS ===== */
const CHIP_ACTIVE={all:'bg-sky-600 text-white border-sky-600',ok:'bg-emerald-600 text-white border-emerald-600',soon:'bg-amber-500 text-white border-amber-500',expired:'bg-rose-600 text-white border-rose-600'};
function setActiveChip(btn){
  document.querySelectorAll('.filter-chip').forEach(b=>{ const base=CHIP_BASE.get(b)||b.className; CHIP_BASE.set(b,base.replace(/\s?active\b/,'')); b.className=CHIP_BASE.get(b); });
  btn.className=(CHIP_BASE.get(btn)||btn.className)+' active '+(CHIP_ACTIVE[btn.dataset.filter]||CHIP_ACTIVE.all);
}

/* ===== LOCAL AI (Kho) ===== */
function parseNumberDays(s){
  const n=nn(s);
  let m=n.match(/\b(\d+(?:[.,]\d+)?)\s*(ngay|day|d)\b/); if(m) return Math.round(Number(m[1].replace(',','.')));
  m=n.match(/\b(\d+(?:[.,]\d+)?)\s*(tuan|week|w)\b/);    if(m) return Math.round(Number(m[1].replace(',','.'))*7);
  m=n.match(/\b(\d+(?:[.,]\d+)?)\s*(thang|month|m)\b/);  if(m) return Math.round(Number(m[1].replace(',','.'))*30);
  m=n.match(/\b(\d+(?:[.,]\d+)?)\s*(nam|year|y|yr|yrs)\b/); if(m) return Math.round(Number(m[1].replace(',','.'))*365);
  return null;
}
function inferCmp(s){
  const n=nn(s);
  if (/(<=|≤|\btrong\b|\bduoi\b|\bnho hon\b|\bit hon\b|\btoi da\b)/.test(n)) return '<=';
  if (/(>=|≥|\btren\b|\blon hon\b|\bhon\b|\btoi thieu\b)/.test(n)) return '>=';
  if (/<\s*\d/.test(s)) return '<';
  if (/>\s*\d/.test(s)) return '>';
  return '<='; // mặc định “trong …”
}
function parseDaysIntent(s0){
  let s=' '+nn(s0)+' ';
  s=s.replace(/\bden han\b/g,'het han').replace(/\bden hsd\b/g,'het han').replace(/\bqh\b/g,'qua han');
  const days=parseNumberDays(s);
  if (/\bsap het han\b/.test(s)) return { mode:'to_expiry', cmp:'<=', days: days ?? 30 };
  if (/\bqua han\b/.test(s))    return days!=null ? { mode:'overdue', cmp:'<=', days } : { need:true, hint:'quá hạn' };
  if (/\bhet han\b/.test(s))    return days!=null ? { mode:'to_expiry', cmp:'<=', days } : { need:true, hint:'hết hạn' };
  return null;
}
function parseQtyIntent(s){
  const n=nn(s);
  const m1=n.match(/\bsl\s*(<=|>=|<|>|=)?\s*(\d+)\b/); if(m1) return { cmp:(m1[1]||'<='), value:Number(m1[2]) };
  const m2=n.match(/\b(duoi|nho hon|it hon|toi da)\s*(\d+)\b/); if(m2) return { cmp:'<=', value:Number(m2[2]) };
  const m3=n.match(/\b(tren|lon hon|hon|toi thieu)\s*(\d+)\b/);  if(m3) return { cmp:'>=', value:Number(m3[2]) };
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
    if (c.qty && !cmp(Number(r.soLuong)||0, c.qty.cmp, c.qty.value)) return false;
    return true;
  });
}

function localAnswer(qRaw){
  const q=String(qRaw||'').trim(); if(!q) return { ok:true, type:'text', content:'Bạn hãy nhập câu hỏi nhé.' };

  const nameHits=findNamesInQuery(q,10);
  const namesCanon=nameHits.map(h=>h.canon);

  const s=nn(q);
  const daysIntent=parseDaysIntent(q);
  const qtyIntent=parseQtyIntent(q);
  let state=null;
  if (/\bqua han\b/.test(s)||/\bhet han\b/.test(s)) state='expired';
  else if (/\bsap het han\b/.test(s)) state='soon';
  else if (/\bcon han\b/.test(s)||/\bchua het han\b/.test(s)) state='ok';

  const listy=/\b(cac|danh sach|liet ke|thuoc nao)\b/.test(s);
  const useDays=(daysIntent && daysIntent.need && !listy)? null : daysIntent;
  if (daysIntent && daysIntent.need && !listy){
    return { ok:true, type:'text', content:`Bạn đang hỏi về "${daysIntent.hint}" nhưng chưa nêu mốc ngày. Ví dụ: "hết HSD trong 14 ngày", "quá hạn ≥ 7 ngày".` };
  }

  const inStockCanon=new Set(RAW.MedData.map(r=>nn(r.ten)));
  if (namesCanon.length && !useDays && !qtyIntent && !state){
    const missing=nameHits.filter(x=>!inStockCanon.has(x.canon));
    if(missing.length){ const txt=missing.map(x=>x.canonical).join(', '); return { ok:true, type:'text', content:`${txt} — chưa có trong kho.` }; }
  }

  const criteria={ names:namesCanon, days:useDays||null, qty:qtyIntent||null, state };
  let rows=filterRowsByCriteria(criteria);

  const title=[]; if(namesCanon.length) title.push(nameHits.map(h=>h.canonical).join(' + '));
  if(criteria.state==='expired') title.push('Hết hạn');
  if(criteria.state==='soon')    title.push('Sắp hết hạn');
  if(criteria.state==='ok')      title.push('Còn hạn');
  if(criteria.days){ title.push(criteria.days.mode==='to_expiry'?`Tới HSD ≤ ${criteria.days.days} ngày`:`Quá HSD ≤ ${criteria.days.days} ngày`); }
  if(criteria.qty){ title.push(`SL ${criteria.qty.cmp} ${criteria.qty.value}`); }

  if(!rows.length){
    return { ok:true, type:'text', content:`Không có kết quả phù hợp${title.length?' — '+title.join(' — '):''}.` };
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
    const ttl=`${title.length?title.join(' — '):'Tổng hợp'} — ${out.length} tên, tổng SL ${sum(out.map(r=>Number(r[2])||0))}`;
    return { ok:true, type:'table', title:ttl, headers, rows:out };
  }

  const askHSD = !!criteria.days || !!criteria.state || /\b(hsd|han|het han|sap het han|qua han)\b/.test(s);
  if(askHSD){
    const today=dayjs().startOf('day');
    rows.sort((a,b)=>{
      const da=parseVNDate(a.hsd)?.startOf('day').diff(today,'day') ?? 1e9;
      const db=parseVNDate(b.hsd)?.startOf('day').diff(today,'day') ?? 1e9;
      return da-db || String(a.ten).localeCompare(b.ten);
    });
  }else{
    rows.sort((a,b)=>String(a.ten).localeCompare(b.ten) || String(a.hsd).localeCompare(b.hsd));
  }

  const headers=['TÊN THUỐC','ALIAS','SỐ LƯỢNG','HSD','NGÀY NHẬP','TRẠNG THÁI','CÒN (ngày)'];
  const out=rows.map(r=>[r.ten,r.alias,String(r.soLuong),r.hsd,r.ngayNhap,r.trangThai,(r.daysLeft===''?'':String(r.daysLeft))]);
  const ttl=`${title.length?title.join(' — '):'Kết quả'} — ${rows.length} lô / ${new Set(rows.map(r=>r.ten)).size} tên, tổng SL ${sum(rows.map(r=>Number(r.soLuong)||0))}`;
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

/* ===== Random chips ===== */
function setupRandomOneChip(){
  const btn=document.getElementById('chipRandOne'); if(!btn) return;
  const pool=Array.from(new Set(RAW.MedData.map(r=>r.ten).filter(Boolean)));
  if(!pool.length){ btn.textContent='Tình trạng: (trống)'; btn.dataset.q=''; btn.disabled=true; return; }
  const name=pool[Math.floor(Math.random()*pool.length)];
  btn.textContent=`Tình trạng: ${name}`;
  // Hỏi theo lô để xem SL + HSD (tt cụ thể)
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
}
initEvents();
loadAll();
