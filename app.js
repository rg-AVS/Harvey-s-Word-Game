'use strict';

/* =====================================================================
   Harvey's Word Game
   Reads this week's words from words.csv and turns them into games.
   ===================================================================== */

const KID_NAME = 'Harvey';
const MAX_WORDS_PER_GAME = 12;   // most words used in one go
const MEMORY_PAIRS = 6;          // pairs in Memory Match

/* ---------- tiny helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const norm = (s) => String(s).normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[’‘`]/g, "'");
const stripAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const isLetter = (c) => /\p{L}/u.test(c);

/* ---------- saved stuff (scores, settings) ---------- */
const Store = {
  get(k, d) { try { const v = localStorage.getItem('hwg:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('hwg:' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const settings = Object.assign({ sound: true, autoSpeak: true, big: false, rate: 0.85 }, Store.get('settings', {}));
function saveSettings() { Store.set('settings', settings); applySettings(); }
function applySettings() { document.documentElement.classList.toggle('big-text', !!settings.big); }

/* ---------- dates ---------- */
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function parseDate(s) {
  s = String(s || '').trim();
  let y, m, d, x;
  if ((x = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) { y = +x[1]; m = +x[2]; d = +x[3]; }
  else if ((x = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) { d = +x[1]; m = +x[2]; y = +x[3]; if (y < 100) y += 2000; } // UK: day first
  else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}
function todayISO() {
  const override = parseDate(new URLSearchParams(location.search).get('date'));
  return override || isoOf(new Date());
}
function niceDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

/* ---------- reading the CSV ---------- */
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/)[0] || '';
  const delim = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

const SUBJECTS = {
  english: { id: 'english', name: 'English Spelling', emoji: '📝', lang: 'en-GB', color: 'blue' },
  spanish: { id: 'spanish', name: 'Spanish', emoji: '🇪🇸', lang: 'es-ES', color: 'orange' },
};
function normSubject(s) {
  s = norm(s || '');
  if (s.startsWith('sp') || s.startsWith('es') || s === 'español') return 'spanish';
  return 'english';
}

let DATA = null;
let loadProblem = null;
const state = { week: {} };

function buildData(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('words.csv has no words in it yet.');
  const header = rows[0].map((x) => norm(x));
  const col = (names) => header.findIndex((x) => names.includes(x));
  const ci = {
    date: col(['date', 'week', 'start', 'start date', 'start_date', 'week_start', 'from']),
    subject: col(['subject', 'type', 'language', 'lang']),
    word: col(['word', 'spelling', 'words']),
    meaning: col(['meaning', 'translation', 'english meaning', 'answer']),
    sentence: col(['sentence', 'example', 'hint', 'clue']),
    test: col(['test', 'test date', 'test_date', 'test day']),
    unit: col(['unit', 'label', 'topic', 'title']),
  };
  if (ci.date < 0 || ci.word < 0) throw new Error('The first row of words.csv must have column names, including "date" and "word".');
  const data = { english: { weeks: {}, dates: [] }, spanish: { weeks: {}, dates: [] } };
  const bad = [];
  rows.slice(1).forEach((r, n) => {
    const get = (i) => (i >= 0 && r[i] != null ? r[i].trim() : '');
    const word = get(ci.word);
    if (!word) return;
    const date = parseDate(get(ci.date));
    if (!date) { bad.push(n + 2); return; }
    const subject = ci.subject >= 0 ? normSubject(get(ci.subject)) : 'english';
    const wk = (data[subject].weeks[date] ||= []);
    if (wk.some((w) => norm(w.word) === norm(word))) return;
    wk.push({ word, meaning: get(ci.meaning), sentence: get(ci.sentence), subject, date, test: parseDate(get(ci.test)), unit: get(ci.unit) });
  });
  for (const s of Object.values(data)) s.dates = Object.keys(s.weeks).sort();
  data.badRows = bad;
  return data;
}

async function loadWords() {
  let text = null;
  try {
    const r = await fetch('words.csv?nocache=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    text = await r.text();
  } catch (e) {
    text = Store.get('csvCache', null);
    if (!text) { loadProblem = 'I could not open words.csv. If you opened index.html straight from your computer, choose the file below instead (or see the README for how to put the game online).'; return false; }
  }
  try { DATA = buildData(text); Store.set('csvCache', text); return true; }
  catch (e) { loadProblem = e.message; return false; }
}

function pastWeeks(subj) {
  const ds = DATA[subj].dates, t = todayISO();
  const past = ds.filter((d) => d <= t);
  return past.length ? past : ds.slice(0, 1); // if everything is in the future, use the first week
}
const activeWeek = (subj) => { const p = pastWeeks(subj); return p.length ? p[p.length - 1] : null; };
const nextWeek = (subj) => DATA[subj].dates.find((d) => d > todayISO()) || null;

/* ---------- talking ---------- */
const Speech = {
  ok: 'speechSynthesis' in window,
  voices: [],
  init() {
    if (!this.ok) return;
    const load = () => { this.voices = speechSynthesis.getVoices(); };
    load(); speechSynthesis.onvoiceschanged = load;
  },
  voiceFor(lang) {
    const L = lang.toLowerCase(), v = this.voices;
    const exact = v.filter((x) => x.lang.replace('_', '-').toLowerCase() === L);
    const near = v.filter((x) => x.lang.toLowerCase().startsWith(L.slice(0, 2)));
    const good = (list) => list.find((x) => /natural|google|enhanced|premium/i.test(x.name)) || list[0];
    return good(exact) || good(near) || null;
  },
  utter(text, lang, rate) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang; u.rate = rate ?? settings.rate;
    const v = this.voiceFor(lang); if (v) u.voice = v;
    return u;
  },
  say(text, lang = 'en-GB', rate) { this.queue([[text, lang, rate]]); },
  queue(items) {
    if (!this.ok || !items.length) return;
    speechSynthesis.cancel();
    items.forEach(([t, l, r]) => t && speechSynthesis.speak(this.utter(t, l || 'en-GB', r)));
  },
  spell(word, lang) {
    const letters = [...word].filter((c) => c !== ' ').map((c) => [c.toLowerCase(), lang, 0.7]);
    this.queue([[word, lang], ...letters, [word, lang]]);
  },
  stop() { if (this.ok) speechSynthesis.cancel(); },
};

/* ---------- beeps ---------- */
const Sound = {
  ctx: null,
  tone(freq, dur, when = 0, type = 'sine', vol = 0.12) {
    if (!settings.sound) return;
    try {
      this.ctx ||= new (window.AudioContext || window.webkitAudioContext)();
      const t = this.ctx.currentTime + when;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur);
    } catch { /* no audio */ }
  },
  tap() { this.tone(520, 0.06, 0, 'triangle', 0.06); },
  good() { this.tone(660, 0.12); this.tone(880, 0.18, 0.1); },
  bad() { this.tone(240, 0.18, 0, 'triangle', 0.08); },
  win() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, i * 0.12)); },
};

/* ---------- little UI bits ---------- */
const app = $('#app');
function render(...nodes) { Speech.stop(); closeModal(); app.replaceChildren(...nodes); window.scrollTo(0, 0); }

const PRAISE_EN = ['Brilliant!', 'Awesome!', 'Nailed it!', 'Fantastic!', 'Amazing!', 'You rock!', 'Legend!', 'Super!', 'Smashed it!'];
const PRAISE_ES = ['¡Muy bien!', '¡Genial!', '¡Fantástico!', '¡Excelente!', '¡Perfecto!'];
const TRY_AGAIN = ['So close!', 'Nearly there!', 'Good try!', 'Almost!', 'Keep going!'];
const praise = (ctx) => pick(ctx && ctx.subj.id === 'spanish' && Math.random() < 0.6 ? PRAISE_ES : PRAISE_EN);

function cheer(text) {
  const el = h('div', { class: 'cheer' }, text);
  document.body.append(el);
  setTimeout(() => el.remove(), 1100);
}
function shake(el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
function bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }

function confetti() {
  const colours = ['#f97316', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ec4899'];
  const box = h('div', { class: 'confetti', 'aria-hidden': 'true' });
  for (let i = 0; i < 80; i++) {
    const p = h('i');
    p.style.left = Math.random() * 100 + 'vw';
    p.style.background = pick(colours);
    p.style.animationDelay = Math.random() * 0.8 + 's';
    p.style.animationDuration = 2 + Math.random() * 1.5 + 's';
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    box.append(p);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 4000);
}

function speakBtn(text, lang, label = '🔊', cls = 'btn-round') {
  return h('button', { class: 'btn ' + cls, type: 'button', 'aria-label': 'Hear ' + text, onclick: () => Speech.say(text, lang) }, label);
}
function letterBoxes(word) {
  return h('div', { class: 'letter-boxes' }, [...word].map((c) => c === ' ' ? h('span', { class: 'gap' }) : h('span', { class: 'lb' }, c)));
}

/* ---------- pop-up panels ---------- */
function openModal(title, ...body) {
  closeModal();
  const m = h('div', { class: 'modal-back', onclick: (e) => { if (e.target === m) closeModal(); } },
    h('div', { class: 'modal', role: 'dialog', 'aria-label': title },
      h('div', { class: 'modal-head' }, h('h2', {}, title), h('button', { class: 'btn btn-round', 'aria-label': 'Close', onclick: closeModal }, '✖')),
      ...body));
  document.body.append(m);
}
function closeModal() { document.querySelectorAll('.modal-back').forEach((m) => m.remove()); }

function settingsPanel() {
  const toggle = (key, label) => h('label', { class: 'toggle' },
    h('input', { type: 'checkbox', checked: !!settings[key], onchange: (e) => { settings[key] = e.target.checked; saveSettings(); } }),
    h('span', {}, label));
  const rate = h('select', { onchange: (e) => { settings.rate = +e.target.value; saveSettings(); Speech.say('This is how fast I talk', 'en-GB'); } },
    [['0.65', 'Slow'], ['0.85', 'Normal'], ['1', 'Quick']].map(([v, l]) => h('option', { value: v, selected: Math.abs(settings.rate - +v) < 0.01 }, l)));
  openModal('Settings ⚙️',
    toggle('sound', '🔔 Sound effects'),
    toggle('autoSpeak', '🗣️ Read words out loud by itself'),
    toggle('big', '🔠 Extra big letters'),
    h('label', { class: 'toggle' }, h('span', {}, '🐢 Talking speed '), rate),
    h('button', { class: 'btn btn-ghost', onclick: helpPanel }, '👩‍🏫 For grown-ups: adding words'));
}

function helpPanel() {
  openModal('For grown-ups 👩‍🏫',
    h('p', {}, 'The words come from the file ', h('code', {}, 'words.csv'), '. Open it in Excel, Google Sheets or Notepad. Each row is one word:'),
    h('pre', {}, 'date,subject,word,meaning,sentence\n30/11/2026,english,island,,We sailed to an island.\n30/11/2026,spanish,el perro,the dog,'),
    h('ul', {},
      h('li', {}, h('b', {}, 'date'), ' – the day those words start (for example the Monday). Write it as 30/11/2026 or 2026-11-30. The game always shows the newest week that has started, so next week’s words switch on all by themselves.'),
      h('li', {}, h('b', {}, 'subject'), ' – ', h('code', {}, 'english'), ' or ', h('code', {}, 'spanish'), '.'),
      h('li', {}, h('b', {}, 'word'), ' – the spelling word, or the Spanish word.'),
      h('li', {}, h('b', {}, 'meaning'), ' – for Spanish, the English meaning (needed for Memory Match and Quick Pick). For English you can leave it empty, or add a short clue.'),
      h('li', {}, h('b', {}, 'sentence'), ' – optional. An example sentence, read out to help.'),
      h('li', {}, h('b', {}, 'test'), ' and ', h('b', {}, 'unit'), ' – optional. The test date and a name for the list (like 7B 25-30), shown at the top of the page.')),
    h('p', {}, 'Save it as CSV and upload it in place of the old one. Old weeks stay in the file so they can still be practised.'),
    h('p', {}, 'Tip: to check a future week, add ', h('code', {}, '?date=2026-12-07'), ' to the end of the web address.'),
    DATA && DATA.badRows.length ? h('p', { class: 'warn' }, `⚠️ Some rows were skipped because the date could not be read: row ${DATA.badRows.join(', ')}.`) : null);
}

function topBar(back) {
  return h('header', { class: 'topbar' },
    back ? h('button', { class: 'btn btn-round', 'aria-label': 'Back', onclick: back }, '⬅') : h('span', { class: 'spacer' }),
    h('div', { class: 'brand' }, '🚀 ', `${KID_NAME}'s Word Game`),
    h('button', { class: 'btn btn-round', 'aria-label': 'Settings', onclick: settingsPanel }, '⚙️'));
}

/* =====================================================================
   SCREENS
   ===================================================================== */

function bestFor(subj, week, gameId) { return Store.get(`best:${subj}:${week}:${gameId}`, null); }
function weekStars() {
  let n = 0;
  for (const s of Object.keys(SUBJECTS)) {
    const wk = activeWeek(s); if (!wk) continue;
    for (const g of GAMES) { const b = bestFor(s, wk, g.id); if (b) n += b.stars; }
  }
  return n;
}

function homeScreen() {
  const cards = Object.values(SUBJECTS).map((s) => {
    const wk = activeWeek(s.id);
    const n = wk ? DATA[s.id].weeks[wk].length : 0;
    return h('button', { class: `subject-card ${s.color}`, disabled: n === 0, onclick: () => subjectScreen(s.id) },
      h('span', { class: 'big-emoji' }, s.emoji),
      h('span', { class: 'card-title' }, s.name),
      h('span', { class: 'card-sub' }, n ? `${n} words this week` : 'No words yet'));
  });
  const stars = weekStars();
  render(
    topBar(null),
    h('section', { class: 'home' },
      h('h1', { class: 'hello' }, `Hi ${KID_NAME}! 👋`),
      h('p', { class: 'lead' }, 'What do you want to practise today?'),
      h('div', { class: 'subject-grid' }, cards),
      h('div', { class: 'star-bank' }, h('span', { class: 'star-big' }, '⭐'), h('span', {}, h('b', {}, stars), ` star${stars === 1 ? '' : 's'} won this week`))));
}

function subjectScreen(subj, week) {
  const S = SUBJECTS[subj];
  const weeks = pastWeeks(subj);
  week = week || state.week[subj] || activeWeek(subj);
  if (!weeks.includes(week)) week = activeWeek(subj);
  state.week[subj] = week;
  const words = DATA[subj].weeks[week];
  const isCurrent = week === activeWeek(subj);
  const testDay = (words.find((w) => w.test) || {}).test;
  const unit = (words.find((w) => w.unit) || {}).unit;

  const wordChips = words.map((w) => h('button', {
    class: 'word-chip', onclick: () => Speech.queue([[w.word, S.lang], w.meaning && subj === 'spanish' ? [w.meaning, 'en-GB'] : null].filter(Boolean)),
  }, h('span', { class: 'chip-word' }, w.word), w.meaning && subj === 'spanish' ? h('span', { class: 'chip-meaning' }, w.meaning) : null, h('span', { class: 'chip-speak' }, '🔊')));

  const weekPicker = weeks.length > 1 ? h('label', { class: 'week-pick' }, 'Practise another week: ',
    h('select', { onchange: (e) => subjectScreen(subj, e.target.value) },
      [...weeks].reverse().map((d) => h('option', { value: d, selected: d === week }, (d === activeWeek(subj) ? 'This week – ' : 'Week of ') + niceDate(d) + (DATA[subj].weeks[d].find((w) => w.unit) ? ` (${DATA[subj].weeks[d].find((w) => w.unit).unit})` : ''))))) : null;

  const games = GAMES.filter((g) => g.subjects.includes(subj) && words.filter(g.wordFilter || (() => true)).length >= (g.minWords || 1));
  if (subj === 'spanish') games.sort((a, b) => (b.needsMeaning ? 1 : 0) - (a.needsMeaning ? 1 : 0));

  const gameCards = games.map((g) => {
    const best = bestFor(subj, week, g.id);
    return h('button', { class: 'game-card', onclick: () => playGame(g, subj, week) },
      h('span', { class: 'game-emoji' }, g.emoji),
      h('span', { class: 'game-name' }, g.name),
      h('span', { class: 'game-desc' }, g.desc),
      h('span', { class: 'game-best', 'aria-label': best ? `Best: ${best.stars} stars` : 'Not played yet' }, best ? '⭐'.repeat(best.stars) + '☆'.repeat(3 - best.stars) : 'New!'));
  });

  const upcoming = isCurrent && nextWeek(subj);
  render(
    topBar(homeScreen),
    h('section', { class: 'subject' },
      h('h1', {}, S.emoji, ' ', S.name),
      unit || testDay ? h('p', { class: 'test-day' }, unit ? h('b', {}, unit) : null, unit && testDay ? ' · ' : null,
        testDay ? (testDay >= todayISO() ? `📝 Test on ${niceDate(testDay)}${testDay === todayISO() ? ' – today! Good luck!' : ''}` : `Tested on ${niceDate(testDay)}`) : null) : null,
      h('h2', { class: 'section-title' }, '🎮 Pick a game'),
      h('div', { class: 'game-grid' }, gameCards),
      h('h2', { class: 'section-title' }, isCurrent ? '📚 This week’s words' : '📚 Words from that week'),
      h('p', { class: 'small' }, 'Tap a word to hear it.'),
      h('div', { class: 'word-list' }, wordChips),
      upcoming ? h('p', { class: 'small' }, `🗓️ New words arrive on ${niceDate(upcoming)}.`) : null,
      weekPicker));
}

/* ---------- running a game ---------- */
function playGame(game, subj, week, onlyThese) {
  const S = SUBJECTS[subj];
  const all = DATA[subj].weeks[week].filter(game.wordFilter || (() => true));
  const words = onlyThese || all;
  const run = { score: 0, max: 0, tricky: [], practice: !!onlyThese };

  const scoreEl = h('b', {}, '0');
  const progText = h('span', { class: 'prog-text' });
  const bar = h('div', { class: 'bar-fill' });
  const stage = h('div', { class: 'stage' });
  let started = false;
  const quit = h('button', { class: 'btn btn-round', 'aria-label': 'Stop game', onclick: () => { if (!started || confirm('Stop this game?')) subjectScreen(subj, week); } }, '✖');

  render(
    h('header', { class: 'game-top' }, quit,
      h('div', { class: 'prog' }, progText, h('div', { class: 'bar' }, bar)),
      h('div', { class: 'score-box' }, '⭐ ', scoreEl)),
    h('h1', { class: 'game-title' }, game.emoji, ' ', game.name),
    stage);

  const ctx = {
    subj: S, lang: S.lang,
    progress(frac, text) { progText.textContent = text; bar.style.width = Math.round(frac * 100) + '%'; },
    add(points, max) { started = true; run.score += points; run.max += max; scoreEl.textContent = run.score; bump(scoreEl.parentNode); },
    tricky(w) { if (!run.tricky.includes(w)) run.tricky.push(w); },
    finish() { bar.style.width = '100%'; setTimeout(() => resultsScreen(game, subj, week, run, words), 700); },
  };

  if (game.round) {
    const list = shuffle(words).slice(0, MAX_WORDS_PER_GAME);
    let i = 0;
    const next = () => {
      if (i >= list.length) return ctx.finish();
      ctx.progress(i / list.length, `Word ${i + 1} of ${list.length}`);
      const w = list[i++];
      stage.replaceChildren();
      let doneOnce = false;
      game.round(stage, w, ctx, all, (points, clean) => {
        if (doneOnce) return; doneOnce = true;
        ctx.add(points, 10);
        if (!clean) ctx.tricky(w);
        setTimeout(next, 1500);
      });
    };
    next();
  } else {
    game.start(stage, words, ctx);
  }
}

function resultsScreen(game, subj, week, run, wordsPlayed) {
  const pct = run.max ? run.score / run.max : 0;
  const stars = pct >= 0.9 ? 3 : pct >= 0.6 ? 2 : 1;
  let newBest = false;
  if (!run.practice) {
    const key = `best:${subj}:${week}:${game.id}`;
    const prev = Store.get(key, null);
    newBest = !!prev && run.score > prev.score;
    Store.set(key, { score: Math.max(run.score, prev?.score || 0), stars: Math.max(stars, prev?.stars || 0) });
  }
  Store.set('played', Store.get('played', 0) + 1);

  const title = stars === 3 ? 'WOW! Superstar! 🌟' : stars === 2 ? 'Great work! 🎉' : 'Good effort! 💪';
  const sub = stars === 3 ? 'You are a word wizard!' : stars === 2 ? 'You’re getting really good at these.' : 'Every go makes your brain stronger. Try again?';
  const starRow = h('div', { class: 'star-row' }, [0, 1, 2].map((i) => h('span', { class: 'res-star' + (i < stars ? ' on' : ''), style: `animation-delay:${0.3 + i * 0.35}s` }, '⭐')));

  const S = SUBJECTS[subj];
  const trickyBox = run.tricky.length ? h('div', { class: 'tricky' },
    h('h2', {}, '🧠 Words to practise again'),
    h('div', { class: 'word-list' }, run.tricky.map((w) => h('button', { class: 'word-chip', onclick: () => Speech.spell(w.word, S.lang) }, h('span', { class: 'chip-word' }, w.word), h('span', { class: 'chip-speak' }, '🔊')))),
    h('button', { class: 'btn btn-go', onclick: () => playGame(game, subj, week, run.tricky) }, '🎯 Practise just these')) : h('p', { class: 'lead' }, 'You got every word first time! 🏆');

  render(
    topBar(() => subjectScreen(subj, week)),
    h('section', { class: 'results' },
      h('h1', {}, title),
      starRow,
      h('div', { class: 'big-score' }, h('b', {}, run.score), h('span', {}, ` / ${run.max} points`)),
      newBest ? h('div', { class: 'new-best' }, '🏅 New best score!') : null,
      h('p', { class: 'lead' }, sub),
      trickyBox,
      h('div', { class: 'actions' },
        h('button', { class: 'btn btn-go', onclick: () => playGame(game, subj, week, run.practice ? wordsPlayed : null) }, '🔁 Play again'),
        h('button', { class: 'btn btn-ghost', onclick: () => subjectScreen(subj, week) }, '🎮 Other games'),
        h('button', { class: 'btn btn-ghost', onclick: homeScreen }, '🏠 Home'))));
  Sound.win();
  if (stars >= 2) confetti();
}

/* =====================================================================
   GAMES
   ===================================================================== */

/* The "hear the word" box at the top of most games */
function promptBox(w, ctx) {
  const lang = ctx.lang;
  const blanked = w.sentence ? w.sentence.replace(new RegExp(w.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '_____') : null;
  if (settings.autoSpeak) setTimeout(() => Speech.say(w.word, lang), 400);
  return h('div', { class: 'prompt' },
    h('div', { class: 'prompt-btns' },
      h('button', { class: 'btn btn-speak', onclick: () => Speech.say(w.word, lang) }, '🔊 Hear it'),
      h('button', { class: 'btn btn-slow', onclick: () => Speech.say(w.word, lang, 0.45) }, '🐢 Slowly'),
      w.sentence ? h('button', { class: 'btn btn-sentence', onclick: () => Speech.say(w.sentence, lang) }, '💬 Sentence') : null),
    w.meaning ? h('p', { class: 'meaning' }, ctx.subj.id === 'spanish' ? 'It means: ' : 'Clue: ', h('strong', {}, w.meaning), ' ', speakBtn(w.meaning, 'en-GB', '🔊', 'btn-mini')) : null,
    blanked ? h('p', { class: 'sentence' }, blanked) : null);
}

function accentBar(input) {
  return h('div', { class: 'accents', 'aria-label': 'Special letters' }, [...'áéíóúñü'].map((ch) => h('button', {
    class: 'accent-btn', type: 'button',
    onmousedown: (e) => e.preventDefault(),
    onclick: () => {
      const s = input.selectionStart ?? input.value.length, e = input.selectionEnd ?? s;
      input.value = input.value.slice(0, s) + ch + input.value.slice(e);
      input.focus(); input.setSelectionRange(s + 1, s + 1);
    },
  }, ch)));
}

function compareSpelling(guess, target) {
  const g = norm(guess), t = norm(target);
  if (g === t) return 'exact';
  if (stripAccents(g) === stripAccents(t)) return 'accent';
  return 'wrong';
}

/* Colour the letters of an attempt: green = in the right order, orange = not */
function markAttempt(guess, target) {
  const a = [...norm(guess)], b = [...norm(target)];
  const A = a.map(stripAccents), B = b.map(stripAccents);
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--)
    dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const keep = new Set(); let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (A[i] === B[j]) { keep.add(i); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  return {
    el: h('div', { class: 'attempt' }, a.map((c, k) => c === ' ' ? h('span', { class: 'gap' }) : h('span', { class: keep.has(k) ? 'l-ok' : 'l-bad' }, c))),
    right: [...keep].filter((k) => a[k] !== ' ').length,
  };
}

/* ---- Game 1: Listen & Spell ---- */
function listenSpellRound(stage, w, ctx, all, done) {
  const target = w.word;
  let tries = 0, peeked = false, reveal = false, finished = false;

  const input = h('input', { class: 'spell-input', type: 'text', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Type the word here', enterkeyhint: 'done', placeholder: 'type here…' });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); check(); } });
  const fb = h('div', { class: 'feedback' });
  const show = h('div', { class: 'reveal hidden' });
  const peekBtn = h('button', { class: 'btn btn-ghost', onclick: peek }, '👀 Peek');
  const skipBtn = h('button', { class: 'btn btn-ghost hidden', onclick: () => finish(0, false) }, 'Skip ➡️');
  const checkBtn = h('button', { class: 'btn btn-go', onclick: check }, '✅ Check');

  stage.append(...[promptBox(w, ctx), show, input, ctx.subj.id === 'spanish' ? accentBar(input) : null, fb, h('div', { class: 'actions' }, peekBtn, skipBtn, checkBtn)].filter(Boolean));
  setTimeout(() => input.focus(), 150);

  function peek() {
    if (reveal || finished) return;
    peeked = true;
    show.replaceChildren(h('p', { class: 'small' }, 'Look carefully…'), letterBoxes(target));
    show.classList.remove('hidden');
    peekBtn.textContent = '👀 Peek again';
    clearTimeout(peek.t);
    peek.t = setTimeout(() => { if (!reveal) show.classList.add('hidden'); input.focus(); }, 4000);
  }

  function check() {
    if (finished) return;
    const guess = input.value;
    if (!guess.trim()) { input.focus(); return; }
    const res = compareSpelling(guess, target);
    if (res !== 'wrong') {
      const pts = reveal ? 2 : peeked ? 5 : tries === 0 ? 10 : 6;
      input.classList.add('correct'); input.disabled = true;
      fb.replaceChildren(h('div', { class: 'good' }, praise(ctx), ` +${pts}`),
        res === 'accent' ? h('div', { class: 'small' }, 'Remember the accent: ', h('strong', {}, target)) : null);
      Sound.good(); Speech.say(target, ctx.lang); cheer(`+${pts}`);
      return finish(pts, tries === 0 && !peeked && !reveal);
    }
    tries++; Sound.bad(); shake(input);
    if (reveal) { fb.replaceChildren(h('div', { class: 'try' }, 'Look at the blocks and copy it letter by letter.')); return; }
    if (tries < 2) {
      const m = markAttempt(guess, target);
      fb.replaceChildren(
        h('div', { class: 'try' }, pick(TRY_AGAIN), ` You got ${m.right} of ${[...target].filter(isLetter).length} letters right.`),
        m.el,
        h('div', { class: 'small' }, 'Green letters are right. Fix the orange ones and check again!'));
      input.focus(); input.select();
    } else {
      reveal = true;
      show.replaceChildren(h('p', { class: 'small' }, 'This is how to spell it:'), letterBoxes(target));
      show.classList.remove('hidden');
      fb.replaceChildren(h('div', { class: 'try' }, 'Now copy it into the box. You can do it!'));
      Speech.spell(target, ctx.lang);
      input.value = ''; input.focus();
      peekBtn.classList.add('hidden'); skipBtn.classList.remove('hidden');
    }
  }
  function finish(pts, clean) { if (finished) return; finished = true; checkBtn.disabled = true; done(pts, clean); }
}

/* ---- Game 2: Word Builder ---- */
function builderRound(stage, w, ctx, all, done) {
  const chars = [...w.word];
  const want = chars.filter((c) => c !== ' ');
  let order = shuffle(want);
  for (let g = 0; g < 10 && want.length > 1 && order.join('') === want.join(''); g++) order = shuffle(want);
  const tiles = order.map((ch) => ({ ch, used: false }));
  const slots = want.map((ch) => ({ want: ch, tile: null, locked: false }));
  let mistakes = 0, hints = 0, finished = false;

  const slotRow = h('div', { class: 'slots' });
  const tray = h('div', { class: 'tray' });
  const fb = h('div', { class: 'feedback' }, h('div', { class: 'small' }, 'Tap the blocks in the right order. Tap a placed block to take it back.'));
  const hintBtn = h('button', { class: 'btn btn-ghost', onclick: hint }, '💡 Help me');
  stage.append(promptBox(w, ctx), slotRow, tray, fb, h('div', { class: 'actions' }, hintBtn));
  draw();

  function draw() {
    slotRow.replaceChildren();
    let group = h('span', { class: 'slot-word' }), si = 0;
    for (const c of chars) {
      if (c === ' ') { slotRow.append(group); group = h('span', { class: 'slot-word' }); continue; }
      const s = slots[si++];
      group.append(h('button', {
        class: 'slot' + (s.locked ? ' locked' : '') + (s.tile != null ? ' filled' : ''),
        'aria-label': s.tile != null ? tiles[s.tile].ch : 'empty',
        onclick: () => { if (finished || s.locked || s.tile == null) return; tiles[s.tile].used = false; s.tile = null; Sound.tap(); draw(); },
      }, s.tile != null ? tiles[s.tile].ch : ''));
    }
    slotRow.append(group);
    tray.replaceChildren(...tiles.map((t, ti) => h('button', { class: 'tile' + (t.used ? ' used' : ''), disabled: t.used || finished, onclick: () => place(ti) }, t.ch)));
  }
  function place(ti) {
    const s = slots.find((x) => !x.locked && x.tile == null);
    if (!s || finished) return;
    s.tile = ti; tiles[ti].used = true; Sound.tap(); draw();
    if (slots.every((x) => x.tile != null)) setTimeout(check, 300);
  }
  function check() {
    let wrong = 0;
    for (const s of slots) {
      if (s.locked) continue;
      if (tiles[s.tile].ch === s.want) s.locked = true;
      else { wrong++; tiles[s.tile].used = false; s.tile = null; }
    }
    if (!wrong) return success();
    mistakes++; Sound.bad(); draw(); shake(slotRow);
    fb.replaceChildren(h('div', { class: 'try' }, pick(TRY_AGAIN), ' The green blocks are right – try the others again.'));
  }
  function hint() {
    if (finished) return;
    const s = slots.find((x) => !x.locked);
    if (!s) return;
    if (s.tile != null) { tiles[s.tile].used = false; s.tile = null; }
    let ti = tiles.findIndex((t) => !t.used && t.ch === s.want);
    if (ti < 0) { // the right block is sitting in another slot – take it back
      const other = slots.find((x) => !x.locked && x.tile != null && tiles[x.tile].ch === s.want);
      ti = other.tile; other.tile = null; tiles[ti].used = false;
    }
    s.tile = ti; tiles[ti].used = true; s.locked = true; hints++;
    Sound.tap(); draw();
    if (slots.every((x) => x.locked)) success();
    else if (slots.every((x) => x.tile != null)) setTimeout(check, 300);
  }
  function success() {
    finished = true; draw();
    const pts = Math.max(2, 10 - mistakes * 2 - hints * 2);
    slotRow.classList.add('win');
    fb.replaceChildren(h('div', { class: 'good' }, praise(ctx), ` +${pts}`));
    Sound.good(); Speech.say(w.word, ctx.lang); cheer(`+${pts}`);
    done(pts, mistakes === 0 && hints === 0);
  }
}

/* ---- Game 3: Missing Letters ---- */
const CONFUSE = { b: 'dpq', d: 'bpq', p: 'bdq', q: 'pdg', m: 'nw', n: 'mu', u: 'nv', w: 'mv', v: 'wf', a: 'eou', e: 'aio', i: 'ey', o: 'au', y: 'ie', c: 'ks', k: 'c', s: 'cz', f: 'vt', g: 'jq', j: 'g', t: 'fl', l: 'it', h: 'n', r: 'n', x: 'z', z: 's' };
function distractors(want, n) {
  const lower = want.toLowerCase(), base = stripAccents(lower);
  const pool = [];
  if (base !== lower) pool.push(base);
  pool.push(...(CONFUSE[base] || ''));
  pool.push(...shuffle([...'abcdefghilmnoprstuwy']));
  const out = [];
  for (const c of pool) if (c !== lower && !out.includes(c)) out.push(c);
  const keep = shuffle(out.slice(0, n + 1)).slice(0, n);
  return want === want.toUpperCase() && want !== lower ? keep.map((c) => c.toUpperCase()) : keep;
}
function missingRound(stage, w, ctx, all, done) {
  const chars = [...w.word];
  const letterPos = chars.map((c, i) => (isLetter(c) ? i : -1)).filter((i) => i >= 0);
  const n = letterPos.length <= 3 ? 1 : letterPos.length <= 6 ? 2 : 3;
  const blanks = shuffle(letterPos).slice(0, n).sort((a, b) => a - b);
  let bi = 0, wrong = 0;

  const wordEl = h('div', { class: 'missing-word' });
  const opts = h('div', { class: 'options letters' });
  const fb = h('div', { class: 'feedback' }, h('div', { class: 'small' }, 'Which letter goes in the glowing box?'));
  stage.append(promptBox(w, ctx), wordEl, opts, fb);
  draw();

  function draw() {
    wordEl.replaceChildren(...chars.map((c, i) => {
      if (c === ' ') return h('span', { class: 'gap' });
      const b = blanks.indexOf(i);
      if (b >= bi) return h('span', { class: 'ml blank' + (b === bi ? ' current' : '') }, '');
      return h('span', { class: 'ml' + (b >= 0 ? ' filled' : '') }, c);
    }));
    if (bi >= blanks.length) { opts.replaceChildren(); return; }
    const want = chars[blanks[bi]];
    opts.replaceChildren(...shuffle([want, ...distractors(want, 3)]).map((ch) => h('button', { class: 'opt-letter', onclick: (e) => choose(ch, e.currentTarget) }, ch)));
  }
  function choose(ch, btn) {
    if (ch === chars[blanks[bi]]) {
      Sound.good(); bi++; draw();
      if (bi >= blanks.length) {
        const pts = Math.max(2, 10 - wrong * 3);
        fb.replaceChildren(h('div', { class: 'good' }, praise(ctx), ` +${pts}`));
        Speech.say(w.word, ctx.lang); cheer(`+${pts}`);
        done(pts, wrong === 0);
      }
    } else {
      wrong++; Sound.bad(); btn.disabled = true; btn.classList.add('wrong'); shake(btn);
      fb.replaceChildren(h('div', { class: 'try' }, pick(TRY_AGAIN), ' Say the word slowly and listen for that sound.'));
    }
  }
}

/* ---- Game 4: Quick Pick ---- */
function quizRound(stage, w, ctx, all, done) {
  const spanish = ctx.subj.id === 'spanish';
  const forward = Math.random() < 0.5; // true: show the word, pick its meaning
  const question = forward ? w.word : w.meaning;
  const qLang = forward ? ctx.lang : 'en-GB';
  const answer = forward ? w.meaning : w.word;
  const others = shuffle([...new Set(all.filter((x) => x !== w).map((x) => (forward ? x.meaning : x.word)))].filter((x) => norm(x) !== norm(answer))).slice(0, 3);
  let tries = 0, finished = false;

  const ask = forward ? (spanish ? 'What does this mean in English?' : 'What does this word mean?') : (spanish ? 'How do you say this in Spanish?' : 'Which word matches this clue?');
  if (settings.autoSpeak) setTimeout(() => Speech.say(question, qLang), 400);
  const fb = h('div', { class: 'feedback' });
  stage.append(
    h('div', { class: 'prompt' },
      h('p', { class: 'small' }, ask),
      h('div', { class: 'quiz-q' }, question, ' ', speakBtn(question, qLang, '🔊', 'btn-mini'))),
    h('div', { class: 'options' }, shuffle([answer, ...others]).map((o) => h('button', { class: 'opt-answer', onclick: (e) => choose(o, e.currentTarget) }, o))),
    fb);

  function choose(o, btn) {
    if (finished) return;
    if (o === answer) {
      finished = true;
      const pts = tries === 0 ? 10 : tries === 1 ? 5 : 2;
      btn.classList.add('right');
      fb.replaceChildren(h('div', { class: 'good' }, praise(ctx), ` +${pts}`), h('div', { class: 'small' }, `${w.word} = ${w.meaning}`));
      Sound.good(); cheer(`+${pts}`);
      Speech.queue([[w.word, ctx.lang], [w.meaning, 'en-GB']]);
      done(pts, tries === 0);
    } else {
      tries++; Sound.bad(); btn.disabled = true; btn.classList.add('wrong'); shake(btn);
      fb.replaceChildren(h('div', { class: 'try' }, pick(TRY_AGAIN), ' Have another go.'));
    }
  }
}

/* ---- Game 5: Memory Match ---- */
function memoryGame(stage, words, ctx) {
  const spanish = ctx.subj.id === 'spanish';
  const chosen = shuffle(words).slice(0, MEMORY_PAIRS);
  const pairs = chosen.length;
  const cards = shuffle(chosen.flatMap((w, i) => [
    { pid: i, side: 'word', text: w.word, lang: ctx.lang, tag: spanish ? 'Español' : 'Word' },
    { pid: i, side: 'meaning', text: w.meaning, lang: 'en-GB', tag: spanish ? 'English' : 'Meaning' },
  ]));
  let open = [], found = 0, misses = 0, lock = false;
  const missCount = new Array(pairs).fill(0);
  const progress = () => ctx.progress(found / pairs, `Pairs found: ${found} of ${pairs}`);
  progress();

  const grid = h('div', { class: 'mem-grid' });
  stage.append(h('p', { class: 'small center' }, spanish ? 'Find each Spanish word and its English meaning. Orange cards are Spanish, blue cards are English.' : 'Find each word and its meaning.'), grid);

  cards.forEach((c) => {
    c.el = h('button', { class: `mem-card side-${c.side}`, 'aria-label': 'Hidden card', onclick: () => flip(c) },
      h('span', { class: 'mem-inner' },
        h('span', { class: 'mem-front' }, '?'),
        h('span', { class: 'mem-back' }, h('span', { class: 'mem-tag' }, c.tag), h('span', { class: 'mem-text' }, c.text))));
    grid.append(c.el);
  });

  function flip(c) {
    if (lock || c.done || open.includes(c)) return;
    c.el.classList.add('flipped'); c.el.setAttribute('aria-label', c.text);
    Sound.tap();
    if (settings.autoSpeak) Speech.say(c.text, c.lang);
    open.push(c);
    if (open.length < 2) return;
    const [a, b] = open;
    if (a.pid === b.pid) {
      a.done = b.done = true; open = [];
      setTimeout(() => {
        a.el.classList.add('matched'); b.el.classList.add('matched');
        Sound.good(); cheer(praise(ctx)); found++; progress();
        if (found === pairs) finish();
      }, 500);
    } else {
      lock = true; misses++; missCount[a.pid]++; missCount[b.pid]++;
      setTimeout(() => {
        a.el.classList.remove('flipped'); b.el.classList.remove('flipped');
        a.el.setAttribute('aria-label', 'Hidden card'); b.el.setAttribute('aria-label', 'Hidden card');
        open = []; lock = false;
      }, 1400);
    }
  }
  function finish() {
    const max = pairs * 10;
    const freeMisses = pairs; // nobody remembers cards they've never seen
    ctx.add(Math.max(pairs * 3, max - 2 * Math.max(0, misses - freeMisses)), max);
    chosen.forEach((w, i) => { if (missCount[i] >= 3) ctx.tricky(w); });
    ctx.finish();
  }
}

const hasMeaning = (w) => !!w.meaning;
const GAMES = [
  { id: 'listen', name: 'Listen & Spell', emoji: '🎧', desc: 'Hear the word, then type it.', subjects: ['english', 'spanish'], round: listenSpellRound },
  { id: 'builder', name: 'Word Builder', emoji: '🧱', desc: 'Tap the letter blocks to build the word.', subjects: ['english', 'spanish'], round: builderRound },
  { id: 'missing', name: 'Missing Letters', emoji: '🔍', desc: 'Find the letters that fell out.', subjects: ['english', 'spanish'], round: missingRound },
  { id: 'memory', name: 'Memory Match', emoji: '🃏', desc: 'Flip the cards to find matching pairs.', subjects: ['spanish', 'english'], needsMeaning: true, wordFilter: hasMeaning, minWords: 2, start: memoryGame },
  { id: 'quiz', name: 'Quick Pick', emoji: '⚡', desc: 'Pick the right meaning.', subjects: ['spanish', 'english'], needsMeaning: true, wordFilter: hasMeaning, minWords: 2, round: quizRound },
];

/* ---------- when the CSV can't be found ---------- */
function problemScreen() {
  const file = h('input', { type: 'file', accept: '.csv,text/csv', onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const t = await f.text(); DATA = buildData(t); Store.set('csvCache', t); homeScreen(); }
    catch (err) { alert(err.message); }
  } });
  render(topBar(null), h('section', { class: 'home' },
    h('h1', {}, 'Oops! 🙈'),
    h('p', { class: 'lead' }, loadProblem),
    h('label', { class: 'btn btn-go file-btn' }, '📂 Choose words.csv', file),
    h('button', { class: 'btn btn-ghost', onclick: helpPanel }, '👩‍🏫 How to write the file')));
}

/* ---------- go! ---------- */
(async function start() {
  applySettings();
  Speech.init();
  if (await loadWords()) homeScreen(); else problemScreen();
})();
