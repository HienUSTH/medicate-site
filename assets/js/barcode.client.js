/* assets/js/barcode.client.js — Barcode -> Drug Name
 * Ưu tiên: Google CSE proxy (/resolve?code=...)  → best title + candidates
 * Fallback: Thuần client, hỏi các site VN (LongChau/Pharmacity/AnKhang/Medigo/Tiki) qua Jina Reader,
 *           theo link sản phẩm, lọc/cân điểm tên có hàm lượng + dạng bào chế.
 *
 * UI cần có: #addBarcode, #btnResolveBarcode, #barcodeMsg, #addTen, #addAlias
 * Phối hợp với scan.js: window.__doBarcodeLookup() sẽ được gọi tự động khi quét thành công.
 */
(function () {
  // ==============================
  // CONFIG
  // ==============================
  // Đặt URL proxy Search (Render) — KHÔNG có dấu '/' cuối.
  // Có thể override bằng localStorage.setItem('medicate_search_proxy', 'https://...') cho tiện test.
  const DEFAULT_PROXY = ""; // ví dụ: "https://medicate-search-proxy.onrender.com"
  const SEARCH_PROXY = (localStorage.getItem('medicate_search_proxy') || DEFAULT_PROXY).replace(/\/$/, '');

  // ==============================
  // CACHE
  // ==============================
  const CACHE_KEY = 'MEDICATE_BARCODE_CACHE_CLIENT_V6';
  const loadCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; } };
  const saveCache = (m) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(m || {})); } catch {} };
  const delCache  = (code) => { try { const m = loadCache(); delete m[code]; saveCache(m); } catch {} };

  // ==============================
  // HELPERS
  // ==============================
  const viaJina = (url) => `https://r.jina.ai/https://${String(url).replace(/^https?:\/\//,'')}`;
  async function fetchText(url, signal) {
    const r = await fetch(viaJina(url), { headers: { 'Accept': 'text/plain' }, signal });
    if (!r.ok) throw new Error(`Fetch fail ${r.status}`);
    return await r.text();
  }
  // Markdown link parser: [title](url)
  function extractMdLinks(text) {
    const links = [];
    const re = /\[([^\]]{3,160})\]\((https?:\/\/[^\s)]+)\)/g;
    let m; while ((m = re.exec(text)) !== null) links.push({ title: cleanLine(m[1]), url: m[2] });
    return links;
  }

  // ==============================
  // SCORING / FILTERS
  // ==============================
  const STORE_WORDS = ['nhà thuốc','an khang','long châu','long chau','pharmacity','medigo','tiki','siêu thị','cửa hàng'];
  const DOSE_RE = /\b(\d+(?:[.,]\d+)?\s?(mg|mcg|g|kg|ml|mL|iu|ui)(?:\/\d+(?:[.,]\d+)?\s?(ml|mL))?)\b/i;
  const FORM_RE = /(viên|viên nén|viên nang|vỉ|hộp|ống|chai|tuýp|lọ|gói|syrup|sirô|giọt|dung dịch|hỗn dịch|kem|gel|mỡ|xịt|thuốc nhỏ mắt)/i;
  const CAPTCHA_RE = /(captcha|too many requests|confirm you'?re a human|robot check|access denied)/i;

  const PRODUCT_URL_HINT = /(\/san-pham|\/product|\/thuoc|\/p\/|\/sp\/)/i;
  const NOT_PRODUCT_URL  = /(\/danh-muc|\/bai-viet|\/he-thong|\/tu-khoa|\/search|\/tim-kiem)/i;

  const BAD_LINE_LEAD = /^(markdown content:|trang chủ|danh mục|lọc theo|sắp xếp|ưu đãi|giỏ hàng|đăng nhập|đăng ký|kết quả tìm kiếm|page \d+|####|\* \[|\[h1\])/i;
  const BAD_NAME = /^(title:\s*)?(nhà thuốc|pharmacity|an khang|long ch(â|a)u|medigo|tiki)\b/i;

  function cleanLine(s) {
    return String(s || '')
      .replace(/\u00A0/g, ' ')
      .replace(/^title:\s*/i, '')
      .replace(/\s*\|\s*(nhà thuốc|pharmacity|an khang|long ch(â|a)u|medigo|tiki).*$/i, '')
      .replace(/\s*[-–—]\s*(nhà thuốc|pharmacity|an khang|long ch(â|a)u|medigo|tiki).*$/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  function looksLikeStoreTitle(s) {
    const t = s.toLowerCase();
    return STORE_WORDS.some(w => t.includes(w)) && !DOSE_RE.test(s) && !FORM_RE.test(s);
  }
  function scoreName(s) {
    const L = cleanLine(s);
    if (!L || L.length < 4 || L.length > 140) return -999;
    if (CAPTCHA_RE.test(L)) return -999;
    if (BAD_LINE_LEAD.test(L) || BAD_NAME.test(L)) return -999;
    if (!/[A-Za-zÀ-Ỵà-ỹ]/.test(L)) return -999;
    if (looksLikeStoreTitle(L)) return -999;

    let sc = 0;
    if (DOSE_RE.test(L)) sc += 2.3;
    if (FORM_RE.test(L)) sc += 1.6;
    if (/^[A-ZÀ-Ỳ]/.test(L)) sc += 0.5;
    if (L.length > 100) sc -= (L.length - 100) / 40;
    return sc;
  }
  function rankUnique(items, max = 10) {
    const map = new Map();
    for (const it of items) {
      const key = it.name.toLowerCase();
      const cur = map.get(key) || { name: it.name, score: 0, hits: 0 };
      cur.score += (it.score || 0);
      cur.hits  += 1;
      map.set(key, cur);
    }
    const arr = [...map.values()]
      .filter(v => scoreName(v.name) > 0)
      .map(v => ({ name: v.name, rank: scoreName(v.name) + v.hits * 0.8 }));
    arr.sort((a, b) => b.rank - a.rank);
    return arr.slice(0, max);
  }

  // ==============================
  // 1) GOOGLE CSE PROXY (ưu tiên)
  // ==============================
  async function trySearchProxy(code) {
    if (!SEARCH_PROXY) throw new Error('proxy not configured');
    const u = `${SEARCH_PROXY}/resolve?code=${encodeURIComponent(code)}`;
    const r = await fetch(u, { headers: { 'Accept': 'application/json' } });
    if (!r.ok) throw new Error(`proxy ${r.status}`);
    const j = await r.json();
    const cands = Array.isArray(j.candidates) ? j.candidates.filter(x => scoreName(x) > 0) : [];
    const best = j.best && scoreName(j.best) > 0 ? j.best : (cands[0] || null);
    if (!best) throw new Error('proxy no good result');
    return { name: best, candidates: cands.slice(0, 8), source: 'google-cse' };
  }

  // ==============================
  // 2) FALLBACK CLIENT-ONLY (Jina + site search)
  // ==============================
  const SITE_SOURCES = [
    { name: 'LongChau',   url: q => `https://www.nhathuoclongchau.com/tim-kiem?kw=${encodeURIComponent(q)}` },
    { name: 'Pharmacity', url: q => `https://www.pharmacity.vn/search?q=${encodeURIComponent(q)}` },
    { name: 'AnKhang',    url: q => `https://www.nhathuocankhang.com/tu-khoa?q=${encodeURIComponent(q)}` },
    { name: 'Medigo',     url: q => `https://www.medigoapp.com/tim-kiem?q=${encodeURIComponent(q)}` },
    { name: 'Tiki',       url: q => `https://tiki.vn/search?q=${encodeURIComponent(q)}` },
  ];

  async function phase1_collect(code, signal) {
    const results = await Promise.allSettled(SITE_SOURCES.map(s => fetchText(s.url(code), signal)));
    const texts = results.filter(x => x.status === 'fulfilled').map(x => x.value);

    const lineCands = [];
    const linkCands = [];

    for (const t of texts) {
      const lines = t.split('\n')
        .map(cleanLine)
        .filter(x => x && !BAD_LINE_LEAD.test(x) && !CAPTCHA_RE.test(x));
      for (const ln of lines) {
        const sc = scoreName(ln);
        if (sc > 0) lineCands.push({ name: ln, score: sc });
      }
      const links = extractMdLinks(t);
      for (const l of links) {
        const isProductish = PRODUCT_URL_HINT.test(l.url) && !NOT_PRODUCT_URL.test(l.url);
        const sc = scoreName(l.title) + (isProductish ? 0.8 : 0);
        if (sc > 0) linkCands.push({ name: l.title, score: sc, url: l.url, productish: isProductish });
      }
    }
    linkCands.sort((a,b)=> (b.productish?1:0) - (a.productish?1:0) || b.score - a.score);
    return { lineCands, linkCands };
  }

  async function phase2_refine(linkCands, signal) {
    const top = linkCands.filter(x=>x.productish).slice(0, 5);
    if (!top.length) return [];
    const fetched = await Promise.allSettled(top.map(l => fetchText(l.url, signal)));
    const refined = [];
    fetched.forEach((r) => {
      if (r.status !== 'fulfilled') return;
      const text = r.value;
      const lines = text.split('\n').slice(0, 180).map(cleanLine).filter(x => x && !CAPTCHA_RE.test(x));
      for (const ln of lines) {
        const sc = scoreName(ln);
        if (sc > 0) refined.push({ name: ln, score: sc + 1.2 });
      }
    });
    return refined;
  }

  async function clientOnlyResolve(code) {
    const ctl = new AbortController(); const signal = ctl.signal;
    const timer = setTimeout(() => ctl.abort('timeout'), 12000);
    try {
      const { lineCands, linkCands } = await phase1_collect(code, signal);
      const refined = await phase2_refine(linkCands, signal);
      const all = rankUnique([...lineCands, ...linkCands, ...refined], 10);
      if (!all.length) throw new Error('Không suy ra được tên từ các nguồn.');
      return { name: all[0].name, candidates: all.map(x => x.name), source: 'client' };
    } finally { clearTimeout(timer); }
  }

  // ==============================
  // RESOLVE (proxy -> fallback)
  // ==============================
  async function resolveBarcodeCore(code) {
    code = String(code || '').trim();
    if (!/^\d{8,14}$/.test(code)) throw new Error('Mã không hợp lệ (cần 8–14 chữ số).');

    // cache
    const cache = loadCache();
    const cached = cache[code];
    if (cached?.name && scoreName(cached.name) > 0) {
      return { name: cached.name, alias: cached.alias || '', candidates: cached.cand || [], source: 'cache' };
    } else if (cached?.name) {
      delCache(code);
    }

    // 1) Thử proxy Google CSE trước
    try {
      const r = await trySearchProxy(code);
      // cache
      cache[code] = { name: r.name, alias: '', cand: r.candidates || [], at: Date.now() };
      saveCache(cache);
      return r;
    } catch (_) {
      // 2) Fallback client-only
      const r2 = await clientOnlyResolve(code);
      cache[code] = { name: r2.name, alias: '', cand: r2.candidates || [], at: Date.now() };
      saveCache(cache);
      return r2;
    }
  }

  // Expose cho nơi khác gọi trực tiếp (scan.js, v.v.)
  window.resolveBarcode = (code) => resolveBarcodeCore(code);

  // ==============================
  // UI WIRING
  // ==============================
  function ensureCandBox() {
    let box = document.getElementById('barcodeCandBox');
    if (box) return box;
    box = document.createElement('div');
    box.id = 'barcodeCandBox';
    box.className = 'mt-2 flex flex-wrap gap-2';
    const msgEl = document.getElementById('barcodeMsg');
    if (msgEl) msgEl.parentElement.insertBefore(box, msgEl.nextSibling);
    return box;
  }
  function renderCandidates(code, candidates, onPick) {
    const box = ensureCandBox();
    box.innerHTML = '';
    if (!candidates || !candidates.length) return;
    const title = document.createElement('div');
    title.className = 'w-full text-xs text-slate-500';
    title.textContent = 'Gợi ý tên thuốc (chọn 1):';
    box.appendChild(title);

    candidates.slice(0, 8).forEach(name => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'text-xs px-2 py-1 rounded-full border border-slate-300 hover:bg-slate-50';
      btn.textContent = name;
      btn.addEventListener('click', () => {
        const m = loadCache();
        m[code] = { name, alias: '', cand: candidates, at: Date.now(), chosen: true };
        saveCache(m);
        onPick(name);
      });
      box.appendChild(btn);
    });
  }

  function wireUI() {
    const input   = document.getElementById('addBarcode');
    const btn     = document.getElementById('btnResolveBarcode');
    const msgEl   = document.getElementById('barcodeMsg');
    const elTen   = document.getElementById('addTen');
    const elAlias = document.getElementById('addAlias');
    if (!input || !btn || !msgEl) return;

    const setMsg = (t, ok = true) => {
      msgEl.textContent = t || '';
      msgEl.className = 'text-xs mt-1 ' + (ok ? 'text-emerald-700' : 'text-rose-600');
    };
    const applyName = (name) => {
      if (elTen) elTen.value = name || '';
      if (elAlias && !elAlias.value) elAlias.value = '';
      elTen?.focus();
    };

    async function doLookup(ev) {
      if (ev) { ev.preventDefault(); ev.stopPropagation(); }
      const code = input.value.trim();
      if (!code) { setMsg('Nhập/Quét mã trước đã.', false); input.focus(); return; }
      setMsg(SEARCH_PROXY ? 'Đang hỏi Google CSE…' : 'Đang tìm trên các nhà thuốc…'); 
      btn.disabled = true;
      try {
        const { name, source, candidates } = await resolveBarcodeCore(code);
        applyName(name);
        renderCandidates(code, candidates, applyName);
        setMsg(`Đã lấy tên: “${name}” (nguồn: ${source || (SEARCH_PROXY?'google-cse':'client')})`);
      } catch (err) {
        setMsg(err.message || 'Tra cứu thất bại.', false);
      } finally { btn.disabled = false; }
    }

    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLookup(e); });
    btn.addEventListener('click', (e) => { doLookup(e); });

    // Cho scan.js gọi
    window.__doBarcodeLookup = doLookup;
  }
  document.addEventListener('DOMContentLoaded', wireUI);
})();
