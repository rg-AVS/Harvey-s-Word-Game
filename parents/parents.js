'use strict';

/* =====================================================================
   Parents' Corner – add and edit the weekly word lists in words.csv
   ===================================================================== */

/* ---------- helpers (same as the game) ---------- */
const $ = (s, el = document) => el.querySelector(s);
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const norm = (s) => String(s).normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (iso, n) => { const d = fromIso(iso); d.setDate(d.getDate() + n); return isoOf(d); };
const ukDate = (iso) => iso ? iso.split('-').reverse().join('/') : '';
const nice = (iso) => fromIso(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const today = () => isoOf(new Date());
const Store = {
  get(k, d) { try { const v = localStorage.getItem('hwg:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('hwg:' + k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem('hwg:' + k); } catch { /* */ } },
};

function parseDate(s) {
  s = String(s || '').trim();
  let y, m, d, x;
  if ((x = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) { y = +x[1]; m = +x[2]; d = +x[3]; }
  else if ((x = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) { d = +x[1]; m = +x[2]; y = +x[3]; if (y < 100) y += 2000; }
  else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}
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
const csvField = (v) => { v = String(v ?? ''); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };

/* ---------- the word list ---------- */
const SUBJECTS = { english: { name: 'English spelling', emoji: '📝' }, spanish: { name: 'Spanish', emoji: '🇪🇸' } };
let weeks = [];        // { subject, date, test, unit, words: [{ word, meaning, sentence }] }
let subject = Store.get('parentsTab', 'english');
let editing = null;    // the week being edited, or null when adding a new one
let dirty = false;
let canSaveOnline = false;

function load(text) {
  const rows = parseCSV(text);
  const header = (rows[0] || []).map(norm);
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
  if (ci.date < 0 || ci.word < 0) throw new Error('words.csv needs "date" and "word" columns.');
  const map = new Map();
  for (const r of rows.slice(1)) {
    const get = (i) => (i >= 0 && r[i] != null ? r[i].trim() : '');
    const word = get(ci.word), date = parseDate(get(ci.date));
    if (!word || !date) continue;
    const subj = /^(sp|es)/.test(norm(get(ci.subject))) ? 'spanish' : 'english';
    const key = subj + '|' + date;
    if (!map.has(key)) map.set(key, { subject: subj, date, test: '', unit: '', words: [] });
    const wk = map.get(key);
    wk.test ||= parseDate(get(ci.test)) || '';
    wk.unit ||= get(ci.unit);
    wk.words.push({ word, meaning: get(ci.meaning), sentence: get(ci.sentence) });
  }
  weeks = [...map.values()];
}

function toCSV() {
  const order = { english: 0, spanish: 1 };
  const sorted = [...weeks].sort((a, b) => order[a.subject] - order[b.subject] || a.date.localeCompare(b.date));
  const lines = ['date,subject,word,meaning,sentence,test,unit'];
  for (const wk of sorted) for (const w of wk.words)
    lines.push([ukDate(wk.date), wk.subject, w.word, w.meaning, w.sentence, ukDate(wk.test), wk.unit].map(csvField).join(','));
  return lines.join('\n') + '\n';
}

/* One word per line. Anything after " - " is the sentence (English) or the meaning (Spanish). */
function linesToWords(text, subj, oldWords = []) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/\s+[-–—]\s+|\t/).map((p) => p.trim());
    const word = parts[0];
    if (!word || out.some((w) => norm(w.word) === norm(word))) continue;
    const old = oldWords.find((w) => norm(w.word) === norm(word));
    if (subj === 'spanish') out.push({ word, meaning: parts[1] || old?.meaning || '', sentence: parts.slice(2).join(' - ') });
    else out.push({ word, meaning: old?.meaning || '', sentence: parts.slice(1).join(' - ') });
  }
  return out;
}
function wordsToLines(words, subj) {
  return words.map((w) => subj === 'spanish'
    ? [w.word, w.meaning, w.sentence].filter((x, i) => x || i === 0).join(' - ')
    : [w.word, w.sentence].filter(Boolean).join(' - ')).join('\n');
}

const subjectWeeks = () => weeks.filter((w) => w.subject === subject).sort((a, b) => b.date.localeCompare(a.date));
const SWITCH_HOUR = 12; // lists switch on at midday on their start date
const started = (d) => { const n = new Date(); return `${d}T${pad(SWITCH_HOUR)}` <= `${isoOf(n)}T${pad(n.getHours())}`; };
const START_DAY = { english: 2, spanish: 4 }; // Tuesday, Thursday
function liveWeek(subj) {
  const ds = weeks.filter((w) => w.subject === subj).map((w) => w.date).sort();
  const past = ds.filter(started);
  return past.length ? past[past.length - 1] : ds[0];
}
function suggestStart() {
  const d = fromIso(today());
  const next = isoOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() + ((START_DAY[subject] - d.getDay() + 7) % 7)));
  const latest = subjectWeeks()[0];
  const afterLatest = latest ? addDays(latest.date, 7) : next;
  return afterLatest > next ? afterLatest : next;
}

/* ---------- drawing the page ---------- */
const app = $('#app');

function render() {
  const S = SUBJECTS[subject];
  app.replaceChildren(
    h('div', { class: 'p-top' }, h('a', { href: '../' }, '← Back to the game'), h('a', { href: '../', target: '_blank' }, 'Open the game in a new tab ↗')),
    h('h1', {}, 'Parents’ corner 👩‍🏫'),
    h('p', { class: 'small' }, 'Add next week’s words here. Each list switches on by itself at midday on its start date – English on Tuesdays, Spanish on Thursdays, straight after the test.'),
    h('div', { class: 'tabs' }, Object.entries(SUBJECTS).map(([id, s]) =>
      h('button', { class: 'tab' + (id === subject ? ' on' : ''), onclick: () => { if (editing && !confirm('Stop editing this week without saving it?')) return; subject = id; editing = null; Store.set('parentsTab', id); render(); } }, `${s.emoji} ${s.name}`))),
    editorCard(),
    weekList(S),
    saveBar());
  updateStatus();
}

function editorCard() {
  const isEs = subject === 'spanish';
  const wk = editing;
  const start = h('input', { type: 'date', value: wk ? wk.date : suggestStart(), required: true });
  const test = h('input', { type: 'date', value: wk ? wk.test : addDays(start.value, 7) });
  let testTouched = !!wk;
  test.addEventListener('input', () => { testTouched = true; });
  start.addEventListener('change', () => { if (!testTouched && start.value) test.value = addDays(start.value, 7); });
  const unit = h('input', { type: 'text', value: wk ? wk.unit : '', placeholder: isEs ? 'e.g. 8A 1-6' : 'e.g. Week 12' });
  const words = h('textarea', {
    spellcheck: isEs ? 'false' : 'true', autocapitalize: 'off',
    placeholder: isEs ? 'el perro - the dog\nel gato - the cat\nla vaca - the cow' : 'because\ndifferent - My shoes are different colours.\nseparate',
  });
  words.value = wk ? wordsToLines(wk.words, subject) : '';
  const count = h('span', { class: 'count' });
  const recount = () => { const n = linesToWords(words.value, subject).length; count.textContent = n ? `(${n} word${n === 1 ? '' : 's'})` : ''; };
  words.addEventListener('input', recount); recount();
  const msg = h('div', { class: 'help', 'aria-live': 'polite' });

  function submit() {
    const date = start.value;
    const list = linesToWords(words.value, subject, wk ? wk.words : []);
    if (!date) { msg.textContent = '⚠️ Please choose the date the words start.'; start.focus(); return; }
    if (!list.length) { msg.textContent = '⚠️ Please type at least one word.'; words.focus(); return; }
    if (isEs && list.some((w) => !w.meaning)) {
      msg.textContent = '⚠️ Each Spanish word needs its English meaning after a dash, like “el perro - the dog”. Missing: ' + list.filter((w) => !w.meaning).map((w) => w.word).join(', ');
      return;
    }
    const clash = weeks.find((w) => w.subject === subject && w.date === date && w !== wk);
    if (clash && !confirm(`There is already a ${SUBJECTS[subject].name} list starting on ${nice(date)}. Replace it?`)) return;
    weeks = weeks.filter((w) => w !== clash && w !== wk);
    weeks.push({ subject, date, test: test.value || '', unit: unit.value.trim(), words: list });
    editing = null; dirty = true;
    render();
    flash(`✅ ${list.length} words ${wk ? 'updated' : 'added'} for ${nice(date)}. Don’t forget to save!`);
  }

  return h('section', { class: 'p-card', id: 'editor' },
    h('h2', {}, wk ? '✏️ Edit this week' : `➕ Add a new week of ${SUBJECTS[subject].name}`),
    wk ? h('div', { class: 'editing-note' }, `Editing the list that starts ${nice(wk.date)}.`) : null,
    h('div', { class: 'form-row' },
      h('label', { class: 'field' }, h('span', {}, 'Words start on ', h('span', { class: 'opt' }, '(at midday)')), start),
      h('label', { class: 'field' }, h('span', {}, 'Test day ', h('span', { class: 'opt' }, '(optional)')), test),
      h('label', { class: 'field' }, h('span', {}, 'List name ', h('span', { class: 'opt' }, '(optional)')), unit)),
    h('label', { class: 'field', style: 'margin-top:12px' }, h('span', {}, 'Words – one per line ', count), words),
    h('p', { class: 'help' }, isEs
      ? h('span', {}, 'Put the English meaning after a dash: ', h('code', {}, 'el perro - the dog'), '. You can paste straight from a list.')
      : h('span', {}, 'Just the words, one per line. Want a sentence read out to help? Add it after a dash: ', h('code', {}, 'because - I stayed in because it rained.'))),
    msg,
    h('div', { class: 'actions', style: 'justify-content:flex-start' },
      h('button', { class: 'btn btn-go', onclick: submit }, wk ? '✅ Update week' : '➕ Add week'),
      wk ? h('button', { class: 'btn btn-ghost', onclick: () => { editing = null; render(); } }, 'Cancel') : null));
}

function weekCard(wk, live) {
  const status = wk.date === live ? ['live', 'Live now'] : !started(wk.date) ? ['soon', 'Coming up'] : ['past', 'Finished'];
  return h('div', { class: 'week' + (status[0] === 'live' ? ' live' : '') },
    h('div', { class: 'week-head' },
      h('span', { class: 'badge ' + status[0] }, status[1]),
      h('span', { class: 'week-title' }, (wk.unit ? wk.unit + ' · ' : '') + 'from ' + nice(wk.date)),
      h('span', { class: 'week-meta' }, `${wk.words.length} words` + (wk.test ? ` · test ${nice(wk.test)}` : ''))),
    h('div', { class: 'week-words' }, wk.words.map((w) => h('span', {}, w.word, subject === 'spanish' && w.meaning ? h('small', {}, ' ' + w.meaning) : null))),
    h('div', { class: 'week-btns' },
      h('button', { class: 'btn btn-ghost', onclick: () => { editing = wk; render(); $('#editor').scrollIntoView({ behavior: 'smooth' }); } }, '✏️ Edit'),
      h('a', { class: 'btn btn-ghost', href: `../?date=${wk.date}`, target: '_blank' }, '👀 Try it'),
      h('button', { class: 'btn btn-ghost', onclick: () => {
        if (!confirm(`Delete the list that starts ${nice(wk.date)}?`)) return;
        weeks = weeks.filter((w) => w !== wk); if (editing === wk) editing = null; dirty = true; render();
      } }, '🗑️ Delete')));
}

function weekList(S) {
  const list = subjectWeeks();
  const live = liveWeek(subject);
  const current = list.filter((w) => w.date >= live);
  const past = list.filter((w) => w.date < live);
  return h('section', { class: 'p-card' },
    h('h2', {}, `${S.emoji} ${S.name} lists`),
    list.length ? null : h('p', { class: 'small' }, 'No lists yet – add one above.'),
    current.map((w) => weekCard(w, live)),
    past.length ? h('details', { class: 'past' }, h('summary', {}, `Finished lists (${past.length})`), past.map((w) => weekCard(w, live))) : null);
}

/* ---------- saving ---------- */
let statusEl, pwInput, rememberBox;
function saveBar() {
  statusEl = h('div', { class: 'save-status', 'aria-live': 'polite' });
  pwInput = h('input', { type: 'password', placeholder: 'Password', autocomplete: 'current-password', value: Store.get('parentsPw', '') });
  pwInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveOnline(); });
  rememberBox = h('input', { type: 'checkbox', checked: !!Store.get('parentsPw', '') });
  return h('div', { class: 'savebar' }, h('div', { class: 'savebar-in' },
    statusEl,
    canSaveOnline ? [pwInput, h('label', { class: 'remember' }, rememberBox, 'Remember'), h('button', { class: 'btn btn-go', onclick: saveOnline }, '💾 Save')] : null,
    h('button', { class: 'btn btn-ghost', onclick: download }, '⬇️ Download')));
}
let flashMsg = null;
function flash(text, kind = 'ok') { flashMsg = { text, kind }; updateStatus(); }
function updateStatus() {
  if (!statusEl) return;
  let text, kind;
  if (flashMsg) ({ text, kind } = flashMsg);
  else if (dirty) { text = canSaveOnline ? '● You have changes that aren’t saved yet.' : '● Changes not saved yet – download words.csv and upload it to your website.'; kind = 'dirty'; }
  else { text = canSaveOnline ? '✓ Everything is saved.' : 'To publish changes: download words.csv and upload it to the game folder on your website.'; kind = canSaveOnline ? 'ok' : ''; }
  if (flashMsg && dirty && kind === 'ok') text += ' (not saved yet)';
  statusEl.textContent = text;
  statusEl.className = 'save-status ' + (kind || '');
  flashMsg = null;
}

async function saveOnline() {
  const pw = pwInput.value;
  if (!pw) { flash('⚠️ Type the password first.', 'err'); pwInput.focus(); return; }
  flash('Saving…', '');
  try {
    const r = await fetch('save.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw, csv: toCSV() }) });
    const j = await r.json().catch(() => null);
    if (!j || !j.ok) throw new Error((j && j.error) || `The website said ${r.status}.`);
    if (rememberBox.checked) Store.set('parentsPw', pw); else Store.del('parentsPw');
    dirty = false;
    flash('✓ Saved! Harvey will see the new words next time the game opens.');
  } catch (e) {
    flash('⚠️ Not saved: ' + e.message, 'err');
  }
}

function download() {
  const blob = new Blob(['﻿' + toCSV()], { type: 'text/csv;charset=utf-8' });
  const a = h('a', { href: URL.createObjectURL(blob), download: 'words.csv' });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  if (!canSaveOnline) { dirty = false; flash('⬇️ Downloaded. Now upload words.csv to the game folder on your website, replacing the old one.'); }
  else flash('⬇️ Downloaded a copy.');
}

window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- start ---------- */
(async function start() {
  try {
    const r = await fetch('save.php', { cache: 'no-store' });
    const j = await r.json();
    canSaveOnline = !!(j && j.ok && j.ready);
  } catch { canSaveOnline = false; }
  try {
    const r = await fetch('../words.csv?nocache=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    load(await r.text());
  } catch (e) {
    app.replaceChildren(h('div', { class: 'p-card' }, h('h1', {}, 'Couldn’t open words.csv'),
      h('p', {}, 'This page needs to be on your website (or a local web server) next to the game. ', e.message)));
    return;
  }
  render();
})();
