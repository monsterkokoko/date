/* Свидание ♡ — анкета. Режимы: live (запись), ?preview (без записи), ?replay (плеер для админки). */
(() => {
  'use strict';

  const qs = new URLSearchParams(location.search);
  const MODE = qs.has('replay') ? 'replay' : qs.has('preview') ? 'preview' : 'live';
  const REPLAY = MODE === 'replay';
  const TOUCH = matchMedia('(hover: none), (pointer: coarse)').matches;
  const SLUG = (location.pathname.match(/^\/p\/([\w-]+)/) || [])[1] || qs.get('to') || '';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const HEART_D = 'M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.2 0 3.6 1.3 4.3 2.5h2c.7-1.2 2.1-2.5 4.3-2.5 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z';
  const heartIcon = (cls = 'hs') => `<svg class="${cls}" viewBox="0 0 24 24"><path d="${HEART_D}"/></svg>`;

  let CFG = null;
  let BASE = new Date();

  const card = $('#card');
  const inner = $('#cardInner');

  const initState = () => ({ step: 'intro', yesDone: false, no: 0, noGone: false, noPos: null, day: null, time: null, noteOpen: false, note: null, noteDraft: '' });
  let state = initState();

  /* ═════════════ тексты ═════════════ */

  // дни недели и месяцы для чипов — на языке приглашения
  const CAL = {
    ru: { wd: ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'], mon: ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'], locale: 'ru-RU' },
    uk: { wd: ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'], mon: ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'], locale: 'uk-UA' },
    en: { wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], mon: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], locale: 'en-US' },
  };
  const cal = () => CAL[(CFG && CFG.settings.lang) || 'ru'] || CAL.ru;
  const fmtCache = {};
  const DAY_FMT = { format: (d) => (fmtCache[cal().locale] ||= new Intl.DateTimeFormat(cal().locale, { weekday: 'long', day: 'numeric', month: 'long' })).format(d) };

  const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dateOf = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  const dayLong = (iso) => (iso ? DAY_FMT.format(dateOf(iso)) : '');

  function vars(extra) {
    const s = CFG.settings;
    return {
      name: s.name, from: s.fromName, fromDat: s.fromDative, fromIns: s.fromInstr,
      date: dayLong(state.day), time: state.time || '', day: dayLong(state.day), ...extra,
    };
  }
  // запасные тексты — если в конфиге (или старой записи) нет нового ключа
  const DEF_TEXTS = window.SCHEMA ? window.SCHEMA.textDefaults() : {};
  function tx(key, extra) {
    const v = vars(extra);
    return String(CFG.texts[key] ?? DEF_TEXTS[key] ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
  }
  const T = (key, extra) => esc(tx(key, extra));
  function txList(key) {
    return String(CFG.texts[key] ?? DEF_TEXTS[key] ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
  }
  // слова заголовка появляются по очереди
  function words(str, d0 = 0, step = 70, cls = '') {
    return esc(str).split(/(\s+)/).map((w, i) => (/^\s+$/.test(w) ? w : `<span class="w ${cls}" style="--d:${d0 + (i / 2) * step}">${w}</span>`)).join('');
  }

  /* ═════════════ котик ═════════════ */

  let catN = 0;
  function catSVG(extraCls = '') {
    const u = 'c' + ++catN;
    return `
<svg class="cat ${extraCls}" viewBox="0 0 200 212" aria-hidden="true">
  <defs>
    <radialGradient id="${u}f" cx="45%" cy="30%" r="75%"><stop offset="0" stop-color="#fff3dc"/><stop offset=".55" stop-color="#ffd79e"/><stop offset="1" stop-color="#f3a55a"/></radialGradient>
    <linearGradient id="${u}h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffa6c9"/><stop offset="1" stop-color="#ff3f86"/></linearGradient>
    <radialGradient id="${u}g"><stop offset="0" stop-color="#ffb3d9" stop-opacity=".5"/><stop offset="1" stop-color="#ffb3d9" stop-opacity="0"/></radialGradient>
  </defs>
  <circle cx="100" cy="112" r="98" fill="url(#${u}g)"/>
  <path class="tail" d="M136 178 C170 180 182 150 172 124 C166 110 154 110 156 120 C160 136 162 160 134 164" fill="url(#${u}f)" stroke="#e8964a" stroke-width="1.5" stroke-opacity=".35"/>
  <ellipse cx="100" cy="164" rx="46" ry="40" fill="url(#${u}f)"/>
  <ellipse cx="100" cy="172" rx="24" ry="22" fill="#fff4e2" opacity=".75"/>
  <ellipse cx="80" cy="201" rx="15" ry="8.5" fill="#ffe9c9"/>
  <ellipse cx="120" cy="201" rx="15" ry="8.5" fill="#ffe9c9"/>
  <g class="paws-down"><ellipse cx="78" cy="180" rx="11" ry="9" fill="#ffe9c9"/><ellipse cx="122" cy="180" rx="11" ry="9" fill="#ffe9c9"/></g>
  <g class="head">
    <path d="M48 76 Q42 34 56 22 Q64 17 92 46 Z" fill="url(#${u}f)"/>
    <path d="M152 76 Q158 34 144 22 Q136 17 108 46 Z" fill="url(#${u}f)"/>
    <path d="M57 62 Q54 38 61 32 Q67 30 81 46 Z" fill="#ffb3c6"/>
    <path d="M143 62 Q146 38 139 32 Q133 30 119 46 Z" fill="#ffb3c6"/>
    <ellipse cx="100" cy="90" rx="60" ry="51" fill="url(#${u}f)"/>
    <path d="M92 44 q8 -5 16 0 M95 51 q5 -3 10 0" fill="none" stroke="#eb9a4f" stroke-width="2.4" stroke-linecap="round" opacity=".55"/>
    <path class="head-heart" d="M136 30 c-3 -5 -10 -3 -9 3 c1 4 9 8 9 8 s8 -4 9 -8 c1 -6 -6 -8 -9 -3z" fill="#ff8fbc"/>
    <g class="eyes-open"><g class="pupils">
      <g class="eye"><ellipse cx="78" cy="90" rx="9.5" ry="11" fill="#2b1730"/><circle cx="81.5" cy="85" r="3.8" fill="#fff"/><circle cx="75" cy="94.5" r="1.7" fill="#fff"/></g>
      <g class="eye"><ellipse cx="122" cy="90" rx="9.5" ry="11" fill="#2b1730"/><circle cx="125.5" cy="85" r="3.8" fill="#fff"/><circle cx="119" cy="94.5" r="1.7" fill="#fff"/></g>
    </g></g>
    <g class="happy-eyes" fill="none" stroke="#2b1730" stroke-width="4.2" stroke-linecap="round"><path d="M68 92 Q78 80 88 92"/><path d="M112 92 Q122 80 132 92"/></g>
    <g class="brows" fill="none" stroke="#8a4a2a" stroke-width="3" stroke-linecap="round"><path d="M68 72 L86 77"/><path d="M132 72 L114 77"/></g>
    <ellipse class="blush" cx="62" cy="106" rx="10.5" ry="6.5" fill="#ff8fb0" opacity=".55"/>
    <ellipse class="blush" cx="138" cy="106" rx="10.5" ry="6.5" fill="#ff8fb0" opacity=".55"/>
    <path d="M96 101 h8 l-4 4.6 z" fill="#ff7aa2" stroke="#ff7aa2" stroke-width="2.4" stroke-linejoin="round"/>
    <path class="mouth" d="M92 108 q4 5 8 0 q4 5 8 0" fill="none" stroke="#7a3f3f" stroke-width="2.4" stroke-linecap="round"/>
    <ellipse class="mouth-o" cx="100" cy="112" rx="4" ry="5" fill="#b8455f"/>
    <path class="mouth-open" d="M92 108 Q100 105 108 108 Q107 123 100 123 Q93 123 92 108 Z" fill="#d94d78"/>
    <g fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="1.6" stroke-linecap="round">
      <path d="M50 100 L27 95"/><path d="M50 106 L26 108"/><path d="M150 100 L173 95"/><path d="M150 106 L174 108"/>
    </g>
  </g>
  <g class="held-heart">
    <path d="M100 182 C70 162 64 136 83 131 C93 128 99 136 100 141 C101 136 107 128 117 131 C136 136 130 162 100 182 Z" fill="url(#${u}h)"/>
    <ellipse cx="88" cy="140" rx="6" ry="4" fill="#fff" opacity=".55" transform="rotate(-30 88 140)"/>
  </g>
  <g class="paws-up"><ellipse cx="73" cy="152" rx="11" ry="9.5" fill="#ffe9c9"/><ellipse cx="127" cy="152" rx="11" ry="9.5" fill="#ffe9c9"/></g>
</svg>`;
  }

  // зрачки следят за курсором
  function lookAt(x, y) {
    const svg = $('.cat', inner);
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height * 0.42;
    const dx = x - cx, dy = y - cy;
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, d / 300);
    const p = svg.querySelector('.pupils');
    if (p) p.style.transform = `translate(${(dx / d) * 4 * k}px, ${(dy / d) * 3.5 * k}px)`;
  }

  /* ═════════════ эффекты (canvas) ═════════════ */

  const FX = (() => {
    // фон (плавающие сердечки, пылинки) — под карточкой; всплески, искры, кольца — поверх неё
    const cv = $('#fx'), cvTop = $('#fxTop');
    const ctx = cv.getContext('2d'), top = cvTop.getContext('2d');
    let W = 0, H = 0, DPR = 1;
    const heart = new Path2D(HEART_D);
    const parts = [];
    const COLORS = ['#ffb3d1', '#ff79ad', '#d9a6ff', '#ffc6ea', '#ffd9a0', '#c78bff'];
    const ambientMax = TOUCH ? 16 : 30;
    const dustMax = TOUCH ? 30 : 60;

    function resize() {
      DPR = Math.min(2, window.devicePixelRatio || 1);
      W = innerWidth; H = innerHeight;
      cv.width = cvTop.width = W * DPR; cv.height = cvTop.height = H * DPR;
    }
    resize();
    addEventListener('resize', resize);

    function ambient(initial) {
      parts.push({
        k: 'a', x: rand(0, W), y: initial ? rand(0, H) : H + 20, s: rand(5, 13),
        vy: rand(-0.25, -0.7), sw: rand(0.4, 1.2), ph: rand(0, 6.28), rot: rand(-0.4, 0.4),
        c: COLORS[(Math.random() * COLORS.length) | 0], a: rand(0.18, 0.55),
      });
    }
    function dust(initial) {
      parts.push({ k: 'd', x: rand(0, W), y: rand(0, H), r: rand(0.5, 1.6), ph: rand(0, 6.28), sp: rand(0.01, 0.04), vy: rand(-0.05, -0.2), life: initial ? rand(0, 1) : 0 });
    }
    for (let i = 0; i < ambientMax; i++) ambient(true);
    for (let i = 0; i < dustMax; i++) dust(true);

    function burst(x, y, n = 24, o = {}) {
      for (let i = 0; i < n; i++) {
        const a = o.up ? rand(-Math.PI * 0.9, -Math.PI * 0.1) : rand(0, Math.PI * 2);
        const v = rand(o.min || 2, o.max || 7);
        parts.push({
          k: 'b', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: o.g ?? 0.12, s: rand(o.smin || 6, o.smax || 14),
          rot: rand(-1, 1), vr: rand(-0.08, 0.08), c: COLORS[(Math.random() * COLORS.length) | 0], life: 1, dec: rand(0.008, 0.018),
          shape: Math.random() < (o.dots ?? 0.25) ? 'dot' : 'heart',
        });
      }
    }
    // частицы разлетаются так, что складываются в контур сердца
    function heartBurst(x, y, k = 5, n = 70, color) {
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2;
        const hx = 16 * Math.pow(Math.sin(t), 3);
        const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        parts.push({
          k: 'b', x, y, vx: hx * k * 0.1, vy: hy * k * 0.1, g: 0.035, drag: 0.94, s: rand(6, 11), rot: rand(-1, 1), vr: rand(-0.05, 0.05),
          c: color || COLORS[(Math.random() * COLORS.length) | 0], life: 1, dec: rand(0.008, 0.012), shape: i % 3 ? 'heart' : 'dot',
        });
      }
    }
    function rocket(x, ty) {
      parts.push({ k: 'k', x, y: H + 10, ty, vx: rand(-0.6, 0.6), vy: -(Math.sqrt(2 * 0.12 * (H - ty)) + 1), c: COLORS[(Math.random() * COLORS.length) | 0] });
    }
    function ring(x, y) {
      parts.push({ k: 'r', x, y, r: 3, life: 1 });
    }
    function spark(x, y) {
      parts.push({ k: 's', x, y, vx: rand(-0.6, 0.6), vy: rand(-0.6, 0.4), r: rand(1, 2.6), life: 1, c: COLORS[(Math.random() * COLORS.length) | 0] });
    }
    function rain(n = 40) {
      for (let i = 0; i < n; i++) {
        parts.push({ k: 'b', x: rand(0, W), y: rand(-H * 0.6, -10), vx: rand(-0.6, 0.6), vy: rand(1, 3), g: 0.03, s: rand(7, 15), rot: rand(-1, 1), vr: rand(-0.05, 0.05), c: COLORS[(Math.random() * COLORS.length) | 0], life: 1, dec: rand(0.003, 0.006), shape: 'heart' });
      }
    }

    function drawHeart(g, x, y, s, rot, c, a) {
      g.save();
      g.translate(x, y); g.rotate(rot); g.scale(s / 24, s / 24); g.translate(-12, -12);
      g.globalAlpha = a; g.fillStyle = c; g.fill(heart);
      g.restore();
    }

    let last = performance.now();
    function frame(now) {
      const dt = Math.min(3, (now - last) / 16.67); last = now;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, W, H);
      top.setTransform(DPR, 0, 0, DPR, 0, 0);
      top.clearRect(0, 0, W, H);
      let na = 0, nd = 0;
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        if (p.k === 'a') {
          na++;
          p.y += p.vy * dt; p.ph += 0.01 * dt;
          const x = p.x + Math.sin(p.ph) * 18 * p.sw;
          if (p.y < -30) { parts.splice(i, 1); continue; }
          const fade = Math.min(1, (H - p.y) / 120) * Math.min(1, (p.y + 30) / 160);
          drawHeart(ctx, x, p.y, p.s, p.rot + Math.sin(p.ph * 1.3) * 0.25, p.c, p.a * fade);
        } else if (p.k === 'd') {
          nd++;
          p.ph += p.sp * dt; p.y += p.vy * dt; p.life += 0.002 * dt;
          if (p.y < -5 || p.life > 1) { parts.splice(i, 1); continue; }
          const a = (Math.sin(p.ph) * 0.5 + 0.5) * 0.7 * Math.sin(p.life * Math.PI);
          ctx.globalAlpha = a; ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
        } else if (p.k === 'b') {
          const dr = p.drag || 0.985;
          p.vx *= dr; p.vy = p.vy * dr + p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.life -= p.dec * dt;
          if (p.life <= 0 || p.y > H + 40) { parts.splice(i, 1); continue; }
          if (p.shape === 'dot') {
            top.globalAlpha = p.life; top.fillStyle = p.c;
            top.beginPath(); top.arc(p.x, p.y, p.s / 5, 0, 6.283); top.fill();
          } else drawHeart(top, p.x, p.y, p.s, p.rot, p.c, Math.min(1, p.life * 1.5));
        } else if (p.k === 'k') {
          p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 0.12 * dt;
          spark(p.x + rand(-1.5, 1.5), p.y + 4);
          top.globalAlpha = 1; top.fillStyle = '#fff';
          top.beginPath(); top.arc(p.x, p.y, 2.2, 0, 6.283); top.fill();
          if (p.vy >= -0.5 || p.y <= p.ty) {
            parts.splice(i, 1);
            heartBurst(p.x, p.y, rand(3.2, 4.6), 56, p.c);
            burst(p.x, p.y, 14, { min: 1, max: 4, g: 0.05, dots: 0.6 });
            continue;
          }
        } else if (p.k === 'r') {
          p.life -= 0.045 * dt; p.r += (34 - p.r) * 0.14 * dt;
          if (p.life <= 0) { parts.splice(i, 1); continue; }
          top.globalAlpha = p.life * 0.8; top.strokeStyle = '#ffc6e0'; top.lineWidth = 2 * p.life + 0.5;
          top.beginPath(); top.arc(p.x, p.y, p.r, 0, 6.283); top.stroke();
        } else if (p.k === 's') {
          p.x += p.vx * dt; p.y += p.vy * dt; p.life -= 0.03 * dt;
          if (p.life <= 0) { parts.splice(i, 1); continue; }
          top.globalAlpha = p.life * 0.9; top.fillStyle = p.c;
          top.beginPath(); top.arc(p.x, p.y, p.r * p.life, 0, 6.283); top.fill();
        }
      }
      ctx.globalAlpha = 1; top.globalAlpha = 1;
      if (na < ambientMax && Math.random() < 0.08 * dt) ambient(false);
      if (nd < dustMax && Math.random() < 0.3 * dt) dust(false);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    return { burst, spark, rain, ring, rocket, heartBurst };
  })();

  // всплеск сердечек при каждом нажатии
  function clickBurst(x, y) {
    FX.ring(x, y);
    FX.burst(x, y, TOUCH ? 12 : 14, { min: 1.6, max: 4.8, smin: 7, smax: 14, g: 0.07, dots: 0.15 });
  }

  function burstAt(el, n, o) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    FX.burst(r.left + r.width / 2, r.top + r.height / 2, n, o);
  }

  /* ═════════════ музыка ═════════════ */

  const Music = (() => {
    let on = false, started = false, ctx = null, master = null, timer = null, audio = null;
    const btn = $('#musicBtn');

    function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }

    function makeReverb() {
      const len = ctx.sampleRate * 3.2;
      const buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      }
      const conv = ctx.createConvolver();
      conv.buffer = buf;
      return conv;
    }

    // «музыкальная шкатулка»: мягкий пэд + колокольчики-арпеджио
    const PROG = [
      [53, 57, 60, 64], // Fmaj7
      [50, 53, 57, 60], // Dm7
      [46, 50, 53, 57], // Bbmaj7
      [48, 52, 55, 58], // C7
      [53, 57, 60, 64],
      [45, 48, 52, 55], // Am7
      [46, 50, 53, 57],
      [48, 50, 55, 60], // Csus
    ];
    const PAT = [0, 2, 1, 3, 2, 1, 3, 2];
    const MEL = [[76, 74], [72], [74, 72, 69], [70, 72], [76, 77], [76, 72], [74, 69], [72]];

    function bell(t, f, g, dur = 2.2) {
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), gn = ctx.createGain();
      o1.type = 'sine'; o2.type = 'sine';
      o1.frequency.value = f; o2.frequency.value = f * 3.01;
      const g2 = ctx.createGain(); g2.gain.value = 0.12;
      o1.connect(gn); o2.connect(g2); g2.connect(gn);
      gn.gain.setValueAtTime(0.0001, t);
      gn.gain.exponentialRampToValueAtTime(g, t + 0.008);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      gn.connect(master.bus);
      o1.start(t); o2.start(t); o1.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
    }
    function pad(t, notes, dur) {
      for (const n of notes) {
        for (const det of [-6, 6]) {
          const o = ctx.createOscillator(), gn = ctx.createGain();
          o.type = 'triangle'; o.frequency.value = midi(n - 12); o.detune.value = det;
          gn.gain.setValueAtTime(0.0001, t);
          gn.gain.linearRampToValueAtTime(0.018, t + 1.2);
          gn.gain.linearRampToValueAtTime(0.0001, t + dur + 1.2);
          o.connect(gn); gn.connect(master.padBus);
          o.start(t); o.stop(t + dur + 1.4);
        }
      }
    }

    let bar = 0, nextT = 0;
    const BEAT = 60 / 74;
    function schedule() {
      while (nextT < ctx.currentTime + 1.2) {
        const ch = PROG[bar % PROG.length];
        pad(nextT, ch, BEAT * 4);
        for (let i = 0; i < 8; i++) {
          const n = ch[PAT[i]] + 12 + (i >= 4 && Math.random() < 0.3 ? 12 : 0);
          bell(nextT + i * BEAT / 2 + rand(-0.008, 0.008), midi(n), i % 2 ? 0.05 : 0.075, 1.6);
        }
        const mel = MEL[bar % MEL.length];
        if (bar >= 4) mel.forEach((n, i) => bell(nextT + (i * 4 / mel.length) * BEAT, midi(n), 0.09, 2.8));
        // бас
        const bo = ctx.createOscillator(), bg = ctx.createGain();
        bo.type = 'sine'; bo.frequency.value = midi(ch[0] - 12);
        bg.gain.setValueAtTime(0.0001, nextT); bg.gain.linearRampToValueAtTime(0.07, nextT + 0.05); bg.gain.exponentialRampToValueAtTime(0.0001, nextT + BEAT * 3.8);
        bo.connect(bg); bg.connect(master.padBus); bo.start(nextT); bo.stop(nextT + BEAT * 4);
        nextT += BEAT * 4; bar++;
      }
    }

    function startBuiltin() {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        const out = ctx.createGain(); out.gain.value = 0;
        const comp = ctx.createDynamicsCompressor();
        const rev = makeReverb();
        const revG = ctx.createGain(); revG.gain.value = 0.55;
        const bus = ctx.createGain();
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
        const padBus = ctx.createGain();
        bus.connect(comp); bus.connect(rev);
        padBus.connect(lp); lp.connect(comp); lp.connect(rev);
        rev.connect(revG); revG.connect(comp);
        comp.connect(out); out.connect(ctx.destination);
        master = { out, bus, padBus };
      }
      ctx.resume();
      nextT = ctx.currentTime + 0.1;
      schedule();
      timer = setInterval(schedule, 300);
      const v = CFG.settings.musicVolume;
      master.out.gain.cancelScheduledValues(ctx.currentTime);
      master.out.gain.setValueAtTime(master.out.gain.value, ctx.currentTime);
      master.out.gain.linearRampToValueAtTime(v * 1.4, ctx.currentTime + 2.5);
    }
    function stopBuiltin() {
      if (!ctx) return;
      clearInterval(timer);
      master.out.gain.cancelScheduledValues(ctx.currentTime);
      master.out.gain.setValueAtTime(master.out.gain.value, ctx.currentTime);
      master.out.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
    }

    function fadeAudio(to, ms) {
      const from = audio.volume, t0 = performance.now();
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / ms);
        audio.volume = from + (to - from) * k;
        if (k < 1) requestAnimationFrame(step); else if (to === 0) audio.pause();
      };
      step();
    }

    function set(v) {
      if (REPLAY) { on = v; btn.classList.toggle('on', on); return; }
      const mode = CFG.settings.musicMode;
      if (mode === 'off') return;
      on = v;
      btn.classList.toggle('on', on);
      if (mode === 'custom') {
        if (!audio) { audio = new Audio(CFG.settings.musicUrl); audio.loop = true; audio.volume = 0; }
        if (on) { audio.play().catch(() => {}); fadeAudio(CFG.settings.musicVolume, 2000); } else fadeAudio(0, 600);
      } else {
        on ? startBuiltin() : stopBuiltin();
      }
    }

    function start() {
      if (started || CFG.settings.musicMode === 'off') return;
      started = true;
      btn.hidden = false;
      set(true);
    }

    btn.addEventListener('click', () => {
      if (REPLAY) return;
      set(!on);
      Rec.push('music', { on });
    });

    return { start, set, get on() { return on; }, btn };
  })();

  /* ═════════════ запись ═════════════ */

  const Rec = {
    id: null, t0: performance.now(), buf: [], failed: 0,
    push(type, data) {
      if (MODE !== 'live') return;
      this.buf.push([Math.round(performance.now() - this.t0), type, data === undefined ? null : data]);
      if (type !== 'm' && type !== 's' && type !== 'd' && type !== 'type') this.flush();
    },
    async start() {
      if (MODE !== 'live') return;
      try {
        const r = await fetch('/api/session', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            slug: SLUG, vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio, touch: TOUCH,
            tz: Intl.DateTimeFormat().resolvedOptions().timeZone, lang: navigator.language, ref: document.referrer,
          }),
        });
        this.id = (await r.json()).id;
      } catch { return; }
      this.flush();
      setInterval(() => this.flush(), 1500);
      addEventListener('pagehide', () => { this.push('bye'); this.flush(true); });
      document.addEventListener('visibilitychange', () => {
        this.push('vis', { h: document.hidden ? 1 : 0 });
        if (document.hidden) this.flush(true);
      });
    },
    flush(beacon) {
      if (!this.id || !this.buf.length) return;
      const batch = this.buf; this.buf = [];
      const url = `/api/session/${this.id}/events`;
      const body = JSON.stringify({ e: batch });
      if (beacon && navigator.sendBeacon) {
        if (navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))) return;
      }
      fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: body.length < 60000 })
        .then((r) => { if (!r.ok && r.status !== 404) throw 0; })
        .catch(() => { if (++this.failed < 20) this.buf = batch.concat(this.buf); });
    },
  };

  /* ═════════════ экраны ═════════════ */

  const timers = [];
  const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); return id; };
  const clearTimers = () => { while (timers.length) clearTimeout(timers.pop()); };

  const STEP_NO = { intro: 0, ask: 1, date: 2, letter: 3, final: 3 };
  function progress(step) {
    const n = STEP_NO[step];
    return `<div class="progress rv" style="--d:0">${[1, 2, 3].map((i) => `<i class="${i === n ? 'on' : ''}"></i>`).join('')}</div>`;
  }

  const SCREENS = {
    intro() {
      return `
<div class="screen intro">
  <p class="kicker rv" style="--d:100">${T('introKicker')}</p>
  <button class="gift rv" style="--d:250" data-act="open" aria-label="Открыть">
    <div class="orbit"><i></i><i></i><i></i></div>
    <svg viewBox="0 0 24 24"><defs><linearGradient id="gh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc0dc"/><stop offset="1" stop-color="#ff3f86"/></linearGradient></defs><path d="${HEART_D}" fill="url(#gh)"/></svg>
  </button>
  <h1 class="title">${words(tx('introTitle'), 450)}</h1>
  <p class="hint rv" style="--d:1000">${T('introHint')}</p>
</div>`;
    },

    ask() {
      const t1 = tx('askTitle1'), t2 = tx('askTitle2');
      const n1 = t1.split(/\s+/).length;
      return `
<div class="screen ask">
  ${progress('ask')}
  <div class="cat-wrap rv" style="--d:80">${catSVG()}<div class="cat-bubble">${T('catYes')}</div></div>
  <p class="kicker rv" style="--d:250">${T('askKicker')}</p>
  <h1 class="title">${words(t1, 350)}<br>${words(t2, 350 + n1 * 70, 70, 'grad-a')}</h1>
  <p class="text rv" style="--d:800">${T('askText')}</p>
  <div class="btns rv" style="--d:1000">
    <button class="btn yes" data-act="yes">${T('yesBtn')} ${heartIcon()}</button>
    <button class="btn no" data-act="no">${T('noBtn')}</button>
  </div>
  <p class="caption" id="caption"></p>
</div>`;
    },

    date() {
      const s = CFG.settings;
      const days = [];
      for (let i = 1; i <= s.daysCount; i++) {
        const d = new Date(BASE.getFullYear(), BASE.getMonth(), BASE.getDate() + i);
        days.push({ iso: isoOf(d), top: i === 1 ? tx('tomorrowLabel') : cal().wd[d.getDay()], n: d.getDate(), mon: cal().mon[d.getMonth()] });
      }
      let k = 0;
      const dayHtml = days.map((d) => `<button class="chip day pop-in" style="--d:${700 + k++ * 60}" data-act="day" data-v="${d.iso}"><small>${esc(d.top)}</small><b>${d.n}</b><small>${d.mon}</small></button>`).join('');
      k = 0;
      const tHtml = (list) => list.map((t) => `<button class="chip time pop-in" style="--d:${1150 + k++ * 45}" data-act="time" data-v="${esc(t)}">${esc(t)}</button>`).join('');
      const dayTimes = tHtml(s.dayTimes);
      const eveTimes = tHtml(s.eveningTimes);
      const t1 = tx('dateTitle1');
      return `
<div class="screen date">
  ${progress('date')}
  <p class="kicker rv" style="--d:100">${T('dateKicker')}</p>
  <h1 class="title">${words(t1, 200)} ${words(tx('dateTitle2'), 200 + t1.split(/\s+/).length * 80, 80, 'grad-g')}</h1>
  <p class="text rv" style="--d:500">${T('dateText')}</p>
  <div class="sect rv" style="--d:600">${T('dayLabel')}</div>
  <div class="days n${days.length}">${dayHtml}</div>
  <div class="sect rv" style="--d:1050">${T('timeLabel')}</div>
  ${s.dayTimes.length ? `<div class="sub rv" style="--d:1100">${T('dayPartLabel')}</div><div class="times">${dayTimes}</div>` : ''}
  ${s.eveningTimes.length ? `<div class="sub rv" style="--d:1300">${T('eveningLabel')}</div><div class="times">${eveTimes}</div>` : ''}
  <div class="hand" id="hand"></div>
  <button class="cta rv" style="--d:1500" data-act="confirm" id="confirm">${T('confirmBtn')} ${heartIcon()}</button>
</div>`;
    },

    letter() {
      return `
<div class="screen letter">
  ${progress('letter')}
  <div class="letter-stage" id="lstage">
    <div class="env-glow"></div>
    <div class="env-shadow" id="envShadow"></div>
    <div class="env-wrap appear" id="env">
      <svg class="env" viewBox="0 0 160 120" aria-hidden="true">
        <defs>
          <linearGradient id="eBk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1cdb6"/><stop offset="1" stop-color="#e2b193"/></linearGradient>
          <linearGradient id="ePk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff8f1"/><stop offset="1" stop-color="#f8e0cd"/></linearGradient>
          <linearGradient id="eFl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fdf0e4"/><stop offset="1" stop-color="#f3d4bf"/></linearGradient>
          <radialGradient id="eSl" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#ff9cc4"/><stop offset="1" stop-color="#e8306f"/></radialGradient>
          <linearGradient id="eBt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fdf2e8"/><stop offset="1" stop-color="#f4d6c0"/></linearGradient>
        </defs>
        <path d="M6 30 H154 V110 Q154 116 148 116 H12 Q6 116 6 110 Z" fill="url(#eBk)"/>
        <path class="flap-open" d="M6 30 L76 -18 Q80 -20.5 84 -18 L154 30 Z" fill="url(#eFl)" stroke="#eccab3" stroke-width="1.2" stroke-linejoin="round"/>
        <g class="paper">
          <rect x="14" y="8" width="132" height="80" rx="5" fill="#fffdfb"/>
          <rect x="14" y="8" width="132" height="80" rx="5" fill="none" stroke="#f4dccf"/>
          <path d="M30 26 h76 M30 38 h98 M30 50 h66" stroke="#f6c3d6" stroke-width="3.4" stroke-linecap="round"/>
          <path transform="translate(110 52) scale(.85)" d="${HEART_D}" fill="#ff8fbc"/>
        </g>
        <path d="M6 30 L80 84 L154 30 V110 Q154 116 148 116 H12 Q6 116 6 110 Z" fill="url(#ePk)"/>
        <path d="M6 30 L80 84 L154 30" stroke="#ecc6ad" stroke-width="1.2" stroke-linejoin="round" fill="none"/>
        <path d="M6 112 L72 71 Q80 66 88 71 L154 112 Q154 116 148 116 H12 Q6 116 6 112 Z" fill="url(#eBt)" stroke="#ecc6ad" stroke-width="1.2" stroke-linejoin="round"/>
        <path class="flap-shut" d="M6 30 H154 L85 79 Q80 82.5 75 79 Z" fill="url(#eFl)" stroke="#eccab3" stroke-width="1.2" stroke-linejoin="round"/>
        <g class="seal">
          <circle cx="80" cy="79" r="15" fill="url(#eSl)"/>
          <circle cx="80" cy="79" r="11.5" fill="none" stroke="#ffd1e3" stroke-width="1.2" stroke-dasharray="2 2.4" opacity=".9"/>
          <path transform="translate(72.5 71.5) scale(.62)" d="${HEART_D}" fill="#fff"/>
        </g>
      </svg>
    </div>
  </div>
</div>`;
    },

    final() {
      return `
<div class="screen final">
  ${progress('final')}
  <div class="cat-wrap rv" style="--d:50">${catSVG('happy')}</div>
  <p class="kicker rv" style="--d:250">${T('finalKicker')}</p>
  <h1 class="title script rv" style="--d:350"><span class="grad-a shim">${T('finalTitle')}</span></h1>
  <div class="when rv" style="--d:550"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>${esc(state.day ? tx('whenPill') : '')}</div>
  <p class="text rv" style="--d:700">${T('finalText')}</p>
  <div class="sign script rv" style="--d:900">${T('finalSign')}</div>
  <div class="extras rv" style="--d:1150">
    <button class="ghost" data-act="ics" id="icsBtn"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/></svg>${T('calendarBtn')}</button>
    <button class="ghost" data-act="noteOpen" id="replyBtn">${heartIcon('')}${T('replyBtn')}</button>
  </div>
  <div class="note" id="note"><div>
    <textarea id="noteText" maxlength="1000" placeholder="${T('notePlaceholder')}"></textarea>
    <button class="cta ready" data-act="noteSend">${T('noteSend')} ${heartIcon()}</button>
  </div></div>
  <div class="note-sent" id="noteSent" hidden></div>
</div>`;
    },
  };

  // плавная смена экрана + анимация высоты карточки
  function go(step, instant) {
    clearTimers();
    state.step = step;
    card.classList.toggle('free', step === 'letter');
    card.querySelectorAll(':scope > .btn.no').forEach((n) => n.remove());
    const old = inner.querySelector('.screen:not(.leaving)');
    inner.querySelectorAll('.screen.leaving').forEach((n) => n.remove());
    const h0 = card.offsetHeight;
    if (old && !instant) {
      old.classList.add('leaving');
      later(() => old.remove(), 460);
    } else if (old) old.remove();

    const wrap = document.createElement('div');
    wrap.innerHTML = SCREENS[step]().trim();
    const el = wrap.firstChild;
    inner.appendChild(el);
    if (instant) document.body.classList.add('instant');

    const h1 = card.offsetHeight;
    if (!instant && old && Math.abs(h1 - h0) > 2) {
      card.style.height = h0 + 'px';
      card.offsetHeight; // reflow
      card.style.height = h1 + 'px';
      later(() => { card.style.height = ''; }, 720);
    } else card.style.height = '';

    if (instant) requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('instant')));
    ENTER[step] && ENTER[step](el, instant);
  }

  const ENTER = {
    ask() { paintNo(); },
    date() { paintDate(true); },
    letter(el, instant) {
      const env = $('#env', el), shadow = $('#envShadow', el);
      const at = (ms, fn) => (instant ? fn() : later(fn, ms));
      at(650, () => env.classList.add('in'));
      at(1550, () => env.classList.add('closed'));
      at(2150, () => { env.classList.add('sealed'); if (!instant) { FX.ring(...center(env, 0.66)); burstAt(env, 16, { min: 1.5, max: 4, g: 0.04 }); } });
      at(2850, () => {
        env.classList.remove('appear'); env.classList.add('fly'); shadow.classList.add('gone');
        if (!instant) trail(env, 1000);
      });
      at(3850, () => showSent(el, instant));
      if (MODE !== 'replay') later(() => dispatch('final'), 6900);
    },
    final(el, instant) {
      card.classList.remove('hidden');
      if (!instant) {
        later(() => { burstAt($('.cat', el), 60, { up: true, min: 3, max: 9, g: 0.1 }); FX.rain(TOUCH ? 25 : 45); }, 250);
      }
      if (state.noteOpen) openNote(true);
      if (state.noteDraft) $('#noteText').value = state.noteDraft;
      if (state.note != null) showNoteSent(true);
    },
  };

  function trail(el, ms) {
    const t0 = performance.now();
    const step = () => {
      if (!el.isConnected) return;
      const r = el.getBoundingClientRect();
      FX.spark(r.left + r.width / 2 + rand(-20, 20), r.top + r.height / 2 + rand(-10, 10));
      FX.spark(r.left + r.width / 2, r.top + r.height / 2);
      if (performance.now() - t0 < ms) requestAnimationFrame(step);
    };
    step();
  }

  function center(el, ky = 0.5) {
    const r = el.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height * ky];
  }

  function showSent(el, instant) {
    const stage = $('#lstage', el || inner);
    if (!stage) return;
    const h0 = card.offsetHeight;
    stage.classList.add('done');
    stage.innerHTML = `
      <div class="sent">
        <div class="sent-ico rv" style="--d:0">${heartIcon('')}</div>
        <div class="script rv" style="--d:150">${T('letterText')}</div>
        <small class="rv" style="--d:450">${T('letterSub')}</small>
      </div>`;
    const h1 = card.offsetHeight;
    if (!instant) {
      card.style.height = h0 + 'px'; card.offsetHeight; card.style.height = h1 + 'px';
      later(() => { card.style.height = ''; }, 720);
      later(() => burstAt($('.sent-ico', stage), 12, { up: true, min: 1.5, max: 3.5, g: 0.04 }), 350);
    }
  }

  /* ─────── вопрос: убегающая кнопка ─────── */

  function paintNo() {
    const yes = $('.btn.yes', inner), no = $('.btn.no', card), cap = $('#caption', inner);
    if (!yes) return;
    yes.style.setProperty('--n', Math.min(state.no, 6));
    yes.classList.toggle('ring', state.no > 0);
    const bubbles = txList('noBubbles'), caps = txList('noCaptions');
    let capText = '';
    if (state.noGone) {
      capText = tx('noGoneCaption');
      if (no) no.remove();
    } else if (state.no > 0 && no) {
      no.textContent = bubbles[Math.min(state.no, bubbles.length) - 1] || tx('noBtn');
      // кнопка «переезжает» в карточку и дальше летает внутри неё
      if (no.parentNode !== card) {
        const r = no.getBoundingClientRect(), cr = card.getBoundingClientRect();
        no.classList.add('flying');
        card.appendChild(no);
        no.style.left = (r.left - cr.left) + 'px';
        no.style.top = (r.top - cr.top) + 'px';
        no.offsetWidth;
      }
      const p = state.noPos || { x: 0.1, y: 0.8, r: 0 };
      no.style.left = (p.x * card.offsetWidth) + 'px';
      no.style.top = (p.y * card.offsetHeight) + 'px';
      no.style.setProperty('--rot', p.r + 'deg');
      capText = caps[Math.min(state.no, caps.length) - 1] || '';
    }
    if (cap && cap.textContent !== capText) {
      cap.textContent = capText;
      cap.classList.remove('swap'); cap.offsetWidth; cap.classList.add('swap');
    }
  }

  // вычислить новое место для кнопки «Нет» (в долях карточки)
  function pickNoPos(px, py, label) {
    const no = $('.btn.no', card), yes = $('.btn.yes', inner);
    const cr = card.getBoundingClientRect();
    const W = card.offsetWidth, H = card.offsetHeight;
    const prevText = no.textContent;
    no.textContent = label;
    const bw = no.offsetWidth + 6, bh = no.offsetHeight;
    no.textContent = prevText;
    const yr = yes.getBoundingClientRect();
    const Y = { l: yr.left - cr.left - 26, t: yr.top - cr.top - 20, r: yr.right - cr.left + 26, b: yr.bottom - cr.top + 20 };
    const P = { x: px - cr.left, y: py - cr.top };
    const pad = 12;
    let best = null, bestScore = -1;
    for (let i = 0; i < 40; i++) {
      const x = rand(pad, Math.max(pad, W - bw - pad));
      const y = rand(pad + 10, Math.max(pad + 10, H - bh - pad));
      const overlapYes = x < Y.r && x + bw > Y.l && y < Y.b && y + bh > Y.t;
      if (overlapYes) continue;
      const d = Math.hypot(x + bw / 2 - P.x, y + bh / 2 - P.y);
      const score = d + rand(0, 60);
      if (d > 130 && score > bestScore) { best = { x, y }; bestScore = score; }
    }
    if (!best) best = { x: pad, y: pad + 10 };
    return { x: +(best.x / W).toFixed(4), y: +(best.y / H).toFixed(4), r: +rand(-9, 9).toFixed(1) };
  }

  let noCooldown = 0;
  function tryDodge(px, py) {
    if (state.step !== 'ask' || state.noGone || REPLAY) return;
    const now = performance.now();
    if (now < noCooldown) return;
    noCooldown = now + 280;
    const bubbles = txList('noBubbles');
    if (state.no >= bubbles.length) { dispatch('no', { gone: 1 }); return; }
    const pos = pickNoPos(px, py, bubbles[state.no] || '');
    dispatch('no', pos);
    if (TOUCH && navigator.vibrate) navigator.vibrate(30);
  }

  function applyNo(data, instant) {
    if (data && data.gone) {
      const no = $('.btn.no', card);
      state.no++;
      state.noGone = true;
      if (no && !instant) {
        burstAt(no, 26, { min: 2, max: 6 });
        no.classList.add('poof');
        later(() => paintNo(), 420);
      } else paintNo();
    } else {
      state.no++;
      state.noPos = data;
      paintNo();
    }
    const cat = $('.cat', inner);
    if (cat && !instant) {
      cat.classList.add('worried');
      clearTimeout(applyNo.t);
      applyNo.t = setTimeout(() => cat.classList.remove('worried'), 900);
    }
  }

  /* ─────── «Да» с первого раза: ни разу не задела «Нет» ─────── */

  function perfectYes() {
    const yes = $('.btn.yes', inner);
    const [x, y] = yes ? center(yes) : [innerWidth / 2, innerHeight / 2];
    const cat = $('.cat', inner);
    cat && cat.classList.add('happy');
    yes && yes.classList.add('pressed');
    const btns = $('.btns', inner);
    if (btns) { btns.classList.remove('rv'); later(() => btns.classList.add('veiled'), 180); }
    if (TOUCH && navigator.vibrate) navigator.vibrate([40, 60, 40, 60, 120]);

    const ov = document.createElement('div');
    ov.className = 'perfect';
    ov.style.setProperty('--x', x + 'px');
    ov.style.setProperty('--y', y + 'px');
    ov.innerHTML = `
      <div class="pf-dim"></div>
      <div class="pf-flash"></div>
      <div class="pf-wave"></div><div class="pf-wave w2"></div>
      <svg class="pf-heart" viewBox="0 0 24 24"><defs><linearGradient id="pfg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd1e6"/><stop offset=".5" stop-color="#ff7eb3"/><stop offset="1" stop-color="#ff3d85"/></linearGradient></defs><path d="${HEART_D}" fill="url(#pfg)"/></svg>
      <div class="pf-text">
        <div class="pf-title script">${words(tx('perfectTitle'), 900, 90)}</div>
        <div class="pf-sub">${T('perfectSub')}</div>
      </div>`;
    document.body.appendChild(ov);

    // мгновенный всплеск от кнопки
    FX.ring(x, y);
    FX.burst(x, y, 40, { min: 3, max: 11, g: 0.08 });
    // большое сердце в центре «взрывается» сердцем из частиц
    const cx = innerWidth / 2, cy = innerHeight / 2;
    later(() => {
      FX.heartBurst(cx, cy, Math.min(innerWidth, innerHeight) / 95, 90);
      FX.burst(cx, cy, 50, { min: 4, max: 13, g: 0.06, smin: 8, smax: 18 });
    }, 1150);
    // салют из сердечек
    const n = TOUCH ? 4 : 6;
    for (let i = 0; i < n; i++) {
      later(() => FX.rocket(innerWidth * (0.15 + 0.7 * ((i * 0.618) % 1)), innerHeight * rand(0.15, 0.4)), 350 + i * 330);
    }
    later(() => FX.rain(TOUCH ? 30 : 60), 1400);
    setTimeout(() => ov.remove(), 3400);
  }

  /* ─────── дата ─────── */

  function paintDate(initial) {
    $$('.chip.day', inner).forEach((b) => b.classList.toggle('sel', b.dataset.v === state.day));
    $$('.chip.time', inner).forEach((b) => b.classList.toggle('sel', b.dataset.v === state.time));
    const hand = $('#hand', inner);
    const key = state.day && state.time ? 'dateHintDone' : state.day ? 'dateHintTime' : state.time ? 'dateHintDay' : 'dateHintStart';
    const txt = tx(key);
    if (hand && hand.dataset.k !== key + txt) {
      hand.dataset.k = key + txt;
      hand.innerHTML = txt ? `<span class="script">${esc(txt)}</span>` : '';
    }
    const c = $('#confirm', inner);
    if (c) c.classList.toggle('ready', !!(state.day && state.time));
  }

  /* ─────── финал: календарь, ответ ─────── */

  function downloadICS() {
    if (!state.day || !state.time) return;
    const [y, m, d] = state.day.split('-').map(Number);
    const [hh, mm] = state.time.split(':').map(Number);
    const start = new Date(y, m - 1, d, hh, mm);
    const end = new Date(start.getTime() + CFG.settings.duration * 3600e3);
    const f = (dt) => `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(dt.getDate()).padStart(2, '0')}T${String(dt.getHours()).padStart(2, '0')}${String(dt.getMinutes()).padStart(2, '0')}00`;
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const escI = (s) => String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//svidanie//RU', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      `UID:${Date.now()}@svidanie`, `DTSTAMP:${stamp}`, `DTSTART:${f(start)}`, `DTEND:${f(end)}`,
      `SUMMARY:${escI(tx('calendarTitle'))}`, `DESCRIPTION:${escI(tx('finalText'))}`,
      'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', `DESCRIPTION:${escI(tx('calendarTitle'))}`, 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    a.download = 'svidanie.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  function openNote(instant) {
    const n = $('#note', inner);
    if (!n) return;
    n.classList.add('open');
    if (instant) n.classList.add('shown'); else later(() => n.classList.add('shown'), 520);
    $('#replyBtn', inner)?.classList.add('done');
    if (!instant && !REPLAY) setTimeout(() => $('#noteText', inner)?.focus(), 300);
  }
  function showNoteSent(instant) {
    const n = $('#note', inner), s = $('#noteSent', inner);
    if (!s) return;
    n && n.classList.remove('open', 'shown');
    s.hidden = false;
    s.innerHTML = `<span class="${instant ? '' : 'rv'}">${T('noteSent')}</span>`;
    $('#replyBtn', inner)?.remove();
    if (!instant) burstAt(s, 20, { up: true, min: 2, max: 5 });
  }

  /* ═════════════ диспетчер действий ═════════════ */

  function dispatch(type, data) {
    Rec.push(type, data);
    apply(type, data, false);
  }

  function apply(type, data, instant) {
    switch (type) {
      case 'open':
        if (!instant) burstAt($('.gift', inner), 40, { min: 2, max: 8 });
        go('ask', instant);
        if (!REPLAY) Music.start();
        else { Music.btn.hidden = CFG.settings.musicMode === 'off'; Music.set(true); }
        break;
      case 'no': applyNo(data, instant); break;
      case 'yes':
        state.yesDone = true;
        if (data && data.perfect && !instant) {
          perfectYes();
          later(() => go('date'), 3000);
        } else {
          if (!instant) burstAt($('.btn.yes', inner), 50, { min: 3, max: 10 });
          go('date', instant);
        }
        break;
      case 'day': state.day = data.d; paintDate(); break;
      case 'time': state.time = data.v; paintDate(); break;
      case 'confirm':
        if (!instant) burstAt($('#confirm', inner), 30, { up: true });
        go('letter', instant);
        break;
      case 'final': go('final', instant); break;
      case 'noteOpen': state.noteOpen = true; openNote(instant); break;
      case 'type': state.noteDraft = data.v; { const t = $('#noteText', inner); if (t) t.value = data.v; } break;
      case 'note': state.note = data.text; showNoteSent(instant); break;
      case 'ics': { const b = $('#icsBtn', inner); b && b.classList.add('done'); if (!instant) burstAt(b, 14, { up: true, min: 1.5, max: 4 }); } break;
      case 'music': Music.set(!!(data && data.on)); break;
    }
  }

  // действия пользователя (только live/preview)
  card.addEventListener('click', (e) => {
    if (REPLAY) return;
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    switch (act) {
      case 'open': if (state.step === 'intro') dispatch('open'); break;
      case 'yes': if (state.step === 'ask' && !state.yesDone) dispatch('yes', state.no === 0 ? { perfect: 1 } : null); break;
      case 'no': tryDodge(e.clientX || 0, e.clientY || 0); break;
      case 'day': dispatch('day', { d: b.dataset.v }); break;
      case 'time': dispatch('time', { v: b.dataset.v }); break;
      case 'confirm': if (state.day && state.time && state.step === 'date') dispatch('confirm'); break;
      case 'ics': dispatch('ics'); downloadICS(); break;
      case 'noteOpen': if (!state.noteOpen) dispatch('noteOpen'); else $('#noteText', inner)?.focus(); break;
      case 'noteSend': {
        const v = ($('#noteText', inner)?.value || '').trim();
        if (v) dispatch('note', { text: v.slice(0, 1000) });
        break;
      }
    }
  });
  // на телефоне «Нет» убегает прямо от касания
  card.addEventListener('pointerdown', (e) => {
    if (REPLAY) return;
    const no = e.target.closest('.btn.no');
    if (no) { e.preventDefault(); tryDodge(e.clientX, e.clientY); }
  });
  // не даём тапу по «Нет» превратиться в клик по тому, что окажется под пальцем
  card.addEventListener('touchstart', (e) => {
    if (!REPLAY && e.target.closest('.btn.no')) e.preventDefault();
  }, { passive: false });
  // после появления снимаем анимационные классы, чтобы работали hover/transform
  card.addEventListener('animationend', (e) => {
    if (e.animationName !== 'rv' && e.animationName !== 'chipIn') return;
    const c = e.target.classList;
    c.remove('rv', 'pop-in', 'w');
    if (c.contains('grad-a') || c.contains('grad-g')) c.add('shim');
  });
  let typeT = 0;
  inner.addEventListener('input', (e) => {
    if (REPLAY || e.target.id !== 'noteText') return;
    state.noteDraft = e.target.value;
    clearTimeout(typeT);
    typeT = setTimeout(() => Rec.push('type', { v: e.target.value.slice(0, 1000) }), 250);
  });

  /* ═════════════ курсор, наклон карточки, запись движений ═════════════ */

  const cursor = $('#cursor');
  const finger = $('#finger');
  let cx = -100, cy = -100, rx = -100, ry = -100;
  const useCursor = () => CFG && CFG.settings.cursor && (!TOUCH || REPLAY);

  function pointerAt(x, y, fromReplay) {
    cx = x; cy = y;
    lookAt(x, y);
    // наклон карточки
    if (CFG && CFG.settings.tilt && (!TOUCH || fromReplay === 'mouse')) {
      const r = card.getBoundingClientRect();
      const nx = (x - (r.left + r.width / 2)) / innerWidth, ny = (y - (r.top + r.height / 2)) / innerHeight;
      card.style.setProperty('--ry', (nx * 6).toFixed(2) + 'deg');
      card.style.setProperty('--rx', (-ny * 6).toFixed(2) + 'deg');
      card.style.setProperty('--mx', ((x - r.left) / r.width * 100).toFixed(1) + '%');
      card.style.setProperty('--my', ((y - r.top) / r.height * 100).toFixed(1) + '%');
    }
    // hover-состояние (для реплея — вручную)
    const el = document.elementFromPoint(x, y);
    const hovEl = el && el.closest('button, .chip');
    cursor.classList.toggle('hover', !!hovEl && !(hovEl.classList.contains('cta') && !hovEl.classList.contains('ready')));
    if (fromReplay) {
      $$('.hov').forEach((n) => n !== hovEl && n.classList.remove('hov'));
      hovEl && hovEl.classList.add('hov');
    }
    if (!TOUCH && !REPLAY && Math.random() < 0.35) FX.spark(x + rand(-4, 4), y + rand(-4, 4));
    if (fromReplay === 'mouse' && Math.random() < 0.35) FX.spark(x, y);
  }

  const curHeart = cursor.querySelector('.cursor-heart'), curRing = cursor.querySelector('.cursor-ring');
  (function cursorLoop() {
    rx += (cx - rx) * 0.18; ry += (cy - ry) * 0.18;
    curHeart.style.translate = `${cx}px ${cy}px`;
    curRing.style.translate = `${rx}px ${ry}px`;
    finger.style.left = cx + 'px'; finger.style.top = cy + 'px';
    requestAnimationFrame(cursorLoop);
  })();

  if (!REPLAY) {
    let lastM = 0, lastX = -1, lastY = -1, down = false, lastS = 0;
    addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse' || down) {
        pointerAt(e.clientX, e.clientY);
        // «Нет» убегает, когда курсор подбирается близко
        if (e.pointerType === 'mouse' && state.step === 'ask' && !state.noGone) {
          const no = $('.btn.no', card);
          if (no) {
            const r = no.getBoundingClientRect();
            const m = 16;
            if (e.clientX > r.left - m && e.clientX < r.right + m && e.clientY > r.top - m && e.clientY < r.bottom + m) tryDodge(e.clientX, e.clientY);
          }
        }
      }
      const now = performance.now();
      if ((e.pointerType === 'mouse' || down) && now - lastM > 33 && (Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY) > 2)) {
        lastM = now; lastX = e.clientX; lastY = e.clientY;
        Rec.push('m', [Math.round(e.clientX), Math.round(e.clientY)]);
      }
    }, { passive: true });
    addEventListener('pointerdown', (e) => {
      down = e.pointerType !== 'mouse';
      cursor.classList.add('down');
      pointerAt(e.clientX, e.clientY);
      Rec.push('d', [Math.round(e.clientX), Math.round(e.clientY)]);
      clickBurst(e.clientX, e.clientY);
      if (CFG && !CFG.settings.showIntro) Music.start();
    }, { passive: true });
    addEventListener('pointercancel', () => { down = false; cursor.classList.remove('down'); });
    addEventListener('pointerup', (e) => {
      down = false;
      cursor.classList.remove('down');
      if (e.pointerType !== 'mouse') Rec.push('u', [Math.round(e.clientX), Math.round(e.clientY)]);
    }, { passive: true });
    document.addEventListener('mouseleave', () => cursor.classList.add('gone'));
    document.addEventListener('mouseenter', () => cursor.classList.remove('gone'));
    addEventListener('scroll', () => {
      const now = performance.now();
      if (now - lastS > 80) { lastS = now; Rec.push('s', Math.round(scrollY)); }
    }, { passive: true });
    let rsT = 0;
    addEventListener('resize', () => {
      clearTimeout(rsT);
      rsT = setTimeout(() => Rec.push('rs', [innerWidth, innerHeight]), 250);
    });
  }

  /* ═════════════ плеер записи (для админки) ═════════════ */

  const Player = {
    ev: [], i: 0, t: 0, dur: 0, playing: false, speed: 1, skipIdle: true, last: 0, touch: false, raf: 0, lastPost: 0,
    load(s) {
      CFG = s.cfg;
      BASE = new Date(s.startedAt);
      this.touch = !!s.touch;
      document.body.classList.toggle('replay-touch', this.touch);
      document.body.classList.toggle('has-cursor', !this.touch);
      applyTheme();
      this.ev = s.events || [];
      this.dur = this.ev.length ? this.ev[this.ev.length - 1][0] : 0;
      this.reset();
      Music.btn.hidden = CFG.settings.musicMode === 'off' || CFG.settings.showIntro;
      this.post(true);
      if (!this.raf) this.loop();
    },
    reset() {
      clearTimers();
      state = initState();
      $('#replayVeil').hidden = true;
      inner.innerHTML = '';
      card.style.height = '';
      window.scrollTo(0, 0);
      go(CFG.settings.showIntro ? 'intro' : 'ask', true);
      this.i = 0; this.t = 0;
    },
    applyOne(e, instant) {
      const [, type, d] = e;
      switch (type) {
        case 'm': pointerAt(d[0], d[1], this.touch ? 'touch' : 'mouse'); break;
        case 'd':
          pointerAt(d[0], d[1], this.touch ? 'touch' : 'mouse');
          if (!instant) {
            cursor.classList.add('down'); setTimeout(() => cursor.classList.remove('down'), 160);
            finger.classList.add('down');
            clickBurst(d[0], d[1]);
            if (!this.touch) break;
            clearTimeout(this.fT); this.fT = setTimeout(() => finger.classList.remove('down'), 450);
          }
          break;
        case 'u': finger.classList.remove('down'); break;
        case 's': window.scrollTo(0, d); break;
        case 'rs': parent.postMessage({ type: 'viewport', w: d[0], h: d[1] }, location.origin); break;
        case 'vis': $('#replayVeil').hidden = !d.h; break;
        case 'bye': break;
        default: apply(type, d, instant);
      }
    },
    seek(t) {
      if (t < this.t) this.reset();
      while (this.i < this.ev.length && this.ev[this.i][0] <= t) this.applyOne(this.ev[this.i++], true);
      this.t = t;
      this.post(true);
    },
    loop() {
      const now = performance.now();
      if (this.playing) {
        let dt = (now - this.last) * this.speed;
        const next = this.ev[this.i];
        if (this.skipIdle && next && next[0] - this.t > 2500) this.t = next[0] - 600;
        this.t += dt;
        while (this.i < this.ev.length && this.ev[this.i][0] <= this.t) this.applyOne(this.ev[this.i++], false);
        if (this.i >= this.ev.length && this.t >= this.dur) {
          this.t = this.dur;
          if (!this.live) { this.playing = false; this.post(true); }
          else this.t = this.dur;
        }
      }
      this.last = now;
      if (now - this.lastPost > 120) this.post();
      this.raf = requestAnimationFrame(() => this.loop());
    },
    post(force) {
      this.lastPost = performance.now();
      parent.postMessage({ type: 'progress', t: this.t, dur: this.dur, playing: this.playing, i: this.i }, location.origin);
    },
  };

  if (REPLAY) {
    document.body.classList.add('replay');
    addEventListener('message', (e) => {
      if (e.origin !== location.origin) return;
      const m = e.data || {};
      switch (m.cmd) {
        case 'load': Player.live = !!m.live; Player.load(m.session); break;
        case 'play':
          if (Player.t >= Player.dur && !Player.live) Player.seek(0);
          Player.playing = true; Player.last = performance.now(); break;
        case 'pause': Player.playing = false; Player.post(true); break;
        case 'seek': Player.seek(m.t); break;
        case 'speed': Player.speed = m.v; break;
        case 'skip': Player.skipIdle = !!m.v; break;
        case 'live': Player.live = !!m.v; break;
        case 'append':
          Player.ev.push(...m.events);
          Player.dur = Player.ev.length ? Player.ev[Player.ev.length - 1][0] : 0;
          break;
      }
    });
    parent.postMessage({ type: 'ready' }, location.origin);
  }

  /* ═════════════ старт ═════════════ */

  function applyTheme() {
    document.documentElement.lang = CFG.settings.lang || 'ru';
    document.documentElement.dataset.theme = CFG.settings.theme || 'violet';
  }

  async function boot() {
    if (REPLAY) { document.body.classList.remove('loading'); return; }
    try {
      const r = await fetch('/api/config?slug=' + encodeURIComponent(SLUG) + (qs.get('lang') ? '&lang=' + encodeURIComponent(qs.get('lang')) : ''));
      CFG = await r.json();
    } catch {
      inner.innerHTML = '<div class="screen"><p class="text">Не получилось загрузить… обнови страницу ♡</p></div>';
      document.body.classList.remove('loading');
      return;
    }
    applyTheme();
    if (useCursor()) document.body.classList.add('has-cursor');
    if (CFG.settings.musicMode === 'off') Music.btn.remove();
    try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1200))]); } catch {}
    document.body.classList.remove('loading');
    go(CFG.settings.showIntro ? 'intro' : 'ask', false);
    if (!CFG.settings.showIntro && CFG.settings.musicMode !== 'off') Music.btn.hidden = false;
    Rec.start();
  }
  boot();
})();
