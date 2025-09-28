/****************************************************
 * transvi.js — EN→VI client (mô phỏng TranslateVi.gs)
 * Protect tokens → (MT fallback đa endpoint) → Glossary → Deep clean → Compact bullets
 ****************************************************/

/* ===== Cấu hình ===== */
window.TRANSLATE_FALLBACK   = (typeof window.TRANSLATE_FALLBACK === 'boolean') ? window.TRANSLATE_FALLBACK : true;
// Thử tuần tự các endpoint công khai (CORS mở). Có thể thêm endpoint riêng nếu cần.
window.TRANSLATE_ENDPOINTS  = window.TRANSLATE_ENDPOINTS || [
  'https://libretranslate.de/translate',
  'https://translate.astian.org/translate'
];
window.TRANSLATE_TIMEOUT_MS = window.TRANSLATE_TIMEOUT_MS || 6000;
const VI_CHUNK_LIMIT = 1600;

/* ===== Tiện ích chuỗi ===== */
const _vi = {
  smart(s){ return String(s||'').replace(/\r/g,'\n').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim(); },
  escRe(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); },
  englishRatio(t){
    const s=String(t||'').replace(/\s+/g,' ');
    const letters = s.replace(/[^A-Za-z]/g,'').length;
    const total   = s.replace(/\s/g,'').length || 1;
    return letters/total;
  },
  sentenceCase(t){
    return String(t||'').split('\n').map(line=>{
      let s=line.trim(); if(!s) return '';
      s = s.replace(/(^|[.!?]\s+)([a-zà-ỹ])/g,(m,p,a)=>p+a.toUpperCase());
      s = s.replace(/^([a-zà-ỹ])/,(m,a)=>a.toUpperCase());
      return s;
    }).join('\n');
  },
  dedupeLines(t){
    const out=[], seen=new Set();
    for (const raw of String(t||'').split(/\n+/)) {
      let s=raw.trim(); if(!s) continue;
      const key=s.toLowerCase().replace(/\s+/g,' ').replace(/[.,;:–—\-]+$/,'');
      if (seen.has(key)) continue; seen.add(key); out.push(s);
    }
    return out.join('\n');
  },
  paragraphize(t){
    const raw=String(t||'');
    if (raw.includes('\n')) return raw;
    const sentences = raw.split(/(?<=[.!?])\s+/).filter(Boolean);
    const chunks=[]; let cur=''; let len=0;
    for(const s of sentences){
      cur += (cur?' ':'') + s; len += s.length;
      if(len > 400){ chunks.push(cur); cur=''; len=0; }
    }
    if(cur) chunks.push(cur);
    return chunks.join('\n');
  }
};

/* ===== Protect / Unprotect tokens ===== */
function viProtect(text, extraTokens=[]){
  const map={}; let out=String(text||'');
  const put = v => { const k=`[[${Object.keys(map).length.toString(36)}]]`; map[k]=v; return k; };

  // 10 mg, 5–10 mL, %, x lần/ngày...
  out = out.replace(/\b(\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?)\s*(mcg|µg|mg|g|kg|ml|mL|L|IU|%)\b/gi,(m)=>put(m));
  out = out.replace(/\b(\d+(?:\s*[-–]\s*\d+)?)\s*(?:lần|viên|gói|ống|giọt)\/(ngày|day|daily)\b/gi,(m)=>put(m));
  out = out.replace(/\b(\d+(?:\.\d+)?)\s*(?:x|×)\s*(\d+(?:\.\d+)?)\b/g,(m)=>put(m));
  out = out.replace(/\b(\d+%|\d+\/\d+)\b/g,(m)=>put(m));
  // tên IN HOA / mã
  out = out.replace(/\b([A-Z][A-Z0-9\-]{2,})\b/g,(m)=>put(m));

  (extraTokens||[]).forEach(tok=>{
    const re = tok instanceof RegExp ? tok : new RegExp('\\b'+_vi.escRe(String(tok))+'\\b','g');
    out = out.replace(re, m=>put(m));
  });

  return { text: out, map };
}
function viUnprotect(text, map){
  let out=String(text||'');
  Object.entries(map||{}).forEach(([k,v])=>{ out=out.replace(new RegExp(k,'g'), v); });
  return out;
}

/* ===== Glossary giống Apps Script (mở rộng) ===== */
const VI_GLOSSARY_FIXED = [
  [/INDICATIONS(?: AND USAGE)?/gi,'Chỉ định'],
  [/DOSAGE(?: AND ADMINISTRATION)?/gi,'Liều dùng và cách dùng'],
  [/CONTRAINDICATIONS/gi,'Chống chỉ định'],
  [/(WARNINGS(?: AND (?:PRECAUTIONS|CAUTIONS))?|PRECAUTIONS|CAUTIONS)/gi,'Cảnh báo/Thận trọng'],
  [/(ADVERSE REACTIONS|SIDE EFFECTS)/gi,'Tác dụng phụ'],
  [/DRUG INTERACTIONS/gi,'Tương tác thuốc'],
  [/PREGNANCY/gi,'Thai kỳ'],
  [/(LACTATION|NURSING MOTHERS)/gi,'Cho con bú'],
  [/(USE IN SPECIFIC POPULATIONS|SPECIFIC POPULATIONS)/gi,'Sử dụng ở nhóm đặc biệt'],
  [/(MECHANISM OF ACTION|CLINICAL PHARMACOLOGY)/gi,'Cơ chế tác dụng'],
  [/(OVERDOSAGE|OVERDOSE)/gi,'Quá liều'],
  [/(STORAGE AND HANDLING|STORAGE)/gi,'Bảo quản'],
  [/HOW SUPPLIED|PACKAGE/gi,'Quy cách/Đóng gói'],
  [/(ACTIVE INGREDIENTS?|COMPOSITION)/gi,'Thành phần hoạt chất'],
  [/(INACTIVE INGREDIENTS|OTHER INGREDIENTS|EXCIPIENTS)/gi,'Thành phần khác (tá dược)'],
];

/* ===== Deep clean giống Apps Script ===== */
function vi_removeAnnotations_(t){
  let s = String(t||'');
  s = s.replace(/\[[^\]]*\]/g, ' ');
  s = s.replace(/\((?:\s*\d+(?:\.\d+)*\s*|xem[^)]*|see[^)]*|ref[^)]*|hình[^)]*|fig[^)]*)\)/gi, ' ');
  s = s.replace(/^\s*(?:\(?\d+(?:\.\d+)*\)?[)\.:-]*|[-–•])\s+/gm, '');
  return s;
}
function vi_fixPunct_(t){
  let s = String(t||'');
  s = s.replace(/^[\s:;,.]+/gm, '');
  s = s.replace(/\s+([,;:])/g, '$1').replace(/([,;:])(?=\S)/g, '$1 ').replace(/\s+\./g, '.');
  s = s.replace(/\.{2,}/g, '.').replace(/,{2,}/g, ',');
  s = s.replace(/(^|\n)([A-ZÀ-Ỵ][^\n]{0,40})\s*:\s+(?=[a-zà-ỹ])/g, '$1$2. ');
  s = s.replace(/\(\s*\)/g,' ').replace(/\(\s*$/gm,' ').replace(/^\s*\)/gm,' ');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s;
}
function vi_sentenceCase_(t){
  return String(t||'').split('\n').map(line=>{
    let s=line.trim(); if(!s) return '';
    s = s.replace(/(^|[\.!\?]\s+)([a-zà-ỹ])/g, (m,p1,p2)=> p1 + p2.toUpperCase());
    s = s.replace(/^([a-zà-ỹ])/g, (m,p)=> p.toUpperCase());
    return s;
  }).join('\n');
}
function vi_dedupLines_(t){
  const lines = String(t||'').split('\n');
  const seen = new Set(); const out = [];
  for (let i=0;i<lines.length;i++){
    let ln = lines[i].trim();
    if (!ln) continue;
    const key = ln.replace(/\s+/g,' ').replace(/[.,;:]+$/,'').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ln);
  }
  return out.join('\n');
}
function vi_paragraphize_(t){
  const raw = String(t||'');
  if (raw.indexOf('\n') >= 0) return raw;
  const sentences = raw.split(/(?<=[\.\!\?])\s+/).filter(Boolean);
  const out = [];
  let buf = [], len = 0;
  for (const s of sentences){
    buf.push(s); len += s.length;
    if (buf.length >= 2 || len > 400){ out.push(buf.join(' ')); buf=[]; len=0; }
  }
  if (buf.length) out.push(buf.join(' '));
  return out.join('\n');
}
function vi_postCleanText_(s){
  let t = _vi.smart(s||'');
  if (!t) return '';
  t = vi_removeAnnotations_(t);
  t = vi_fixPunct_(t);
  t = vi_dedupLines_(t);
  t = t.replace(/\s{2,}/g, ' ').replace(/ ?\n ?/g, '\n');
  t = vi_paragraphize_(t);
  t = vi_sentenceCase_(t);
  return t.trim();
}

/* ===== Compact bullets: luôn “• ” và lọc ký tự rác đầu dòng ===== */
function viFixLeadingGarbage(line){
  let s=String(line||'').trim();
  s = s.replace(/^[\]\)\(}\-•·]+/g,''); // bỏ ] - • thừa
  s = s.replace(/^[JI]\s+Adults\b/,'Người lớn').replace(/^Adults\b/i,'Người lớn').replace(/^Children\b/i,'Trẻ em');
  s = s.replace(/^WARNING\b[:\s]*/i,'Cảnh báo: ');
  return s.trim();
}
window.vi_compact = function(s, maxItems, maxChars){
  const MAX = maxItems || 2, LIM = maxChars || 160;
  const parts = String(s||'').split(/[\n]+|(?<=[\.\!\?…])\s+/).map(viFixLeadingGarbage).filter(x => x && x.length > 2);
  const bullets=[];
  for(const p0 of parts){
    if(bullets.length>=MAX) break;
    let p=p0.trim();
    if(p.length>LIM) p=p.slice(0,LIM-1).replace(/\s+\S*$/,'')+'…';
    p = p.replace(/^[•\-\u2022]\s*/,'');
    bullets.push('• '+p);
  }
  return bullets.join('\n');
};

/* ===== MT fallback đa endpoint + chunking ===== */
async function translateOneMT_(text){
  if(!window.TRANSLATE_FALLBACK) return '';
  const payload = (q)=>JSON.stringify({ q, source:'en', target:'vi', format:'text' });

  for(const url of window.TRANSLATE_ENDPOINTS){
    const controller = new AbortController();
    const to = setTimeout(()=>controller.abort(), window.TRANSLATE_TIMEOUT_MS);
    try{
      const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: payload(text), signal: controller.signal });
      clearTimeout(to);
      if(!r.ok) continue;
      const j = await r.json();
      const out = j?.translatedText || '';
      if (out) return out;
    }catch{ clearTimeout(to); }
  }
  return '';
}
async function translateMTWithChunks_(en){
  const s = _vi.smart(en||''); if(!s) return '';
  if(s.length <= VI_CHUNK_LIMIT) return translateOneMT_(s);
  const sentences = s.split(/(?<=[\.\!\?])\s+/);
  const chunks=[]; let cur=''; for(const sent of sentences){
    const nxt = (cur?cur+' ':'')+sent;
    if(nxt.length > VI_CHUNK_LIMIT){ chunks.push(cur); cur=sent; } else cur=nxt;
  }
  if(cur) chunks.push(cur);
  const outs=[];
  for(const c of chunks){ outs.push(await translateOneMT_(c)); }
  return outs.filter(Boolean).join(' ');
}

/* ===== API chính: dịch toàn label ===== */
window.translateLabelToVi = async function(label,tokensForProtect){
  const L = label||{};
  const tok = (tokensForProtect||[]).slice(0,16);
  const keys = [
    'boxed_warning','indications','dosage','contraindications','warnings_precautions','adverse',
    'interactions','pregnancy','lactation','specific_populations','mechanism','overdosage','storage',
    'how_supplied','active_ingredients','inactive_ingredients'
  ];
  const out = { };

  for(const k of keys){
    const en = L[k]; if(!en){ out[k]=''; continue; }
    // Protect → MT → Glossary → Clean
    const prot = viProtect(en, tok);
    let vi = await translateMTWithChunks_(prot.text);
    if(!vi) vi = prot.text; // nếu MT hỏng, giữ nguyên để glossary xử lý phần nào
    VI_GLOSSARY_FIXED.forEach(([re, rep]) => { vi = vi.replace(re, rep); });
    vi = viUnprotect(vi, prot.map);
    vi = vi_postCleanText_(vi);
    out[k] = vi;
  }
  return out;
};
