/* scan.js – ZXing live + ZXing snapshot fallback + Quagga2 + overlay debug
 * Cần HTML:
 *  #btnScanCam, #scanModal, #scanVideo, #camSelect, #btnTorch, #btnCloseScan, #scanImage, #scanResult, #addBarcode
 * Nhúng:
 *  <script src="https://unpkg.com/@zxing/library@0.20.0"></script>
 *  <script src="https://unpkg.com/@ericblade/quagga2@2.0.0-beta.3/dist/quagga.js"></script>
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
  if (!ui.btnScan || !ui.modal) return;

  // overlay debug
  let overlay = null, octx = null;
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
    if(!overlay) return;
    const r = ui.video.getBoundingClientRect();
    overlay.width = r.width;
    overlay.height = r.height;
  }
  function clearOverlay(){ if(octx) octx.clearRect(0,0,overlay.width,overlay.height); }
  function drawGuide(){
    if(!octx) return;
    const w = overlay.width, h = overlay.height;
    const pw = Math.floor(w*0.8), ph = Math.floor(h*0.3);
    const x = Math.floor((w-pw)/2), y = Math.floor((h-ph)/2);
    octx.strokeStyle='rgba(0,255,0,.6)'; octx.lineWidth=2;
    octx.strokeRect(x,y,pw,ph);
  }

  // state
  let codeReader = null;
  let stream = null;
  let torchOn = false;
  let quaggaOn = false;
  let zxHit = false;
  let zxDeviceIdInUse = null;
  let snapshotTimer = null;

  const tip = (t) => { if (ui.resultEl) ui.resultEl.textContent = t || ''; };
  const secureOk = () =>
    location.protocol === 'https:' ||
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1';

  function showModal(){ ui.modal.classList.remove('hidden'); }
  function hideModal(){ ui.modal.classList.add('hidden'); }

  async function listCameras(){
    try{
      const ds = await ZXing.BrowserMultiFormatReader.listVideoInputDevices();
      ui.camSelect.innerHTML = ds.map(d=>`<option value="${d.deviceId}">${esc(d.label||('Camera '+d.deviceId.slice(0,6)))}</option>`).join('');
      return ds;
    }catch{ tip('Không liệt kê được camera.'); return []; }
  }
  function esc(s){ return String(s||'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }

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

  function stopZXing(){ try{ codeReader?.reset?.(); }catch{} }
  function stopAll(){
    stopZXing();
    try{ stream?.getTracks?.().forEach(t=>t.stop()); }catch{}
    stream = null; torchOn = false;
    ui.btnTorch?.classList.remove('bg-amber-500','text-white');
    if (quaggaOn && window.Quagga){ try{ Quagga.stop(); }catch{} quaggaOn = false; }
    if (snapshotTimer){ clearInterval(snapshotTimer); snapshotTimer = null; }
    clearOverlay();
  }

  async function startZXing(deviceId){
    stopAll(); zxHit=false; zxDeviceIdInUse = deviceId || null; ensureOverlay();
    if(!codeReader) codeReader = new ZXing.BrowserMultiFormatReader(buildHints());
    else codeReader.hints = buildHints();

    const tries = [
      { deviceId: deviceId || undefined, facingMode: deviceId ? undefined : { ideal:'environment' } },
      { deviceId: deviceId || undefined, facingMode: deviceId ? undefined : { ideal:'user' } }
    ];

    for(const t of tries){
      try{
        const constraints = {
          video: {
            deviceId: t.deviceId ? { exact: t.deviceId } : undefined,
            facingMode: t.facingMode,
            width: { ideal: 1920 }, height: { ideal: 1080 },
            frameRate: { ideal: 30 },
            advanced: [{ focusMode: 'continuous', zoom: 2.0 }]
          }, audio:false
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        ui.video.srcObject = stream;
        ui.video.setAttribute('playsinline','');
        ui.video.muted = true;
        await ui.video.play();

        resizeOverlay(); clearOverlay(); drawGuide();
        codeReader.decodeFromVideoDevice(t.deviceId || undefined, ui.video, onZXingResult);

        // Snapshot fallback: mỗi 700ms chụp 1 khung hình và decode
        snapshotTimer = setInterval(() => { if(!zxHit) trySnapshotDecode(); }, 700);

        return;
      }catch(e){ /* thử config tiếp */ }
    }
    tip('Không mở được camera.');
  }

  function onZXingResult(result, err){
    if(result && result.text){
      zxHit = true;
      showCode(String(result.text).trim());
    }
  }

  // ZXing snapshot decode (tăng tỷ lệ bắt với webcam laptop)
  function trySnapshotDecode(){
    try{
      const w = ui.video.videoWidth || 0, h = ui.video.videoHeight || 0;
      if (!w || !h) return;
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(ui.video, 0, 0, w, h);
      const luminance = new ZXing.HTMLCanvasElementLuminanceSource(canvas);
      const bitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(luminance));
      const reader = new ZXing.MultiFormatReader();
      reader.setHints(buildHints());
      const result = reader.decode(bitmap);
      if (result && result.getText()){
        zxHit = true;
        showCode(result.getText());
      }
    }catch(e){
      // im lặng, sẽ thử lại lần sau
    }
  }

  // Quagga2 fallback (mạnh cho 1D) + overlay boxes
  function startQuaggaFallback(){
    if(quaggaOn || !window.Quagga) return;
    quaggaOn = true; stopZXing();
    const target = ui.video.parentElement || ui.video;
    Quagga.init({
      inputStream: {
        name: 'Live', type: 'LiveStream', target,
        constraints: {
          width: { ideal: 1920 }, height: { ideal: 1080 },
          facingMode: 'environment',
          deviceId: zxDeviceIdInUse ? { exact: zxDeviceIdInUse } : undefined
        },
        area: { top: "30%", right: "10%", left: "10%", bottom: "30%" }
      },
      numOfWorkers: 0, frequency: 10, locate: true,
      decoder: { readers: ['ean_reader','ean_8_reader','upc_reader','code_128_reader','code_39_reader','i2of5_reader'] }
    }, (err)=>{
      if(err){ quaggaOn=false; tip('Quagga lỗi khởi tạo.'); return; }
      Quagga.start();
      Quagga.onProcessed((res)=>{
        clearOverlay(); drawGuide();
        if(!res) return;
        if(res.boxes){
          const boxes = res.boxes.filter(b => b !== res.box);
          drawBoxes(boxes.map(toPoints), 'rgba(0,170,255,0.7)');
        }
        if(res.box){ drawBoxes([toPoints(res.box)], 'rgba(0,255,100,0.9)'); }
      });
      Quagga.onDetected((data)=>{
        const code = data?.codeResult?.code;
        if(code) showCode(String(code).trim());
      });
    });
  }

  function toPoints(b){
    return (Array.isArray(b)? b : (b?.line || [])).map(p=>({x:p.x, y:p.y}));
  }

  function showCode(code){
    tip(code);
    if(ui.barcodeInput) ui.barcodeInput.value = code;
    if(typeof window.__doBarcodeLookup === 'function') window.__doBarcodeLookup();
    else if(typeof window.resolveBarcode === 'function') autoResolve(code);
    if(navigator.vibrate) navigator.vibrate(30);
  }

  async function autoResolve(code){
    const msgEl = document.getElementById('barcodeMsg');
    const elTen = document.getElementById('addTen');
    const elAlias = document.getElementById('addAlias');
    const setMsg = (t,ok=true)=>{ if(msgEl){ msgEl.textContent=t||''; msgEl.className='text-xs mt-1 ' + (ok?'text-emerald-700':'text-rose-600'); } };
    try{
      setMsg('Đang hỏi các nguồn…');
      const out = await window.resolveBarcode(code); // từ barcode.client.js
      if(elTen && !elTen.value) elTen.value = out.name;
      if(elAlias && !elAlias.value && out.alias) elAlias.value = out.alias;
      setMsg(`Đã lấy tên: “${out.name}”`);
      elTen?.focus();
    }catch(ex){
      setMsg(ex.message || 'Tra cứu thất bại', false);
    }
  }

  async function decodeImageFile(file){
    if(!file) return;
    const img = new Image();
    img.onload = async ()=>{
      try{
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width; canvas.height = img.height;
        ctx.drawImage(img,0,0);
        const luminance = new ZXing.HTMLCanvasElementLuminanceSource(canvas);
        const bitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(luminance));
        const reader = new ZXing.MultiFormatReader();
        reader.setHints(buildHints());
        const result = reader.decode(bitmap);
        if(result && result.getText()) showCode(result.getText());
        else alert('Không đọc được mã trong ảnh.');
      }catch{ alert('Không đọc được mã trong ảnh.'); }
    };
    img.onerror = ()=>alert('Không mở được ảnh.');
    img.src = URL.createObjectURL(file);
  }

  // Events
  ui.btnScan.addEventListener('click', async ()=>{
    if(!secureOk()) tip('Cần mở trang qua HTTPS (hoặc http://localhost) để dùng camera.');
    try{ await navigator.mediaDevices.getUserMedia({ video:true }); }catch{ tip('Bị từ chối quyền camera.'); return; }
    showModal();
    const devs = await listCameras();
    await startZXing(devs[0]?.deviceId || undefined);
    // Nếu ZXing live/snapshot chưa “ăn” sau 3.5s → bật Quagga fallback
    setTimeout(()=>{ if(!zxHit) startQuaggaFallback(); }, 3500);
  });

  ui.btnClose.addEventListener('click', ()=>{ hideModal(); stopAll(); });
  ui.camSelect.addEventListener('change', async ()=>{ await startZXing(ui.camSelect.value || undefined); setTimeout(()=>{ if(!zxHit) startQuaggaFallback(); }, 3000); });
  ui.btnTorch.addEventListener('click', async ()=>{
    try{
      const track = stream?.getVideoTracks?.[0];
      if(!track) return;
      const caps = track.getCapabilities?.()||{};
      if(!('torch' in caps)){ tip('Thiết bị không hỗ trợ bật đèn.'); return; }
      const want = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: want }] });
      torchOn = want;
      ui.btnTorch.classList.toggle('bg-amber-500', torchOn);
      ui.btnTorch.classList.toggle('text-white', torchOn);
    }catch{}
  });
  ui.fileInput.addEventListener('change', (e)=> decodeImageFile(e.target.files?.[0] || null));
})();
