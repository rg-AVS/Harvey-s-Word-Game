'use strict';
/* Helpers shared by the two grown-up pages: /parents (scores) and /parentswords (words + students). */

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
const norm = (s) => String(s ?? '').normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (iso, n) => { const d = fromIso(iso); d.setDate(d.getDate() + n); return isoOf(d); };
const ukDate = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
const nice = (iso) => fromIso(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const niceShort = (iso) => fromIso(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const today = () => isoOf(new Date());
const Store = {
  get(k, d) { try { const v = localStorage.getItem('hwg:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('hwg:' + k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem('hwg:' + k); } catch { /* */ } },
};
const SWITCH_HOUR = 12; // lists switch on at midday on their start date
const started = (d) => { const n = new Date(); return `${d}T${pad(SWITCH_HOUR)}` <= `${isoOf(n)}T${pad(n.getHours())}`; };
const setLabel = (s) => (!s ? 'Everyone' : s.replace(/^set\s*(\d+)$/i, 'Set $1'));
const SUBJECTS = { english: { name: 'English spelling', emoji: '📝' }, spanish: { name: 'Spanish', emoji: '🇪🇸' } };
const GAME_NAMES = { listen: '🎧 Listen & Spell', builder: '🧱 Word Builder', missing: '🔍 Missing Letters', memory: '🃏 Memory Match', quiz: '⚡ Quick Pick' };

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

/* words.csv → [{ subject, set, date, test, unit, words: [{ word, meaning, sentence }] }] */
function parseWeeks(text) {
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
    set: col(['set', 'group', 'english set']),
  };
  if (ci.date < 0 || ci.word < 0) throw new Error('words.csv needs "date" and "word" columns.');
  const map = new Map();
  for (const r of rows.slice(1)) {
    const get = (i) => (i >= 0 && r[i] != null ? r[i].trim() : '');
    const word = get(ci.word), date = parseDate(get(ci.date));
    if (!word || !date) continue;
    const subject = /^(sp|es)/.test(norm(get(ci.subject))) ? 'spanish' : 'english';
    const set = norm(get(ci.set));
    const key = subject + '|' + set + '|' + date;
    if (!map.has(key)) map.set(key, { subject, set, date, test: '', unit: '', words: [] });
    const wk = map.get(key);
    wk.test ||= parseDate(get(ci.test)) || '';
    wk.unit ||= get(ci.unit);
    wk.words.push({ word, meaning: get(ci.meaning), sentence: get(ci.sentence) });
  }
  return [...map.values()];
}
async function fetchWeeks() {
  const r = await fetch('../words.csv?nocache=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error('Could not open words.csv (' + r.status + ').');
  return parseWeeks(await r.text());
}
/* Lists a child in `set` would see (their set's lists plus lists for everyone). */
const forSet = (weeks, subject, set) => weeks.filter((w) => w.subject === subject && (!w.set || set == null || w.set === norm(set)));
function liveDate(list) {
  const ds = [...new Set(list.map((w) => w.date))].sort();
  const past = ds.filter(started);
  return past.length ? past[past.length - 1] : ds[0];
}

async function api(path, body) {
  const r = await fetch('../api/' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  const j = await r.json().catch(() => null);
  if (!j) throw new Error('The website isn’t running PHP, so this can’t work yet (see the README).');
  if (!j.ok) throw new Error(j.error || 'Something went wrong (' + r.status + ').');
  return j;
}
