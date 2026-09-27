(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  async function api(path, opts = {}) {
    const o = { method: opts.method || 'GET', headers: {} };
    if (opts.body instanceof Blob || opts.body instanceof File) {
      o.body = opts.body; o.headers['content-type'] = opts.body.type || 'application/octet-stream';
    } else if (opts.body !== undefined) {
      o.body = JSON.stringify(opts.body); o.headers['content-type'] = 'application/json';
    }
    const r = await fetch(path, o);
    let data = null;
    try { data = await r.json(); } catch {}
    if (r.status === 401 && path !== '/api/admin/login') { showAuth(); throw new Error('Нужно войти'); }
    if (!r.ok) throw new Error((data && data.error) || 'Ошибка ' + r.status);
    return data;
  }

  function toast(text, kind = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = text;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, 3200);
  }

  const fmtDur = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const DAY_FMT = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });
  const DAY_LONG = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  const dayOf = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  const dShort = (iso) => (iso ? DAY_FMT.format(dayOf(iso)) : '');
  const dLong = (iso) => (iso ? DAY_LONG.format(dayOf(iso)) : '');
  function when(iso) {
    const d = new Date(iso), now = new Date();
    const diff = (now - d) / 1000;
    const hm = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    if (diff < 60) return 'только что';
    if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
    if (d.toDateString() === now.toDateString()) return `сегодня, ${hm}`;
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return `вчера, ${hm}`;
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) + ', ' + hm;
  }
  const isOnline = (s) => !(s.st && s.st.left) && Date.now() - s.lastSeen < 12000;

  /* ═════════════ вход ═════════════ */

  let authMode = 'login';
  function showAuth(st) {
    $('#app').hidden = true;
    $('#player').hidden = true;
    $('#auth').hidden = false;
    const setup = st && !st.setup;
    authMode = setup ? 'setup' : 'login';
    $('#authTitle').textContent = setup ? 'Первый запуск ♡' : 'Вход в админку';
    $('#authText').textContent = setup
      ? (st.canSetup ? 'Придумай пароль для админки' : 'Пароль ещё не задан. Открой админку с этого компьютера: http://localhost:3333/admin')
      : 'Введи пароль';
    $('#authPw2').hidden = !setup;
    $('#authPw2').required = setup;
    $('#authBtn').textContent = setup ? 'Сохранить пароль' : 'Войти';
    $('#authBtn').disabled = setup && !st.canSetup;
    $('#authPw').autocomplete = setup ? 'new-password' : 'current-password';
    setTimeout(() => $('#authPw').focus(), 50);
  }
  $('#authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#authErr').textContent = '';
    const pw = $('#authPw').value;
    try {
      if (authMode === 'setup') {
        if (pw !== $('#authPw2').value) throw new Error('Пароли не совпадают');
        await api('/api/admin/setup', { method: 'POST', body: { password: pw } });
      } else {
        await api('/api/admin/login', { method: 'POST', body: { password: pw } });
      }
      $('#authPw').value = ''; $('#authPw2').value = '';
      start();
    } catch (err) { $('#authErr').textContent = err.message; }
  });
  $('#logout').addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST', body: {} }).catch(() => {});
    location.reload();
  });

  /* ═════════════ данные ═════════════ */

  let cfg = null, draft = null, defaults = null, info = {}, sessions = [], filter = 'all';

  async function start() {
    $('#auth').hidden = true;
    $('#app').hidden = false;
    const c = await api('/api/admin/config');
    defaults = c.defaults; delete c.defaults;
    normalizeLangs(c); normalizeLangs(defaults);
    cfg = c; draft = clone(c);
    textLang = cfg.lang;
    info = await api('/api/admin/info');
    sessions = await api('/api/admin/sessions');
    renderAll();
    connectStream();
    setInterval(() => { renderRecords(); }, 15000);
  }

  function renderAll() {
    renderTunnel(); renderRecords(); renderLangs(); renderInvites(); renderTexts(); renderPerson(); renderStyle(); renderSettings(); updateSavebar();
  }

  /* ═════════════ вкладки ═════════════ */

  function showTab(name) {
    $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
    $$('.tab').forEach((t) => (t.hidden = t.dataset.tab !== name));
    ls.set('adm.tab', name);
  }
  $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) showTab(b.dataset.tab); });
  showTab(ls.get('adm.tab', 'records'));

  /* ═════════════ туннель ═════════════ */

  const baseUrl = () => info.publicUrl || location.origin;
  function renderTunnel() {
    const el = $('#tunnel');
    if (info.publicUrl) {
      el.innerHTML = `<span class="dot on"></span><span class="muted">Публичная ссылка:</span> <a href="${esc(info.publicUrl)}" target="_blank" rel="noopener">${esc(info.publicUrl.replace('https://', ''))}</a> <button class="btn ghost sm" data-copy="${esc(info.publicUrl)}">Копировать</button>`;
    } else if (info.tunnel) {
      el.innerHTML = `<span class="dot"></span><span class="muted">Туннель поднимается…</span>`;
    } else {
      el.innerHTML = `<span class="dot"></span><span class="muted">Туннель выключен — запусти <code>start.bat</code>, чтобы получить публичную ссылку</span>`;
    }
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-copy]');
    if (!b) return;
    const v = b.dataset.copy;
    (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(
      () => toast('Скопировано ♡', 'ok'),
      () => { prompt('Скопируй ссылку:', v); },
    );
  });

  /* ═════════════ записи ═════════════ */

  function statusBadges(s) {
    const st = s.st || {};
    const out = [];
    if (st.confirmed || st.final) out.push(`<span class="badge date">📅 ${esc(dShort(st.day))} · ${esc(st.time || '')}</span>`);
    else if (st.yes) out.push('<span class="badge yes">💖 Сказала «да»</span>');
    else if (st.opened) out.push('<span class="badge">Открыла, думает…</span>');
    else out.push('<span class="badge">Зашла на страницу</span>');
    if (st.perfect) out.push('<span class="badge yes">💘 с первого раза</span>');
    if (st.no) out.push(`<span class="badge no">😼 «нет» ×${st.no}</span>`);
    if (st.note) out.push('<span class="badge note">✉️ ответ</span>');
    return out.join('');
  }

  function renderRecords(flashId) {
    const inv = draft ? draft.invites : [];
    // статистика
    const total = sessions.length;
    const yes = sessions.filter((s) => s.st && s.st.yes).length;
    const conf = sessions.filter((s) => s.st && s.st.confirmed).length;
    const noSum = sessions.reduce((a, s) => a + ((s.st && s.st.no) || 0), 0);
    const online = sessions.filter(isOnline).length;
    $('#stats').innerHTML = `
      <div class="stat"><b>${total}</b><span>всего визитов</span></div>
      <div class="stat hl"><b>${yes}</b><span>сказали «да» 💖</span></div>
      <div class="stat"><b>${conf}</b><span>выбрали дату</span></div>
      <div class="stat"><b>${yes ? (noSum / Math.max(1, total)).toFixed(1) : '0'}</b><span>попыток нажать «нет» в среднем</span></div>
      <div class="stat"><b>${online}</b><span>сейчас на странице</span></div>`;
    $('#liveCount').hidden = !online;
    $('#liveCount').textContent = online;

    // фильтры
    const fl = [['all', 'Все'], ['main', 'Основная ссылка'], ...inv.map((i) => [i.id, i.name])];
    if (!fl.some((f) => f[0] === filter)) filter = 'all';
    $('#filters').innerHTML = fl.length > 2 ? fl.map(([k, t]) => `<button data-f="${esc(k)}" class="${k === filter ? 'on' : ''}">${esc(t)}</button>`).join('') : '';

    const list = sessions.filter((s) => filter === 'all' || (filter === 'main' ? !s.inviteId : s.inviteId === filter));
    if (!list.length) {
      $('#recList').innerHTML = `<div class="empty"><span class="big">💌</span>Пока никто не проходил анкету.<br>Скопируй ссылку во вкладке «Ссылки» и отправь её ♡</div>`;
      return;
    }
    $('#recList').innerHTML = list.map((s) => `
      <div class="rec ${s.id === flashId ? 'new' : ''}" data-id="${esc(s.id)}">
        <div class="ava">${esc((s.name || '?').trim()[0] || '?').toUpperCase()}${isOnline(s) ? '<i class="ld"></i>' : ''}</div>
        <div class="rec-main">
          <div class="rec-top"><b>${esc(s.name)}</b><span class="muted small">${esc(when(s.startedAt))}</span></div>
          <div class="rec-sub"><span>${s.device === 'mobile' ? '📱' : '💻'} ${esc(s.os)} · ${esc(s.browser)}</span><span>⏱ ${fmtDur(s.duration)}</span>${s.slug ? `<span>🔗 /p/${esc(s.slug)}</span>` : ''}</div>
        </div>
        <div class="rec-end">${statusBadges(s)}</div>
      </div>`).join('');
  }
  $('#filters').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) { filter = b.dataset.f; renderRecords(); } });
  $('#recList').addEventListener('click', (e) => { const r = e.target.closest('.rec'); if (r) openPlayer(r.dataset.id); });

  /* ═════════════ live-поток ═════════════ */

  let es = null;
  function connectStream() {
    if (es) es.close();
    es = new EventSource('/api/admin/stream');
    es.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.type === 'session') {
        const i = sessions.findIndex((s) => s.id === m.s.id);
        const prev = i >= 0 ? sessions[i] : null;
        if (i >= 0) sessions[i] = m.s; else sessions.unshift(m.s);
        renderRecords(m.isNew ? m.s.id : null);
        onSessionUpdate(prev, m.s, m.isNew);
        if (P.id === m.s.id) P.onLive(m.s);
      } else if (m.type === 'deleted') {
        sessions = sessions.filter((s) => s.id !== m.id); renderRecords();
      } else if (m.type === 'cleared') {
        sessions = []; renderRecords();
      } else if (m.type === 'info') {
        info.publicUrl = m.publicUrl; renderTunnel(); renderInvites();
      }
    };
  }

  // звук/уведомления о событиях
  let actx = null;
  function chime(big) {
    if (!ls.get('adm.snd', true)) return;
    try {
      actx = actx || new AudioContext();
      const notes = big ? [72, 76, 79, 84] : [79, 84];
      notes.forEach((n, i) => {
        const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * 0.11;
        o.type = 'sine'; o.frequency.value = 440 * Math.pow(2, (n - 69) / 12);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.15, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 1);
      });
    } catch {}
  }
  function sysNotify(text) {
    if (!ls.get('adm.ntf', false) || !('Notification' in window) || Notification.permission !== 'granted') return;
    try { new Notification('Свидание ♡', { body: text }); } catch {}
  }
  function onSessionUpdate(prev, s, isNew) {
    const a = (prev && prev.st) || {}, b = s.st || {};
    let msg = null, big = false;
    if (isNew) msg = `👀 ${s.name}: кто-то открыл анкету`;
    else if (b.yes && !a.yes) { msg = b.perfect ? `💘 ${s.name} сразу сказала «да», даже не тронув «нет»!` : `💖 ${s.name} сказала «да»!`; big = true; }
    else if (b.confirmed && !a.confirmed) { msg = `📅 ${s.name}: ${dLong(b.day)}, ${b.time}`; big = true; }
    else if (b.note && b.note !== a.note) { msg = `✉️ ${s.name} написала ответ`; big = true; }
    if (!msg) return;
    toast(msg, 'love'); chime(big); sysNotify(msg);
  }

  /* ═════════════ плеер ═════════════ */

  const EV_META = {
    open: ['#ffb3d1', () => 'Открыла приглашение'],
    no: ['#ffcf7a', (d, n) => (d && d.gone ? 'Кнопка «Нет» исчезла' : `Попытка нажать «Нет» #${n}`)],
    yes: ['#ff79ad', (d) => (d && d.perfect ? 'Сразу нажала «Да» 💘 — ни разу не задела «Нет»' : 'Нажала «Да» 💖')],
    day: ['#a77bff', (d) => `Выбрала день: ${dLong(d.d)}`],
    time: ['#a77bff', (d) => `Выбрала время: ${d.v}`],
    confirm: ['#5ee0a0', () => 'Нажала «Договорились»'],
    final: ['#5ee0a0', () => 'Увидела финальный экран'],
    ics: ['#5ee0a0', () => 'Добавила в календарь'],
    noteOpen: ['#c9a8ff', () => 'Открыла поле для ответа'],
    note: ['#c9a8ff', (d) => `Написала: «${d.text}»`],
    music: ['#8aa0ff', (d) => (d.on ? 'Включила музыку' : 'Выключила музыку')],
    vis: ['#666', (d) => (d.h ? 'Свернула вкладку' : 'Вернулась на вкладку')],
    rs: ['#666', (d) => `Изменила размер окна: ${d[0]}×${d[1]}`],
    bye: ['#ff6b81', () => 'Закрыла страницу'],
  };

  const P = {
    id: null, s: null, ev: [], marks: [], t: 0, dur: 0, playing: false, frameReady: false, vw: 0, vh: 0,

    async open(id) {
      this.id = id;
      const s = await api('/api/admin/sessions/' + encodeURIComponent(id));
      this.s = s; this.ev = s.events; this.dur = s.events.length ? s.events[s.events.length - 1][0] : 0; this.t = 0;
      this.vw = s.vw || (s.touch ? 390 : 1280); this.vh = s.vh || (s.touch ? 800 : 800);
      $('#player').hidden = false;
      document.body.style.overflow = 'hidden';
      $('#plName').textContent = s.name;
      $('#plWhen').textContent = new Date(s.startedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
      $('#plEmpty').hidden = s.events.length > 0;
      $('#plDevice').classList.toggle('phone', !!s.touch);
      this.renderSide(); this.renderMarks(); this.layout();
      requestAnimationFrame(() => this.layout());
      this.frameReady = false;
      $('#plFrame').src = '/?replay=1&_=' + Date.now();
      this.setPlaying(false);
      $('#plLive').hidden = !isOnline(s.summary || s);
    },
    close() {
      this.id = null; this.s = null;
      $('#player').hidden = true;
      $('#plFrame').src = 'about:blank';
      document.body.style.overflow = '';
    },
    send(msg) { const w = $('#plFrame').contentWindow; if (w && this.frameReady) w.postMessage(msg, location.origin); },
    onFrame(m) {
      if (m.type === 'ready') {
        this.frameReady = true;
        const live = isOnline(this.s.summary || this.s);
        this.send({ cmd: 'load', session: this.s, live });
        this.send({ cmd: 'speed', v: Number($('#plSpeed').value) });
        this.send({ cmd: 'skip', v: $('#plSkip').checked });
        if (this.ev.length) { this.send({ cmd: 'play' }); }
      } else if (m.type === 'progress') {
        this.t = m.t; this.dur = Math.max(this.dur, m.dur);
        this.setPlaying(m.playing);
        this.renderProgress(m.i);
      } else if (m.type === 'viewport') {
        this.vw = m.w; this.vh = m.h; this.layout();
      }
    },
    layout() {
      if (!this.s) return;
      const st = $('#plStage').getBoundingClientRect();
      const pad = this.s.touch ? 40 : 24;
      const k = Math.min((st.width - pad) / this.vw, (st.height - pad) / this.vh, 1);
      const dev = $('#plDevice'), fr = $('#plFrame');
      dev.style.width = this.vw * k + 'px'; dev.style.height = this.vh * k + 'px';
      fr.style.width = this.vw + 'px'; fr.style.height = this.vh + 'px';
      fr.style.transform = `scale(${k})`;
    },
    setPlaying(v) { this.playing = v; $('#plPlay').textContent = v ? '❚❚' : '▶'; },
    renderProgress(idx) {
      const k = this.dur ? Math.min(1, this.t / this.dur) : 0;
      $('#plFill').style.width = k * 100 + '%';
      $('#plKnob').style.left = k * 100 + '%';
      $('#plTime').textContent = `${fmtDur(this.t)} / ${fmtDur(this.dur)}`;
      let cur = null;
      $$('#plLog .ev').forEach((el) => {
        const past = Number(el.dataset.t) <= this.t;
        el.classList.toggle('past', past);
        if (past) cur = el;
        el.classList.remove('cur');
      });
      if (cur) cur.classList.add('cur');
    },
    renderMarks() {
      const items = [];
      let n = 0;
      for (const e of this.ev) {
        const meta = EV_META[e[1]];
        if (!meta) continue;
        if (e[1] === 'no') n++;
        items.push({ t: e[0], c: meta[0], label: meta[1](e[2] || {}, n) });
      }
      this.marks = items;
      $('#plMarks').innerHTML = this.dur ? items.filter((i) => i.c !== '#666').map((i) => `<i style="left:${(i.t / this.dur) * 100}%;background:${i.c}" title="${esc(i.label)}"></i>`).join('') : '';
      $('#plLog').innerHTML = items.length
        ? items.map((i) => `<div class="ev" data-t="${i.t}"><time>${fmtDur(i.t)}</time><i style="background:${i.c}"></i><span>${esc(i.label)}</span></div>`).join('')
        : '<div class="muted small">Событий пока нет</div>';
    },
    renderSide() {
      const s = this.s, st = (s.summary && s.summary.st) || s.st || {};
      let res;
      if (st.confirmed || st.final) res = `<div class="result"><div class="r1">💖 Согласилась!</div><div class="r2">${esc(dLong(st.day))}, в ${esc(st.time)}</div></div>`;
      else if (st.yes) res = `<div class="result"><div class="r1">💖 Сказала «да»</div><div class="r2">${st.day || st.time ? 'выбирает: ' + esc([dLong(st.day), st.time].filter(Boolean).join(', ')) : 'дату пока не выбрала'}</div></div>`;
      else res = `<div class="result"><div class="r1">${st.opened ? '🤔 Открыла, но пока не ответила' : '👀 Зашла на страницу'}</div></div>`;
      const note = st.note ? `<h4>Её ответ</h4><div class="notebox">${esc(st.note)}</div>` : '';
      const dur = (s.summary && s.summary.duration) || s.duration;
      $('#plSum').innerHTML = `${res}${note}
        <h4>Детали</h4>
        <div class="kv"><span>Попыток нажать «нет»</span><b>${st.perfect ? '0 — «да» с первого раза 💘' : (st.no || 0) + (st.noGone ? ' (кнопка сдалась)' : '')}</b></div>
        <div class="kv"><span>Время на странице</span><b>${fmtDur(dur)}</b></div>
        <div class="kv"><span>Устройство</span><b>${s.touch ? '📱' : '💻'} ${esc(s.os)} · ${esc(s.browser)}</b></div>
        <div class="kv"><span>Экран</span><b>${s.vw}×${s.vh}${s.dpr > 1 ? ' @' + s.dpr + 'x' : ''}</b></div>
        <div class="kv"><span>Ссылка</span><b>${s.slug ? '/p/' + esc(s.slug) : 'основная /'}</b></div>
        ${s.ref ? `<div class="kv"><span>Откуда пришла</span><b>${esc(s.ref)}</b></div>` : ''}
        <div class="kv"><span>Часовой пояс</span><b>${esc(s.tz || '—')}</b></div>
        <div class="kv"><span>IP</span><b>${esc(s.ip || '—')}</b></div>`;
    },
    async onLive(sum) {
      $('#plLive').hidden = !isOnline(sum);
      if (!this.s || sum.eventsCount <= this.ev.length) return;
      try {
        const r = await api(`/api/admin/sessions/${encodeURIComponent(this.id)}?from=${this.ev.length}`);
        if (!r.events.length) return;
        this.ev.push(...r.events);
        this.s.summary = r.s; this.s.st = r.s.st;
        this.dur = this.ev[this.ev.length - 1][0];
        this.send({ cmd: 'append', events: r.events });
        $('#plEmpty').hidden = true;
        this.renderSide(); this.renderMarks(); this.renderProgress();
        if (!this.playing && this.ev.length === r.events.length) this.send({ cmd: 'play' });
      } catch {}
    },
  };
  function openPlayer(id) { P.open(id).catch((e) => toast(e.message, 'bad')); }

  addEventListener('message', (e) => {
    if (e.origin !== location.origin || !P.id) return;
    if (e.source !== $('#plFrame').contentWindow) return;
    P.onFrame(e.data || {});
  });
  addEventListener('resize', () => P.layout());
  $('#plClose').addEventListener('click', () => P.close());
  $('#plPlay').addEventListener('click', () => P.send({ cmd: P.playing ? 'pause' : 'play' }));
  $('#plSpeed').addEventListener('change', (e) => P.send({ cmd: 'speed', v: Number(e.target.value) }));
  $('#plSkip').addEventListener('change', (e) => P.send({ cmd: 'skip', v: e.target.checked }));
  $('#plLog').addEventListener('click', (e) => {
    const r = e.target.closest('.ev');
    if (r) P.send({ cmd: 'seek', t: Math.max(0, Number(r.dataset.t) - 1200) });
  });
  $('#plDel').addEventListener('click', async () => {
    if (!confirm('Удалить эту запись?')) return;
    await api('/api/admin/sessions/' + encodeURIComponent(P.id), { method: 'DELETE' });
    toast('Запись удалена');
    P.close();
  });
  // перемотка по таймлайну
  (() => {
    const tl = $('#plTl');
    let drag = false;
    const seekAt = (x) => {
      const r = tl.getBoundingClientRect();
      const k = Math.max(0, Math.min(1, (x - r.left) / r.width));
      P.send({ cmd: 'seek', t: k * P.dur });
    };
    tl.addEventListener('pointerdown', (e) => { drag = true; tl.setPointerCapture(e.pointerId); seekAt(e.clientX); });
    tl.addEventListener('pointermove', (e) => { if (drag) seekAt(e.clientX); });
    tl.addEventListener('pointerup', () => { drag = false; });
  })();
  document.addEventListener('keydown', (e) => {
    if ($('#player').hidden || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); $('#plPlay').click(); }
    if (e.code === 'Escape') P.close();
    if (e.code === 'ArrowRight') P.send({ cmd: 'seek', t: Math.min(P.dur, P.t + 5000) });
    if (e.code === 'ArrowLeft') P.send({ cmd: 'seek', t: Math.max(0, P.t - 5000) });
  });

  /* ═════════════ языки ═════════════ */

  const LANGS = SCHEMA.LANGS;
  const langById = (id) => LANGS.find((l) => l.id === id) || LANGS[0];
  let textLang = 'ru';
  function normalizeLangs(c) {
    if (!c.lang) c.lang = 'ru';
    c.langNames = c.langNames || {};
    for (const l of LANGS) if (l.id !== 'ru') c.langNames[l.id] = { name: '', fromName: '', fromDative: '', fromInstr: '', ...(c.langNames[l.id] || {}) };
    c.langTexts = c.langTexts || {};
    for (const l of LANGS) if (l.id !== 'ru') c.langTexts[l.id] = { ...SCHEMA.textDefaults(l.id), ...(c.langTexts[l.id] || {}) };
  }
  // надписи выбранного языка в черновике и их значения по умолчанию
  const tset = (l) => (l === 'ru' ? draft.texts : draft.langTexts[l]);
  const tdef = (l) => (l === 'ru' ? defaults.texts : defaults.langTexts[l]);

  function renderLangs() {
    $('#langCards').innerHTML = LANGS.map((l) => {
      const inv = draft.invites.filter((i) => i.lang === l.id).length;
      const on = draft.lang === l.id;
      return `<button class="lang-card ${on ? 'on' : ''}" data-lang="${l.id}">
        ${on ? '<span class="lang-on">● по умолчанию</span>' : ''}
        <span class="lang-code">${l.short}</span>
        <span class="lang-title">${esc(l.title)}</span>
        <span class="lang-sample">«${esc(l.sample)}»</span>
        <span class="lang-meta">${inv ? `отдельных ссылок на этом языке: ${inv}` : 'отдельных ссылок нет'}</span>
        <a href="/?preview=1&lang=${l.id}" target="_blank" rel="noopener" data-noselect>Посмотреть на этом языке ↗</a>
      </button>`;
    }).join('');
    const opts = (sel) => `<option value="" ${!sel ? 'selected' : ''}>по умолчанию (${langById(draft.lang).short})</option>` + LANGS.map((l) => `<option value="${l.id}" ${sel === l.id ? 'selected' : ''}>${esc(l.title)}</option>`).join('');
    const cur = $('#invLang').value;
    $('#invLang').innerHTML = opts(cur);
    $('#textLang').innerHTML = LANGS.map((l) => `<button data-v="${l.id}" class="${textLang === l.id ? 'on' : ''}">${l.short}</button>`).join('');
    window.__langOpts = opts;
  }
  $('#langCards').addEventListener('click', (e) => {
    if (e.target.closest('[data-noselect]')) return;
    const b = e.target.closest('[data-lang]');
    if (!b) return;
    e.preventDefault();
    draft.lang = b.dataset.lang;
    textLang = draft.lang;
    renderLangs(); renderTexts(); renderInvites(); updateSavebar();
    toast(`Язык приглашения: ${langById(draft.lang).title}`, 'ok');
  });
  $('#textLang').addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    textLang = b.dataset.v;
    renderLangs(); renderTexts();
  });

  /* ─────── имена по языкам ─────── */

  let nameLang = 'ru';
  // подписи полей и подсказки на каждом языке; en — без падежей
  const NAME_FIELDS = {
    ru: [
      ['name', 'Имя получательницы для основной ссылки «/»'],
      ['fromName', 'Твоё имя (подпись)'],
      ['fromDative', 'Кому? — «Я передам <u>{v}</u>»'],
      ['fromInstr', 'С кем? — «Свидание с <u>{v}</u>»'],
    ],
    uk: [
      ['name', 'Имя получательницы по-украински (для основной ссылки «/»)'],
      ['fromName', 'Твоё имя по-украински (подпись)'],
      ['fromDative', 'Кому? — «Я передам <u>{v}</u>»'],
      ['fromInstr', 'З ким? — «Побачення з <u>{v}</u>»'],
    ],
    en: [
      ['name', 'Имя получательницы по-английски (для основной ссылки «/»)'],
      ['fromName', 'Твоё имя по-английски (подпись)'],
    ],
  };
  const NAME_EXAMPLE = { uk: { fromDative: 'Максимові', fromInstr: 'Максимом' }, en: { fromName: 'Max' } };
  const nameSet = (l) => (l === 'ru' ? draft.settings : draft.langNames[l]);

  function renderNames() {
    $('#nameLang').innerHTML = LANGS.map((l) => `<button data-v="${l.id}" class="${nameLang === l.id ? 'on' : ''}">${l.short}</button>`).join('');
    $('#nameHint').textContent = nameLang === 'ru'
      ? 'Русские формы имени. Для других языков переключи сверху.'
      : nameLang === 'en'
        ? 'В английском падежей нет — хватит имени. Пустое поле = как в русском.'
        : 'Пустое поле = как в русском. В украинском падежи другие, например «Максимові».';
    const set = nameSet(nameLang);
    const ru = draft.settings;
    $('#nameFields').innerHTML = NAME_FIELDS[nameLang].map(([k, label]) => {
      const example = set[k] || (nameLang === 'ru' ? '' : (NAME_EXAMPLE[nameLang] || {})[k] || ru[k]);
      const lbl = label.replace('{v}', esc(example || '…'));
      const ph = nameLang === 'ru' ? '' : `как в русском: ${ru[k] || ''}`;
      return `<label><span class="lbl">${lbl}</span><input data-n="${k}" maxlength="60" value="${esc(set[k] || '')}" placeholder="${esc(ph)}"></label>`;
    }).join('');
  }
  $('#nameLang').addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    nameLang = b.dataset.v;
    renderNames();
  });
  $('#nameFields').addEventListener('input', (e) => {
    const k = e.target.dataset.n;
    if (!k) return;
    nameSet(nameLang)[k] = e.target.value;
    // обновляем пример в подписи
    const u = e.target.parentNode.querySelector('u');
    if (u) u.textContent = e.target.value || '…';
    if (nameLang === 'ru' && k === 'name') renderInvites();
    updateSavebar();
  });

  /* ═════════════ ссылки ═════════════ */

  function renderInvites() {
    const b = baseUrl();
    const count = (id) => sessions.filter((s) => (id ? s.inviteId === id : !s.inviteId)).length;
    const opts = window.__langOpts || (() => '');
    const row = (name, url, extra, id, inv) => `
      <div class="inv">
        <div class="ava">${esc((name || '?')[0].toUpperCase())}</div>
        <div class="inv-main"><b>${esc(name)}</b> <span class="muted small">· прохождений: ${count(id)}</span><span class="inv-url">${esc(url)}</span></div>
        <div class="inv-actions">
          ${inv ? `<select data-inv-lang="${esc(inv.id)}" title="Язык приглашения">${opts(inv.lang || '')}</select>` : `<span class="badge">${langById(draft.lang).short}</span>`}
          <button class="btn primary sm" data-copy="${esc(url)}">Копировать</button>
          <a class="btn ghost sm" href="${esc(url.replace(b, '') || '/')}${url.includes('?') ? '&' : '?'}preview=1" target="_blank" rel="noopener">Посмотреть</a>
          ${extra || ''}
        </div>
      </div>`;
    let html = row(`${cfg.settings.name} (основная)`, b + '/', '', null);
    html += cfg.invites.map((i) => row(i.name, `${b}/p/${i.slug}`, `<button class="btn danger sm" data-del-inv="${esc(i.id)}">Удалить</button>`, i.id, i)).join('');
    if (!info.publicUrl) html += `<p class="muted small">Сейчас ссылки локальные — откроются только на этом компьютере. Запусти <code>start.bat</code>, и тут появятся публичные ссылки через Cloudflare.</p>`;
    $('#invList').innerHTML = html;
  }
  $('#invForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const inv = await api('/api/admin/invites', { method: 'POST', body: { name: $('#invName').value, slug: $('#invSlug').value, lang: $('#invLang').value } });
      cfg.invites.push(inv); draft.invites.push(inv);
      $('#invName').value = ''; $('#invSlug').value = '';
      renderInvites(); renderRecords(); renderLangs();
      navigator.clipboard?.writeText(`${baseUrl()}/p/${inv.slug}`).then(() => toast(`Ссылка для «${inv.name}» создана и скопирована ♡`, 'ok'), () => toast('Ссылка создана', 'ok'));
    } catch (err) { toast(err.message, 'bad'); }
  });
  $('#invList').addEventListener('change', async (e) => {
    const sel = e.target.closest('[data-inv-lang]');
    if (!sel) return;
    try {
      const inv = await api('/api/admin/invites/' + sel.dataset.invLang, { method: 'PUT', body: { lang: sel.value } });
      for (const list of [cfg.invites, draft.invites]) { const i = list.find((x) => x.id === inv.id); if (i) i.lang = inv.lang; }
      renderLangs();
      toast(`«${inv.name}»: ${inv.lang ? langById(inv.lang).title : 'язык по умолчанию'}`, 'ok');
    } catch (err) { toast(err.message, 'bad'); }
  });
  $('#invList').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-del-inv]');
    if (!b || !confirm('Удалить ссылку? Записи останутся.')) return;
    await api('/api/admin/invites/' + b.dataset.delInv, { method: 'DELETE' });
    cfg.invites = cfg.invites.filter((i) => i.id !== b.dataset.delInv);
    draft.invites = clone(cfg.invites);
    renderInvites(); renderRecords(); renderLangs();
  });

  /* ═════════════ тексты ═════════════ */

  function renderTexts() {
    $('#textGroups').innerHTML = SCHEMA.TEXT_GROUPS.map((g) => `
      <div class="panel tgroup">
        <div class="tgroup-head"><h3>${esc(g.title)}</h3>${g.hint ? `<span class="muted small">${esc(g.hint)}</span>` : ''}</div>
        ${g.fields.map(([k, label, , type]) => {
          const v = tset(textLang)[k] ?? '';
          const dv = tdef(textLang)[k];
          const input = type === 'area' || type === 'list'
            ? `<textarea data-t="${k}" rows="${type === 'list' ? 5 : 2}">${esc(v)}</textarea>`
            : `<input data-t="${k}" value="${esc(v)}">`;
          return `<label class="tfield ${v !== dv ? 'changed' : ''}"><span>${esc(label)}</span>${input}<button type="button" class="reset" data-reset="${k}" ${v === dv ? 'hidden' : ''}>↺ по умолчанию</button></label>`;
        }).join('')}
      </div>`).join('');
  }
  $('#textGroups').addEventListener('input', (e) => {
    const k = e.target.dataset.t;
    if (!k) return;
    tset(textLang)[k] = e.target.value;
    const lab = e.target.closest('.tfield');
    const changed = e.target.value !== tdef(textLang)[k];
    lab.classList.toggle('changed', changed);
    lab.querySelector('.reset').hidden = !changed;
    updateSavebar();
  });
  $('#textGroups').addEventListener('click', (e) => {
    const b = e.target.closest('[data-reset]');
    if (!b) return;
    e.preventDefault();
    const k = b.dataset.reset;
    tset(textLang)[k] = tdef(textLang)[k];
    const inp = b.parentNode.querySelector('[data-t]');
    inp.value = tdef(textLang)[k];
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  });

  /* ═════════════ персонализация и стиль ═════════════ */

  function renderPerson() {
    renderNames();
    $$('[data-s]').forEach((el) => {
      const v = draft.settings[el.dataset.s];
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
    });
    $('#volVal').textContent = Math.round(draft.settings.musicVolume * 100) + '%';
  }
  document.addEventListener('input', (e) => {
    const k = e.target.dataset && e.target.dataset.s;
    if (!k) return;
    const el = e.target;
    const d = defaults.settings[k];
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (typeof d === 'number') v = Number(v) || 0;
    draft.settings[k] = v;
    if (k === 'musicVolume') { $('#volVal').textContent = Math.round(v * 100) + '%'; $('#musicPreview').volume = v; }
    updateSavebar();
  });

  function renderStyle() {
    $('#themes').innerHTML = SCHEMA.THEMES.map((t) => `
      <button class="theme ${draft.settings.theme === t.id ? 'on' : ''}" data-theme="${t.id}">
        <div class="sw" style="background: radial-gradient(circle at 20% 20%, ${t.colors[1]}, transparent 60%), radial-gradient(circle at 80% 70%, ${t.colors[2]}, transparent 60%), ${t.colors[0]}"></div>${esc(t.title)}
      </button>`).join('');
    const mode = draft.settings.musicMode;
    $$('#musicMode button').forEach((b) => b.classList.toggle('on', b.dataset.v === mode));
    $('#musicCustom').hidden = mode !== 'custom';
    $('#musicHint').textContent = {
      builtin: 'Нежная «музыкальная шкатулка», которая генерируется прямо в браузере. Никаких файлов не нужно.',
      custom: 'Загрузи свою песню — она будет играть по кругу с плавным появлением.',
      off: 'Музыки не будет, кнопка звука скрыта.',
    }[mode];
    const f = draft.settings.musicFile;
    $('#musicName').textContent = f ? 'Загружен: ' + f : 'Файл ещё не загружен';
    $('#musicPreview').hidden = !f;
    if (f && !$('#musicPreview').src.includes(encodeURIComponent(f))) $('#musicPreview').src = '/music?v=' + encodeURIComponent(f);
  }
  $('#themes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-theme]');
    if (!b) return;
    draft.settings.theme = b.dataset.theme; renderStyle(); updateSavebar();
  });
  $('#musicMode').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    draft.settings.musicMode = b.dataset.v; renderStyle(); updateSavebar();
  });
  $('#musicPick').addEventListener('click', () => $('#musicFile').click());
  $('#musicFile').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) return toast('Файл больше 25 МБ', 'bad');
    const type = f.type || (/\.mp3$/i.test(f.name) ? 'audio/mpeg' : /\.m4a$/i.test(f.name) ? 'audio/mp4' : /\.ogg$/i.test(f.name) ? 'audio/ogg' : /\.wav$/i.test(f.name) ? 'audio/wav' : '');
    toast('Загружаю…');
    try {
      const r = await api('/api/admin/music', { method: 'POST', body: new Blob([f], { type }) });
      cfg.settings.musicFile = draft.settings.musicFile = r.file;
      cfg.settings.musicMode = 'custom';
      draft.settings.musicMode = 'custom';
      renderStyle(); updateSavebar();
      toast('Трек загружен ♡', 'ok');
    } catch (err) { toast(err.message, 'bad'); }
    e.target.value = '';
  });

  /* ═════════════ уведомления и доступ ═════════════ */

  function renderSettings() {
    $('#tgOn').checked = !!draft.telegram.enabled;
    $('#tgToken').value = draft.telegram.token || '';
    $('#tgChat').value = draft.telegram.chatId || '';
    $('#sndOn').checked = ls.get('adm.snd', true);
    $('#ntfOn').checked = ls.get('adm.ntf', false) && 'Notification' in window && Notification.permission === 'granted';
  }
  ['tgOn', 'tgToken', 'tgChat'].forEach((id) => $('#' + id).addEventListener('input', () => {
    draft.telegram = { enabled: $('#tgOn').checked, token: $('#tgToken').value.trim(), chatId: $('#tgChat').value.trim() };
    updateSavebar();
  }));
  $('#tgOn').addEventListener('change', () => $('#tgOn').dispatchEvent(new Event('input')));
  $('#tgTest').addEventListener('click', async () => {
    if (dirty()) await save();
    const r = await api('/api/admin/test-telegram', { method: 'POST', body: {} }).catch((e) => ({ ok: false, description: e.message }));
    if (r.ok) toast('Сообщение отправлено ✅', 'ok');
    else toast(r.skipped ? 'Сначала включи уведомления и заполни поля' : 'Telegram: ' + (r.description || 'ошибка'), 'bad');
  });
  $('#sndOn').addEventListener('change', (e) => { ls.set('adm.snd', e.target.checked); if (e.target.checked) chime(false); });
  $('#ntfOn').addEventListener('change', async (e) => {
    if (e.target.checked && 'Notification' in window) {
      const p = await Notification.requestPermission();
      e.target.checked = p === 'granted';
    }
    ls.set('adm.ntf', e.target.checked);
  });
  $('#pwForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/admin/password', { method: 'POST', body: { old: $('#pwOld').value, password: $('#pwNew').value } });
      $('#pwOld').value = ''; $('#pwNew').value = '';
      toast('Пароль изменён', 'ok');
    } catch (err) { toast(err.message, 'bad'); }
  });
  $('#wipe').addEventListener('click', async () => {
    if (!confirm('Точно удалить ВСЕ записи прохождений? Это нельзя отменить.')) return;
    await api('/api/admin/sessions', { method: 'DELETE' });
    toast('Все записи удалены');
  });

  /* ═════════════ сохранение ═════════════ */

  // автосохранение: любые правки уходят на сервер через ~0.7 сек и лежат в data/config.json
  const pick = (c) => JSON.stringify({ l: c.lang, t: c.texts, lt: c.langTexts, ln: c.langNames, s: c.settings, g: c.telegram });
  const dirty = () => cfg && pick(cfg) !== pick(draft);
  const payload = (d) => ({ lang: d.lang, texts: d.texts, langTexts: d.langTexts, langNames: d.langNames, settings: d.settings, telegram: d.telegram });
  let saveT = 0, hideT = 0, saving = false;
  const SAVE_TEXT = { pending: 'Есть изменения…', saving: 'Сохраняю…', saved: 'Сохранено ✓', error: 'Не получилось сохранить — пробую ещё раз' };
  function setSaveState(st) {
    const bar = $('#savebar');
    bar.hidden = false;
    bar.dataset.st = st;
    $('#saveText').textContent = SAVE_TEXT[st];
    clearTimeout(hideT);
    if (st === 'saved') hideT = setTimeout(() => { bar.hidden = true; }, 1800);
  }
  function updateSavebar() {
    if (!dirty()) return;
    setSaveState('pending');
    clearTimeout(saveT);
    saveT = setTimeout(save, 700);
  }
  async function save() {
    clearTimeout(saveT);
    if (!dirty()) return;
    if (saving) { saveT = setTimeout(save, 300); return; }
    saving = true;
    setSaveState('saving');
    const snap = clone(draft);
    try {
      await api('/api/admin/config', { method: 'PUT', body: payload(snap) });
      cfg = clone({ ...snap, invites: cfg.invites });
      draft.invites = clone(cfg.invites);
      renderInvites();
      if (dirty()) { setSaveState('pending'); saveT = setTimeout(save, 300); } else setSaveState('saved');
    } catch (err) {
      setSaveState('error');
      saveT = setTimeout(save, 3000);
    } finally { saving = false; }
  }
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') { e.preventDefault(); save(); }
  });
  // если вкладку закрывают до автосохранения — отправляем правки напоследок
  const flush = () => {
    if (!dirty()) return;
    fetch('/api/admin/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload(draft)), keepalive: true }).catch(() => {});
  };
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

  /* ═════════════ старт ═════════════ */

  api('/api/admin/state').then((st) => (st.authed ? start() : showAuth(st))).catch((e) => toast(e.message, 'bad'));
})();
