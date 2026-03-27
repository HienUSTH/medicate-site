/* assets/js/barcode.js
 * Barcode -> tên thuốc
 * Dùng với form Supabase mới: #addBarcode, #btnResolveBarcode, #barcodeMsg, #addTen
 */
(function(){
  const API_BASE = (window.MEDICATE_API_BASE || '').replace(/\/+$/,'');
  const CACHE_KEY = 'MEDICATE_BARCODE_CACHE_V2';

  function loadCache(){ try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; } }
  function saveCache(m){ try { localStorage.setItem(CACHE_KEY, JSON.stringify(m || {})); } catch {} }
  function setMsg(el, text, ok = true){
    if (!el) return;
    el.textContent = text || '';
    el.className = 'text-xs mt-1 ' + (ok ? 'text-emerald-700' : 'text-rose-600');
  }

  async function resolveBarcode(code, provider){
    code = String(code || '').trim();
    if (!/^\d{8,14}$/.test(code)) throw new Error('Mã không hợp lệ (cần 8–14 chữ số).');

    const cache = loadCache();
    if (cache[code]?.name) {
      return { name: cache[code].name, source: 'cache' };
    }

    const params = new URLSearchParams({ code });
    if (provider) params.set('provider', provider);
    const url = `${API_BASE}/api/barcode/resolve?${params.toString()}`;

    let res;
    try {
      res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    } catch {
      throw new Error(`Không kết nối được server (${API_BASE || 'same-origin'}).`);
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => String(res.status));
      const short = txt.length > 140 ? txt.slice(0, 140) + '…' : txt;
      throw new Error(`API lỗi: ${res.status} ${short}`);
    }

    const data = await res.json().catch(() => null);
    if (!data?.best?.name) {
      throw new Error('Không suy ra được tên thuốc từ mã.');
    }

    cache[code] = { name: data.best.name, at: Date.now() };
    saveCache(cache);

    return {
      name: data.best.name,
      source: data.provider || 'api'
    };
  }

  window.resolveBarcode = resolveBarcode;

  function wireBarcodeUI(){
    const input = document.getElementById('addBarcode');
    const btn = document.getElementById('btnResolveBarcode');
    const msgEl = document.getElementById('barcodeMsg');
    const elTen = document.getElementById('addTen');
    if (!input || !btn || !msgEl) return;

    async function doLookup(ev){
      if (ev) {
        ev.preventDefault();
        ev.stopPropagation();
      }

      const code = String(input.value || '').trim();
      if (!code) {
        setMsg(msgEl, 'Nhập/Quét mã trước đã.', false);
        input.focus();
        return null;
      }

      setMsg(msgEl, `Đang tra cứu từ ${API_BASE || 'same-origin'}…`);
      btn.disabled = true;

      try {
        const out = await resolveBarcode(code);
        if (elTen && !String(elTen.value || '').trim()) {
          elTen.value = out.name || '';
        }
        setMsg(msgEl, `Đã lấy tên: “${out.name}”${out.source === 'cache' ? ' (cache)' : ''}`);
        elTen?.focus();

        window.dispatchEvent(new CustomEvent('medicate:barcode-resolved', {
          detail: { code, name: out.name, source: out.source }
        }));

        return out;
      } catch (err) {
        setMsg(msgEl, err.message || 'Tra cứu thất bại.', false);
        throw err;
      } finally {
        btn.disabled = false;
      }
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doLookup(e);
    });

    btn.addEventListener('click', (e) => doLookup(e));
    window.__doBarcodeLookup = doLookup;
  }

  document.addEventListener('DOMContentLoaded', wireBarcodeUI);
})();
