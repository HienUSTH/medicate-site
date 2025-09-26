/** =========================================================
 *  AI TRA CỨU THUỐC — client-only (không dùng Apps Script)
 *  - Gợi ý tên: RxNav (spelling/approx) + map Vitamin
 *  - Nguồn: openFDA /drug/label → fallback DailyMed
 *  - Dịch Việt + rút gọn gạch đầu dòng (compact)
 *  - Bỏ tham chiếu (2.1), [see …], URL/phone
 *  - Dựa trên đặc tả trong ai.txt của bạn
 * ========================================================= */

(function(){
  /* ---------- Inject UI vào #chatThuoc khi chuyển tab ---------- */
  window.buildDrugUI = function(){
    const root = document.getElementById('chatThuoc');
    if (!root || root.dataset.ready === '1') return;
    root.dataset.ready = '1';

    root.innerHTML = `
      <div class="text-sm text-slate-600 mb-2">
        Hỏi chỉ định, liều dùng, tác dụng phụ… Ví dụ: “ibuprofen liều dùng”, “vitamin C tác dụng phụ (tóm tắt)”.
      </div>
      <div class="flex flex-wrap items-start gap-2">
        <button class="chip px-3 py-1.5 rounded-full border border-slate-300 text-sm hover:bg-emerald-50" data-slot="indications">Chỉ định</button>
        <button class="chip px-3 py-1.5 rounded-full border border-slate-300 text-sm hover:bg-emerald-50" data-slot="dosage">Liều dùng</button>
        <button class="chip px-3 py-1.5 rounded-full border border-slate-300 text-sm hover:bg-emerald-50" data-slot="adverse">TDP</button>
        <button class="chip px-3 py-1.5 rounded-full border border-slate-300 text-sm hover:bg-emerald-50" data-slot="interactions">Tương tác</button>
        <button class="chip px-3 py-1.5 rounded-full border border-slate-300 text-sm hover:bg-emerald-50" data-slot="warnings_precautions">Cảnh báo</button>
        <button class="chip px-3 py-1.5 rounded-full border border-slate-300 text-sm hover:bg-emerald-50" data-slot="pregnancy">Thai kỳ</button>
        <button class="chip px-3 py-1.5 rounded-full border border-slate-300 text-sm hover:bg-emerald-50" data-slot="lactation">Cho bú</button>
        <span class="grow"></span>
        <label class="flex items-center gap-2 text-sm text-slate-600"><input id="cbCompact" type="checkbox" class="accent-emerald-600"> Tóm tắt</label>
      </div>

      <div class="flex items-start gap-2 mt-2">
        <input id="drugQ" list="drugDatalist"
               class="flex-1 px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring focus:ring-emerald-200"
               placeholder="Nhập tên thuốc hoặc câu hỏi..." />
        <button id="drugBtn" class="px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">Hỏi</button>
      </div>
      <datalist id="drugDatalist"></datalist>
      <div id="drugOut" class="mt-3 space-y-3 max-h-[46vh] overflow-y-auto pr-1"></div>
      <div class="text-xs text-slate-500 mt-1">Nguồn: openFDA / DailyMed / RxNav. Không thay thế tư vấn y tế.</div>
    `;

    initDrugHandlers(root);
  };

  /* ---------- Common helpers ---------- */
  const escapeHtml = s => String(s).replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
  const nn = s => String(s||'').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/[^\w\s]/g,' ').replace(/\s+/g,' ').trim();
  function showUser(outEl, text){ outEl.insertAdjacentHTML('beforeend', `<div class="flex justify-end"><div class="chat-bubble chat-user">${escapeHtml(text)}</div></div>`); outEl.scrollTop=outEl.scrollHeight; }
  function showLoading(outEl){ const id='dld-'+Date.now(); outEl.insertAdjacentHTML('beforeend', `<div id="${id}" class="flex"><div class="chat-bubble chat-bot">Đang xử lý…</div></div>`); outEl.scrollTop=outEl.scrollHeight; return id; }
  function replaceLoading(id, html){ const el=document.getElementById(id); if(el) el.outerHTML=`<div class="flex"><div class="chat-bubble chat-bot w-full">${html}</div></div>`; }

  /* ---------- Từ điển & làm sạch để dịch Việt mượt ---------- */
  const RE_DROP = [
    /\(\s*\d+(?:\.\d+)?\s*\)/g,                     // (2.1), (5), (1.2)
    /\[\s*see[^\\\]]*?\]/gi,                        // [see ...]
    /\bsee full prescribing information[^.]*\./gi,
    /\bto report suspected adverse[^.]*\./gi,
    /https?:\/\/\S+/gi, /\bwww\.\S+/gi,             // URL
    /\bcall\s*\d[\d\- ]+\b/gi                       // phone
  ];
  const GLOSSARY = [
    [/indication(s)?/gi,'chỉ định'], [/contraindication(s)?/gi,'chống chỉ định'],
    [/dosage and administration/gi,'liều dùng và cách dùng'], [/dosage/gi,'liều dùng'],
    [/adverse reaction(s)?|side effect(s)?/gi,'tác dụng phụ'],
    [/warning(s)? and precaution(s)?/gi,'cảnh báo và thận trọng'], [/warning(s)?/gi,'cảnh báo'], [/precaution(s)?/gi,'thận trọng'],
    [/drug interaction(s)?/gi,'tương tác thuốc'], [/interaction(s)?/gi,'tương tác'],
    [/pregnancy/gi,'thai kỳ'], [/lactation|nursing/gi,'cho con bú'],
    [/use in specific populations/gi,'đối tượng đặc biệt'],
    [/mechanism of action/gi,'cơ chế tác dụng'],
    [/overdosage|overdose/gi,'quá liều'],
    [/storage and handling/gi,'bảo quản'], [/storage/gi,'bảo quản'],
    [/active ingredient(s)?/gi,'thành phần hoạt chất'], [/inactive ingredient(s)?/gi,'tá dược'],
    [/contraindicated in/gi,'chống chỉ định ở'],
    [/indicated (to|for)/gi,'được chỉ định (để|cho)'],
    [/reduce the risk of/gi,'giảm nguy cơ'],
    [/treat(ment)?/gi,'điều trị'],
    [/adult(s)?/gi,'người lớn'], [/pediatric (patient|use|population)s?/gi,'trẻ em'],
    [/elderly|geriatric/gi,'người cao tuổi'],
    [/hepatic impairment/gi,'suy gan'], [/renal impairment/gi,'suy thận'],
    [/once daily|1 time daily/gi,'1 lần/ngày'],
    [/twice daily|two times daily|bid\b/gi,'2 lần/ngày'],
    [/three times daily|tid\b/gi,'3 lần/ngày'],
    [/with or without food/gi,'có hoặc không kèm thức ăn'],
    [/as needed|prn\b/gi,'khi cần'],
    [/contraindicated/gi,'chống chỉ định'],
    [/administer/gi,'dùng'], [/take/gi,'uống'], [/given/gi,'dùng'],
    [/tablet(s)?/gi,'viên'], [/capsule(s)?/gi,'viên nang'], [/suspension/gi,'hỗn dịch'],
    [/may cause/gi,'có thể gây'], [/should be/gi,'nên'], [/must be/gi,'cần'],
  ];
  function cleanEnglish(s){
    let t=String(s||'');
    RE_DROP.forEach(re=>t=t.replace(re,''));
    // bỏ số mục đầu câu kiểu “6.”, “7 ” v.v.
    t=t.replace(/(^|\n)\s*\d+\s*[:.-]?\s*/g,'$1');
    // gộp khoảng trắng
    return t.replace(/\s{2,}/g,' ').trim();
  }
  function viReplace(s){
    let t=' '+s+' ';
    GLOSSARY.forEach(([re,vn])=>{ t=t.replace(re,vn); });
    // một số cụm diễn đạt
    t=t.replace(/\bare indicated\b/gi,'được chỉ định');
    t=t.replace(/\buse\b/gi,'sử dụng');
    t=t.replace(/\bpatients?\b/gi,'bệnh nhân');
    t=t.replace(/\bcontraindications?:?/gi,'chống chỉ định:');
    t=t.replace(/\bwarnings?\b/gi,'cảnh báo');
    t=t.replace(/\bprecautions?\b/gi,'thận trọng');
    return t.trim();
  }
  function bulletsVN(text, max=8, lim=200){
    const src = viReplace(cleanEnglish(text));
    const parts = src
      .split(/[\n]+|(?<=[\.\!\?…;:])\s+/)
      .map(x=>x.trim())
      .filter(x=>x && x.length>4 && !/^(xem|see)/i.test(x));
    const out=[];
    for(let i=0;i<parts.length && out.length<max;i++){
      let p=parts[i];
      if(p.length>lim) p=p.slice(0,lim-1).replace(/\s+\S*$/,'')+'…';
      // gạch đầu dòng, bỏ dấu • lặp từ nguồn
      p=p.replace(/^•\s*/,'');
      out.push('• '+p);
    }
    return out.join('<br>');
  }

  /* ---------- Slot picking theo câu hỏi ---------- */
  function pickSlots(q, label){
    const s=nn(q); const p=[];
    const want = (key, defVN) => label[key] ? p.push([defVN, label[key]]) : null;
    if (/(chi dinh|cong dung|uses|purpose)/.test(s)) want('indications','Chỉ định');
    if (/(lieu|cach dung|directions|administration)/.test(s)) want('dosage','Liều dùng');
    if (/(chong chi dinh)/.test(s)) want('contraindications','Chống chỉ định');
    if (/(canh bao|than trong|warnings|precautions)/.test(s)) want('warnings_precautions','Cảnh báo/Thận trọng');
    if (/(tac dung phu|adr|adverse|side effects?)/.test(s)) want('adverse','Tác dụng phụ');
    if (/(tuong tac|interactions)/.test(s)) want('interactions','Tương tác');
    if (/(thai|mang thai|pregnancy)/.test(s)) want('pregnancy','Thai kỳ');
    if (/(cho bu|lactation|nursing)/.test(s)) want('lactation','Cho con bú');
    if(!p.length){
      want('indications','Chỉ định'); want('dosage','Liều dùng');
      want('warnings_precautions','Cảnh báo/Thận trọng'); want('adverse','Tác dụng phụ');
      want('interactions','Tương tác');
    }
    return p;
  }

  /* ---------- RxNav suggestions ---------- */
  const RXNAV = 'https://rxnav.nlm.nih.gov/REST';
  const VIT = [
    {re:/\bvitamin\s*a\b/i, name:'retinol'},
    {re:/\bvitamin\s*b1\b|\bthiamin(e)?\b/i,name:'thiamine'},
    {re:/\bvitamin\s*b2\b|\briboflavin\b/i, name:'riboflavin'},
    {re:/\bvitamin\s*b3\b|\bniacin(amid(e)?)?\b/i, name:'niacinamide'},
    {re:/\bvitamin\s*b6\b|\bpyridoxine\b/i, name:'pyridoxine'},
    {re:/\bvitamin\s*b12\b|\bcobalamin\b/i, name:'cyanocobalamin'},
    {re:/\bvitamin\s*c\b|\bascorbic acid\b/i, name:'ascorbic acid'},
    {re:/\bvitamin\s*d3\b|\bcholecalciferol\b/i, name:'cholecalciferol'},
    {re:/\bvitamin\s*d\b|\bergocalciferol\b/i,  name:'ergocalciferol'},
    {re:/\bvitamin\s*e\b|\btocopherol\b/i,   name:'alpha-tocopherol'},
    {re:/\bvitamin\s*k2\b|\bmenaquinone\b/i, name:'menaquinone'},
    {re:/\bvitamin\s*k\b|\bphytonadione\b/i, name:'phytonadione'}
  ];
  async function rxSpellings(q){ try{ const u=`${RXNAV}/spellingsuggestions.json?name=${encodeURIComponent(q)}`; const js=await fetch(u).then(r=>r.json()); return js?.suggestionGroup?.suggestion||[]; }catch(e){return[]} }
  async function rxApprox(q,max=12){ try{ const u=`${RXNAV}/approximateTerm.json?term=${encodeURIComponent(q)}&maxEntries=${max}`; const js=await fetch(u).then(r=>r.json()); return (js?.approximateGroup?.candidate||[]).map(x=>x?.name).filter(Boolean); }catch(e){return[]} }
  function vitaminSuggest(q){ const out=[]; if(/vitamin\s*$/i.test(q)||/vitamin\s+[a-z0-9]?$/i.test(q)){ VIT.forEach(v=>out.push(v.name)); } else { VIT.forEach(v=>{ if(v.re.test(q)) out.push(v.name); }); } return out; }

  /* ---------- openFDA & DailyMed ---------- */
  const FDA = 'https://api.fda.gov/drug/label.json';
  async function fdaByTokens(tokens){
    if(tokens?.length){
      const parts=Array.from(new Set(tokens)).slice(0,4).map(t=>`openfda.substance_name:"${t.toUpperCase()}"`);
      const url=`${FDA}?search=${encodeURIComponent(parts.join(' AND '))}&limit=1&sort=effective_time:desc`;
      const r=await fetch(url); if(r.status===404) return null; if(!r.ok) throw new Error('openFDA '+r.status);
      const js=await r.json(); return js?.results?.[0]||null;
    }
    return null;
  }
  async function fdaByGeneric(inn){
    const url=`${FDA}?search=${encodeURIComponent('openfda.generic_name:"'+inn.toUpperCase()+'"')}&limit=1&sort=effective_time:desc`;
    const r=await fetch(url); if(r.status===404) return null; if(!r.ok) throw new Error('openFDA '+r.status);
    const js=await r.json(); return js?.results?.[0]||null;
  }
  async function dailymedFirstByName(q){
    try{
      const list=await fetch(`https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json?drug_name=${encodeURIComponent(q)}&name_type=both&pagesize=1&page=1`).then(r=>r.json());
      const setid=list?.data?.[0]?.setid; if(!setid) return null;
      const xml=await fetch(`https://dailymed.nlm.nih.gov/dailymed/services/v2/spls/${encodeURIComponent(setid)}.xml`).then(r=>r.text());
      const grab=re=>{ const m=xml.match(re); return m?m[1].replace(/<[^>]+>/g,' ').replace(/\s{2,}/g,' ').trim():null; };
      return {
        indications:grab(/<title>INDICATIONS(?: AND USAGE)?<\/title>[\s\S]*?<text>([\s\S]*?)<\/text>/i),
        dosage:grab(/<title>DOSAGE(?: AND ADMINISTRATION)?<\/title>[\s\S]*?<text>([\s\S]*?)<\/text>/i),
        warnings_precautions:grab(/<title>WARNINGS[\s\S]*?<\/title>[\s\S]*?<text>([\s\S]*?)<\/text>/i),
        adverse:grab(/<title>ADVERSE REACTIONS<\/title>[\s\S]*?<text>([\s\S]*?)<\/text>/i),
        interactions:grab(/<title>DRUG INTERACTIONS<\/title>[\s\S]*?<text>([\s\S]*?)<\/text>/i),
        storage:grab(/<title>STORAGE[\s\S]*?<\/title>[\s\S]*?<text>([\s\S]*?)<\/text>/i)
      };
    }catch(e){ return null; }
  }
  function pickTxt(obj,key){ const v=obj?.[key]; if(!v) return null; if(Array.isArray(v)) return v.join('\n\n'); if(typeof v==='string') return v; return null; }
  function normalizeOpenFDALabel(r){
    const raw={
      indications:pickTxt(r,'indications_and_usage'),
      dosage:pickTxt(r,'dosage_and_administration'),
      contraindications:pickTxt(r,'contraindications'),
      warnings_precautions:pickTxt(r,'warnings_and_cautions')||pickTxt(r,'warnings')||pickTxt(r,'precautions'),
      adverse:pickTxt(r,'adverse_reactions'),
      interactions:pickTxt(r,'drug_interactions')||pickTxt(r,'drug_and_or_laboratory_test_interactions'),
      pregnancy:pickTxt(r,'pregnancy'), lactation:pickTxt(r,'lactation'),
      specific_populations:pickTxt(r,'use_in_specific_populations'),
      mechanism:pickTxt(r,'mechanism_of_action')||pickTxt(r,'clinical_pharmacology'),
      overdosage:pickTxt(r,'overdosage'), storage:pickTxt(r,'storage_and_handling'),
      how_supplied:pickTxt(r,'how_supplied'), description:pickTxt(r,'description'),
      active_ingredients:Array.isArray(r?.active_ingredient)?r.active_ingredient.join('\n'):null,
      inactive_ingredients:Array.isArray(r?.inactive_ingredient)?r.inactive_ingredient.join('\n'):null
    };
    const out={}; Object.keys(raw).forEach(k=>{ out[k]=raw[k]?cleanEnglish(raw[k]):null; });
    return out;
  }
  async function getUnifiedLabel(name){
    let tokens=[];
    for(const v of VIT){ if(v.re.test(name)){ tokens=[v.name]; break; } }
    let hit=null;
    if(!hit && tokens.length) try{ hit=await fdaByTokens(tokens); }catch(e){}
    if(!hit) try{ hit=await fdaByGeneric(name); }catch(e){}
    if(hit) return normalizeOpenFDALabel(hit);
    const dm=await dailymedFirstByName(name); if(dm) return dm;
    return null;
  }

  /* ---------- Render ---------- */
  function renderAnswer(name, label, compact){
    const rows = [
      ['Chỉ định',label.indications],
      ['Liều dùng',label.dosage],
      ['Chống chỉ định',label.contraindications],
      ['Cảnh báo/Thận trọng',label.warnings_precautions],
      ['Tác dụng phụ',label.adverse],
      ['Tương tác',label.interactions]
    ].filter(x=>x[1]);

    const tr = rows.map(([k,v])=>{
      const body = compact ? bulletsVN(v, 8, 220)
                           : bulletsVN(v, 50, 800); // vẫn bullet hoá để đọc dễ
      return `<tr><td class="px-2 py-1.5 font-medium bg-slate-50">${escapeHtml(k)}</td><td class="px-2 py-1.5">${body}</td></tr>`;
    }).join('');

    return `
      <div class="font-medium mb-2">${escapeHtml(name.toUpperCase())}</div>
      <div class="overflow-auto max-h-[40vh] rounded-lg border">
        <table class="w-full text-[13px]">
          <thead><tr><th class="px-2 py-1.5 text-left bg-emerald-600 text-white">Mục</th><th class="px-2 py-1.5 text-left bg-emerald-600 text-white">Nội dung</th></tr></thead>
          <tbody>${tr}</tbody>
        </table>
      </div>
      <div class="text-xs text-slate-500 mt-2">⚠️ Thông tin chỉ mang tính tham khảo, không thay thế tư vấn y tế.</div>
    `;
  }

  /* ---------- Handlers ---------- */
  function initDrugHandlers(root){
    const qEl   = root.querySelector('#drugQ');
    const btn   = root.querySelector('#drugBtn');
    const outEl = root.querySelector('#drugOut');
    const dl    = root.querySelector('#drugDatalist');
    const cbCompact = root.querySelector('#cbCompact');

    // suggestions
    let timer=null,last='';
    qEl.addEventListener('input', ()=>{
      const v=qEl.value.trim(); if(v.length<2||v===last){ dl.innerHTML=''; return; }
      last=v; clearTimeout(timer);
      timer=setTimeout(async()=>{
        const vit=vitaminSuggest(v), sp=await rxSpellings(v), ap=await rxApprox(v,12);
        const list=[...vit,...sp,...ap]; const seen=new Set(), dedup=list.filter(x=>{x=String(x);const k=x.toLowerCase(); if(seen.has(k))return false; seen.add(k); return true;}).slice(0,12);
        dl.innerHTML=dedup.map(s=>`<option value="${escapeHtml(s)}">`).join('');
      },160);
    });

    function submit(q){
      const text=(q??qEl.value).trim(); if(!text) return;
      showUser(outEl,text); qEl.value='';
      const id=showLoading(outEl);
      (async()=>{
        try{
          const label = await getUnifiedLabel(text);
          if(!label){ replaceLoading(id, `<div class="text-slate-700">Không tìm thấy tài liệu/nhãn phù hợp cho “${escapeHtml(text)}”. Hãy thử tên hoạt chất (INN) hoặc tên khác.</div>`); return; }
          const html = renderAnswer(text, label, cbCompact.checked);
          replaceLoading(id, html);
        }catch(err){
          replaceLoading(id, `<div class="text-rose-600">Lỗi: ${escapeHtml(err.message||String(err))}</div>`);
        }
      })();
    }

    btn.addEventListener('click', ()=>submit());
    qEl.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); submit(); } });
    root.querySelectorAll('.chip').forEach(ch=>{
      ch.addEventListener('click', ()=>{
        const v=qEl.value.trim()||'ibuprofen'; // nếu trống thì demo
        qEl.value = `${v} ${ch.innerText.toLowerCase()}`;
        submit(qEl.value);
      });
    });
  }
})();
