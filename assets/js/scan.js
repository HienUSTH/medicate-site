/* assets/js/scan.js
 * Camera scan cho kho thuốc Supabase mới
 * Hỗ trợ live scan + upload ảnh.
 * Tự điền #addBarcode và gọi window.__doBarcodeLookup().
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const ui = {
    btnScan: $('btnScanCam'),
    modal: $('scanModal'),
    btnClose: $('btnCloseScan'),
    video: $('scanVideo'),
    camSelect: $('camSelect'),
    btnTorch: $('btnTorch'),
    fileInput: $('scanImage'),
    resultEl: $('scanResult'),
    barcodeInput: $('addBarcode')
  };

  if (!ui.btnScan || !ui.modal || !ui.video) return;

  let overlay = null;
  let octx = null;
  let codeReader = null;
  let stream = null;
  let torchOn = false;
  let quaggaOn = false;
  let zxHit = false;
  let zxDeviceIdInUse = null;
  let snapshotTimer = null;
  let handlingCode = false;
  let lastCode = '';
  let lastCodeAt = 0;

  const DUP_MS = 2500;
  const tip = (t) => { if (ui.resultEl) ui.resultEl.textContent = t || ''; };
  const secureOk = () =>
    location.protocol === 'https:' ||
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1';

  function esc(s){
    return String(s || '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m]));
  }

  function showModal(){ ui.modal.classList.remove('hidden'); }
  function hideModal(){ ui.modal.classList.add('hidden'); }

  function ensureOverlay(){
    if (overlay) return;
    overlay = document.createElement('canvas');
    overlay.id = 'scanOverlay';
    overlay.style.position = 'absolute';
    overlay.style.left = '0';
    overlay.style.top = '0';
    overlay.style.pointerEvents = 'none';
    const wrap = ui.video.parentElement || ui.video;
    wrap.style.position = 'relative';
    wrap.appendChild(overlay);
    octx = overlay.getContext('2d');
    resizeOverlay();
    window.addEventListener('resize', resizeOverlay);
  }

  function resizeOverlay(){
    if (!overlay) return;
    const r = ui.video.getBoundingClientRect();
    overlay.width = r.width;
    overlay.height = r.height;
  }

  function clearOverlay(){
    if (octx) octx.clearRect(0, 0, overlay.width, overlay.height);
  }

  function drawGuide(){
    if (!octx) return;
    const w = overlay.width;
    const h = overlay.height;
    const pw = Math.floor(w * 0.8);
    const ph = Math.floor(h * 0.3);
    const x = Math.floor((w - pw) / 2);
    const y = Math.floor((h - ph) / 2);
    octx.strokeStyle = 'rgba(0,255,0,.6)';
    octx.lineWidth = 2;
    octx.strokeRect(x, y, pw, ph);
  }

  function drawBoxes(list, color){
    if (!octx || !list?.length) return;
    octx.save();
    octx.strokeStyle = color;
    octx.lineWidth = 2;
    list.forEach((pts) => {
      if (!pts?.length) return;
      octx.beginPath();
      octx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i += 1) octx.lineTo(pts[i].x, pts[i].y);
      octx.closePath();
      octx.stroke();
    });
    octx.restore();
  }

  function buildHints(){
    const hints = new Map();
    hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
      ZXing.BarcodeFormat.EAN_13,
      ZXing.BarcodeFormat.EAN_8,
      ZXing.BarcodeFormat.UPC_A,
      ZXing.BarcodeFormat.CODE_128,
      ZXing.BarcodeFormat.CODE_39,
      ZXing.BarcodeFormat.ITF,
      ZXing.BarcodeFormat.QR_CODE,
      ZXing.BarcodeFormat.DATA_MATRIX,
      ZXing.BarcodeFormat.PDF_417
    ]);
    return hints;
  }

  async function listCameras(){
    try {
      const ds = await ZXing.BrowserMultiFormatReader.listVideoInputDevices();
      ui.camSelect.innerHTML = ds.map((d) => `<option value="${d.deviceId}">${esc(d.label || ('Camera ' + d.deviceId.slice(0, 6)))}</option>`).join('');
      return ds;
    } catch {
      tip('Không liệt kê được camera.');
      return [];
    }
  }

  function stopZXing(){
    try { codeReader?.reset?.(); } catch {}
  }

  function stopAll(){
    stopZXing();
    try { stream?.getTracks?.().forEach((t) => t.stop()); } catch {}
    stream = null;
    torchOn = false;
    ui.btnTorch?.classList.remove('bg-amber-500', 'text-white');
    if (quaggaOn && window.Quagga) {
      try { window.Quagga.stop(); } catch {}
      quaggaOn = false;
    }
    if (snapshotTimer) {
      clearInterval(snapshotTimer);
      snapshotTimer = null;
    }
    clearOverlay();
  }

  async function startZXing(deviceId){
    stopAll();
    zxHit = false;
    zxDeviceIdInUse = deviceId || null;
    ensureOverlay();

    if (!codeReader) codeReader = new ZXing.BrowserMultiFormatReader(buildHints());
    else codeReader.hints = buildHints();

    const tries = [
      { deviceId: deviceId || undefined, facingMode: deviceId ? undefined : { ideal: 'environment' } },
      { deviceId: deviceId || undefined, facingMode: deviceId ? undefined : { ideal: 'user' } }
    ];

    for (const t of tries) {
      try {
        const constraints = {
          video: {
            deviceId: t.deviceId ? { exact: t.deviceId } : undefined,
            facingMode: t.facingMode,
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 },
            advanced: [{ focusMode: 'continuous', zoom: 2.0 }]
          },
          audio: false
        };

        stream = await navigator.mediaDevices.getUserMedia(constraints);
        ui.video.srcObject = stream;
        ui.video.setAttribute('playsinline', '');
        ui.video.muted = true;
        await ui.video.play();

        resizeOverlay();
        clearOverlay();
        drawGuide();
        codeReader.decodeFromVideoDevice(t.deviceId || undefined, ui.video, onZXingResult);
        snapshotTimer = setInterval(() => { if (!zxHit && !handlingCode) trySnapshotDecode(); }, 700);
        return;
      } catch {}
    }

    tip('Không mở được camera.');
  }

  function onZXingResult(result){
    if (result && result.text) {
      zxHit = true;
      acceptCode(String(result.text).trim());
    }
  }

  function trySnapshotDecode(){
    try {
      const w = ui.video.videoWidth || 0;
      const h = ui.video.videoHeight || 0;
      if (!w || !h) return;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(ui.video, 0, 0, w, h);
      const luminance = new ZXing.HTMLCanvasElementLuminanceSource(canvas);
      const bitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(luminance));
      const reader = new ZXing.MultiFormatReader();
      reader.setHints(buildHints());
      const result = reader.decode(bitmap);
      if (result && result.getText()) {
        zxHit = true;
        acceptCode(String(result.getText()).trim());
      }
    } catch {}
  }

  function startQuaggaFallback(){
    if (quaggaOn || !window.Quagga) return;
    quaggaOn = true;
    stopZXing();
    const target = ui.video.parentElement || ui.video;
    window.Quagga.init({
      inputStream: {
        name: 'Live',
        type: 'LiveStream',
        target,
        constraints: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          facingMode: 'environment',
          deviceId: zxDeviceIdInUse ? { exact: zxDeviceIdInUse } : undefined
        },
        area: { top: '30%', right: '10%', left: '10%', bottom: '30%' }
      },
      numOfWorkers: 0,
      frequency: 10,
      locate: true,
      decoder: { readers: ['ean_reader', 'ean_8_reader', 'upc_reader', 'code_128_reader', 'code_39_reader', 'i2of5_reader'] }
    }, (err) => {
      if (err) {
        quaggaOn = false;
        tip('Quagga lỗi khởi tạo.');
        return;
      }
      window.Quagga.start();
      window.Quagga.onProcessed((res) => {
        clearOverlay();
        drawGuide();
        if (!res) return;
        if (res.boxes) {
          const boxes = res.boxes.filter((b) => b !== res.box);
          drawBoxes(boxes.map(toPoints), 'rgba(0,170,255,0.7)');
        }
        if (res.box) drawBoxes([toPoints(res.box)], 'rgba(0,255,100,0.9)');
      });
      window.Quagga.onDetected((data) => {
        const code = data?.codeResult?.code;
        if (code) acceptCode(String(code).trim());
      });
    });
  }

  function toPoints(b){
    return (Array.isArray(b) ? b : (b?.line || [])).map((p) => ({ x: p.x, y: p.y }));
  }

  async function acceptCode(code){
    const clean = String(code || '').trim();
    if (!clean || handlingCode) return;

    const now = Date.now();
    if (clean === lastCode && (now - lastCodeAt) < DUP_MS) return;
    lastCode = clean;
    lastCodeAt = now;
    handlingCode = true;

    tip(clean);
    if (ui.barcodeInput) ui.barcodeInput.value = clean;
    if (navigator.vibrate) navigator.vibrate(30);

    try {
      if (typeof window.__doBarcodeLookup === 'function') {
        await window.__doBarcodeLookup();
      } else if (typeof window.resolveBarcode === 'function') {
        await autoResolve(clean);
      }
      setTimeout(() => {
        hideModal();
        stopAll();
      }, 500);
    } catch {
      // giữ modal mở để user quét lại
    } finally {
      setTimeout(() => { handlingCode = false; }, 800);
    }
  }

  async function autoResolve(code){
    const msgEl = document.getElementById('barcodeMsg');
    const elTen = document.getElementById('addTen');
    const setMsg = (t, ok = true) => {
      if (!msgEl) return;
      msgEl.textContent = t || '';
      msgEl.className = 'text-xs mt-1 ' + (ok ? 'text-emerald-700' : 'text-rose-600');
    };

    try {
      setMsg('Đang hỏi các nguồn…');
      const out = await window.resolveBarcode(code);
      if (elTen && !String(elTen.value || '').trim()) elTen.value = out.name || '';
      setMsg(`Đã lấy tên: “${out.name}”`);
      elTen?.focus();
    } catch (ex) {
      setMsg(ex.message || 'Tra cứu thất bại', false);
      throw ex;
    }
  }

  async function decodeImageFile(file){
    if (!file) return;
    const img = new Image();
    img.onload = async () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        const luminance = new ZXing.HTMLCanvasElementLuminanceSource(canvas);
        const bitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(luminance));
        const reader = new ZXing.MultiFormatReader();
        reader.setHints(buildHints());
        const result = reader.decode(bitmap);
        if (result && result.getText()) acceptCode(result.getText());
        else alert('Không đọc được mã trong ảnh.');
      } catch {
        alert('Không đọc được mã trong ảnh.');
      }
    };
    img.onerror = () => alert('Không mở được ảnh.');
    img.src = URL.createObjectURL(file);
  }

  ui.btnScan.addEventListener('click', async () => {
    if (!secureOk()) {
      tip('Cần mở trang qua HTTPS (hoặc http://localhost) để dùng camera.');
      return;
    }
    try {
      await navigator.mediaDevices.getUserMedia({ video: true });
    } catch {
      tip('Bị từ chối quyền camera.');
      return;
    }
    showModal();
    const devs = await listCameras();
    await startZXing(devs[0]?.deviceId || undefined);
    setTimeout(() => { if (!zxHit && !handlingCode) startQuaggaFallback(); }, 3500);
  });

  ui.btnClose.addEventListener('click', () => { hideModal(); stopAll(); });
  ui.camSelect.addEventListener('change', async () => {
    await startZXing(ui.camSelect.value || undefined);
    setTimeout(() => { if (!zxHit && !handlingCode) startQuaggaFallback(); }, 3000);
  });
  ui.btnTorch.addEventListener('click', async () => {
    try {
      const track = stream?.getVideoTracks?.[0];
      if (!track) return;
      const caps = track.getCapabilities?.() || {};
      if (!('torch' in caps)) {
        tip('Thiết bị không hỗ trợ bật đèn.');
        return;
      }
      const want = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: want }] });
      torchOn = want;
      ui.btnTorch.classList.toggle('bg-amber-500', torchOn);
      ui.btnTorch.classList.toggle('text-white', torchOn);
    } catch {}
  });

  ui.fileInput.addEventListener('change', (e) => decodeImageFile(e.target.files?.[0] || null));
})();
