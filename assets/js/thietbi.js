/* Medicate – Thiết bị
 * Render danh mục + thiết bị theo dữ liệu tĩnh bên dưới.
 * Có filter search, auto-open ?cat=..., và lưới category quick links.
 */

(function () {
  // ====== DATA ======
  const CATS = [
    {
      id: "cam-bien",
      name: "Cảm biến",
      desc: "Các cảm biến đo lường môi trường và vào/ra.",
      items: [
        {
          name: "DHT22 Temperature & Humidity Sensor",
          specs: [
            "Đo nhiệt/ẩm: -40–80°C, 0–100%RH",
            "Độ chính xác: ±0.5°C; ±2–5%RH",
            "Nguồn: 3.3–5.5V; giao tiếp 1-wire"
          ],
          img: "assets/img/devices/dht22.jpg"
        },
        {
          name: "Module GM65 (Barcode/QR)",
          specs: [
            "Đọc 1D/2D: QR, Code128, EAN-13…",
            "Giao tiếp UART/TTL, 3.3–5V",
            "Tốc độ đọc cao, đèn chiếu tích hợp"
          ],
          img: "assets/img/devices/gm65.jpg"
        }
      ]
    },
    {
      id: "vi-dieu-khien",
      name: "Vi điều khiển",
      desc: "Board xử lý trung tâm, kết nối Wi-Fi/BLE.",
      items: [
        {
          name: "ESP32 DevKit",
          specs: [
            "Wi-Fi 2.4GHz, Bluetooth BLE",
            "2× Tensilica @240MHz, SRAM ~520KB",
            "GPIO đa năng, ADC/DAC, SPI/I2C/UART"
          ],
          img: "assets/img/devices/esp32.jpg"
        }
      ]
    },
    {
      id: "man-hinh",
      name: "Màn hình hiển thị",
      desc: "Module hiển thị thông tin trạng thái.",
      items: [
        {
          name: "OLED 0.96 inch",
          specs: [
            "Độ phân giải thường 128×64",
            "Giao tiếp I2C/SPI, 3.3–5V",
            "Kích thước nhỏ gọn (nhược điểm: khá nhỏ)"
          ],
          img: "assets/img/devices/oled096.jpg"
        },
        {
          name: "LCD TFT 2.8 inch",
          specs: [
            "Màu, cảm ứng tuỳ phiên bản",
            "Độ phân giải phổ biến 320×240",
            "Giao tiếp SPI/8080; nguồn 3.3/5V tuỳ module"
          ],
          img: "assets/img/devices/tft28.jpg"
        }
      ]
    },
    {
      id: "nguon-pin",
      name: "Nguồn / Pin / Sạc",
      desc: "Cung cấp năng lượng cho hệ thống.",
      items: [
        {
          name: "4 Pin sạc AA 2200 mWh",
          specs: ["Chuẩn AA, dung lượng danh định ~2200 mWh", "Có thể sạc lại"],
          img: "assets/img/devices/aa-rechargeable.jpg"
        },
        {
          name: "Pin sạc 3.7V 18650",
          specs: ["Dung lượng tuỳ cell (2000–3500 mAh)", "Dòng xả cao, tái sạc"],
          img: "assets/img/devices/18650.jpg"
        },
        {
          name: "Đế pin 18650",
          specs: ["Khay 1–2 cell 18650", "Dây cắm/đầu cos tuỳ loại"],
          img: "assets/img/devices/18650-holder.jpg"
        },
        {
          name: "Bộ sạc tự ngắt 18650",
          specs: ["Tự ngắt khi đầy, bảo vệ quá sạc", "Nguồn vào 5V USB"],
          img: "assets/img/devices/18650-charger.jpg"
        }
      ]
    },
    {
      id: "giam-ap",
      name: "Module giảm áp",
      desc: "Buck converter hạ áp từ nguồn cao xuống mức dùng được.",
      items: [
        {
          name: "MP1584 (5V→3.3V)",
          specs: ["Dòng tối đa ~3A", "Hiệu suất cao, kích thước nhỏ"],
          img: "assets/img/devices/mp1584.jpg"
        },
        {
          name: "LM2596S 3A (hạ xuống 5V)",
          specs: ["Dòng tối đa 3A", "Có biến trở chỉnh áp"],
          img: "assets/img/devices/lm2596.jpg"
        }
      ]
    },
    {
      id: "phu-kien",
      name: "Phụ kiện",
      desc: "Dây nối, breadboard và linh kiện phụ trợ.",
      items: [
        {
          name: "Dây nối đực-đực 21 cm",
          specs: ["Jumper male-male", "Chiều dài ~21 cm"],
          img: "assets/img/devices/jumpers.jpg"
        },
        {
          name: "Breadboard 830 lỗ",
          specs: ["Tiêu chuẩn 830 tie-points", "Tương thích jumper 22–26AWG"],
          img: "assets/img/devices/breadboard.jpg"
        }
      ]
    }
  ];

  // ====== HELPERS ======
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const byId = (id) => document.getElementById(id);

  function getQueryParam(key) {
    const url = new URL(window.location.href);
    return url.searchParams.get(key);
  }

  // fallback ảnh nếu chưa có file thật
  function onImgError(e) {
    e.target.onerror = null;
    e.target.src =
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360'>
           <rect width='100%' height='100%' fill='#eef2ff'/>
           <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle'
                 font-family='system-ui,Segoe UI,Roboto' font-size='18' fill='#64748b'>
             No image — replace at assets/img/devices/...
           </text>
         </svg>`
      );
  }

  // ====== RENDER: Category cards ======
  function renderCategoryGrid() {
    const wrap = byId("category-grid");
    wrap.innerHTML = CATS.map(
      (c) => `
      <a href="thietbi.html?cat=${c.id}" class="block rounded-2xl border border-slate-200 bg-white p-5 hover:shadow-sm">
        <div class="font-medium">${c.name}</div>
        <p class="text-sm text-slate-600 mt-1">${c.desc}</p>
      </a>
    `
    ).join("");
  }

  // ====== RENDER: Accordion ======
  function renderAccordions(filter = "") {
    const q = filter.trim().toLowerCase();
    const wrap = byId("device-accordions");
    const sections = CATS.map((cat) => {
      // filter items
      const items = cat.items.filter((it) => {
        const hay = (it.name + " " + (it.specs || []).join(" ")).toLowerCase();
        return q ? hay.includes(q) : true;
      });

      if (items.length === 0) return "";

      const rows = items
        .map(
          (it) => `
          <div class="flex flex-col md:flex-row gap-4 p-3 rounded-xl border border-slate-200 bg-white">
            <div class="md:w-64 w-full aspect-video bg-slate-100 overflow-hidden rounded-lg flex items-center justify-center">
              <img src="${it.img}" alt="${it.name}" class="w-full h-full object-cover" onerror="(${onImgError})(event)">
            </div>
            <div class="flex-1">
              <div class="font-medium">${it.name}</div>
              <ul class="mt-2 text-sm text-slate-700 list-disc pl-5 space-y-1">
                ${(it.specs || []).map((s) => `<li>${s}</li>`).join("")}
              </ul>
            </div>
          </div>
        `
        )
        .join("");

      return `
        <details class="group rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <summary class="cursor-pointer select-none flex items-center justify-between gap-4 px-5 py-3">
            <div class="font-semibold">${cat.name}</div>
            <svg class="w-5 h-5 text-slate-400 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m19 9-7 7-7-7"/>
            </svg>
          </summary>
          <div class="p-5 bg-slate-50">
            <div class="grid gap-4">
              ${rows}
            </div>
          </div>
        </details>
      `;
    }).join("");

    wrap.innerHTML = sections || `
      <div class="rounded-2xl border border-dashed p-6 text-slate-500 bg-white">
        Không tìm thấy thiết bị phù hợp với từ khoá <span class="font-medium">"${filter}"</span>.
      </div>`;
  }

  // ====== Search ======
  function setupSearch() {
    const input = byId("dev-search");
    if (!input) return;
    input.addEventListener("input", (e) => {
      renderAccordions(e.target.value || "");
    });
  }

  // ====== Auto open by ?cat ======
  function openByQuery() {
    const catId = getQueryParam("cat");
    if (!catId) return;
    const el = $(`details:has(summary .font-semibold:contains("${catId}"))`); // not supported widely
    // safer: open by index
    const idx = CATS.findIndex((c) => c.id === catId);
    if (idx >= 0) {
      const details = $$("#device-accordions details")[idx];
      if (details) details.setAttribute("open", "open");
      // scroll into view
      details?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  // ====== Boot ======
  renderCategoryGrid();
  renderAccordions("");
  setupSearch();
  // delay to ensure DOM placed
  setTimeout(openByQuery, 50);
})();
