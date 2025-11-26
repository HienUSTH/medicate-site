/* Medicate – Thiết bị (v6)
 * - Vendor/Nguồn mua: hiển thị dưới thông số (có URL -> hyperlink)
 * - Notes (localStorage)
 * - Thêm/Sửa/Xóa:
 *    + Custom: sửa/xóa trực tiếp (localStorage)
 *    + Default: sửa = override; xóa = ẩn; có khôi phục
 * - Thùng rác thiết bị + Hoàn tác + XÓA VĨNH VIỄN
 * - Block Diagram: nhiều bản vẽ (tạo/chọn/đổi tên/lưu/xóa vào thùng rác),
 *   thùng rác sơ đồ riêng; kéo thả, nối, nhãn; lưu localStorage
 */

(function(){
  // ====== DEFAULT DATA ======
  const DEF = [
    { id:"cam-bien", name:"Cảm biến", desc:"Các cảm biến đo lường môi trường và vào/ra.", items:[
      { name:"DHT22 Temperature & Humidity Sensor",
        specs:["Đo nhiệt/ẩm: -40–80°C, 0–100%RH","Độ chính xác: ±0.5°C; ±2–5%RH","Nguồn: 3.3–5.5V; giao tiếp 1-wire"],
        img:"assets/img/devices/dht22.jpg", url:"", vendorBase:{ name:"Nshop", url:"https://nshopvn.com/product/module-cam-bien-do-am-nhiet-do-dht22"} },
      { name:"Module GM65 (Barcode/QR)",
        specs:["Đọc 1D/2D: QR, Code128, EAN-13…","Giao tiếp UART/TTL, 3.3–5V","Tốc độ đọc cao, đèn chiếu tích hợp"],
        img:"assets/img/devices/gm65.jpg", url:"", vendorBase:{ name:"Nshop", url:"https://nshopvn.com/product/module-quet-ma-vach-1d-2d-qr-gm65" } }
    ]},
    { id:"vi-dieu-khien", name:"Vi điều khiển", desc:"Board xử lý trung tâm, kết nối Wi-Fi/BLE.", items:[
      { name:"ESP32 DevKit",
        specs:["Wi-Fi 2.4GHz, Bluetooth BLE","2× Tensilica @240MHz, SRAM ~520KB","GPIO đa năng, ADC/DAC, SPI/I2C/UART"],
        img:"assets/img/devices/esp32.jpg", url:"", vendorBase:{ name:"Shopee", url:"https://shopee.vn/ESP32-WROOM-32-TYPE-C-38-PIN-DEVKIT-KIT-WIFI-PHÁT-TRIỂN-HỌ-ESP-i.1045034041.24188409447"} }
    ]},
    { id:"man-hinh", name:"Màn hình hiển thị", desc:"Module hiển thị thông tin trạng thái.", items:[
      { name:"LCD TFT 2.8 inch",
        specs:["Màu, có phiên bản cảm ứng","Độ phân giải 320×240","Giao tiếp SPI/8080; nguồn 3.3/5V tuỳ module"], img:"assets/img/devices/lcd.jpg", url:"", vendorBase:{ name:"Shopee", url:"https://shopee.vn/Bảng-Mạch-Phát-Triển-ESP32-Màn-Hình-Cảm-Ứng-LCD-TFT-2.8-Kết-Nối-Bluetooth-i.141578221.23372662754"} }
    ]},
    { id:"nguon-pin", name:"Nguồn / Pin", desc:"Cung cấp năng lượng cho hệ thống.", items:[
      { name:"Nguồn Meanwell HRP-75-3.3", specs:["AC-DC","Output CV","Công suất 49.5W","Điện áp đầu ra 3V","Dòng điện đầu ra 15A"], img:"assets/img/devices/hrp753.3.jpg", url:"", vendorBase:{ name:"Meanwell", url:"https://dailymeanwell.com.vn/nguon-mean-well-hrp-75-3-3-49-5w-3v-15a/" } },
      { name:"Pin sạc", specs:["3.2V","12.5AH"], img:"assets/img/devices/pin.jpg", url:"", vendorBase:{ name:"Tự sản xuất", url:"" } },
    ]},
    { id:"giam-ap", name:"Module giảm áp", desc:"Buck converter hạ áp từ nguồn cao xuống mức dùng được.", items:[
      { name:"MP1584 (5V→3.3V)", specs:["Dòng tối đa ~3A","Hiệu suất cao, kích thước nhỏ"], img:"assets/img/devices/mp1584.jpg", url:"", vendorBase:{ name:"Shopee", url:"https://shopee.vn/Mạch-nguồn-hạ-áp-DC-DC-MP1584-5V-3A-i.144587162.14306393686"} },
      { name:"LM2596S 3A (hạ xuống 5V)", specs:["Dòng tối đa 3A","Có biến trở chỉnh áp"], img:"assets/img/devices/lm2596s.jpg", url:"", vendorBase:{ name:"Shopee", url:"https://shopee.vn/Mạch-Hạ-Áp-3A-LM2596S-DC-DC-(-hạ-từ-3-40v-xuống-dải-1.25-33v)-từ-Hà-Nội-Hifi-i.121774202.9655883528" } }
    ]},
    { id:"phu-kien", name:"Phụ kiện", desc:"Dây nối, và linh kiện phụ trợ.", items:[
      { name:"Dây nối", specs:["Jumper","Chiều dài ~21 - 30 cm"], img:"assets/img/devices/jumper.jpg", url:"", vendorBase:{ name:"Shopee", url:"https://shopee.vn/Dây-cắm-test-board-20-cm-lõi-đồng-mối-tiếp-xúc-tốt-và-chắc-chắn-kết-nối-siêu-nhanh-i.16504852.7050771926?extraParams=%7B" } },
      { name:"Tấm nhôm tản nhiệt", specs:["Tản nhiệt cho vi điều khiển","8.5 x 10 cm"], img:"assets/img/devices/nhom.jpg", url:"", vendorBase:{ name:"Linh kiện 3M", url:"https://chotroihn.vn/tan-nhiet-nhom-78xx-21x15x10mm?srsltid=AfmBOooghoj95nqUxqeF8G6mx33MO_iFd4kLS3xkfWhg7VEq0tE4ucTG" } }
    ]}
  ];

  // ====== STORAGE KEYS ======
  const LS_CUSTOM   = "medicate_devices_custom_v4";
  const LS_OVR      = "medicate_devices_overrides_v1";
  const LS_NOTES    = "medicate_device_notes_v1";
  const LS_TRASH    = "medicate_devices_trash_v2"; // + delete forever
  // Diagrams (multi)
  const LS_DIAGRAMS = "medicate_diagrams_v1";       // {id:{id,name,nodes,links,deleted?:true}}
  const LS_DG_CUR   = "medicate_diagrams_current_v1";
  const LS_DG_TRASH = "medicate_diagrams_trash_v1"; // [{id,name,nodes,links,when}]

  // ====== STATE ======
  let DATA = rebuild();
  let CONNECT_MODE = false;
  let SELECTED_FOR_ADD = [];

  // ====== HELPERS ======
  const $  = (s,root=document)=>root.querySelector(s);
  const $$ = (s,root=document)=>Array.from(root.querySelectorAll(s));
  const byId=id=>document.getElementById(id);
  const qs=k=>new URL(location.href).searchParams.get(k);
  const uid=()=>Math.random().toString(36).slice(2,10);
  // Các accordion đang mở (để giữ trạng thái sau khi render lại)
  function getOpenCats() {
    return Array.from(document.querySelectorAll('#device-accordions details[open]'))
                .map(d => d.dataset.cat);
  }
  function load(k,def){ try{ return JSON.parse(localStorage.getItem(k) ?? (def!==undefined?JSON.stringify(def):"null")); }catch{return def;} }
  function save(k,v){ localStorage.setItem(k, JSON.stringify(v)); }

  function itemKey(catId, name){ return `${catId}::${name}`; }
  function svgPlaceholder(){
    return `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360'>
        <rect width='100%' height='100%' fill='#eef2ff'/>
        <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle'
          font-family='system-ui,Segoe UI,Roboto' font-size='16' fill='#64748b'>No image</text>
      </svg>`)}`
  }

  // ====== BUILD DATA (default + overrides + custom) ======
  function rebuild(){
    const ovr = load(LS_OVR, {});
    // giữ lại đoạn sanitize vendor rỗng nếu bạn đang có

    const custom = load(LS_CUSTOM, []);
    return DEF.map(c=>{
      const items=[];
      c.items.forEach(base=>{
        const key=itemKey(c.id, base.name);
        const o=ovr[key];

        if(o && o.hidden) return;

        // merged: luôn giữ vendorBase từ seed; còn vendors (mảng) lấy từ override nếu có
        const merged = {
          ...base,                     // có vendorBase ở seed
          ...(o && o.data ? { ...o.data } : {})
        };
        // nếu override/data có 'vendor' cũ -> chuyển thành vendors[0]
        if (merged.vendor && !merged.vendors) {
          merged.vendors = [ merged.vendor ];
          delete merged.vendor;
        }
        items.push({
          ...merged,
          vendors: merged.vendors || [],  // đảm bảo là mảng
          __isDefault:true, __baseName:base.name, __catId:c.id
        });
      });

      custom.filter(x=>x.cat===c.id).forEach(x=>{
        // custom: không có vendorBase; chỉ có vendors (mảng)
        let vendors = x.vendors || [];
        if (!vendors.length && x.vendor) vendors = [x.vendor];
        items.push({
          name:x.name, img:x.img||"", url:x.url||"",
          vendorBase:null,
          vendors, specs:x.specs||[],
          __custom:true, __id:x.id, __catId:c.id, __baseName:x.name
        });
      });
      return {id:c.id, name:c.name, desc:c.desc, items};
    });
  }


  // ====== TOAST / UNDO ======
  function showToast(html, undoFn){
    const wrap=byId("toast");
    wrap.className="fixed bottom-4 right-4 max-w-sm bg-white border border-slate-200 rounded-xl shadow-lg p-3 flex items-center gap-3";
    wrap.innerHTML=`<div class="text-sm">${html}</div>
      ${undoFn?'<button id="toastUndo" class="ml-auto text-sky-700 underline underline-offset-2 text-sm">Hoàn tác</button>':''}
      <button id="toastClose" class="ml-1 text-slate-500 hover:text-slate-700">✕</button>`;
    wrap.classList.remove("hidden");
    const close=()=>wrap.classList.add("hidden");
    byId("toastClose").onclick=close;
    if(undoFn) byId("toastUndo").onclick=()=>{undoFn();close();};
    setTimeout(close,6000);
  }

  // ====== RENDER ACCORDIONS ======
  function renderAccordions(filter = "", openCats = null) {
    const q = (filter || "").toLowerCase().trim();
    const wrap = byId("device-accordions");
    const notes = load(LS_NOTES, {});

    wrap.innerHTML = DATA.map(cat => {
      const items = cat.items.filter(it => {
        const hay = (it.name + " " + (it.specs || []).join(" ")).toLowerCase();
        return q ? hay.includes(q) : true;
      });
      if (!items.length) return "";

      const rows = items.map(it => {
        const noteK = itemKey(cat.id, it.name);

// A) Vendor gốc (code)
      const baseV = it.vendorBase;
      const vendorBaseHtml =
        `<div class="mt-2 text-sm">
          <span class="text-slate-500">Nguồn mua (gốc):</span>
          ${
            baseV && (baseV.name || baseV.url)
              ? (baseV.url
                    ? ` <a class="text-sky-700 hover:underline" target="_blank" rel="noopener" href="${baseV.url}">${baseV.name || baseV.url}</a>`
                    : ` <span class="text-slate-700">${baseV.name}</span>`)
              : ` <em class="text-slate-400">(chưa có)</em>`
          }
        </div>`;

      // B) Vendor khác (người dùng)
      const v0 = (it.vendors && it.vendors[0]) || null;
      const vendorExtraHtml =
        `<div class="mt-1 text-sm">
          <span class="text-slate-500">Nguồn mua khác:</span>
          ${
            v0 && (v0.name || v0.url)
              ? (v0.url
                    ? ` <a class="text-sky-700 hover:underline" target="_blank" rel="noopener" href="${v0.url}">${v0.name || v0.url}</a>`
                    : ` <span class="text-slate-700">${v0.name}</span>`)
              : ` <em class="text-slate-400">(chưa có)</em>`
          }
        </div>`;


        // 2) Datasheet
        const datasheetHtml = it.url
          ? `<div class="mt-1 text-sm">Datasheet: <a class="text-sky-700 hover:underline" target="_blank" rel="noopener" href="${it.url}">${new URL(it.url).hostname}</a></div>`
          : `<div class="mt-1 text-sm text-slate-400 italic">Datasheet (chưa có)</div>`;

        // 3) Thuộc tính nút Sửa/Xóa
        const editAttrs = it.__custom
          ? `data-edit="custom" data-id="${it.__id}" data-cat="${cat.id}"`
          : `data-edit="default" data-base="${it.__baseName}" data-cat="${cat.id}"`;
        const delAttrs  = it.__custom
          ? `data-del="custom" data-id="${it.__id}"`
          : `data-del="default" data-base="${it.__baseName}" data-cat="${cat.id}"`;

        // 4) Template item
        return `
        <div class="flex flex-col md:flex-row gap-4 p-3 rounded-xl border border-slate-200 bg-white">
          <div class="md:w-64 w-full aspect-video bg-slate-100 overflow-hidden rounded-lg flex items-center justify-center">
            <img src="${it.img || ""}" alt="${it.name}" class="w-full h-full object-cover"
                onerror="this.onerror=null;this.src='${svgPlaceholder()}'">
          </div>
          <div class="flex-1">
            <div class="font-medium">${it.name}</div>
            <ul class="mt-2 text-sm text-slate-700 list-disc pl-5 space-y-1">
              ${(it.specs || []).map(s => `<li>${s}</li>`).join("")}
            </ul>
            ${datasheetHtml}
            ${vendorBaseHtml}
            ${vendorExtraHtml}
            <div class="mt-3 flex flex-wrap gap-2">
              <label class="text-xs text-slate-500">Notes:</label>
              <textarea data-note-key="${noteK}" class="w-full md:w-[min(520px,100%)] rounded-lg border border-slate-300 p-2 text-sm" rows="2"
                        placeholder="Ghi chú / nơi mua / giá / mã đơn…">${notes[noteK] || ""}</textarea>
            </div>
            <div class="mt-2 flex flex-wrap items-center gap-3">
              <label class="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" class="accent-sky-600" data-select-device data-cat="${cat.id}" data-name="${it.name}">
                <span>Chọn để thêm vào sơ đồ</span>
              </label>
              <button class="px-3 py-1.5 text-sm rounded-lg border border-slate-300 hover:bg-slate-50" ${editAttrs}>Sửa</button>
              <button class="px-3 py-1.5 text-sm rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50" ${delAttrs}>Xóa</button>
            </div>
          </div>
        </div>`;
      }).join("");

      // 5) Giữ accordion đang mở
      const opened = openCats ? openCats.includes(cat.id) : (qs("cat") === cat.id);

      return `
      <details class="group rounded-2xl border border-slate-200 bg-white overflow-hidden" data-cat="${cat.id}" ${opened ? "open" : ""}>
        <summary class="summary-btn cursor-pointer select-none flex items-center justify-between gap-4 px-5 py-3">
          <div>
            <div class="font-semibold">${cat.name}</div>
            <p class="text-sm text-slate-600">${cat.desc}</p>
          </div>
          <svg class="w-5 h-5 text-slate-400 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m19 9-7 7-7-7"/>
          </svg>
        </summary>
        <div class="p-5 bg-slate-50"><div class="grid gap-4">${rows}</div></div>
      </details>`;
    }).join("") || `<div class="rounded-2xl border border-dashed p-6 text-slate-500 bg-white">
      Không tìm thấy thiết bị phù hợp với từ khoá <span class="font-medium">"${filter}"</span>.
    </div>`;

    // bind notes + select + edit/delete
    $$('textarea[data-note-key]').forEach(t=>{
      t.addEventListener('change',()=>{ const o=load(LS_NOTES,{}); o[t.dataset.noteKey]=t.value; save(LS_NOTES,o); });
    });
    $$('input[data-select-device]').forEach(chk=>{
      chk.addEventListener('change',()=>{
        const key=chk.dataset.cat+"::"+chk.dataset.name;
        if(chk.checked){ if(!SELECTED_FOR_ADD.includes(key)) SELECTED_FOR_ADD.push(key); }
        else { SELECTED_FOR_ADD = SELECTED_FOR_ADD.filter(k=>k!==key); }
      });
    });
    $$('button[data-edit]').forEach(b=>b.addEventListener('click',()=>openEditDialog(b)));
    $$('button[data-del]').forEach(b=>b.addEventListener('click',()=>handleDelete(b)));
  }

  // ====== SEARCH ======
  byId("dev-search")?.addEventListener("input", e=>renderAccordions(e.target.value||""));

  // ====== DEVICE DIALOG ======
  const dlg=byId("dlgAdd");
  const fMode=byId("fMode"), fId=byId("fId"), fBaseCat=byId("fBaseCat"), fBaseName=byId("fBaseName");
  const fCat=byId("fCat"), fName=byId("fName"), fImg=byId("fImg"), fUrl=byId("fUrl");
  const fVendorName=byId("fVendorName"), fVendorUrl=byId("fVendorUrl"), fSpecs=byId("fSpecs");
  const fBaseVendorView = byId("fBaseVendorView");
  const fImgFile = byId("fImgFile");
  const fImgPreview = byId("fImgPreview");
  if (fImgFile) {
    fImgFile.addEventListener("change", () => {
      fImgPreview.textContent = "";
      const file = fImgFile.files && fImgFile.files[0];
      if (!file) return;
      fImgPreview.textContent = `${file.name} • ${Math.floor(file.size/1024)} KB`;
    });
  }
  const btnClearImg = byId("btnClearImg");
  if (btnClearImg) {
    btnClearImg.addEventListener("click", () => {
      fImg.value = "";
      if (fImgFile) fImgFile.value = "";
      if (fImgPreview) fImgPreview.textContent = "";
    });
  }  
  const btnAdd=byId("btnAddDevice"), btnCancel=byId("btnDlgCancel"), btnSave=byId("btnDlgSave"), btnDel=byId("btnDlgDelete"), btnRestore=byId("btnDlgRestore");
  fCat.innerHTML = DEF.map(c=>`<option value="${c.id}">${c.name}</option>`).join("");

  btnAdd.addEventListener("click",()=>{
    byId("dlgTitle").textContent = "Thêm thiết bị";
    fMode.value = "add"; fId.value=""; fBaseCat.value=""; fBaseName.value="";
    fCat.value = DEF[0].id; fName.value = ""; fImg.value = ""; fUrl.value = "";
    fVendorName.value = JSON.parse(localStorage.getItem("medicate_def_vendor_name") || "null") || "";
    fVendorUrl.value  = JSON.parse(localStorage.getItem("medicate_def_vendor_url")  || "null") || "";
    fSpecs.value = "";
    if (fImgFile) fImgFile.value = "";
    if (fImgPreview) fImgPreview.textContent = "";
    btnDel.classList.add("hidden"); btnRestore.classList.add("hidden");
    dlg.showModal();
  });
  btnCancel.addEventListener("click", e => { e.preventDefault(); dlg.close(); });

  btnSave.addEventListener("click", async (e) => {
    e.preventDefault();

    // Giữ trạng thái UI đang mở + vị trí cuộn
    const openCats = getOpenCats();
    const scrollY = window.scrollY;

    // Lưu vendor người dùng nhập cho lần sau (auto-fill) — không ảnh hưởng vendorBase
    const venName = (fVendorName.value || "").trim();
    const venUrl  = (fVendorUrl.value  || "").trim();
    try {
      localStorage.setItem("medicate_def_vendor_name", JSON.stringify(venName));
      localStorage.setItem("medicate_def_vendor_url",  JSON.stringify(venUrl));
    } catch {}

    // KHÔNG auto-chèn "Nguồn mua:" vào specs
    const specsArr = (fSpecs.value || "")
      .split("\n")
      .map(s => s.trim())
      .filter(Boolean);

    // Ảnh: ưu tiên file upload nếu có
    let finalImg = (fImg.value || "").trim();
    const file = (typeof fImgFile !== "undefined" && fImgFile && fImgFile.files && fImgFile.files[0]) ? fImgFile.files[0] : null;
    if (file) {
      finalImg = await new Promise((resolve) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);  // data URL
        fr.readAsDataURL(file);
      });
    }

    // vendors: mảng “Nguồn mua khác” (UI hiện chỉ nhập 1 nguồn)
    const vendors = (venName || venUrl) ? [{ name: venName || "", url: venUrl || "" }] : [];

    // Core record (không đụng vendorBase)
    const recCore = {
      cat:   fCat.value,
      name:  (fName.value || "").trim(),
      img:   finalImg,
      url:   (fUrl.value || "").trim(),
      specs: specsArr
    };
    if (!recCore.name) return;

    if (fMode.value === "add") {
      const arr = load(LS_CUSTOM, []);
      const next = { id: "dev_" + uid(), ...recCore };
      if (vendors.length) next.vendors = vendors; // chỉ thêm nếu có
      save(LS_CUSTOM, [...arr, next]);

    } else if (fMode.value === "edit-custom") {
      const arr = load(LS_CUSTOM, []);
      const idx = arr.findIndex(x => x.id === fId.value);
      if (idx >= 0) {
        const next = { id: fId.value, ...recCore };
        if (vendors.length) next.vendors = vendors; // rỗng thì không ghi, sẽ xóa field cũ
        arr[idx] = next;
        save(LS_CUSTOM, arr);
      }

    } else if (fMode.value === "edit-default") {
      const ovr = load(LS_OVR, {});
      const key = itemKey(fBaseCat.value, fBaseName.value);

      // Bắt đầu từ data cũ (nếu có), merge với core mới
      const prevData = (ovr[key] && ovr[key].data) ? ovr[key].data : {};
      const newData  = { ...prevData, ...recCore };

      if (vendors.length) {
        // User có nhập nguồn mua khác -> set vendors mới
        newData.vendors = vendors;
      } else {
        // User để trống -> XÓA hẳn vendors (và cả vendor kiểu cũ nếu còn) khỏi override
        delete newData.vendors;
        delete newData.vendor;
      }

      ovr[key] = { ...(ovr[key] || {}), hidden: false, data: newData };
      save(LS_OVR, ovr);
    }

    // Clear nhẹ phần upload
    if (typeof fImgFile !== "undefined" && fImgFile) fImgFile.value = "";
    if (typeof fImgPreview !== "undefined" && fImgPreview) fImgPreview.textContent = "";

    // Rebuild & render lại — GIỮ các accordion đang mở và vị trí scroll
    DATA = rebuild();
    dlg.close();
    renderAccordions(byId("dev-search")?.value || "", openCats);
    window.scrollTo({ top: scrollY });
  });

  btnDel.addEventListener("click",e=>{
    e.preventDefault();
    if(!confirm("Xác nhận xóa thiết bị?")) return;

    const trash=load(LS_TRASH,[]);
    if(fMode.value==="edit-custom"){
      const arr=load(LS_CUSTOM,[]);
      const rec=arr.find(x=>x.id===fId.value);
      save(LS_CUSTOM, arr.filter(x=>x.id!==fId.value));
      trash.unshift({type:"custom", rec, when:Date.now()}); save(LS_TRASH,trash);
      showToast(`Đã xóa thiết bị <b>${rec.name}</b>.`, ()=>{
        const t=load(LS_TRASH,[]); const item=t.find(x=>x.type==="custom"&&x.rec.id===rec.id);
        if(item){ save(LS_CUSTOM,[item.rec,...load(LS_CUSTOM,[])]); save(LS_TRASH,t.filter(x=>x!==item)); DATA=rebuild(); renderAccordions(byId("dev-search")?.value||""); }
      });
    }else{
      const ovr=load(LS_OVR,{}); const key=itemKey(fBaseCat.value,fBaseName.value);
      const prev=ovr[key]||null; ovr[key]={...(ovr[key]||{}), hidden:true}; save(LS_OVR,ovr);
      trash.unshift({type:"default", key, prev, when:Date.now()}); save(LS_TRASH,trash);
      showToast(`Đã ẩn thiết bị <b>${fBaseName.value}</b>.`, ()=>{
        const t=load(LS_TRASH,[]); const item=t.find(x=>x.type==="default"&&x.key===key);
        if(item){ const o=load(LS_OVR,{}); if(item.prev) o[key]=item.prev; else delete o[key]; save(LS_OVR,o); save(LS_TRASH,t.filter(x=>x!==item)); DATA=rebuild(); renderAccordions(byId("dev-search")?.value||""); }
      });
    }
    DATA=rebuild(); dlg.close(); renderAccordions(byId("dev-search")?.value||"");
  });

  btnRestore.addEventListener("click",e=>{
    e.preventDefault();
    const ovr=load(LS_OVR,{}); const key=itemKey(fBaseCat.value,fBaseName.value);
    if(ovr[key]){ delete ovr[key].hidden; if(!ovr[key].data) delete ovr[key]; }
    save(LS_OVR,ovr); DATA=rebuild(); dlg.close(); renderAccordions(byId("dev-search")?.value||"");
  });

  function openEditDialog(btn){
  // Mặc định cho thiết bị custom (không có vendor gốc)
  fBaseVendorView.innerHTML = `<div class="mb-1">
    <span class="text-slate-500">Nguồn mua (gốc):</span>
    <em class="text-slate-400">(không có — thiết bị tự thêm)</em>
  </div>`;

  const type = btn.dataset.edit || btn.dataset.del;

  if(type==="custom"){
    const id = btn.dataset.id;
    const rec = load(LS_CUSTOM, []).find(x=>x.id===id);
    if(!rec) return;

    byId("dlgTitle").textContent="Sửa thiết bị (Custom)";
    fMode.value="edit-custom"; fId.value=rec.id; fBaseCat.value=""; fBaseName.value="";
    fCat.value=rec.cat; fName.value=rec.name; fImg.value=rec.img||""; fUrl.value=rec.url||"";
    // LẤY vendor từ mảng vendors (không dùng rec.vendor nữa)
    const v0 = (rec.vendors && rec.vendors[0]) || null;
    fVendorName.value = v0?.name || "";
    fVendorUrl.value  = v0?.url  || "";
    fSpecs.value=(rec.specs||[]).join("\n");

    btnDel.classList.remove("hidden"); btnRestore.classList.add("hidden");
    dlg.showModal();
    return;
  }

  // type default (sửa item mặc định -> override)
  const base = btn.dataset.base;
  const catId = btn.dataset.cat;
  const cat = DATA.find(c=>c.id===catId);
  const it  = cat?.items.find(x=>x.__isDefault && x.__baseName===base);
  if(!it) return;

  // Hiển thị vendor gốc (read-only)
  const baseV = it.vendorBase;
  fBaseVendorView.innerHTML = `<div class="mb-1">
    <span class="text-slate-500">Nguồn mua (gốc):</span>
    ${
      baseV && (baseV.name || baseV.url)
        ? (baseV.url
            ? `<a class="text-sky-700 hover:underline" href="${baseV.url}" target="_blank" rel="noopener">${baseV.name || baseV.url}</a>`
            : `<span class="text-slate-700">${baseV.name}</span>`)
        : `<em class="text-slate-400">(chưa có)</em>`
    }
  </div>`;

  // Nguồn mua khác (do user nhập)
  const v0 = (it.vendors && it.vendors[0]) || null;
  fVendorName.value = v0?.name || "";
  fVendorUrl.value  = v0?.url  || "";

  const ovr = load(LS_OVR,{});
  const key = itemKey(catId, base);
  const hidden = !!(ovr[key] && ovr[key].hidden);

  byId("dlgTitle").textContent="Sửa thiết bị (Mặc định — sẽ tạo bản ghi đè)";
  fMode.value="edit-default"; fId.value=""; fBaseCat.value=catId; fBaseName.value=base;
  fCat.value=catId; fName.value=it.name; fImg.value=it.img||""; fUrl.value=it.url||"";
  fSpecs.value=(it.specs||[]).join("\n");
  btnDel.textContent= hidden?"Đang ẩn":"Xóa";
  btnDel.classList.remove("hidden");
  btnRestore.classList.toggle("hidden", !hidden);

  dlg.showModal();
}

  // ====== BLOCK DIAGRAM MULTI ======
  const svg=byId("diagramCanvas");
  let DG = { id:null, name:"", nodes:[], links:[] };

  function ensureFirstDiagram(){
    const all = load(LS_DIAGRAMS,{});
    const ids = Object.keys(all).filter(id=>!all[id].deleted);
    if(ids.length===0){
      const id="dg_"+uid();
      all[id]={id,name:"Sơ đồ 1",nodes:[],links:[]};
      save(LS_DIAGRAMS,all); save(LS_DG_CUR,id);
    }
  }
  function loadCurrentDiagram(){
    ensureFirstDiagram();
    const all=load(LS_DIAGRAMS,{});
    let id = load(LS_DG_CUR,null);
    if(!id || !all[id] || all[id].deleted){ id = Object.keys(all).find(k=>!all[k].deleted); save(LS_DG_CUR,id); }
    DG = JSON.parse(JSON.stringify(all[id]));
  }
  function saveCurrentDiagram(){
    const all=load(LS_DIAGRAMS,{});
    all[DG.id]={ id:DG.id, name:DG.name, nodes:DG.nodes, links:DG.links };
    save(LS_DIAGRAMS,all);
  }
  function setCurrentDiagram(id){
    const all=load(LS_DIAGRAMS,{});
    if(all[id] && !all[id].deleted){ save(LS_DG_CUR,id); loadCurrentDiagram(); renderDiagram(); fillDiagramSelect(); }
  }
  function fillDiagramSelect(){
    const sel=byId("diagramSelect");
    const all=load(LS_DIAGRAMS,{});
    const ids=Object.keys(all).filter(i=>!all[i].deleted);
    sel.innerHTML = ids.map(i=>`<option value="${i}">${all[i].name}</option>`).join("");
    sel.value = DG.id;
  }

  // diagram canvas renderer
  function renderDiagram(){
    svg.innerHTML="";
    // links
    DG.links.forEach(e=>{
      const a=DG.nodes.find(n=>n.id===e.from);
      const b=DG.nodes.find(n=>n.id===e.to);
      if(!a||!b) return;
      const x1=a.x+a.w/2, y1=a.y+a.h/2, x2=b.x+b.w/2, y2=b.y+b.h/2;
      const line=document.createElementNS("http://www.w3.org/2000/svg","line");
      line.setAttribute("x1",x1); line.setAttribute("y1",y1); line.setAttribute("x2",x2); line.setAttribute("y2",y2);
      line.setAttribute("stroke","#64748b"); line.setAttribute("stroke-width","2.5"); line.style.cursor="text";
      line.addEventListener("click",()=>{ const lbl=prompt("Nhãn đường nối:",e.label||""); if(lbl!==null){ e.label=lbl; renderDiagram(); } });
      svg.appendChild(line);
      if(e.label){
        const tx=document.createElementNS("http://www.w3.org/2000/svg","text");
        tx.setAttribute("x",(x1+x2)/2); tx.setAttribute("y",(y1+y2)/2-6);
        tx.setAttribute("text-anchor","middle"); tx.setAttribute("font-size","12"); tx.setAttribute("fill","#334155");
        tx.textContent=e.label; svg.appendChild(tx);
      }
    });
    // nodes
    DG.nodes.forEach(n=>{
      const g=document.createElementNS("http://www.w3.org/2000/svg","g"); g.setAttribute("transform",`translate(${n.x},${n.y})`);
      const r=document.createElementNS("http://www.w3.org/2000/svg","rect");
      r.setAttribute("width",n.w); r.setAttribute("height",n.h); r.setAttribute("rx",12); r.setAttribute("ry",12);
      r.setAttribute("fill","#e2f2ff"); r.setAttribute("stroke","#0ea5e9"); r.setAttribute("stroke-width","1.5");
      const t=document.createElementNS("http://www.w3.org/2000/svg","text");
      t.setAttribute("x",n.w/2); t.setAttribute("y",n.h/2+4); t.setAttribute("text-anchor","middle"); t.setAttribute("font-size","13"); t.setAttribute("fill","#0f172a"); t.textContent=n.label;
      g.appendChild(r); g.appendChild(t);

      // drag
      let dragging=false, ox=0, oy=0;
      g.addEventListener("mousedown",(ev)=>{ dragging=true; ox=ev.offsetX-n.x; oy=ev.offsetY-n.y; });
      svg.addEventListener("mousemove",(ev)=>{ if(!dragging) return; n.x=ev.offsetX-ox; n.y=ev.offsetY-oy; renderDiagram(); });
      window.addEventListener("mouseup",()=>{ if(dragging){ dragging=false; } });

      // connect
      g.style.cursor = CONNECT_MODE ? "copy" : "move";
      g.addEventListener("click",()=>{ if(CONNECT_MODE) selectForConnect(n.id); });

      svg.appendChild(g);
    });
  }
  let CONNECT_PENDING=null;
  function selectForConnect(id){
    if(!CONNECT_PENDING){ CONNECT_PENDING=id; return; }
    if(CONNECT_PENDING===id){ CONNECT_PENDING=null; return; }
    DG.links.push({ id:"e"+uid(), from:CONNECT_PENDING, to:id, label:"" });
    CONNECT_PENDING=null; CONNECT_MODE=false;
    byId("btnDiagramConnect").classList.remove("bg-sky-600","text-white");
    renderDiagram();
  }
  function addNode(label){ DG.nodes.push({ id:"n"+uid(), label, x:60+Math.random()*200, y:60+Math.random()*120, w:160, h:56 }); renderDiagram(); }

  // UI events for diagrams
  function setupDiagramUI(){
    loadCurrentDiagram(); renderDiagram(); fillDiagramSelect();

    byId("diagramSelect").addEventListener("change",e=> setCurrentDiagram(e.target.value));
    byId("btnDiagramNew").addEventListener("click",()=>{
      const name = prompt("Tên sơ đồ mới:", "Sơ đồ mới");
      if(!name) return;
      const all=load(LS_DIAGRAMS,{});
      const id="dg_"+uid(); all[id]={id,name,nodes:[],links:[]};
      save(LS_DIAGRAMS,all); save(LS_DG_CUR,id); loadCurrentDiagram(); renderDiagram(); fillDiagramSelect();
    });
    byId("btnDiagramRename").addEventListener("click",()=>{
      const name=prompt("Tên mới:", DG.name); if(!name) return;
      DG.name=name; saveCurrentDiagram(); fillDiagramSelect();
    });
    byId("btnDiagramSave").addEventListener("click",()=>{ saveCurrentDiagram(); showToast("Đã lưu sơ đồ."); });
    byId("btnDiagramDelete").addEventListener("click",()=>{
      if(!confirm("Chuyển sơ đồ hiện tại vào thùng rác?")) return;
      const all=load(LS_DIAGRAMS,{});
      const trash=load(LS_DG_TRASH,[]);
      trash.unshift({ ...DG, when:Date.now() });
      all[DG.id].deleted=true;
      save(LS_DIAGRAMS,all); save(LS_DG_TRASH,trash);
      setCurrentDiagram(Object.keys(all).find(k=>!all[k].deleted));
      showToast("Đã chuyển vào thùng rác sơ đồ.");
    });
    byId("btnDiagramTrash").addEventListener("click",()=>{
      const list=load(LS_DG_TRASH,[]);
      const host=byId("diagramTrashList");
      if(!list.length){ host.innerHTML=`<div class="text-slate-500 text-sm">Chưa có sơ đồ nào.</div>`; }
      else{
        host.innerHTML=list.map(d=>`
          <div class="border rounded-xl p-3 mb-2 bg-white">
            <div class="font-medium">${d.name}</div>
            <div class="text-xs text-slate-500">${new Date(d.when).toLocaleString()}</div>
            <div class="mt-2 text-right flex gap-2 justify-end">
              <button class="px-3 py-1.5 text-sm rounded-lg border border-slate-300 hover:bg-slate-50" data-dg-restore="${d.id}">Khôi phục</button>
              <button class="px-3 py-1.5 text-sm rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50" data-dg-delete="${d.id}">Xóa vĩnh viễn</button>
            </div>
          </div>`).join("");
        $$('#diagramTrashList [data-dg-restore]').forEach(b=>{
          b.addEventListener('click',()=>{
            const id=b.dataset.dgRestore;
            const list2=load(LS_DG_TRASH,[]);
            const item=list2.find(x=>x.id===id); if(!item) return;
            const all=load(LS_DIAGRAMS,{});
            all[id]={ id:item.id, name:item.name, nodes:item.nodes, links:item.links };
            save(LS_DIAGRAMS,all); save(LS_DG_TRASH,list2.filter(x=>x.id!==id));
            save(LS_DG_CUR,id); loadCurrentDiagram(); renderDiagram(); fillDiagramSelect();
            byId("dlgDiagramTrash").close();
          });
        });
        $$('#diagramTrashList [data-dg-delete]').forEach(b=>{
          b.addEventListener('click',()=>{
            if(!confirm("Xóa vĩnh viễn sơ đồ này?")) return;
            const list2=load(LS_DG_TRASH,[]).filter(x=>x.id!==b.dataset.dgDelete);
            save(LS_DG_TRASH,list2); byId("dlgDiagramTrash").close();
          });
        });
      }
      byId("dlgDiagramTrash").showModal();
    });
    byId("btnDiagramTrashClose").addEventListener("click",()=> byId("dlgDiagramTrash").close());

    byId("btnDiagramConnect").addEventListener("click",()=>{
      CONNECT_MODE=!CONNECT_MODE;
      byId("btnDiagramConnect").classList.toggle("bg-sky-600");
      byId("btnDiagramConnect").classList.toggle("text-white");
    });
    byId("btnDiagramAddSelected").addEventListener("click",()=>{
      if(!SELECTED_FOR_ADD.length){ alert("Hãy tick chọn thiết bị trước."); return; }
      SELECTED_FOR_ADD.forEach(k=>addNode(k.split("::")[1]));
      SELECTED_FOR_ADD=[]; $$('input[data-select-device]:checked').forEach(c=>c.checked=false);
    });
    byId("btnDiagramClear").addEventListener("click",()=>{
      if(!confirm("Xóa sạch node/edge trong canvas của sơ đồ hiện tại?")) return;
      DG.nodes=[]; DG.links=[]; renderDiagram();
    });
  }

  // ====== INIT ======
  renderAccordions("");
  setupDiagramUI();

// ====== DIRECT DELETE (from item card) ======
function handleDelete(btn) {
  const type = btn.dataset.del; // "custom" | "default"
  if(!confirm("Xác nhận xóa thiết bị?")) return;

  // Giữ trạng thái UI đang mở + vị trí cuộn
  const openCats = getOpenCats();
  const scrollY = window.scrollY;

  const trash = load(LS_TRASH, []);
  if (type === "custom") {
    const id = btn.dataset.id;
    const arr = load(LS_CUSTOM, []);
    const rec = arr.find(x => x.id === id);
    if (!rec) return;

    save(LS_CUSTOM, arr.filter(x => x.id !== id));
    trash.unshift({ type: "custom", rec, when: Date.now() });
    save(LS_TRASH, trash);

    showToast(`Đã xóa thiết bị <b>${rec.name}</b>.`, () => {
      const t = load(LS_TRASH, []);
      const item = t.find(x => x.type === "custom" && x.rec.id === rec.id);
      if (item) {
        save(LS_CUSTOM, [item.rec, ...load(LS_CUSTOM, [])]);
        save(LS_TRASH, t.filter(x => x !== item));
        DATA = rebuild();
        renderAccordions(byId("dev-search")?.value || "", openCats);
        window.scrollTo({ top: scrollY });
      }
    });

  } else {
    // default: ẩn bằng override.hidden, có thể hoàn tác
    const base = btn.dataset.base;
    const cat  = btn.dataset.cat;
    const key  = itemKey(cat, base);

    const ovr  = load(LS_OVR, {});
    const prev = ovr[key] || null;         // để hoàn tác
    ovr[key] = { ...(ovr[key] || {}), hidden: true };
    save(LS_OVR, ovr);

    trash.unshift({ type: "default", key, prev, when: Date.now() });
    save(LS_TRASH, trash);

    showToast(`Đã ẩn thiết bị <b>${base}</b>.`, () => {
      const t = load(LS_TRASH, []);
      const item = t.find(x => x.type === "default" && x.key === key);
      if (item) {
        const o = load(LS_OVR, {});
        if (item.prev) o[key] = item.prev; else delete o[key];
        save(LS_OVR, o);
        save(LS_TRASH, t.filter(x => x !== item));
        DATA = rebuild();
        renderAccordions(byId("dev-search")?.value || "", openCats);
        window.scrollTo({ top: scrollY });
      }
    });
  }

  DATA = rebuild();
  renderAccordions(byId("dev-search")?.value || "", openCats);
  window.scrollTo({ top: scrollY });
}

// ====== DEVICE TRASH DIALOG (FIXED) ======
function renderTrashList() {
  const list = load(LS_TRASH, []);
  const host = byId("trashList");
  if (!host) return;

  if (!list.length) {
    host.innerHTML = `<div class="text-slate-500 text-sm">Thùng rác đang trống.</div>`;
    return;
  }

  host.innerHTML = list.map(item => {
    const title = item.type === "custom" ? item.rec?.name : item.key.split("::")[1];
    const when  = new Date(item.when).toLocaleString();

    // dùng data-type + data-token RIÊNG BIỆT (không dùng "type:token" nữa)
    const token = item.type === "custom" ? item.rec.id : item.key;

    return `
      <div class="border rounded-xl p-3 mb-2 bg-white">
        <div class="font-medium">${title}</div>
        <div class="text-xs text-slate-500">${when}</div>
        <div class="mt-2 flex gap-2 justify-end">
          <button class="px-3 py-1.5 text-sm rounded-lg border border-slate-300 hover:bg-slate-50"
                  data-type="${item.type}" data-token="${token}" data-action="restore">Khôi phục</button>
          <button class="px-3 py-1.5 text-sm rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50"
                  data-type="${item.type}" data-token="${token}" data-action="purge">Xóa vĩnh viễn</button>
        </div>
      </div>`;
  }).join("");

  // Bind: Restore
  host.querySelectorAll('[data-action="restore"]').forEach(b => {
    b.addEventListener("click", () => {
      const type  = b.dataset.type;   // "custom" | "default"
      const token = b.dataset.token;  // id (custom) | key "cat::base" (default)
      const arr   = load(LS_TRASH, []);
      const idx   = arr.findIndex(x =>
        type === "custom" ? (x.type==="custom" && x.rec.id===token)
                          : (x.type==="default" && x.key===token)
      );
      if (idx < 0) return;
      const it = arr[idx];

      if (type === "custom") {
        save(LS_CUSTOM, [it.rec, ...load(LS_CUSTOM, [])]);
      } else {
        const o = load(LS_OVR, {});
        if (it.prev) o[it.key] = it.prev; else delete o[it.key];
        save(LS_OVR, o);
      }
      arr.splice(idx,1); save(LS_TRASH, arr);

      DATA = rebuild();
      renderAccordions(byId("dev-search")?.value || "");
      renderTrashList();
    });
  });

  // Bind: Purge (xóa vĩnh viễn)
  host.querySelectorAll('[data-action="purge"]').forEach(b => {
    b.addEventListener("click", () => {
      if (!confirm("Xóa vĩnh viễn mục này? Không thể hoàn tác.")) return;

      const type  = b.dataset.type;
      const token = b.dataset.token;
      const next  = load(LS_TRASH, []).filter(x =>
        type === "custom" ? !(x.type==="custom" && x.rec.id===token)
                          : !(x.type==="default" && x.key===token)
      );
      save(LS_TRASH, next);
      renderTrashList();
    });
  });
}

// nút mở/đóng thùng rác
const dlgTrashBtn = byId("btnTrash");
if (dlgTrashBtn) {
  dlgTrashBtn.addEventListener("click", () => {
    renderTrashList();
    byId("dlgTrash").showModal();
  });
}
byId("btnTrashClose")?.addEventListener("click", () => byId("dlgTrash").close());
})();
