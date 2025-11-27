// assets/js/gm65-watcher.js
// Tự động đọc mã GM65 mới nhất từ Google Sheet và tra tên thuốc.

(function () {
  // --- CONFIG: sửa đúng ID & tên sheet của bạn ---
  const SPREADSHEET_ID = '1qK6l4APpMpJn06TY45HZdreSfI0d9tjPyJ0wtT15cNw';
  const SHEET_NAME     = 'Barcode information';
  const POLL_MS        = 3000; // 3 giây/lần

  // Mã hợp lệ: chỉ dùng số, độ dài 8–14 (bạn thích thì chỉnh 12–13 cũng được)
  function isValidBarcode(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    const len = digits.length;
    if (!digits) return false;
    if (digits === '0') return false;
    return len >= 8 && len <= 14;  // chỉnh nếu cần
  }

  let lastKey = ''; // để tránh xử lý trùng mã

  async function fetchLatestValidBarcode() {
    const base = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq`;

    // Lấy tối đa 10 dòng mới nhất có cột B khác null
    const tq  = encodeURIComponent('select A,B where B is not null order by A desc limit 10');
    const url = `${base}?tqx=out:json&sheet=${encodeURIComponent(SHEET_NAME)}&tq=${tq}`;

    const res = await fetch(url);
    const txt = await res.text();

    // GViz trả về string kiểu "google.visualization.Query.setResponse({...})"
    const m = txt.match(/\{.*\}/s);
    if (!m) throw new Error('Không parse được JSON GViz');
    const json = JSON.parse(m[0]);

    const rows = json.table?.rows || [];
    if (!rows.length) return null;

    // Duyệt từ mới nhất → cũ hơn, chọn dòng đầu tiên có mã hợp lệ
    for (const r of rows) {
      const cells = r.c || [];
      const tsRaw = cells[0]?.v;   // cột A
      const code  = cells[1]?.v;   // cột B
      if (!isValidBarcode(code)) continue;

      const digits = String(code).replace(/\D/g, '');
      return { ts: tsRaw, code: digits };
    }

    return null;
  }

  async function pollOnce() {
    try {
      const latest = await fetchLatestValidBarcode();
      if (!latest) return;

      const key = `${latest.ts}__${latest.code}`;
      if (key === lastKey) return; // chưa có mã mới
      lastKey = key;

      const input = document.getElementById('addBarcode');
      if (!input) return;

      // Ghi mã mới vào ô nhập
      input.value = latest.code;

      // Gọi tra cứu từ barcode.js nếu có
      if (typeof window.__doBarcodeLookup === 'function') {
        window.__doBarcodeLookup();
      }
    } catch (err) {
      console.error('GM65 watcher error:', err);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Chỉ chạy trên trang có ô addBarcode (tức là kho.html)
    if (!document.getElementById('addBarcode')) return;

    // Chạy ngay 1 lần, sau đó lặp
    pollOnce();
    setInterval(pollOnce, POLL_MS);
  });
})();
