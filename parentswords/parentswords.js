'use strict';
/* =====================================================================
   /parentswords – add and edit word lists, and manage students.
   Uses helpers from ../parents/shared.js
   ===================================================================== */

let weeks = [];
let tab = Store.get('wordsTab', 'english');           // english | spanish | students
let setFilter = Store.get('wordsSet', 'set1');         // which English set is showing ('' = lists for everyone)
let editing = null;
let dirty = false;
let server = { php: false, ready: false };
let password = '';
let unlocked = false;
let students = [];
let studentsDirty = false;
let studentsNote = '';

/* ---------- words ---------- */
function toCSV() {
  const order = { english: 0, spanish: 1 };
  const sorted = [...weeks].sort((a, b) => order[a.subject] - order[b.subject] || a.set.localeCompare(b.set) || a.date.localeCompare(b.date));
  const lines = ['date,subject,word,meaning,sentence,test,unit,set'];
  for (const wk of sorted) for (const w of wk.words)
    lines.push([ukDate(wk.date), wk.subject, w.word, w.meaning, w.sentence, ukDate(wk.test), wk.unit, wk.set].map(csvField).join(','));
  return lines.join('\n') + '\n';
}
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
function allSets() {
  const s = new Set(['set1', 'set2']);
  weeks.forEach((w) => w.set && s.add(w.set));
  students.forEach((u) => u.set && s.add(norm(u.set)));
  return [...s].sort();
}
const subject = () => (tab === 'spanish' ? 'spanish' : 'english');
const curSet = () => (subject() === 'spanish' ? '' : setFilter);
/* Lists shown on the page: Spanish all; English the chosen set's own lists plus lists for everyone. */
function shownWeeks() {
  const subj = subject();
  const list = subj === 'spanish' ? weeks.filter((w) => w.subject === 'spanish') : forSet(weeks, 'english', setFilter || null).filter((w) => setFilter || !w.set);
  return list.sort((a, b) => b.date.localeCompare(a.date));
}
const START_DAY = { english: 2, spanish: 4 }; // Tuesday, Thursday
function suggestStart() {
  const d = fromIso(today());
  const next = isoOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() + ((START_DAY[subject()] - d.getDay() + 7) % 7)));
  const latest = shownWeeks()[0];
  const after = latest ? addDays(latest.date, 7) : next;
  return after > next ? after : next;
}

/* ---------- page ---------- */
const app = $('#app');
function render() {
  app.replaceChildren(
    h('div', { class: 'p-top' }, h('a', { href: '../' }, '← Back to the game'), h('a', { href: '../parents/' }, '📊 Scores')),
    h('h1', {}, 'Words & students ✏️'),
    h('p', { class: 'small' }, 'Each list switches on by itself at midday on its start date – English on Tuesdays, Spanish on Thursdays, straight after the test.'),
    loginCard(),
    h('div', { class: 'tabs' },
      [['english', '📝 English'], ['spanish', '🇪🇸 Spanish'], ['students', '👧 Students']].map(([id, label]) =>
        h('button', { class: 'tab' + (id === tab ? ' on' : ''), onclick: () => switchTab(id) }, label))),
    ...(tab === 'students' ? [studentsCard()] : [subject() === 'english' ? setChips() : '', editorCard(), weekList()]),
    tab === 'students' && !dirty ? '' : saveBar());
  updateStatus();
}
function switchTab(id) {
  if (editing && !confirm('Stop editing this list without keeping your changes?')) return;
  tab = id; editing = null; Store.set('wordsTab', id); render();
}

function loginCard() {
  if (unlocked) return h('div', { class: 'p-note ok' }, '🔓 Unlocked – you can save words and students. ',
    h('button', { class: 'linkish', onclick: () => { unlocked = false; password = ''; Store.del('adminPw'); render(); } }, 'Lock'));
  if (!server.php) return h('div', { class: 'p-note' }, 'ℹ️ Your website isn’t running PHP, so changes can’t be saved straight from this page and students can’t be added. You can still edit the words, then press ', h('b', {}, 'Download'), ' and upload words.csv yourself.');
  if (!server.ready) return h('div', { class: 'p-note' }, 'ℹ️ To save from this page, set a password first: copy ', h('code', {}, 'api/config.example.php'), ' to ', h('code', {}, 'api/config.php'), ' on your website and change “change-me”.');
  const pw = h('input', { type: 'password', placeholder: 'Grown-ups’ password', autocomplete: 'current-password' });
  const remember = h('input', { type: 'checkbox' });
  const msg = h('span', { class: 'help' });
  const go = async () => {
    try { await api('admin.php', { password: pw.value, action: 'check' }); password = pw.value; unlocked = true; if (remember.checked) Store.set('adminPw', password); await loadStudents(); render(); }
    catch (e) { msg.textContent = '⚠️ ' + e.message; }
  };
  pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  return h('section', { class: 'p-card login' },
    h('h2', {}, '🔒 Unlock to save'),
    h('div', { class: 'login-row' }, pw, h('button', { class: 'btn btn-go', onclick: go }, 'Unlock')),
    h('label', { class: 'remember' }, remember, 'Remember on this device'), msg);
}

function setChips() {
  return h('div', { class: 'set-chips' }, h('span', { class: 'small' }, 'Which group? '),
    [...allSets(), ''].map((s) => h('button', {
      class: 'chip' + (s === setFilter ? ' on' : ''),
      onclick: () => { if (editing && !confirm('Stop editing this list?')) return; setFilter = s; editing = null; Store.set('wordsSet', s); render(); },
    }, setLabel(s), s ? h('small', {}, ` (${students.filter((u) => norm(u.set) === s).map((u) => u.name).join(', ') || 'no one yet'})`) : null)));
}

function editorCard() {
  const subj = subject();
  const isEs = subj === 'spanish';
  const wk = editing;
  const start = h('input', { type: 'date', value: wk ? wk.date : suggestStart(), required: true });
  const test = h('input', { type: 'date', value: wk ? wk.test : addDays(start.value, 7) });
  let testTouched = !!wk;
  test.addEventListener('input', () => { testTouched = true; });
  start.addEventListener('change', () => { if (!testTouched && start.value) test.value = addDays(start.value, 7); });
  const unit = h('input', { type: 'text', value: wk ? wk.unit : '', placeholder: isEs ? 'e.g. 8A 1-6' : 'e.g. Week 12' });
  const setSel = isEs ? null : h('select', {}, [...allSets(), ''].map((s) => h('option', { value: s, selected: s === (wk ? wk.set : setFilter) }, setLabel(s))));
  const words = h('textarea', { spellcheck: isEs ? 'false' : 'true', autocapitalize: 'off',
    placeholder: isEs ? 'el perro - the dog\nel gato - the cat\nla vaca - the cow' : 'because\ndifferent - My shoes are different colours.\nseparate' });
  words.value = wk ? wordsToLines(wk.words, subj) : '';
  const count = h('span', { class: 'count' });
  const recount = () => { const n = linesToWords(words.value, subj).length; count.textContent = n ? `(${n} word${n === 1 ? '' : 's'})` : ''; };
  words.addEventListener('input', recount); recount();
  const msg = h('div', { class: 'help', 'aria-live': 'polite' });

  function submit() {
    const date = start.value;
    const set = isEs ? '' : setSel.value;
    const list = linesToWords(words.value, subj, wk ? wk.words : []);
    if (!date) { msg.textContent = '⚠️ Please choose the date the words start.'; start.focus(); return; }
    if (!list.length) { msg.textContent = '⚠️ Please type at least one word.'; words.focus(); return; }
    if (isEs && list.some((w) => !w.meaning)) {
      msg.textContent = '⚠️ Each Spanish word needs its English meaning after a dash, like “el perro - the dog”. Missing: ' + list.filter((w) => !w.meaning).map((w) => w.word).join(', ');
      return;
    }
    const clash = weeks.find((w) => w.subject === subj && w.set === set && w.date === date && w !== wk);
    if (clash && !confirm(`There is already a list for ${setLabel(set)} starting on ${nice(date)}. Replace it?`)) return;
    weeks = weeks.filter((w) => w !== clash && w !== wk);
    weeks.push({ subject: subj, set, date, test: test.value || '', unit: unit.value.trim(), words: list });
    editing = null; dirty = true;
    if (!isEs) { setFilter = set; Store.set('wordsSet', set); }
    render();
    flash(`✅ ${list.length} words ${wk ? 'updated' : 'added'} for ${nice(date)}. Don’t forget to save!`);
  }

  return h('section', { class: 'p-card', id: 'editor' },
    h('h2', {}, wk ? '✏️ Edit this list' : `➕ Add a new ${isEs ? 'Spanish' : 'English'} list`),
    wk ? h('div', { class: 'editing-note' }, `Editing the list that starts ${nice(wk.date)}.`) : null,
    h('div', { class: 'form-row' },
      setSel ? h('label', { class: 'field' }, 'For', setSel) : null,
      h('label', { class: 'field' }, h('span', {}, 'Words start on ', h('span', { class: 'opt' }, '(at midday)')), start),
      h('label', { class: 'field' }, h('span', {}, 'Test day ', h('span', { class: 'opt' }, '(optional)')), test),
      h('label', { class: 'field' }, h('span', {}, 'List name ', h('span', { class: 'opt' }, '(optional)')), unit)),
    h('label', { class: 'field', style: 'margin-top:12px' }, h('span', {}, 'Words – one per line ', count), words),
    h('p', { class: 'help' }, isEs
      ? h('span', {}, 'Put the English meaning after a dash: ', h('code', {}, 'el perro - the dog'), '. You can paste straight from a list.')
      : h('span', {}, 'Just the words, one per line. Want a sentence read out to help? Add it after a dash: ', h('code', {}, 'because - I stayed in because it rained.'))),
    msg,
    h('div', { class: 'actions', style: 'justify-content:flex-start' },
      h('button', { class: 'btn btn-go', onclick: submit }, wk ? '✅ Update list' : '➕ Add list'),
      wk ? h('button', { class: 'btn btn-ghost', onclick: () => { editing = null; render(); } }, 'Cancel') : null));
}

function weekCard(wk, live) {
  const status = !started(wk.date) ? ['soon', 'Coming up'] : wk.date === live ? ['live', 'Live now'] : ['past', 'Finished'];
  const forWhom = wk.subject === 'english' ? setLabel(wk.set) : null;
  return h('div', { class: 'week' + (status[0] === 'live' ? ' live' : '') },
    h('div', { class: 'week-head' },
      h('span', { class: 'badge ' + status[0] }, status[1]),
      forWhom && wk.set !== setFilter ? h('span', { class: 'badge set' }, forWhom) : null,
      h('span', { class: 'week-title' }, (wk.unit ? wk.unit + ' · ' : '') + 'from ' + nice(wk.date)),
      h('span', { class: 'week-meta' }, `${wk.words.length} words` + (wk.test ? ` · test ${nice(wk.test)}` : ''))),
    h('div', { class: 'week-words' }, wk.words.map((w) => h('span', {}, w.word, wk.subject === 'spanish' && w.meaning ? h('small', {}, ' ' + w.meaning) : null))),
    h('div', { class: 'week-btns' },
      h('button', { class: 'btn btn-ghost', onclick: () => { editing = wk; render(); $('#editor').scrollIntoView({ behavior: 'smooth' }); } }, '✏️ Edit'),
      h('a', { class: 'btn btn-ghost', href: `../?date=${wk.date}`, target: '_blank' }, '👀 Try it'),
      h('button', { class: 'btn btn-ghost', onclick: () => {
        if (!confirm(`Delete the list that starts ${nice(wk.date)}?`)) return;
        weeks = weeks.filter((w) => w !== wk); if (editing === wk) editing = null; dirty = true; render();
      } }, '🗑️ Delete')));
}
function weekList() {
  const list = shownWeeks();
  const live = liveDate(list);
  const current = list.filter((w) => w.date >= live);
  const past = list.filter((w) => w.date < live);
  const title = subject() === 'spanish' ? '🇪🇸 Spanish lists' : `📝 English lists – ${setLabel(setFilter)}`;
  return h('section', { class: 'p-card' },
    h('h2', {}, title),
    list.length ? null : h('p', { class: 'small' }, 'No lists yet – add one above.'),
    current.map((w) => weekCard(w, live)),
    past.length ? h('details', { class: 'past' }, h('summary', {}, `Finished lists (${past.length})`), past.map((w) => weekCard(w, live))) : null);
}

/* ---------- students ---------- */
async function loadStudents() {
  try { students = (await api('admin.php', { password, action: 'users' })).users; studentsDirty = false; }
  catch { students = []; }
}
const newPin = () => String(Math.floor(1000 + Math.random() * 9000));
function studentsCard() {
  if (!unlocked) return h('section', { class: 'p-card' }, h('h2', {}, '👧 Students'),
    h('p', {}, server.ready ? 'Unlock above with the grown-ups’ password to add students and choose their English group.' : 'Students need PHP and a password set up on your website – see the README.'));
  const sets = allSets();
  const msg = h('div', { class: 'help', 'aria-live': 'polite' }, studentsNote);
  studentsNote = '';
  const rows = students.map((u, i) => {
    const touch = () => { studentsDirty = true; updateStatus(); };
    const setSel = h('select', { onchange: (e) => {
      if (e.target.value === '__new') {
        const n = norm(prompt('Name of the new group (for example set3):') || '');
        if (n) u.set = n; render(); touch(); return;
      }
      u.set = e.target.value; touch();
    } }, sets.map((s) => h('option', { value: s, selected: s === norm(u.set) }, setLabel(s))), h('option', { value: '__new' }, '+ New group…'));
    return h('tr', {},
      h('td', {}, h('input', { type: 'text', value: u.name, 'aria-label': 'Name', oninput: (e) => { u.name = e.target.value; touch(); } })),
      h('td', {}, setSel),
      h('td', {}, h('input', { type: 'text', value: u.pin, inputmode: 'numeric', class: 'pin', 'aria-label': 'PIN', oninput: (e) => { u.pin = e.target.value.trim(); touch(); } })),
      h('td', {}, h('button', { class: 'btn btn-ghost btn-small', 'aria-label': 'Remove ' + u.name, onclick: () => {
        if (!confirm(`Remove ${u.name || 'this student'}? Their old scores stay saved.`)) return;
        students.splice(i, 1); studentsDirty = true; render();
      } }, '🗑️')));
  });
  async function save() {
    const names = students.map((u) => norm(u.name)).filter(Boolean);
    if (new Set(names).size !== names.length) { msg.textContent = '⚠️ Two students have the same name. Please make them different (e.g. add an initial).'; return; }
    try {
      await api('admin.php', { password, action: 'save_users', users: students.filter((u) => u.name.trim()) });
      await loadStudents(); studentsNote = '✓ Students saved. They’ll appear on the game’s “Who’s playing?” screen.'; render();
    } catch (e) { msg.textContent = '⚠️ ' + e.message; }
  }
  return h('section', { class: 'p-card' },
    h('h2', {}, '👧 Students'),
    h('p', { class: 'small' }, 'Each child picks their name when they open the game. Their group decides which English words they get (everyone gets the same Spanish). Give each family their child’s PIN so they can see scores on the 📊 Scores page.'),
    students.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'students' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'English group'), h('th', {}, 'PIN'), h('th', {}, ''))),
      h('tbody', {}, rows))) : h('p', {}, 'No students yet.'),
    msg,
    h('div', { class: 'actions', style: 'justify-content:flex-start' },
      h('button', { class: 'btn btn-ghost', onclick: () => { students.push({ name: '', set: setFilter || 'set1', pin: newPin() }); studentsDirty = true; render(); app.querySelector('tbody tr:last-child input')?.focus(); } }, '➕ Add student'),
      h('button', { class: 'btn btn-go', onclick: save }, '💾 Save students')));
}

/* ---------- saving words ---------- */
let statusEl;
function saveBar() {
  statusEl = h('div', { class: 'save-status', 'aria-live': 'polite' });
  return h('div', { class: 'savebar' }, h('div', { class: 'savebar-in' },
    statusEl,
    unlocked ? h('button', { class: 'btn btn-go', onclick: saveWords }, '💾 Save words') : null,
    h('button', { class: 'btn btn-ghost', onclick: download }, '⬇️ Download words.csv')));
}
let flashMsg = null;
function flash(text, kind = 'ok') { flashMsg = { text, kind }; updateStatus(); }
function updateStatus() {
  if (!statusEl) return;
  let text, kind;
  if (flashMsg) ({ text, kind } = flashMsg);
  else if (dirty || studentsDirty) {
    const what = [dirty && 'words', studentsDirty && 'students'].filter(Boolean).join(' and ');
    text = unlocked ? `● You have changes to ${what} that aren’t saved yet.` : `● Changes to ${what} aren’t saved yet.` + (server.ready ? ' Unlock above to save.' : ' Download words.csv and upload it to your website.');
    kind = 'dirty';
  } else { text = unlocked ? '✓ Everything is saved.' : (server.ready ? 'Unlock above to save changes.' : 'To publish changes: download words.csv and upload it to the game folder.'); kind = unlocked ? 'ok' : ''; }
  statusEl.textContent = text;
  statusEl.className = 'save-status ' + (kind || '');
  flashMsg = null;
}
async function saveWords() {
  flash('Saving…', '');
  try { await api('admin.php', { password, action: 'save_words', csv: toCSV() }); dirty = false; flash('✓ Words saved! The children will see them next time the game opens.'); }
  catch (e) { flash('⚠️ Not saved: ' + e.message, 'err'); }
}
function download() {
  const blob = new Blob(['﻿' + toCSV()], { type: 'text/csv;charset=utf-8' });
  const a = h('a', { href: URL.createObjectURL(blob), download: 'words.csv' });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  if (!unlocked) { dirty = false; flash('⬇️ Downloaded. Now upload words.csv to the game folder on your website, replacing the old one.'); }
  else flash('⬇️ Downloaded a copy.');
}
window.addEventListener('beforeunload', (e) => { if (dirty || studentsDirty) { e.preventDefault(); e.returnValue = ''; } });

/* ---------- start ---------- */
(async function start() {
  try { const j = await api('users.php'); server = { php: true, ready: !!j.ready }; } catch { server = { php: false, ready: false }; }
  try { weeks = await fetchWeeks(); }
  catch (e) { app.replaceChildren(h('div', { class: 'p-card' }, h('h1', {}, 'Couldn’t open words.csv'), h('p', {}, e.message))); return; }
  const saved = Store.get('adminPw', '');
  if (server.ready && saved) {
    try { await api('admin.php', { password: saved, action: 'check' }); password = saved; unlocked = true; await loadStudents(); }
    catch { Store.del('adminPw'); }
  }
  render();
})();
