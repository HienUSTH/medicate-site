/* Medicate – Roadmap "treasure map"
 * Sửa nội dung mốc ngay trong STEPS bên dưới (title, desc, img).
 * Ảnh: có thể để trống hoặc dùng đường dẫn local assets/img/roadmap/... hoặc URL ngoài.
 */

const STEPS = [
  {
    title: "Lên ý tưởng",
    desc: "Xác định vấn đề, giải pháp, thực trạng và bộ tính năng cốt lõi của tủ.",
    img: "assets/img/roadmap/step_1.jpg",
    icon: "🧭",
  },
  {
    title: "Chia việc",
    desc: "3 thành viên: phần cứng/mạch; phần mềm web; dữ liệu & nguồn số liệu.",
    img: "assets/img/roadmap/step_2.jpg",
    icon: "🧩",
  },
  {
    title: "Chuẩn bị",
    desc: "Tổng hợp thiết bị, thiết kế sơ đồ, dựng bản thảo & checklist.",
    img: "assets/img/roadmap/step_3.jpg",
    icon: "📦",
  },
  {
    title: "Tiến hành",
    desc: "Tìm nơi mua, làm tủ, setup nơi làm việc, huy động tài trợ.",
    img: "assets/img/roadmap/step_4.jpg",
    icon: "⚙️",
  },
  {
    title: "Làm việc",
    desc: "Làm mạch, viết web, thiết kế giao diện & kiểm thử chức năng.",
    img: "assets/img/roadmap/step_5.jpg",
    icon: "🛠️",
  },
  {
    title: "Đích đến",
    desc: "Sản phẩm hoàn thiện — demo & chuẩn bị phát hành.",
    img: "assets/img/roadmap/step_6.jpg",
    final: true, // vẽ dấu X đỏ
  },
];

(function () {
  const wrap = document.getElementById("roadmap");
  const list = document.getElementById("roadmapSteps");
  const svg  = document.getElementById("roadmapPath");
  if (!wrap || !list || !svg) return;

  // render cards
  list.innerHTML = STEPS.map((s, i) => {
    const badge =
      s.final
        ? `<span class="absolute -top-3 -right-3 text-rose-600 text-xl select-none">✕</span>`
        : `<span class="absolute -top-3 -right-3 text-sky-600 text-xl select-none">${s.icon || "•"}</span>`;

    const imgTag = s.img
      ? `<img src="${s.img}" alt="" class="w-full h-28 object-cover rounded-lg mb-3 bg-slate-100" />`
      : `<div class="w-full h-28 rounded-lg mb-3 bg-slate-100 grid place-items-center text-slate-400 text-sm">Ảnh minh họa</div>`;

    return `
      <div class="relative group rounded-xl border border-slate-200 bg-white p-3 md:p-4 shadow-sm hover:shadow-md transition"
           data-step-index="${i}">
        ${badge}
        ${imgTag}
        <div class="flex items-center gap-2 mb-1">
          <span class="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-semibold text-slate-600 pin-dot">${i+1}</span>
          <h3 class="font-semibold">${s.title}</h3>
        </div>
        <p class="text-sm text-slate-600">${s.desc}</p>
      </div>
    `;
  }).join("");

  // helper: get center of each pin-dot (for path)
  function centers() {
    const dots = [...list.querySelectorAll(".pin-dot")];
    return dots.map(dot => {
      const r1 = wrap.getBoundingClientRect();
      const r2 = dot.getBoundingClientRect();
      return {
        x: (r2.left + r2.right) / 2 - r1.left,
        y: (r2.top + r2.bottom) / 2 - r1.top,
      };
    });
  }

  function draw() {
    const pts = centers();
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("width", W);
    svg.setAttribute("height", H);

    // build a smooth-ish path connecting points
    if (pts.length < 2) { svg.innerHTML = ""; return; }

    const d = pts.map((p, i) => `${i===0?"M":"L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    svg.innerHTML = `
      <defs>
        <marker id="dot" markerWidth="6" markerHeight="6" refX="3" refY="3">
          <circle cx="3" cy="3" r="3" fill="#0284c7"/>
        </marker>
      </defs>
      <path d="${d}"
            fill="none"
            stroke="#94a3b8"
            stroke-width="2"
            stroke-dasharray="6 6"
            marker-start="url(#dot)"
            marker-mid="url(#dot)"
            marker-end="${STEPS[STEPS.length-1].final ? "" : "url(#dot)"}"
      />
    `;

    // nếu step cuối là final, vẽ thêm X đỏ lớn ở vị trí cuối
    if (STEPS[STEPS.length-1].final) {
      const p = pts[pts.length-1];
      const size = 14;
      svg.innerHTML += `
        <line x1="${p.x-size}" y1="${p.y-size}" x2="${p.x+size}" y2="${p.y+size}" stroke="#dc2626" stroke-width="4" stroke-linecap="round"/>
        <line x1="${p.x+size}" y1="${p.y-size}" x2="${p.x-size}" y2="${p.y+size}" stroke="#dc2626" stroke-width="4" stroke-linecap="round"/>
      `;
    }
  }

  // draw initially & on resize
  const ro = new ResizeObserver(() => draw());
  ro.observe(wrap);
  window.addEventListener("load", draw);
})();
