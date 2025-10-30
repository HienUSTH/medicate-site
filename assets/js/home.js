/* Medicate — Home slider (carousel)
   Ảnh có thể là file local (assets/img/slider/...) hoặc URL ngoài.
   Đã set sẵn 5 ảnh sp_1.jpg … sp_5.jpg như bạn nói.
*/

const HERO_SLIDES = [
  { src: "assets/img/slider/sp_1.jpg", alt: "Medicate – ảnh 1" },
  { src: "assets/img/slider/sp_2.jpg", alt: "Medicate – ảnh 2" },
  { src: "assets/img/slider/sp_3.jpg", alt: "Medicate – ảnh 3" },
  { src: "assets/img/slider/sp_4.jpg", alt: "Medicate – ảnh 4" },
  { src: "assets/img/slider/sp_5.jpg", alt: "Medicate – ảnh 5" },
];

// Tùy chỉnh
const AUTOPLAY_MS   = 3500; // thời gian tự chuyển
const TRANSITION_MS = 600;  // thời gian trượt
// Peek: phần hé lộ ảnh hai bên (0 = tắt). Đã tinh chỉnh nhẹ cho khung cao hơn.
const PEEK_DESKTOP  = 0.035;
const PEEK_MOBILE   = 0.025;

(function () {
  const wrap    = document.getElementById("heroSlider");
  const prevBtn = document.getElementById("slidePrev");
  const nextBtn = document.getElementById("slideNext");
  const dotsBox = document.getElementById("slideDots");
  if (!wrap) return;

  // Track
  const track = document.createElement("div");
  track.id = "heroTrack";
  track.style.height = "100%";
  track.style.display = "flex";
  track.style.alignItems = "stretch";
  track.style.willChange = "transform";
  track.style.transition = `transform ${TRANSITION_MS}ms ease`;
  wrap.appendChild(track);

  // Slides
  HERO_SLIDES.forEach((s, i) => {
    const slide = document.createElement("div");
    slide.className = "heroSlide shrink-0 h-full overflow-hidden bg-slate-200 rounded";
    slide.style.marginRight = "16px";
    slide.setAttribute("data-slide", i.toString());

    const img = document.createElement("img");
    img.src = s.src;
    img.alt = s.alt || "";
    img.className = "w-full h-full object-cover"; // fill khung, không méo
    img.referrerPolicy = "no-referrer"; // an toàn khi dùng URL ngoài
    img.onerror = function () {
      this.onerror = null;
      this.src =
        "data:image/svg+xml;utf8," +
        encodeURIComponent(
          `<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='600'><rect width='100%' height='100%' fill='#f1f5f9'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#64748b' font-family='system-ui,Segoe UI,Roboto' font-size='18'>Không tải được ảnh</text></svg>`
        );
    };
    slide.appendChild(img);
    track.appendChild(slide);
  });

  // Dots
  dotsBox.innerHTML = HERO_SLIDES.map(
    (_, i) =>
      `<button class="w-2.5 h-2.5 rounded-full ${i===0?"bg-sky-600":"bg-slate-300"}" data-dot="${i}" aria-label="Ảnh ${i+1}"></button>`
  ).join("");

  // Layout
  let idx = 0;
  let slideW = 0;
  let gap = 16;

  function computeLayout() {
    const vw = wrap.clientWidth;
    const peek = (vw >= 768 ? PEEK_DESKTOP : PEEK_MOBILE);
    slideW = Math.round(vw * (1 - 2 * peek)); // chừa 2 bên để nhìn ảnh kế
    gap = 16;

    document.querySelectorAll(".heroSlide").forEach((el) => {
      el.style.width = slideW + "px";
      el.style.marginRight = gap + "px";
      el.style.borderRadius = "12px";
    });
    translateTo(idx, false);
  }

  function translateTo(i, animate = true) {
    const n = HERO_SLIDES.length;
    idx = (i + n) % n;
    if (!animate) track.style.transition = "none";

    const vw = wrap.clientWidth;
    const offset = idx * (slideW + gap) - (vw - slideW) / 2;
    track.style.transform = `translateX(${-offset}px)`;

    if (!animate) {
      requestAnimationFrame(() => (track.style.transition = `transform ${TRANSITION_MS}ms ease`));
    }
    // dots
    document.querySelectorAll("#slideDots [data-dot]").forEach((d, k) => {
      d.classList.toggle("bg-sky-600", k === idx);
      d.classList.toggle("bg-slate-300", k !== idx);
    });
  }

  computeLayout();
  window.addEventListener("resize", computeLayout);

  // Controls
  const hasMultiple = HERO_SLIDES.length > 1;
  prevBtn.style.display = hasMultiple ? "" : "none";
  nextBtn.style.display = hasMultiple ? "" : "none";
  dotsBox.style.display = hasMultiple ? "" : "none";

  prevBtn?.addEventListener("click", () => translateTo(idx - 1));
  nextBtn?.addEventListener("click", () => translateTo(idx + 1));
  dotsBox?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-dot]");
    if (b) translateTo(parseInt(b.dataset.dot, 10));
  });

  // Keyboard arrows
  document.addEventListener("keydown", (e) => {
    if (!hasMultiple) return;
    if (e.key === "ArrowLeft") translateTo(idx - 1);
    if (e.key === "ArrowRight") translateTo(idx + 1);
  });

  // Autoplay
  let timer = null;
  const start = () => { if (hasMultiple) timer = setInterval(() => translateTo(idx + 1), AUTOPLAY_MS); };
  const stop  = () => { if (timer) clearInterval(timer); timer = null; };
  start();

  // Pause on hover
  wrap.addEventListener("mouseenter", stop);
  wrap.addEventListener("mouseleave", start);

  // Touch swipe
  let x0 = null;
  wrap.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; stop(); }, { passive: true });
  wrap.addEventListener("touchend",   (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 40) translateTo(idx + (dx < 0 ? 1 : -1));
    x0 = null; start();
  }, { passive: true });
})();
