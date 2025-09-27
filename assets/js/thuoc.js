/** =========================================================
 *  AI TRA CỨU THUỐC — thuần client (no Apps Script)
 *  - Suggest: RxNav spellings/approx + vitamin map
 *  - Fetch: openFDA /drug/label → fallback DailyMed
 *  - Render: các mục chọn lọc, gạch đầu dòng ngắn gọn
 *  - Dịch/chuẩn hoá tiếng Việt: từ điển + quy tắc cụm từ
 *  - Loại bỏ ngoặc tham chiếu (2.1), [see …], số hotline…
 *  - Chỉ giữ 1–3 ý chính/mục (compact), bullet •
 *  - Hoạt động song song với “AI Tủ” trong kho.html
 * ========================================================= */

(function(){
  /* ---------- Gắn UI khi bật tab "Tra cứu thuốc" ---------- */
  window.buildDrugUI = function(){
    const root = document.getElementById('chatThuoc');
    if (!root || root.dataset.inited === '1') return;

    root.dataset.inited = '1';
    root.innerHTML = `
      <div class="text-sm text-slate-600 mb-2">
        Nhập tên thuốc/hoạt chất để xem chỉ định, liều dùng, tác dụng phụ…
      </div>

      <div class="flex items-start gap-2">
        <input id="drugQ" list="drugDatalist"
               class="flex-1 px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring focus:ring-sky-200"
               placeholder="Ví dụ: ibuprofen, vitamin C, metformin…" />
        <button id="drugBtn"
                class="px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">Hỏi</button>
      </div>
      <datalist id="drugDatalist"></datalist>

      <div id="drugOut" class="mt-3 space-y-3 max-h-[46vh] overflow-y-auto pr-1"></div>
      <div class="text-xs text-slate-500 mt-1">
        Nguồn: openFDA / DailyMed / RxNav. Thông tin chỉ mang tính tham khảo, không thay thế tư vấn y tế.
      </div>
    `;

    const qEl   = root.querySelector('#drugQ');
    const btn   = root.querySelector('#drugBtn');
    const outEl = root.querySelector('#drugOut');
    const dl    = root.querySelector('#drugDatalist');

    /* ---------- Helpers UI ---------- */
    const escapeHtml = (s)=> String(s??'').replace(/[&<>"']/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[m]));

    const showUser  = (t)=>{ outEl.insertAdjacentHTML('beforeend',
      `<div class="flex justify-end"><div class="chat-bubble chat-user">${escapeHtml(t)}</div></div>`); outEl.scrollTop=outEl.scrollHeight; };
    const showLoad  = ()=>{ const id='dld-'+Date.now(); outEl.insertAdjacentHTML('beforeend',
      `<div id="${id}" class="flex"><div class="chat-bubble chat-bot">Đang xử lý…</div></div>`); outEl.scrollTop=outEl.scrollHeight; return id; };
    const swapLoad  = (id, html)=>{ const el=document.getElementById(id); if(!el) return;
      el.outerHTML=`<div class="flex"><div class="chat-bubble chat-bot w-full">${html}</div></div>`; };

    /* ---------- Chuẩn hoá chuỗi ---------- */
    const nn = s => String(s||'').toLowerCase()
      .normalize('NFD').replace(/\p{Diacritic}/gu,'')
      .replace(/[^\w\s]/g,' ').replace(/\s+/g,' ').trim();

    const wantCompact = (q)=> /(tom tat|t[óo]m t[ắa]t|ngan|gach dau dong)/i.test(String(q));

    /* ---------- Gợi ý tên: RxNav + vitamin map ---------- */
    const RXNAV='https://rxnav.nlm.nih.gov/REST';
    const VIT = [
      {re:/\bvitamin\s*a\b/i,                 name:'retinol'},
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

    async function rxSpellings(q){
      try{
        const u=`${RXNAV}/spellingsuggestions.json?name=${encodeURIComponent(q)}`;
        const js=await fetch(u).then(r=>r.json());
        return js?.suggestionGroup?.suggestion||[];
      }catch{ return []; }
    }
    async function rxApprox(q, max=12){
      try{
        const u=`${RXNAV}/approximateTerm.json?term=${encodeURIComponent(q)}&maxEntries=${max}`;
        const js=await fetch(u).then(r=>r.json());
        const c=js?.approximateGroup?.candidate||[];
        return c.map(x=>x?.name).filter(Boolean);
      }catch{ return []; }
    }
    function vitaminSuggest(q){
      const out=[]; 
      if (/vitamin\s*$/i.test(q) || /vitamin\s+[a-z0-9]?$/i.test(q)){
        VIT.forEach(v=>out.push(v.name));
      }else{
        VIT.forEach(v=>{ if(v.re.test(q)) out.push(v.name); });
      }
      return out;
    }

    let sgTimer=null, lastSg='';
    qEl.addEventListener('input', ()=>{
      const v=qEl.value.trim();
      if (v.length<2 || v===lastSg){ dl.innerHTML=''; return; }
      lastSg=v; clearTimeout(sgTimer);
      sgTimer=setTimeout(async ()=>{
        const list=[...vitaminSuggest(v), ...(await rxSpellings(v)), ...(await rxApprox(v,12))];
        const seen=new Set();
        const dedup=list.filter(x=>{ const k=String(x).toLowerCase(); if(seen.has(k)) return false; seen.add(k); return true; }).slice(0,12);
        dl.innerHTML = dedup.map(s=>`<option value="${escapeHtml(s)}">`).join('');
      }, 160);
    });

    /* ---------- Fetch nhãn: openFDA → DailyMed ---------- */
    const FDA='https://api.fda.gov/drug/label.json';
    async function fdaByGeneric(inn){
      const url = `${FDA}?search=${encodeURIComponent('openfda.generic_name:"'+inn.toUpperCase()+'"')}&limit=1&sort=effective_time:desc`;
      const r = await fetch(url); if (r.status===404) return null;
      if (!r.ok) throw new Error('openFDA '+r.status);
      const js = await r.json();
      return js?.results?.[0] || null;
    }
    async function fdaByTokens(tokens){
      if (!tokens?.length) return null;
      const parts = Array.from(new Set(tokens)).slice(0,4).map(t=>`openfda.substance_name:"${t.toUpperCase()}"`);
      const url   = `${FDA}?search=${encodeURIComponent(parts.join(' AND '))}&limit=1&sort=effective_time:desc`;
      const r = await fetch(url); if (r.status===404) return null;
      if (!r.ok) throw new Error('openFDA '+r.status);
      const js = await r.json();
      return js?.results?.[0] || null;
    }
    async function dailymedFirstByName(q){
      try{
        const list = await fetch(`https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json?drug_name=${encodeURIComponent(q)}&name_type=both&pagesize=1&page=1`).then(r=>r.json());
        const setid = list?.data?.[0]?.setid; if (!setid) return null;
        const xml   = await fetch(`https://dailymed.nlm.nih.gov/dailymed/services/v2/spls/${encodeURIComponent(setid)}.xml`).then(r=>r.text());
        return { setid, xml };
      }catch{ return null; }
    }

    const pickTxt=(o,k)=> Array.isArray(o?.[k])?o[k].join('\n\n'): (typeof o?.[k]==='string'?o[k]:null);

    function sectionizeAnywhere(text){
      const HEADS={
        boxed_warning:['BOXED WARNING','BLACK BOX WARNING','WARNING:'],
        indications:['INDICATIONS AND USAGE','INDICATIONS','USES','PURPOSE'],
        dosage:['DOSAGE AND ADMINISTRATION','DOSAGE','ADMINISTRATION','DIRECTIONS'],
        contraindications:['CONTRAINDICATIONS'],
        warnings_precautions:['WARNINGS AND PRECAUTIONS','WARNINGS','PRECAUTIONS','CAUTIONS','WHEN USING','STOP USE','ASK DOCTOR'],
        adverse:['ADVERSE REACTIONS','SIDE EFFECTS'],
        interactions:['DRUG INTERACTIONS','INTERACTIONS'],
        pregnancy:['PREGNANCY'],
        lactation:['LACTATION','NURSING MOTHERS'],
        specific_populations:['USE IN SPECIFIC POPULATIONS','SPECIFIC POPULATIONS'],
        mechanism:['MECHANISM OF ACTION','CLINICAL PHARMACOLOGY'],
        overdosage:['OVERDOSAGE','OVERDOSE'],
        storage:['STORAGE AND HANDLING','STORAGE'],
        how_supplied:['HOW SUPPLIED','PACKAGE'],
        active_ingredients:['SUPPLEMENT FACTS','ACTIVE INGREDIENTS','ACTIVE INGREDIENT','COMPOSITION'],
        inactive_ingredients:['INACTIVE INGREDIENTS','OTHER INGREDIENTS','EXCIPIENTS'],
        description:['DESCRIPTION']
      };
      const map={}; Object.keys(HEADS).forEach(k=>HEADS[k].forEach(s=>map[s]=k));
      const alt=Object.keys(map).sort((a,b)=>b.length-a.length).map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
      const re=new RegExp(`\\b(${alt})\\b\\s*[:\\-–]?`,'gi');
      const S=String(text||'').replace(/\r/g,'\n'); const marks=[]; let m;
      while((m=re.exec(S))!==null){ const head=(m[1]||'').toUpperCase().replace(/\s+/g,' ').trim(); const key=map[head]; if(!key)continue; marks.push({idx:m.index+m[1].length,key}); }
      if(!marks.length) return {};
      marks.sort((a,b)=>a.idx-b.idx);
      const out={};
      for(let i=0;i<marks.length;i++){
        const start=marks[i].idx, end=(i+1<marks.length)?marks[i+1].idx:S.length;
        const chunk=S.slice(start,end).trim(); if(!chunk) continue;
        out[marks[i].key]=(out[marks[i].key]?out[marks[i].key]+'\n\n':'')+chunk;
      }
      return out;
    }

    function normalizeOpenFDALabel(r){
      const raw={
        indications:pickTxt(r,'indications_and_usage'),
        dosage:pickTxt(r,'dosage_and_administration'),
        contraindications:pickTxt(r,'contraindications'),
        warnings_precautions:pickTxt(r,'warnings_and_cautions')||pickTxt(r,'warnings')||pickTxt(r,'precautions'),
        adverse:pickTxt(r,'adverse_reactions'),
        interactions:pickTxt(r,'drug_interactions')||pickTxt(r,'drug_and_or_laboratory_test_interactions'),
        pregnancy:pickTxt(r,'pregnancy'),
        lactation:pickTxt(r,'lactation'),
        specific_populations:pickTxt(r,'use_in_specific_populations'),
        mechanism:pickTxt(r,'mechanism_of_action')||pickTxt(r,'clinical_pharmacology'),
        overdosage:pickTxt(r,'overdosage'),
        storage:pickTxt(r,'storage_and_handling'),
        boxed_warning:pickTxt(r,'boxed_warning'),
        description:pickTxt(r,'description'),
        how_supplied:pickTxt(r,'how_supplied'),
        active_ingredients:Array.isArray(r?.active_ingredient)?r.active_ingredient.join('\n'):null,
        inactive_ingredients:Array.isArray(r?.inactive_ingredient)?r.inactive_ingredient.join('\n'):null
      };

      // Bổ sung: tìm tiêu đề rải rác trong các trường
      const pool={}; const keys=['dosage','warnings_precautions','description','indications','adverse','interactions','storage','how_supplied'];
      keys.forEach(k=>{ const seg=sectionizeAnywhere(raw[k]); Object.keys(seg).forEach(h=>{ pool[h]=(pool[h]||[]).concat(seg[h]); });});

      const out={}; const KEYS=[
        'boxed_warning','indications','dosage','contraindications','warnings_precautions','adverse','interactions','pregnancy','lactation','specific_populations','mechanism','overdosage','storage','how_supplied','active_ingredients','inactive_ingredients'
      ];
      KEYS.forEach(k=>{ let v=raw[k]||(pool[k]&&pool[k].join('\n\n'))||''; v=v.replace(/\n{3,}/g,'\n\n').trim(); out[k]=v||null; });
      return out;
    }

    async function getUnifiedLabel(name){
      // vitamin tokens (ưu tiên)
      let tokens=[]; for(const v of VIT){ if(v.re.test(name)){ tokens=[v.name]; break; } }
      let hit=null;
      if (!hit && tokens.length){ try{ hit=await fdaByTokens(tokens); }catch{} }
      if (!hit){ try{ hit=await fdaByGeneric(name); }catch{} }
      if (!hit){
        const dm=await dailymedFirstByName(name);
        if(dm?.xml){
          const grab=(re)=>{ const m=dm.xml.match(re); return m?m[1].replace(/<[^>]+>/g,' ').replace(/\s{2,}/g,' ').trim():null; };
          return {
            indications: grab(/<title>INDICATIONS(?: AND USAGE)?<\/title>[\s\S]*?<text>([\s\S]*?)<\/text>/i),
            dosage:      grab(/<title>DOSAGE(?: AND ADMINISTRATION)?<\/title>[\s\S]*?<text>([\s\S]*?)<\/text>/i),
            warnings_precautions: grab(/<title>WARNINGS[\s\S]*?<\/title>[\s\S]*?<text>([\s\S]*?)<\/text>/i),
            adverse:     grab(/<title>ADVERSE REACTIONS<\/title>[\s\S]*?<text>([\s\S]*?)<\/text>/i),
            interactions:grab(/<title>DRUG INTERACTIONS<\/title>[\s\S]*?<text>([\s\S]*?)<\/text>/i),
            storage:     grab(/<title>STORAGE[\s\S]*?<\/title>[\s\S]*?<text>([\s\S]*?)<\/text>/i)
          };
        }
        return null;
      }
      return normalizeOpenFDALabel(hit);
    }

    /* ---------- Dịch + rút gọn tiếng Việt ---------- */
    // 1) dọn rác: ngoặc, tham chiếu, hotline, URL
    function stripRefs(s){
      return String(s||'')
        .replace(/\[[^\]]+\]/g,' ')
        .replace(/\(\s*(see|xem)[^)]+\)/gi,' ')
        .replace(/\(\s*\d+(?:\.\d+)*\s*\)/g,' ')
        .replace(/https?:\/\/\S+/g,' ')
        .replace(/\b1-800-FDA-\d+\b|\b1-800-\d{3}-\d{4}\b/gi,' ')
        .replace(/contact\s+.*?(fda|manufacturer)[^\.]*\./gi,' ')
        .replace(/[®©™]/g,' ');
    }

    // 2) từ điển thuật ngữ (ưu tiên cụm dài → ngắn)
    const GLOSS = [
      // routes/đường dùng
      [/\bintravenous\b/gi, 'tĩnh mạch'],
      [/\bintramuscular\b/gi, 'tiêm bắp'],
      [/\boral(?:ly)?\b/gi, 'uống'],
      [/\bsubcutaneous\b/gi, 'dưới da'],
      [/\btopical(?:ly)?\b/gi, 'dùng ngoài'],
      [/\bIV\b/g, 'tĩnh mạch'],
      [/\bIM\b/g, 'tiêm bắp'],

      // dạng bào chế & đơn vị
      [/\btablet(s)?\b/gi, 'viên nén'],
      [/\bcapsule(s)?\b/gi, 'viên nang'],
      [/\bsuspension\b/gi, 'hỗn dịch'],
      [/\bsolution\b/gi, 'dung dịch'],
      [/\binjection\b/gi, 'tiêm'],
      [/\bdrop(s)?\b/gi, 'giọt'],
      [/\bpatch\b/gi, 'miếng dán'],

      // tần suất
      [/\bonce daily\b/gi, '1 lần/ngày'],
      [/\btwice daily\b/gi, '2 lần/ngày'],
      [/\bthree times daily\b/gi, '3 lần/ngày'],
      [/\bonce\b/gi, '1 lần'],
      [/\btwice\b/gi, '2 lần'],

      // cụm ý nghĩa lâm sàng
      [/\bis indicated for\b/gi, 'được chỉ định để'],
      [/\bindicated\b/gi, 'được chỉ định'],
      [/\bto reduce the risk of\b/gi, 'giảm nguy cơ'],
      [/\bcontraindicated in\b/gi, 'chống chỉ định ở'],
      [/\bcontraindications?\b/gi, 'chống chỉ định'],
      [/\badverse reactions?\b/gi, 'tác dụng phụ'],
      [/\bside effects?\b/gi, 'tác dụng phụ'],
      [/\bwarnings and precautions\b/gi, 'cảnh báo/thận trọng'],
      [/\bprecautions\b/gi, 'thận trọng'],
      [/\bwarnings\b/gi, 'cảnh báo'],
      [/\binteractions?\b/gi, 'tương tác'],
      [/\boverdose|overdosage\b/gi, 'quá liều'],
      [/\bpregnancy\b/gi, 'thai kỳ'],
      [/\blactation|nursing\b/gi, 'cho con bú'],
      [/\buse in specific populations\b/gi, 'sử dụng ở nhóm đặc biệt'],
      [/\bmechanism of action\b/gi, 'cơ chế tác dụng'],
      [/\bkeep out of reach of children\b/gi, 'Để xa tầm tay trẻ em'],
      [/\bcall a doctor or poison control immediately\b/gi, 'Liên hệ bác sĩ hoặc Trung tâm Chống độc ngay'],
      [/\bconsult a doctor\b/gi, 'tham khảo ý kiến bác sĩ'],

      // chủ thể
      [/\badults?\b/gi, 'người lớn'],
      [/\bpediatric( patients)?\b/gi, 'trẻ em'],
      [/\belderly\b/gi, 'người cao tuổi'],
      [/\bpatients?\b/gi, 'người bệnh'],
      [/\bchildren\b/gi, 'trẻ em'],

      // từ vựng chung
      [/\bdose\b/gi, 'liều'],
      [/\bdosing\b/gi, 'liều dùng'],
      [/\bdosage\b/gi, 'liều dùng'],
      [/\badminister(?:ed|ing)?\b/gi, 'dùng'],
      [/\btake\b/gi, 'uống'],
      [/\bwith or without food\b/gi, 'có thể dùng cùng hoặc không cùng thức ăn']
    ];

    // 3) quy tắc rút gọn câu (đưa về bullet ngắn)
    function toBullets(text, max=3, lim=180){
      const s = stripRefs(text)
        .replace(/•/g,'\n')
        .replace(/[-–—]\s+/g,' ')
        .replace(/\s{2,}/g,' ')
        .trim();

      // tách câu
      const raw = s.split(/\n+|(?<=[\.\?!;:])\s+/).map(x=>x.trim()).filter(Boolean);

      // dịch từng câu
      const out = [];
      for (let i=0; i<raw.length && out.length<max; i++){
        let t = raw[i];

        // chặn lỗi "IM" → immediately
        t = t.replace(/\bIM\b/g,'tiêm bắp').replace(/\bIV\b/g,'tĩnh mạch');

        // từ điển cụm
        GLOSS.forEach(([re,vi])=>{ t = t.replace(re, vi); });

        // một số mẫu thường gặp
        t = t
          .replace(/\bUsual\b\s*(adult)?\s*(dose|dosing|dosage)\s*(is|:)?/i, 'Liều người lớn thường dùng:')
          .replace(/\brecommended\b\s*(starting)?\s*dose\s*(is|:)?/i, 'Liều khởi đầu khuyến cáo:')
          .replace(/\bas directed by a (healthcare|licensed) professional\b/gi, 'theo chỉ định của bác sĩ')
          .replace(/\bas prescribed by a (healthcare|licensed) medical (practitioner|professional)\b/gi, 'theo chỉ định của bác sĩ')
          .replace(/\bto be used\b/gi, 'dùng')
          .replace(/\bif necessary\b/gi, 'nếu cần')
          .replace(/\bmonitor\b/gi, 'theo dõi')
          .replace(/\bassess\b/gi, 'đánh giá');

        // dọn dấu câu & khoảng trắng
        t = t
          .replace(/\(\s*\)/g,'')
          .replace(/\s*,\s*/g, ', ')
          .replace(/\s*\.\s*/g, '. ')
          .replace(/\s*;\s*/g, '; ')
          .replace(/\s*:\s*/g, ': ')
          .replace(/\s{2,}/g, ' ')
          .trim();

        // viết hoa đầu câu
        if (t && /[a-zA-ZÀ-ỹ]/.test(t[0])) t = t[0].toUpperCase() + t.slice(1);

        // cắt ngắn
        if (t.length>lim) t = t.slice(0, lim-1).replace(/\s+\S*$/,'') + '…';

        // bỏ câu hotline/URLs/too generic
        if (/^\s*(visit|see full prescribing|to report suspected)/i.test(t)) continue;

        out.push('• ' + t);
      }

      // nếu rỗng, trả chấm gạch
      if (!out.length) out.push('• (chưa có thông tin phù hợp từ nhãn công khai)');

      return out.join('<br>');
    }

    // 4) chọn slot theo câu hỏi
    function pickSlots(q, label){
      const s = nn(q);
      const P = [];
      if (/(chi dinh|cong dung|uses|purpose)/.test(s)) P.push(['Chỉ định', label.indications]);
      if (/(lieu|cach dung|directions|administration)/.test(s)) P.push(['Liều dùng', label.dosage]);
      if (/(chong chi dinh)/.test(s)) P.push(['Chống chỉ định', label.contraindications]);
      if (/(canh bao|than trong|warnings|precautions)/.test(s)) P.push(['Cảnh báo/Thận trọng', label.warnings_precautions]);
      if (/(tac dung phu|adr|adverse|side effect)/.test(s)) P.push(['Tác dụng phụ', label.adverse]);
      if (/(tuong tac|interaction)/.test(s)) P.push(['Tương tác', label.interactions]);
      if (/(thai|pregnancy)/.test(s)) P.push(['Thai kỳ', label.pregnancy]);
      if (/(cho bu|lactation|nursing)/.test(s)) P.push(['Cho con bú', label.lactation]);

      // nếu không chỉ định mục → mặc định 3–4 mục cốt lõi
      if (!P.length){
        P.push(['Chỉ định', label.indications]);
        P.push(['Liều dùng', label.dosage]);
        P.push(['Cảnh báo/Thận trọng', label.warnings_precautions]);
        P.push(['Tác dụng phụ', label.adverse]);
      }
      return P.filter(x=>x[1]);
    }

    /* ---------- Render ---------- */
    function renderAnswer(name, label, q){
      const compact = true; // luôn gọn (khớp mong muốn UI hẹp)
      const slots   = pickSlots(q, label);
      const rows    = slots.length ? slots : [['Chỉ định',label.indications],['Liều dùng',label.dosage]];
      const tr = rows.map(([k,v])=>{
        const body = compact ? toBullets(v, 3, 180) : escapeHtml(String(v||'')).replace(/\n/g,'<br>');
        return `<tr>
          <td class="px-2 py-1.5 font-medium bg-slate-50 align-top w-[28%]">${escapeHtml(k)}</td>
          <td class="px-2 py-1.5">${body}</td>
        </tr>`;
      }).join('');

      return `
        <div class="font-semibold mb-2">${escapeHtml(name).toUpperCase()}</div>
        <div class="overflow-auto max-h-[40vh] rounded-lg border">
          <table class="w-full text-[13px]">
            <thead>
              <tr><th class="px-2 py-1.5 text-left bg-emerald-600 text-white">Mục</th>
                  <th class="px-2 py-1.5 text-left bg-emerald-600 text-white">Nội dung</th></tr>
            </thead>
            <tbody>${tr}</tbody>
          </table>
        </div>
        <div class="text-xs text-slate-500 mt-2">⚠️ Thông tin chỉ mang tính tham khảo, không thay thế tư vấn y tế.</div>
      `;
    }

    /* ---------- Submit ---------- */
    async function submit(){
      const q = (qEl.value||'').trim(); if(!q) return;
      showUser(q);
      const id = showLoad();
      try{
        // tên dùng nguyên văn; phần “slots” tự quyết định mục hiển thị
        const label = await getUnifiedLabel(q);
        if (!label){
          swapLoad(id, `<div class="text-slate-700">Không tìm thấy nhãn/monograph phù hợp cho “${escapeHtml(q)}”. Hãy thử tên hoạt chất (INN) hoặc tên khác.</div>`);
          return;
        }
        swapLoad(id, renderAnswer(q, label, q));
      }catch(err){
        swapLoad(id, `<div class="text-rose-600">Lỗi: ${escapeHtml(err.message||String(err))}</div>`);
      }
    }

    btn.addEventListener('click', submit);
    qEl.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); submit(); } });
  };
})();
