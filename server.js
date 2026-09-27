'use strict';
/*
 * Свидание ♡ — сервер без зависимостей.
 *   node server.js            — только localhost:3333
 *   node server.js --tunnel   — плюс публичная ссылка через Cloudflare Quick Tunnel
 */
const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { spawn } = require('child_process');
const SCHEMA = require('./public/schema.js');

const PORT = Number(process.env.PORT) || 3333;
const ROOT = __dirname;
const PUB = path.join(ROOT, 'public');
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const SESS_DIR = path.join(DATA, 'sessions');
const CONFIG_FILE = path.join(DATA, 'config.json');
const AUTH_FILE = path.join(DATA, 'auth.json');
const WANT_TUNNEL = process.argv.includes('--tunnel') || process.env.TUNNEL === '1';

const MAX_EVENTS_PER_SESSION = 80000;
const MAX_BODY = 400 * 1024;
const MAX_MUSIC = 25 * 1024 * 1024;

fs.mkdirSync(SESS_DIR, { recursive: true });

/* ───────────────────────── config ───────────────────────── */

const LANG_IDS = SCHEMA.LANGS.map((l) => l.id);
const OTHER_LANGS = LANG_IDS.filter((l) => l !== 'ru');

// имена в разных языках пишутся по-разному (Максим / Максимові / Max)
const NAME_KEYS = ['name', 'fromName', 'fromDative', 'fromInstr'];
const emptyNames = () => Object.fromEntries(NAME_KEYS.map((k) => [k, '']));

// texts — русские надписи, langTexts.uk / langTexts.en — надписи на других языках
// русские имена лежат в settings, остальные — в langNames (пусто = как в русском)
function defaultConfig() {
  const langTexts = {}, langNames = {};
  for (const l of OTHER_LANGS) { langTexts[l] = SCHEMA.textDefaults(l); langNames[l] = emptyNames(); }
  return {
    lang: 'ru',
    texts: SCHEMA.textDefaults(),
    langTexts,
    langNames,
    settings: { ...SCHEMA.SETTINGS_DEFAULTS },
    invites: [],
    telegram: { enabled: false, token: '', chatId: '' },
  };
}

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

let config = (() => {
  const d = defaultConfig();
  const c = readJSON(CONFIG_FILE, null);
  if (!c) return d;
  const langTexts = {}, langNames = {};
  for (const l of OTHER_LANGS) {
    langTexts[l] = { ...d.langTexts[l], ...((c.langTexts && c.langTexts[l]) || {}) };
    langNames[l] = { ...d.langNames[l], ...((c.langNames && c.langNames[l]) || {}) };
  }
  return {
    lang: LANG_IDS.includes(c.lang) ? c.lang : 'ru',
    texts: { ...d.texts, ...(c.texts || {}) },
    langTexts,
    langNames,
    settings: { ...d.settings, ...(c.settings || {}) },
    invites: Array.isArray(c.invites) ? c.invites : [],
    telegram: { ...d.telegram, ...(c.telegram || {}) },
  };
})();

let writeChain = Promise.resolve();
function writeFileAtomic(file, data) {
  writeChain = writeChain.then(async () => {
    const tmp = file + '.' + process.pid + '.tmp';
    await fsp.writeFile(tmp, data);
    try {
      await fsp.rename(tmp, file);
    } catch {
      // Windows иногда не даёт заменить файл (антивирус, открыт в редакторе) — пишем напрямую
      await fsp.writeFile(file, data);
      await fsp.rm(tmp, { force: true });
    }
  }).catch((e) => console.error('write error', file, e.message));
  return writeChain;
}
const saveConfig = () => writeFileAtomic(CONFIG_FILE, JSON.stringify(config, null, 2));

function splitTimes(s) {
  return String(s || '').split(/[,;\s]+/).map((x) => x.trim()).filter((x) => /^\d{1,2}:\d{2}$/.test(x));
}

const textsFor = (lang) => (lang === 'ru' ? config.texts : config.langTexts[lang]);

function publicConfig(slug, forceLang) {
  const inv = slug ? config.invites.find((i) => i.slug === slug) : null;
  const s = config.settings;
  const lang = (LANG_IDS.includes(forceLang) && forceLang) || (inv && LANG_IDS.includes(inv.lang) && inv.lang) || config.lang;
  // имя на языке приглашения; падежи без своего значения берут имя этого языка, потом — русское
  const ln = (lang !== 'ru' && config.langNames[lang]) || {};
  const nm = (k) => {
    if (ln[k]) return ln[k];
    if ((k === 'fromDative' || k === 'fromInstr') && ln.fromName) return ln.fromName;
    return s[k];
  };
  let musicUrl = null;
  if (s.musicMode === 'custom' && s.musicFile && fs.existsSync(path.join(DATA, s.musicFile))) {
    musicUrl = '/music?v=' + encodeURIComponent(s.musicFile);
  }
  return {
    inviteId: inv ? inv.id : null,
    slug: inv ? inv.slug : null,
    texts: textsFor(lang),
    settings: {
      lang,
      locale: SCHEMA.LANGS.find((l) => l.id === lang).locale,
      name: (inv && inv.name) || nm('name'),
      fromName: nm('fromName'),
      fromDative: nm('fromDative'),
      fromInstr: nm('fromInstr'),
      daysCount: Math.max(3, Math.min(14, Number(s.daysCount) || 7)),
      dayTimes: splitTimes(s.dayTimes),
      eveningTimes: splitTimes(s.eveningTimes),
      duration: Number(s.duration) || 2,
      showIntro: !!s.showIntro,
      cursor: !!s.cursor,
      tilt: !!s.tilt,
      theme: s.theme,
      musicMode: musicUrl ? 'custom' : (s.musicMode === 'off' ? 'off' : 'builtin'),
      musicUrl,
      musicVolume: Math.max(0, Math.min(1, Number(s.musicVolume) || 0)),
    },
  };
}

/* ───────────────────────── auth ───────────────────────── */

let auth = readJSON(AUTH_FILE, { hash: null, salt: null, tokens: {} });
const saveAuth = () => writeFileAtomic(AUTH_FILE, JSON.stringify(auth, null, 2));
const hashPw = (pw, salt) => crypto.scryptSync(String(pw), salt, 64).toString('hex');

function setPassword(pw) {
  auth.salt = crypto.randomBytes(16).toString('hex');
  auth.hash = hashPw(pw, auth.salt);
  auth.tokens = {};
}
function checkPassword(pw) {
  if (!auth.hash) return false;
  const a = Buffer.from(hashPw(pw, auth.salt), 'hex');
  const b = Buffer.from(auth.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function newToken() {
  const t = crypto.randomBytes(32).toString('hex');
  auth.tokens[t] = Date.now() + 30 * 86400e3;
  saveAuth();
  return t;
}
function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function isAuthed(req) {
  const t = parseCookies(req).adm;
  if (!t || !auth.tokens[t]) return false;
  if (auth.tokens[t] < Date.now()) { delete auth.tokens[t]; saveAuth(); return false; }
  return true;
}
function isHttps(req) { return req.headers['x-forwarded-proto'] === 'https'; }
function isLocalRequest(req) {
  const ra = req.socket.remoteAddress || '';
  const local = ra === '127.0.0.1' || ra === '::1' || ra === '::ffff:127.0.0.1';
  return local && !req.headers['cf-connecting-ip'] && !req.headers['cf-ray'];
}
function clientIp(req) {
  return String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
    .split(',')[0].trim().replace(/^::ffff:/, '');
}

const loginAttempts = new Map();
function loginAllowed(ip) {
  const a = loginAttempts.get(ip);
  return !a || a.until < Date.now() || a.count < 6;
}
function loginFailed(ip) {
  const a = loginAttempts.get(ip) || { count: 0, until: 0 };
  if (a.until < Date.now()) { a.count = 0; }
  a.count++; a.until = Date.now() + 10 * 60e3;
  loginAttempts.set(ip, a);
}

/* ───────────────────────── sessions ───────────────────────── */

const sessions = new Map(); // id -> session
for (const f of fs.readdirSync(SESS_DIR)) {
  if (!f.endsWith('.json')) continue;
  const s = readJSON(path.join(SESS_DIR, f), null);
  if (s && s.id) sessions.set(s.id, s);
}

const saveTimers = new Map();
function scheduleSave(s) {
  if (saveTimers.has(s.id)) return;
  saveTimers.set(s.id, setTimeout(() => {
    saveTimers.delete(s.id);
    if (sessions.has(s.id)) writeFileAtomic(path.join(SESS_DIR, s.id + '.json'), JSON.stringify(s));
  }, 800));
}

function parseUA(ua) {
  ua = String(ua || '');
  let os = 'Другое';
  if (/iPhone|iPad|iPod/.test(ua)) os = /iPad/.test(ua) ? 'iPad' : 'iPhone';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  let br = 'Браузер';
  if (/YaBrowser/.test(ua)) br = 'Яндекс';
  else if (/Edg\//.test(ua)) br = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) br = 'Opera';
  else if (/Telegram/i.test(ua)) br = 'Telegram';
  else if (/Instagram/.test(ua)) br = 'Instagram';
  else if (/Firefox|FxiOS/.test(ua)) br = 'Firefox';
  else if (/CriOS|Chrome/.test(ua)) br = 'Chrome';
  else if (/Safari/.test(ua)) br = 'Safari';
  return { os, browser: br };
}

const DAY_FMT = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
function dayLabel(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  return DAY_FMT.format(new Date(+m[1], +m[2] - 1, +m[3]));
}

function summary(s) {
  return {
    id: s.id,
    inviteId: s.inviteId,
    slug: s.slug,
    name: s.name,
    startedAt: s.startedAt,
    lastSeen: s.lastSeen,
    duration: s.duration || 0,
    ip: s.ip,
    device: s.device,
    os: s.os,
    browser: s.browser,
    vw: s.vw, vh: s.vh,
    eventsCount: s.events.length,
    st: s.st,
  };
}

function applyEventToSummary(s, ev) {
  const [t, type, data] = ev;
  const st = s.st;
  if (t > (s.duration || 0)) s.duration = t;
  if (type !== 'vis') st.left = type === 'bye';
  switch (type) {
    case 'open': st.opened = true; break;
    case 'no': if (data && data.gone) st.noGone = true; else st.no = (st.no || 0) + 1; break;
    case 'yes': st.yes = true; st.opened = true; if (data && data.perfect) st.perfect = true; break;
    case 'day': st.day = data && data.d; break;
    case 'time': st.time = data && data.v; break;
    case 'confirm': st.confirmed = true; st.when = { d: st.day, t: st.time }; break;
    case 'final': st.final = true; break;
    case 'ics': st.ics = true; break;
    case 'note': st.note = String((data && data.text) || '').slice(0, 2000); break;
  }
}

/* ───────────────────────── SSE ───────────────────────── */

const sseClients = new Set();
function broadcast(obj) {
  const line = 'data: ' + JSON.stringify(obj) + '\n\n';
  for (const res of sseClients) res.write(line);
}
setInterval(() => { for (const res of sseClients) res.write(': ping\n\n'); }, 20000);

/* ───────────────────────── telegram ───────────────────────── */

function notify(text) {
  const tg = config.telegram;
  if (!tg.enabled || !tg.token || !tg.chatId) return Promise.resolve({ ok: false, skipped: true });
  return fetch(`https://api.telegram.org/bot${encodeURIComponent(tg.token)}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: tg.chatId, text, disable_web_page_preview: true }),
  }).then((r) => r.json()).catch((e) => ({ ok: false, description: e.message }));
}

/* ───────────────────────── http helpers ───────────────────────── */

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.webm': 'audio/webm', '.woff2': 'font/woff2',
};

const SEC_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
};

function send(res, code, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  const payload = isBuf || typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(code, {
    ...SEC_HEADERS,
    'content-type': isBuf || typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('too large'), { code: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJSONBody(req, limit) {
  const buf = await readBody(req, limit);
  try { return JSON.parse(buf.toString('utf8') || '{}'); } catch { throw Object.assign(new Error('bad json'), { code: 400 }); }
}

async function serveFile(req, res, file, extraHeaders = {}) {
  try {
    const st = await fsp.stat(file);
    if (!st.isFile()) throw new Error('nf');
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range;
    if (range && /^bytes=/.test(range)) {
      const [a, b] = range.replace('bytes=', '').split('-');
      const start = Math.min(Number(a) || 0, st.size - 1);
      const end = b ? Math.min(Number(b), st.size - 1) : st.size - 1;
      res.writeHead(206, {
        ...SEC_HEADERS, 'content-type': type, 'content-length': end - start + 1,
        'content-range': `bytes ${start}-${end}/${st.size}`, 'accept-ranges': 'bytes', ...extraHeaders,
      });
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, {
      ...SEC_HEADERS, 'content-type': type, 'content-length': st.size, 'accept-ranges': 'bytes',
      'cache-control': 'no-cache', ...extraHeaders,
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  } catch {
    send(res, 404, 'Not found');
  }
}

function slugify(s) {
  const map = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
  return String(s || '').toLowerCase().split('').map((c) => (c in map ? map[c] : c)).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

/* ───────────────────────── router ───────────────────────── */

let publicUrl = null;

function lanUrls() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(`http://${i.address}:${PORT}`);
  }
  return out;
}

async function handleApi(req, res, url) {
  const p = url.pathname;
  const m = req.method;

  /* ---------- public ---------- */
  if (p === '/api/config' && m === 'GET') {
    return send(res, 200, publicConfig(url.searchParams.get('slug') || '', url.searchParams.get('lang') || ''));
  }

  if (p === '/api/session' && m === 'POST') {
    const b = await readJSONBody(req, 8 * 1024);
    const cfg = publicConfig(String(b.slug || ''), String(b.lang || ''));
    const ua = String(req.headers['user-agent'] || '').slice(0, 400);
    const { os: osName, browser } = parseUA(ua);
    const s = {
      id: crypto.randomBytes(9).toString('base64url'),
      inviteId: cfg.inviteId,
      slug: cfg.slug,
      name: cfg.settings.name,
      startedAt: new Date().toISOString(),
      lastSeen: Date.now(),
      duration: 0,
      ip: clientIp(req),
      ua,
      os: osName,
      browser,
      device: b.touch ? 'mobile' : 'desktop',
      vw: Math.round(Number(b.vw) || 0),
      vh: Math.round(Number(b.vh) || 0),
      dpr: Number(b.dpr) || 1,
      tz: String(b.tz || '').slice(0, 60),
      lang: String(b.lang || '').slice(0, 20),
      ref: String(b.ref || '').slice(0, 300),
      touch: !!b.touch,
      cfg,
      st: {},
      events: [],
    };
    sessions.set(s.id, s);
    scheduleSave(s);
    broadcast({ type: 'session', s: summary(s), isNew: true });
    notify(`👀 ${s.name}: приглашение открыто\n${s.os} · ${browser}`);
    return send(res, 200, { id: s.id });
  }

  let mm = /^\/api\/session\/([\w-]+)\/events$/.exec(p);
  if (mm && m === 'POST') {
    const s = sessions.get(mm[1]);
    if (!s) return send(res, 404, { error: 'no session' });
    const b = await readJSONBody(req);
    const evs = Array.isArray(b.e) ? b.e : [];
    const before = { ...s.st };
    let needSort = false;
    for (const ev of evs) {
      if (s.events.length >= MAX_EVENTS_PER_SESSION) break;
      if (!Array.isArray(ev) || typeof ev[0] !== 'number' || typeof ev[1] !== 'string' || ev[1].length > 12) continue;
      const clean = [Math.max(0, Math.round(ev[0])), ev[1], ev[2] === undefined ? null : ev[2]];
      if (JSON.stringify(clean[2]).length > 4000) continue;
      const last = s.events[s.events.length - 1];
      if (last && last[0] > clean[0]) needSort = true;
      s.events.push(clean);
      applyEventToSummary(s, clean);
    }
    // события могли прийти не по порядку (beacon + fetch)
    if (needSort) s.events.sort((a, b2) => a[0] - b2[0]);
    s.lastSeen = Date.now();
    scheduleSave(s);
    broadcast({ type: 'session', s: summary(s) });

    const st = s.st;
    if (st.yes && !before.yes) {
      notify(st.perfect
        ? `💘 ${s.name} сразу нажала «Да», даже не тронув «Нет»!`
        : `💖 ${s.name} ответила «Да»!` + (st.no ? `\nПопыток нажать «Нет»: ${st.no}` : ''));
    }
    if (st.confirmed && !before.confirmed) notify(`📅 ${s.name} выбрала: ${dayLabel(st.day)}, ${st.time}`);
    if (st.note && st.note !== before.note) notify(`✉️ ${s.name} написала:\n${st.note}`);
    return send(res, 200, { ok: true });
  }

  /* ---------- admin auth ---------- */
  if (p === '/api/admin/state' && m === 'GET') {
    return send(res, 200, { setup: !!auth.hash, authed: isAuthed(req), canSetup: isLocalRequest(req) });
  }
  if (p === '/api/admin/setup' && m === 'POST') {
    if (auth.hash) return send(res, 409, { error: 'Пароль уже задан' });
    if (!isLocalRequest(req)) return send(res, 403, { error: 'Первичная настройка доступна только с localhost' });
    const b = await readJSONBody(req, 4096);
    if (!String(b.password || '').length) return send(res, 400, { error: 'Пароль не может быть пустым' });
    setPassword(b.password);
    const t = newToken();
    return send(res, 200, { ok: true }, { 'set-cookie': cookie(req, t) });
  }
  if (p === '/api/admin/login' && m === 'POST') {
    const ip = clientIp(req);
    if (!loginAllowed(ip)) return send(res, 429, { error: 'Слишком много попыток. Подожди 10 минут.' });
    const b = await readJSONBody(req, 4096);
    if (!checkPassword(b.password || '')) { loginFailed(ip); return send(res, 401, { error: 'Неверный пароль' }); }
    loginAttempts.delete(ip);
    const t = newToken();
    return send(res, 200, { ok: true }, { 'set-cookie': cookie(req, t) });
  }
  if (p === '/api/admin/logout' && m === 'POST') {
    const t = parseCookies(req).adm;
    if (t) { delete auth.tokens[t]; saveAuth(); }
    return send(res, 200, { ok: true }, { 'set-cookie': 'adm=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict' });
  }

  if (!p.startsWith('/api/admin/')) return send(res, 404, { error: 'not found' });
  if (!isAuthed(req)) return send(res, 401, { error: 'auth' });
  if (m !== 'GET' && m !== 'HEAD' && !/^application\/json|^audio\/|^application\/octet-stream/.test(req.headers['content-type'] || '') && m !== 'DELETE') {
    return send(res, 415, { error: 'content-type' });
  }

  /* ---------- admin ---------- */
  if (p === '/api/admin/password' && m === 'POST') {
    const b = await readJSONBody(req, 4096);
    if (!checkPassword(b.old || '')) return send(res, 400, { error: 'Старый пароль неверный' });
    if (!String(b.password || '').length) return send(res, 400, { error: 'Пароль не может быть пустым' });
    setPassword(b.password);
    const t = newToken();
    return send(res, 200, { ok: true }, { 'set-cookie': cookie(req, t) });
  }

  if (p === '/api/admin/info' && m === 'GET') {
    return send(res, 200, { publicUrl, localUrl: `http://localhost:${PORT}`, lan: lanUrls(), tunnel: WANT_TUNNEL });
  }

  if (p === '/api/admin/config' && m === 'GET') {
    return send(res, 200, { ...config, defaults: defaultConfig() });
  }
  if (p === '/api/admin/config' && m === 'PUT') {
    const b = await readJSONBody(req, 200 * 1024);
    const d = defaultConfig();
    if (b.texts && typeof b.texts === 'object') {
      for (const k of Object.keys(d.texts)) if (typeof b.texts[k] === 'string') config.texts[k] = b.texts[k].slice(0, 3000);
    }
    if (b.langTexts && typeof b.langTexts === 'object') {
      for (const l of OTHER_LANGS) {
        const src = b.langTexts[l];
        if (!src || typeof src !== 'object') continue;
        for (const k of Object.keys(d.texts)) if (typeof src[k] === 'string') config.langTexts[l][k] = src[k].slice(0, 3000);
      }
    }
    if (LANG_IDS.includes(b.lang)) config.lang = b.lang;
    if (b.langNames && typeof b.langNames === 'object') {
      for (const l of OTHER_LANGS) {
        const src = b.langNames[l];
        if (!src || typeof src !== 'object') continue;
        for (const k of NAME_KEYS) if (typeof src[k] === 'string') config.langNames[l][k] = src[k].trim().slice(0, 60);
      }
    }
    if (b.settings && typeof b.settings === 'object') {
      for (const k of Object.keys(d.settings)) {
        if (k === 'musicFile') continue;
        if (k in b.settings && typeof b.settings[k] === typeof d.settings[k]) config.settings[k] = b.settings[k];
      }
    }
    if (b.telegram && typeof b.telegram === 'object') {
      config.telegram = {
        enabled: !!b.telegram.enabled,
        token: String(b.telegram.token || '').trim().slice(0, 200),
        chatId: String(b.telegram.chatId || '').trim().slice(0, 64),
      };
    }
    await saveConfig();
    return send(res, 200, { ok: true });
  }

  if (p === '/api/admin/invites' && m === 'POST') {
    const b = await readJSONBody(req, 4096);
    const name = String(b.name || '').trim().slice(0, 60);
    if (!name) return send(res, 400, { error: 'Нужно имя' });
    let slug = slugify(b.slug || name) || crypto.randomBytes(3).toString('hex');
    let base = slug, n = 2;
    while (config.invites.some((i) => i.slug === slug)) slug = `${base}-${n++}`;
    const lang = LANG_IDS.includes(b.lang) ? b.lang : '';
    const inv = { id: crypto.randomBytes(6).toString('hex'), name, slug, lang, createdAt: new Date().toISOString() };
    config.invites.push(inv);
    await saveConfig();
    return send(res, 200, inv);
  }
  mm = /^\/api\/admin\/invites\/(\w+)$/.exec(p);
  if (mm && m === 'DELETE') {
    config.invites = config.invites.filter((i) => i.id !== mm[1]);
    await saveConfig();
    return send(res, 200, { ok: true });
  }
  if (mm && m === 'PUT') {
    const inv = config.invites.find((i) => i.id === mm[1]);
    if (!inv) return send(res, 404, { error: 'нет' });
    const b = await readJSONBody(req, 4096);
    if (b.name) inv.name = String(b.name).trim().slice(0, 60);
    if ('lang' in b) inv.lang = LANG_IDS.includes(b.lang) ? b.lang : '';
    await saveConfig();
    return send(res, 200, inv);
  }

  if (p === '/api/admin/sessions' && m === 'GET') {
    const list = [...sessions.values()].map(summary).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return send(res, 200, list);
  }
  if (p === '/api/admin/sessions' && m === 'DELETE') {
    for (const id of sessions.keys()) await fsp.rm(path.join(SESS_DIR, id + '.json'), { force: true });
    sessions.clear();
    broadcast({ type: 'cleared' });
    return send(res, 200, { ok: true });
  }
  mm = /^\/api\/admin\/sessions\/([\w-]+)$/.exec(p);
  if (mm && m === 'GET') {
    const s = sessions.get(mm[1]);
    if (!s) return send(res, 404, { error: 'нет' });
    const from = Math.max(0, Number(url.searchParams.get('from')) || 0);
    if (from) return send(res, 200, { events: s.events.slice(from), total: s.events.length, s: summary(s) });
    return send(res, 200, { ...s, summary: summary(s) });
  }
  if (mm && m === 'DELETE') {
    sessions.delete(mm[1]);
    await fsp.rm(path.join(SESS_DIR, mm[1] + '.json'), { force: true });
    broadcast({ type: 'deleted', id: mm[1] });
    return send(res, 200, { ok: true });
  }

  if (p === '/api/admin/stream' && m === 'GET') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    res.write('retry: 3000\n\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  if (p === '/api/admin/music' && m === 'POST') {
    const ext = ({ 'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/ogg': '.ogg', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a', 'audio/aac': '.aac', 'audio/webm': '.webm' })[String(req.headers['content-type']).split(';')[0]];
    if (!ext) return send(res, 415, { error: 'Нужен аудиофайл (mp3, ogg, wav, m4a)' });
    const buf = await readBody(req, MAX_MUSIC);
    if (config.settings.musicFile) await fsp.rm(path.join(DATA, config.settings.musicFile), { force: true });
    const name = 'music-' + Date.now() + ext;
    await fsp.writeFile(path.join(DATA, name), buf);
    config.settings.musicFile = name;
    config.settings.musicMode = 'custom';
    await saveConfig();
    return send(res, 200, { ok: true, file: name });
  }
  if (p === '/api/admin/music' && m === 'DELETE') {
    if (config.settings.musicFile) await fsp.rm(path.join(DATA, config.settings.musicFile), { force: true });
    config.settings.musicFile = '';
    if (config.settings.musicMode === 'custom') config.settings.musicMode = 'builtin';
    await saveConfig();
    return send(res, 200, { ok: true });
  }

  if (p === '/api/admin/test-telegram' && m === 'POST') {
    const r = await notify('✅ Проверка связи: уведомления из анкеты работают ♡');
    return send(res, 200, r);
  }

  return send(res, 404, { error: 'not found' });
}

function cookie(req, token) {
  return `adm=${token}; Path=/; Max-Age=${30 * 86400}; HttpOnly; SameSite=Strict${isHttps(req) ? '; Secure' : ''}`;
}

const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, 'http://x'); } catch { return send(res, 400, 'bad url'); }
  const p = decodeURIComponent(url.pathname);
  try {
    if (p.startsWith('/api/')) return await handleApi(req, res, url);

    if (p === '/' || /^\/p\/[\w-]+\/?$/.test(p)) return serveFile(req, res, path.join(PUB, 'index.html'));
    if (p === '/admin' || p === '/admin/') return serveFile(req, res, path.join(PUB, 'admin.html'), { 'x-frame-options': 'DENY' });
    if (p === '/music') {
      const f = config.settings.musicFile;
      if (!f) return send(res, 404, 'no music');
      return serveFile(req, res, path.join(DATA, f));
    }

    const file = path.normalize(path.join(PUB, p));
    if (!file.startsWith(PUB + path.sep)) return send(res, 403, 'forbidden');
    return serveFile(req, res, file);
  } catch (e) {
    if (!res.headersSent) send(res, e.code >= 400 && e.code < 600 ? e.code : 500, { error: e.message });
    if (!(e.code >= 400 && e.code < 500)) console.error(e);
  }
});

/* ───────────────────────── tunnel ───────────────────────── */

let tunnelProc = null;
let shuttingDown = false;

function tunnelCandidates() {
  const list = [path.join(ROOT, 'bin', 'cloudflared.exe'), 'cloudflared'];
  if (process.platform === 'win32') {
    list.push('C:\\Program Files (x86)\\cloudflared\\cloudflared.exe', 'C:\\Program Files\\cloudflared\\cloudflared.exe');
  }
  return list;
}

function startTunnel(idx = 0) {
  const cands = tunnelCandidates();
  if (idx >= cands.length) {
    console.log('\n  ⚠  cloudflared не найден. Установи его командой:\n     winget install Cloudflare.cloudflared\n  и перезапусти start.bat\n');
    return;
  }
  const bin = cands[idx];
  if (bin.includes(path.sep) && !fs.existsSync(bin)) return startTunnel(idx + 1);
  console.log('  ☁  Поднимаю Cloudflare-туннель…');
  // свой пустой конфиг, чтобы ~/.cloudflared/config.yml (ingress других туннелей) не перехватывал запросы
  const emptyCfg = path.join(DATA, 'cloudflared-quick.yml');
  try { fs.writeFileSync(emptyCfg, 'no-autoupdate: true\n'); } catch {}
  const child = spawn(bin, ['tunnel', '--config', emptyCfg, '--no-autoupdate', '--url', `http://127.0.0.1:${PORT}`], { windowsHide: true });
  tunnelProc = child;
  let started = false;
  const onData = (d) => {
    const text = d.toString();
    if (/Registered tunnel connection/.test(text) && !child.ready) { child.ready = true; console.log('  ☁  Туннель подключён ✔'); }
    for (const line of text.split('\n')) if (/ ERR /.test(line)) console.log('  ☁  ' + line.trim().slice(0, 200));
    const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(text);
    if (m && m[0] !== publicUrl) {
      started = true;
      publicUrl = m[0];
      banner();
      broadcast({ type: 'info', publicUrl });
    }
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('error', (e) => {
    if (e.code === 'ENOENT' && !started) startTunnel(idx + 1);
    else console.error('  cloudflared error:', e.message);
  });
  child.on('exit', (code) => {
    if (tunnelProc === child) tunnelProc = null;
    if (shuttingDown) return;
    if (started || code !== null) {
      publicUrl = null;
      broadcast({ type: 'info', publicUrl: null });
      console.log('  ☁  Туннель упал, перезапускаю через 5 сек…');
      setTimeout(() => startTunnel(idx), 5000);
    }
  });
}

function banner() {
  const lines = [
    '',
    '  ♡  Свидание — сервер запущен',
    '',
    `  Анкета (локально):   http://localhost:${PORT}`,
    `  Админка:             http://localhost:${PORT}/admin`,
    ...lanUrls().map((u) => `  В локальной сети:    ${u}`),
  ];
  if (publicUrl) {
    lines.push('', `  🌍 Публичная ссылка:  ${publicUrl}`, `     Админка снаружи:   ${publicUrl}/admin`);
    for (const inv of config.invites) lines.push(`     Для «${inv.name}»:`.padEnd(24) + `${publicUrl}/p/${inv.slug}`);
  } else if (WANT_TUNNEL) {
    lines.push('', '  ☁  Туннель ещё поднимается…');
  }
  lines.push('');
  console.log(lines.join('\n'));
}

function shutdown() {
  shuttingDown = true;
  if (tunnelProc) try { tunnelProc.kill(); } catch {}
  for (const [id, t] of saveTimers) {
    clearTimeout(t);
    const s = sessions.get(id);
    if (s) try { fs.writeFileSync(path.join(SESS_DIR, id + '.json'), JSON.stringify(s)); } catch {}
  }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGHUP', shutdown);

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n  ✖  Порт ${PORT} уже занят. Закрой другое окно сервера и попробуй снова.\n`);
    process.exit(1);
  }
  throw e;
});

server.listen(PORT, () => {
  banner();
  if (!auth.hash) console.log(`  🔐 Открой http://localhost:${PORT}/admin и придумай пароль для админки.\n`);
  if (WANT_TUNNEL) startTunnel();
});
