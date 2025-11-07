/* assets/js/barcode.js
 * Nhập/Quét mã → gọi API backend → tự điền Tên/Alias
 * Phụ thuộc HTML: #addBarcode, #btnResolveBarcode, #barcodeMsg, #addTen, #addAlias
 */

(function(){
  const API_BASE = (window.MEDICATE_API_BASE || "").replace(/\/+$/,""); // "" = same-origin
  const CACHE_KEY = 'MEDICATE_BARCODE_CACHE_V1';

  function loadCache(){ try{ return JSON.parse(localStorage.getItem(CACHE_KEY)||'{}'); }catch{ return {}; } }
  function saveCache(m){ try{ localStorage.setItem(CACHE_KEY, JSON.stringify(m||{})); }catch{} }

  async function resolveBarcode(code, provider){
    code = String(code||'').trim();
    if(!code) throw new Error('Mã trống');

    // 1) cache local
    const cache = loadCache();
    if (cache[code]?.name) {
      return { name: cache[code].name, alias: cache[code].alias||'', source: 'cache' };
    }

    // 2) gọi API
    const params = new URLSearchParams({ code });
    if (provider) params.set('provider', provider);

    // nếu API_BASE trống ⇒ /api/... (same origin). Ngược lại gọi https://xxx/api/...
    const url = `${API_BASE}/api/barcode/resolve?${params.toString()}`;

    let res;
    try{
      res = await fetch(url, { headers:{'Accept':'application/json'} });
    }catch(e){
      throw new Error(`Không kết nối được server (${API_BASE||'same-origin'}).`);
    }
    if (!res.ok) {
      // đọc text để xem có phải 404 do route không
      const txt = await res.text().catch(()=>String(res.status));
      // Thu gọn HTML dài dòng
      const short = txt.length > 140 ? txt.slice(0,140) + '…' : txt;
      throw new Error(`API lỗi: ${res.status} ${short}`);
    }

    const data = await res.json().catch(()=>null);
    if (!data || !data.best || !data.best.name) {
      throw new Error('Không suy ra được tên thuốc từ mã.');
    }

    cache[code] = { name: data.best.name, alias: data.best.alias||'', at: Date.now() };
    saveCache(cache);

    return { name: data.best.name, alias: data.best.alias||'', source: data.provider||'api' };
  }

  // export để scan.js dùng
  window.resolveBarcode = resolveBarcode;

  function wireBarcodeUI(){
    const input   = document.getElementById('addBarcode');
    const btn     = document.getElementById('btnResolveBarcode');
    const msgEl   = document.getElementById('barcodeMsg');
    const elTen   = document.getElementById('addTen');
    const elAlias = document.getElementById('addAlias');

    if(!input || !btn || !msgEl) return;

    const setMsg = (t, ok=true)=>{
      msgEl.textContent = t || '';
      msgEl.className = 'text-xs mt-1 ' + (ok ? 'text-emerald-700' : 'text-rose-600');
    };

    async function doLookup(){
      const code = input.value.trim();
      if(!code){ setMsg('Nhập/Quét mã trước đã.', false); input.focus(); return; }
      setMsg(`Đang tra cứu từ ${API_BASE||'same-origin'}…`);
      btn.disabled = true;

      try{
        const { name, alias, source } = await resolveBarcode(code);
        if (elTen && !elTen.value) elTen.value = name;
        if (elAlias && !elAlias.value && alias) elAlias.value = alias;
        setMsg(`Đã lấy tên: “${name}” ${source==='cache'?'(cache)':''}`);
        elTen?.focus();
      }catch(err){
        setMsg(err.message || 'Tra cứu thất bại.', false);
      }finally{
        btn.disabled = false;
      }
    }

    input.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); doLookup(); }});
    btn.addEventListener('click', (e)=>{ e.preventDefault(); doLookup(); });

    // expose cho scan.js
    window.__doBarcodeLookup = doLookup;
  }

  document.addEventListener('DOMContentLoaded', wireBarcodeUI);
})();
