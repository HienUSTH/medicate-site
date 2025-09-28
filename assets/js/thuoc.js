/***********************
 * TRA CỨU THUỐC – RxNav + openFDA + DailyMed
 * + Fallback alias nội & mini cache
 * + Autocomplete 5 gợi ý (A→Z, có thêm gợi ý động từ openFDA)
 * + Vùng kết quả scroll, bài mới ở DƯỚI
 * + Ẩn panel kết quả cho tới khi user tra
 ***********************/

/* ===== helpers ===== */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const norm = s => {
  try { return String(s||'').toLowerCase().normalize('NFD').replace(/[^\p{L}\p{N}\s\-\.]/gu,' ').replace(/\s+/g,' ').trim(); }
  catch { return String(s||'').toLowerCase().trim(); }
};

/* ===== Alias map để hiển thị “Tên (alias)” ===== */
const ALIAS_PAIRS = {
  'ACETAMINOPHEN':'Paracetamol',
  'PARACETAMOL':'Acetaminophen',
  'ASCORBIC ACID':'Vitamin C',
  'VITAMIN C':'Ascorbic acid',
  'THIAMINE':'Vitamin B1',
  'PYRIDOXINE':'Vitamin B6',
};

/* ===== Fallback VN alias + mini label cache (offline) ===== */
const LOCAL_ALIAS = [
  { re:/\boresol\b/i, display:'Oral Rehydration Salts (ORS)', tokens:['SODIUM CHLORIDE','POTASSIUM CHLORIDE','SODIUM CITRATE','GLUCOSE'] },
  { re:/\bors\b/i,     display:'Oral Rehydration Salts (ORS)', tokens:['SODIUM CHLORIDE','POTASSIUM CHLORIDE','SODIUM CITRATE','GLUCOSE'] },
  { re:/\bberberin(e)?\b/i, display:'Berberine', tokens:['BERBERINE','BERBERINE HYDROCHLORIDE'] },
];

const LOCAL_MONO = {
  'Oral Rehydration Salts (ORS)': {
    indications: 'Bù nước – điện giải trong tiêu chảy cấp, nôn nhiều, mất nước nhẹ đến vừa.',
    dosage: 'Pha đúng theo hướng dẫn trên gói. Uống từng ngụm nhỏ, chia nhiều lần. Người lớn thường 2–3 lít/ngày tùy mất nước; trẻ em theo cân nặng/khuyến cáo trên bao bì.',
    contraindications: 'Không dùng nếu nôn ói không kiểm soát, liệt ruột, tắc ruột, hoặc có dấu hiệu mất nước nặng cần truyền tĩnh mạch.',
    warnings_precautions: 'Pha đúng tỷ lệ, không tự ý tăng nồng độ. Theo dõi dấu hiệu mất nước nặng (khát dữ, tiểu rất ít, lừ đừ) để đi khám.',
    adverse: 'Đôi khi đầy bụng, nôn nhẹ. Hiếm khi rối loạn điện giải nếu pha sai nồng độ.',
    interactions: 'Thận trọng khi dùng cùng chế phẩm có natri/kalium cao.',
    storage: 'Gói bột: nơi khô, mát. Dung dịch đã pha: dùng trong 24 giờ.',
    how_supplied: 'Gói bột pha dung dịch uống.'
  },
  'Berberine': {
    indications: 'Hỗ trợ điều trị tiêu chảy do nhiễm khuẩn nhẹ, rối loạn tiêu hóa; có thể dùng trong hội chứng lỵ nhẹ theo hướng dẫn địa phương.',
    dosage: 'Người lớn thường 100–200 mg mỗi lần, 2–3 lần/ngày, tối đa theo hướng dẫn trên bao bì/khuyến cáo của bác sĩ.',
    contraindications: 'Không dùng cho phụ nữ có thai, trẻ sơ sinh. Tránh dùng nếu dị ứng với berberine/alkaloid họ Berberis.',
    warnings_precautions: 'Dùng ngắn ngày. Nếu tiêu chảy kéo dài ≥2 ngày, sốt cao, có nhầy máu, hoặc mất nước: đi khám.',
    adverse: 'Có thể gây táo bón, buồn nôn, đau bụng nhẹ; hiếm gặp vàng da sơ sinh nếu dùng cho trẻ nhỏ (tránh).',
    interactions: 'Có thể tương tác với cyclosporin, thuốc chuyển hóa qua CYP3A4/P-glycoprotein; hỏi ý kiến bác sĩ khi dùng cùng thuốc khác.',
    storage: 'Bảo quản nơi khô mát, tránh ánh sáng.',
    how_supplied: 'Viên nén/viên nang 100–500 mg (tùy nhà sản xuất).'
  }
};

/* ===== wire tabs (export global) ===== */
function wireTabsForThuoc(){
  const tabKho=$('#tabKho'), tabThuoc=$('#tabThuoc'), chatKho=$('#chatKho'), chatThuoc=$('#chatThuoc');
  if(!tabKho||!tabThuoc||!chatKho||!chatThuoc) return;

  const setTab=(which)=>{
    const isThuoc = (which==='thuoc');
    tabThuoc.setAttribute('aria-pressed', isThuoc?'true':'false');
    tabKho.setAttribute('aria-pressed', isThuoc?'false':'true');
    chatThuoc.classList.toggle('hidden', !isThuoc);
    chatKho.classList.toggle('hidden', isThuoc);
    if(isThuoc) ensureDrugUI();
  };

  tabThuoc.addEventListener('click', ()=>setTab('thuoc'));
  tabKho.addEventListener('click', ()=>setTab('kho'));
}
window.wireTabsForThuoc = wireTabsForThuoc;

/* ===== Suggest pool (static + dynamic openFDA) ===== */
let SUGGEST_POOL = []; // static
const OFDA_CACHE = new Map(); // prefix -> array
function buildSuggestPool(){
  const vitamins = [
    'Vitamin A (Retinol)','Vitamin B1 (Thiamine)','Vitamin B2 (Riboflavin)','Vitamin B3 (Niacin)',
    'Vitamin B5 (Pantothenic acid)','Vitamin B6 (Pyridoxine)','Vitamin B9 (Folic acid)','Vitamin B12 (Cobalamin)',
    'Vitamin C (Ascorbic acid)','Vitamin D (Cholecalciferol)','Vitamin E (Tocopherol)','Vitamin K (Phylloquinone)'
  ];
  const commons = ['Paracetamol','Acetaminophen','Ibuprofen','Amoxicillin','Azithromycin','Metformin','Omeprazole','Loperamide','Smectite (Diosmectite)','Domperidone','ORS','Berberine'];
  const aliasDisp = Array.from(new Set(LOCAL_ALIAS.map(a=>a.display)));
  let pool = [];
  if (Array.isArray(window.DM_SEARCH_WORDS) && window.DM_SEARCH_WORDS.length){
    pool = window.DM_SEARCH_WORDS.slice();
  } else {
    pool = [...vitamins, ...commons, ...aliasDisp];
  }
  pool = [...new Set(pool)].sort((a,b)=>a.localeCompare(b));
  SUGGEST_POOL = pool;
}
async function fetchOfdaSuggest(prefix){
  const key = prefix.toLowerCase();
  if(OFDA_CACHE.has(key)) return OFDA_CACHE.get(key);
  // Thử đếm theo substance_name / brand_name bắt đầu bằng prefix*
  const escQ = prefix.replace(/"/g,'\\"');
  const queries = [
    `https://api.fda.gov/drug/label.json?search=openfda.substance_name:"${escQ}*"&count=openfda.substance_name.exact`,
    `https://api.fda.gov/drug/label.json?search=openfda.brand_name:"${escQ}*"&count=openfda.brand_name.exact`
  ];
  const out = [];
  for(const url of queries){
    try{
      const r = await fetch(url);
      if(!r.ok) continue;
      const j = await r.json();
      const arr = (j?.results||[]).slice(0,10).map(x=>x.term).filter(Boolean);
      out.push(...arr);
      if(out.length>=10) break;
    }catch{/* ignore */}
  }
  const uniq = [...new Set(out)].slice(0,10);
  OFDA_CACHE.set(key, uniq);
  return uniq;
}
function aliasLabel(name){
  const up = String(name||'').toUpperCase();
  const al = ALIAS_PAIRS[up];
  return al ? `${name} (${al})` : name;
}

/* ===== Autocomplete UI (5 gợi ý) ===== */
function setupAutocomplete(){
  buildSuggestPool();
  const input = drugInput(); const box=$('#drugSuggest');
  if(!input||!box) return;

  const show = (items)=>{
    if(!items.length){ box.classList.add('hidden'); return; }
    box.innerHTML = items.map(x=>`<div class="px-3 py-2 hover:bg-slate-100 cursor-pointer">${esc(aliasLabel(x))}</div>`).join('');
    box.style.position='absolute';
    box.style.zIndex='50';
    box.style.top=(input.offsetTop+input.offsetHeight+4)+'px';
    box.style.left=input.offsetLeft+'px';
    box.style.minWidth=input.offsetWidth+'px';
    box.classList.remove('hidden');
    box.querySelectorAll('div').forEach(d=>d.addEventListener('click',()=>{
      input.value=d.textContent||''; box.classList.add('hidden'); input.focus();
    }));
  };

  input.addEventListener('input', async ()=>{
    const q=norm(input.value||''); 
    if(!q){ box.classList.add('hidden'); return; }
    const starts = SUGGEST_POOL.filter(x=>norm(x).startsWith(q));
    const contains = SUGGEST_POOL.filter(x=>!norm(x).startsWith(q) && norm(x).includes(q));
    let pool = [...starts, ...contains].slice(0,5);

    // Nếu ít hơn 5 → bổ sung gợi ý động từ openFDA theo tiền tố
    if(pool.length<5){
      const ofda = await fetchOfdaSuggest(q);
      const merged = [...pool, ...ofda];
      // unique & ưu tiên A→Z
      pool = [...new Set(merged)].sort((a,b)=>a.localeCompare(b)).slice(0,5);
    }
    show(pool);
  });
  input.addEventListener('keydown',(e)=>{ if(e.key==='Escape') box.classList.add('hidden'); });
  document.addEventListener('click', (e)=>{ if(!box.contains(e.target) && e.target!==input) box.classList.add('hidden'); });
}

/* ===== chat UI (Tra cứu) ===== */
function chatListDrug(){ return $('#chatListDrug'); }
function drugInput(){ return $('#drugInput'); }

function ensureDrugUI(){
  const host = $('#chatThuoc'); if(!host) return;
  if(!drugInput()){
    host.innerHTML = `
      <div class="text-sm text-slate-600 mb-3">
        Nhập tên thuốc/hoạt chất để tra cứu thông tin chỉ định, liều dùng, tác dụng phụ, cảnh báo…
      </div>
      <div class="flex items-start gap-2 mb-2">
        <input id="drugInput" class="flex-1 px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring focus:ring-sky-200" placeholder="Nhập tên thuốc hoặc hoạt chất" />
        <button id="drugSend" class="px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm">Tra cứu</button>
      </div>
      <div id="drugSuggest" class="hidden absolute bg-white border border-slate-200 rounded-lg shadow-md text-sm"></div>

      <!-- Kết quả: ẨN cho tới khi có truy vấn đầu tiên -->
      <div id="drugResultWrap" class="hidden rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div class="px-3 py-2 text-[12.5px] text-slate-600 border-b border-slate-100">Kết quả tra cứu</div>
        <div id="chatScrollWrap" class="max-h-[460px] overflow-y-auto">
          <div id="chatListDrug" class="space-y-3 p-3"></div>
        </div>
      </div>
    `;
    $('#drugSend').addEventListener('click', ()=>sendDrugQuery());
    $('#drugInput').addEventListener('keydown', e=>{ if(e.key==='Enter') sendDrugQuery(); });
    setupAutocomplete();
  }
}

/* ===== Message helpers (bài mới ở DƯỚI) ===== */
function pushLoadingDrug(){
  const list = chatListDrug(); if(!list) return null;
  const id = 'ldr_'+Math.random().toString(36).slice(2,8);
  const html = `<div id="${id}" class="px-3 py-3 rounded-2xl bg-slate-50 border border-slate-200">
    <div class="animate-pulse text-sm text-slate-500">Đang tra cứu…</div>
  </div>`;
  // hiện panel nếu lần đầu
  const wrapAll = $('#drugResultWrap'); if(wrapAll) wrapAll.classList.remove('hidden');
  // thêm cuối + cuộn xuống cuối
  list.insertAdjacentHTML('beforeend', html);
  const wrap = $('#chatScrollWrap'); if(wrap) wrap.scrollTop = wrap.scrollHeight;
  return id;
}
function replaceLoadingDrug(id, html){
  const el=document.getElementById(id); if(el) el.outerHTML = html;
  const wrap = $('#chatScrollWrap'); if(wrap) wrap.scrollTop = wrap.scrollHeight;
}

/* ===== RxNav / openFDA / DailyMed fetchers ===== */
async function rxStrict(name){
  const url=`https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(name)}&search=2`;
  const j=await (await fetch(url)).json();
  const rxcui = j?.idGroup?.rxnormId?.[0]||null;
  const nm = j?.idGroup?.name || name;
  return rxcui?{rxcui, name:nm}:null;
}
async function rxnavApprox(q, max=8){
  const url=`https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(q)}&maxEntries=${max}`;
  const j=await (await fetch(url)).json();
  const ids = j?.approximateGroup?.candidate?.map(c=>c.rxcui).filter(Boolean)||[];
  return ids;
}
async function rxApproxBest(q){
  const ids=await rxnavApprox(q,8);
  for(const id of ids){
    const url=`https://rxnav.nlm.nih.gov/REST/rxcui/${id}/property.json?propName=RxNorm%20Name`;
    const j=await (await fetch(url)).json();
    const nm=j?.propConceptGroup?.propConcept?.[0]?.propValue;
    if(nm) return {rxcui:id, name:nm};
  }
  return null;
}
async function rxIngredients(rxcui){
  if(!rxcui) return [];
  const url=`https://rxnav.nlm.nih.gov/REST/rxcui/${rxcui}/related.json?tty=IN`;
  const j=await (await fetch(url)).json();
  const ins=j?.relatedGroup?.conceptGroup?.flatMap(g=>g.conceptGroup?.conceptProperties||g.conceptProperties||[])||[];
  return ins.map(p=>p.name).filter(Boolean);
}
function normalizeSubstanceForFDA(s){
  return String(s||'').toUpperCase().replace(/\s+/g,' ');
}

async function ofdaTry(tokens, rxcui, displayName){
  const t = (tokens||[]).map(x=>normalizeSubstanceForFDA(x)).slice(0,8);
  const tryOne = async (query) => {
    const url=`https://api.fda.gov/drug/label.json?search=${encodeURIComponent(query)}&limit=1`;
    const r=await fetch(url); if(!r.ok) return null; const j=await r.json();
    const rec=j?.results?.[0]; if(rec) return {...normalizeOpenFDALabel(rec), _source:'openFDA /drug/label'};
    return null;
  };
  const qs = [];
  if(displayName) qs.push(`(openfda.brand_name:"${displayName}")`);
  t.forEach(x=>qs.push(`(active_ingredient:"${x}")`));
  t.forEach(x=>qs.push(`(substance_name:"${x}")`));
  t.forEach(x=>qs.push(`(openfda.substance_name:"${x}")`));
  for(const q of qs){
    const got=await tryOne(q);
    if(got) return got;
  }
  return null;
}
function normalizeOpenFDALabel(rec){
  const g = (k)=>Array.isArray(rec[k])?rec[k].join('\n'):rec[k];
  return {
    indications: g('indications_and_usage'),
    dosage: g('dosage_and_administration'),
    contraindications: g('contraindications'),
    warnings_precautions: g('warnings_and_cautions') || g('warnings') || g('precautions'),
    adverse: g('adverse_reactions'),
    interactions: g('drug_interactions'),
    storage: g('storage_and_handling') || g('how_supplied_storage_and_handling'),
    how_supplied: g('how_supplied'),
  };
}
async function dmTry(name){
  const q = encodeURIComponent(name);
  const url = `https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json?drug_name=${q}&pagesize=1&page=1`;
  const j = await (await fetch(url)).json();
  const setid = j?.data?.[0]?.setid;
  if(!setid) return null;
  const url2 = `https://dailymed.nlm.nih.gov/dailymed/services/v2/spls/${setid}.json`;
  const j2 = await (await fetch(url2)).json();
  const sec = j2?.data?.[0]?.sections||[];
  const get = (titleLike) => {
    const hit = sec.find(s=> (s.title||'').toUpperCase().includes(titleLike));
    return hit?.text;
  };
  return {
    indications: get('INDICATIONS'),
    dosage: get('DOSAGE'),
    contraindications: get('CONTRAINDICATIONS'),
    warnings_precautions: get('WARNINGS') || get('PRECAUTIONS'),
    adverse: get('ADVERSE'),
    interactions: get('DRUG INTERACTIONS'),
    storage: get('STORAGE') || get('HOW SUPPLIED, STORAGE AND HANDLING'),
    how_supplied: get('HOW SUPPLIED'),
    _source: 'DailyMed'
  };
}

/* ===== Resolver ===== */
const VITAMIN_MAP = [
  {name:'Vitamin C (Ascorbic acid)', re:/^v(itamin)?\s*c\b/i},
  {name:'Vitamin B6 (Pyridoxine)',   re:/^v(itamin)?\s*b6?\b/i},
  {name:'Vitamin B1 (Thiamine)',     re:/^v(itamin)?\s*b1\b/i},
];
async function resolveOpenFDAName(raw){
  const q=String(raw||'').trim(); if(!q) return {display_inn:'',rxcui:null,openfda_tokens:[]};

  // 0) Alias nội
  for(const a of LOCAL_ALIAS){
    if(a.re.test(q)){
      return { display_inn:a.display, rxcui:null, openfda_tokens:a.tokens || [a.display.toUpperCase()], sources:['Alias(VN)'] };
    }
  }
  // 1) Vitamin map
  for(const v of VITAMIN_MAP){ if(v.re?.test && v.re.test(q)){
    const strict=await rxStrict(v.name.replace(/^Vitamin\s+[A-Z0-9]+\s*\(|\)$/gi,'').trim())||await rxStrict(v.name);
    const rxcui=strict?.rxcui||null;
    return {display_inn:(strict?.name||v.name), rxcui, openfda_tokens:[strict?.name||v.name], sources:['RxNav','Vitamin map'] };
  }}
  // 2) RxNav strict/approx
  const strict=await rxStrict(q)||await rxApproxBest(q);
  if(strict){
    const ins=await rxIngredients(strict.rxcui);
    const tokens=[strict.name, ...ins].filter(Boolean).map(x=>String(x).toUpperCase());
    return {display_inn:strict.name, rxcui:strict.rxcui, openfda_tokens:Array.from(new Set(tokens)).slice(0,8), sources:['RxNav']};
  }
  // 3) fallback
  return {display_inn:q, rxcui:null, openfda_tokens:[q], sources:[]};
}

/* ===== Translate + compact ===== */
async function translateAndCompact(label,tokens){
  if(!window.translateLabelToVi) return label;
  const vi = await window.translateLabelToVi(label,tokens||[]);
  const compact=s=>window.vi_compact?window.vi_compact(s,2,160):s;
  const keys=['indications','dosage','contraindications','warnings_precautions','adverse','interactions','storage','how_supplied'];
  const out={...vi}; keys.forEach(k=>{ if(out[k]) out[k]=compact(out[k]); });
  return out;
}

/* ===== render ===== */
function renderAnswer(title, pairs){
  const items=pairs.filter(p=>p[1] && String(p[1]).trim()).map(([k,v])=>`
    <div class="px-3 py-2 rounded-lg border border-slate-200 bg-white">
      <div class="font-semibold mb-1">${esc(k)}</div>
      <div class="text-[13.5px] leading-relaxed whitespace-pre-wrap">${esc(String(v))}</div>
    </div>`).join('');
  const tip=`<div class="mt-2 text-[12.5px] text-slate-600">⚠️ ${esc('Thông tin chỉ mang tính tham khảo, không thay thế tư vấn y tế.')}</div>`;
  return `<div class="px-3 py-3 rounded-2xl bg-slate-50 border border-slate-200">
    <div class="font-semibold text-lg mb-2">${esc(title)}</div>
    <div class="space-y-2">${items || '<div class="text-sm text-slate-500">Không có mục nào để hiển thị.</div>'}</div>
    ${tip}
  </div>`;
}

/* ===== main answer ===== */
async function drugAnswer(raw){
  const q = String(raw||'').trim(); if(!q) throw new Error('Bạn chưa nhập tên thuốc.');
  const resolved = await resolveOpenFDAName(q);
  const tokens = resolved.openfda_tokens||[];

  // openFDA → DailyMed
  const labelA=await ofdaTry(tokens,resolved.rxcui,resolved.display_inn).catch(()=>null);
  const labelB=labelA?null:await dmTry(resolved.display_inn,resolved.rxcui).catch(()=>null);
  let label = labelA||labelB||{};
  // Local mono fallback nếu vẫn trống
  if((!label.indications && !label.dosage) && LOCAL_MONO[resolved.display_inn]){
    label = { ...LOCAL_MONO[resolved.display_inn], _source:'Local cache' };
  }

  const vi=await translateAndCompact(label,tokens);

  const rows = [
    ['Chỉ định', vi.indications || label.indications],
    ['Liều dùng', vi.dosage || label.dosage],
    ['Chống chỉ định', vi.contraindications || label.contraindications],
    ['Cảnh báo/Thận trọng', vi.warnings_precautions || label.warnings_precautions],
    ['Tác dụng phụ', vi.adverse || label.adverse],
    ['Tương tác', vi.interactions || label.interactions],
    ['Bảo quản', vi.storage || label.storage],
    ['Quy cách/Đóng gói', vi.how_supplied || label.how_supplied],
  ];
  return renderAnswer(aliasLabel(resolved.display_inn || q), rows);
}

async function sendDrugQuery(text){
  ensureDrugUI();
  const input=drugInput();
  const raw=(typeof text==='string' && text.length) ? text : (input ? input.value : '');
  const q=String(raw||'').trim();
  if(!q){ if(input) input.focus(); return; }
  const id=pushLoadingDrug();
  try{
    const html=await drugAnswer(q);
    replaceLoadingDrug(id, html);
  }catch(e){
    replaceLoadingDrug(id, `<div class="text-sm text-rose-600">Lỗi: ${esc(String(e.message||e))}</div>`);
  }
}

/* ===== boot ===== */
document.addEventListener('DOMContentLoaded', ()=>{
  wireTabsForThuoc();
  const tabThuoc=$('#tabThuoc'); if(tabThuoc && tabThuoc.getAttribute('aria-pressed')==='true'){ ensureDrugUI(); }
});
