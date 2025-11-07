// server.js – Medicate (Auth + Barcode Resolve + Static)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const db = require('./db'); // giữ nguyên file db.js của bạn (Postgres + SSL Render)

const app = express();
app.use(cors());
app.use(express.json());

// --- Health ---
app.get('/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// --- Auth (giữ nguyên như trước) ---
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Missing email/password' });
    const hash = await bcrypt.hash(password, 10);
    const result = await db.query(
      'INSERT INTO users(email, password_hash, name) VALUES($1,$2,$3) RETURNING id,email,name',
      [email, hash, name || null]
    );
    res.json({ ok: true, user: result.rows[0] });
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'Register failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Missing email/password' });
    const q = await db.query('SELECT id,email,name,password_hash FROM users WHERE email=$1 LIMIT 1', [email]);
    if (!q.rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const u = q.rows[0];
    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ sub: u.id, email: u.email }, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '7d' });
    res.json({ ok: true, token, user: { id: u.id, email: u.email, name: u.name } });
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/me', async (req, res) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing token' });
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
    const q = await db.query('SELECT id,email,name FROM users WHERE id=$1 LIMIT 1', [payload.sub]);
    if (!q.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true, user: q.rows[0] });
  } catch (e) {
    console.error(e); res.status(401).json({ error: 'Invalid token' });
  }
});

// --- Helpers cho Barcode ---
function cleanProductName(raw) {
  if (!raw) return '';
  let s = String(raw);
  s = s.replace(/\s*\|.*$/,'').replace(/\s*[-–—]\s*.+$/,'');
  s = s.replace(/\b(\d+(?:\s)?(mg|mcg|g|kg|ml|mL|IU)|hộp|vỉ|viên|ống|chai|tuýp|lọ|hủ)\b.*$/i,'');
  s = s.replace(/#\w+$/,'').replace(/\b(SKU|MÃ)\s*[:\-\w]+$/i,'');
  return s.replace(/\s{2,}/g,' ').trim();
}
function pickBest(items) {
  const counts = new Map();
  for (const it of items) {
    const name = cleanProductName(it.title || '');
    if (!name) continue;
    const key = name.toLowerCase();
    counts.set(key, { name, score: (counts.get(key)?.score || 0) + 1 });
  }
  let best = null;
  for (const v of counts.values()) {
    const penalty = Math.max(0, (v.name.length - 40) / 40);
    const sc = v.score - penalty;
    if (!best || sc > best._sc) best = { name: v.name, _sc: sc };
  }
  return best ? { name: best.name, alias: '' } : null;
}

// --- /api/barcode/resolve ---
app.get('/api/barcode/resolve', async (req, res) => {
  try {
    const code = String(req.query.code || '').trim();
    if (!code) return res.status(400).json({ error: 'Missing code' });

    const key = process.env.GOOGLE_API_KEY;
    const cx  = process.env.GOOGLE_CSE_ID;
    if (!key || !cx) return res.status(500).json({ error: 'Missing GOOGLE_API_KEY/GOOGLE_CSE_ID' });

    const q   = encodeURIComponent(`${code} thuốc`);
    const url = `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=${q}`;

    const r = await fetch(url).catch(() => null);
    if (!r || !r.ok) return res.status(502).json({ error: 'Search API failed' });
    const data = await r.json().catch(() => null);
    const items = (data && data.items) ? data.items.slice(0, 8) : [];
    const mapped = items.map(it => ({ title: it.title, link: it.link, snippet: it.snippet }));
    const best = pickBest(mapped);
    if (!best) return res.status(404).json({ error: 'No candidate' });

    return res.json({ ok: true, provider: 'google', best, samples: mapped.slice(0, 3) });
  } catch (e) {
    console.error('resolve error', e);
    res.status(500).json({ error: 'Resolve failed' });
  }
});

// --- Static (nếu bạn phục vụ site tĩnh từ /public). Tùy dự án, giữ/ bỏ dòng này cho đúng đường dẫn build của bạn.
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on', PORT));
