// index.js — Microservice: /resolve?code=8934...
import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const PORT = process.env.PORT || 3000;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_CSE_ID  = process.env.GOOGLE_CSE_ID;

if (!GOOGLE_API_KEY || !GOOGLE_CSE_ID) {
  console.warn("⚠️ Missing GOOGLE_API_KEY or GOOGLE_CSE_ID env.");
}

const app = express();
app.use(cors()); // cho client gọi trực tiếp

// Heuristic lọc/điểm tên thuốc
const DOSE_RE = /\b(\d+(?:[.,]\d+)?\s?(mg|mcg|g|kg|ml|mL|iu|ui)(?:\/\d+(?:[.,]\d+)?\s?(ml|mL))?)\b/i;
const FORM_RE = /(viên|viên nén|viên nang|vỉ|hộp|ống|chai|tuýp|lọ|gói|syrup|sirô|giọt|dung dịch|hỗn dịch|kem|gel|mỡ|xịt|thuốc nhỏ mắt)/i;
const STORE_RE = /(nhà thuốc|pharmacity|an khang|long ch(â|a)u|medigo|tiki)/i;

function cleanTitle(s=""){
  return s
    .replace(/\s*\|\s*(nhà thuốc|pharmacity|an khang|long ch(â|a)u|medigo|tiki).*$/i,'')
    .replace(/\s*[-–—]\s*(nhà thuốc|pharmacity|an khang|long ch(â|a)u|medigo|tiki).*$/i,'')
    .replace(/\s{2,}/g,' ')
    .trim();
}
function scoreTitle(t=""){
  const L = cleanTitle(t);
  if (!L || L.length < 4 || L.length > 160) return -999;
  if (STORE_RE.test(L) && !DOSE_RE.test(L) && !FORM_RE.test(L)) return -999;
  let s = 0;
  if (DOSE_RE.test(L)) s += 2.4;
  if (FORM_RE.test(L)) s += 1.6;
  if (/^[A-ZÀ-Ỳ]/.test(L)) s += 0.5;
  if (L.length > 100) s -= (L.length - 100)/40;
  return s;
}

app.get("/resolve", async (req, res) => {
  try {
    const code = String(req.query.code || "").trim();
    if (!/^\d{8,14}$/.test(code)) {
      return res.status(400).json({ error: "code must be 8-14 digits" });
    }
    if (!GOOGLE_API_KEY || !GOOGLE_CSE_ID) {
      return res.status(500).json({ error: "Server is not configured with Google CSE" });
    }

    // gọi Google Custom Search (giới hạn domain đã cài trong CSE)
    const u = new URL("https://www.googleapis.com/customsearch/v1");
    u.searchParams.set("key", GOOGLE_API_KEY);
    u.searchParams.set("cx",  GOOGLE_CSE_ID);
    u.searchParams.set("q",   code);
    u.searchParams.set("num", "10"); // lấy 10 kết quả đầu

    const r = await fetch(u.toString());
    if (!r.ok) {
      const text = await r.text();
      return res.status(502).json({ error: "CSE error", detail: text });
    }
    const data = await r.json();
    const items = Array.isArray(data.items) ? data.items : [];

    const candidates = items.map(it => {
      const title = cleanTitle(it.title || "");
      return { title, link: it.link || "", score: scoreTitle(title) };
    }).filter(x => x.score > 0);

    candidates.sort((a,b)=> b.score - a.score);

    const best = candidates[0]?.title || null;
    res.json({
      code,
      from: "google-cse",
      best,
      candidates: candidates.slice(0,8).map(x=>x.title),
      raw: candidates.slice(0,8)
    });
  } catch (e) {
    res.status(500).json({ error: e.message || "unknown" });
  }
});

app.get("/", (_, res)=> res.send("OK"));
app.listen(PORT, ()=> console.log(`Search proxy listening on ${PORT}`));
