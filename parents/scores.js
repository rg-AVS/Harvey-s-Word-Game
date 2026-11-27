'use strict';
/* =====================================================================
   /parents – see how a child is getting on. Needs the child's PIN
   (or the grown-ups' password). Uses helpers from shared.js
   ===================================================================== */

const app = $('#app');
let users = [];
let weeks = [];

const stars = (n) => '⭐'.repeat(n) + '☆'.repeat(3 - n);
const pct = (s, m) => (m ? Math.round((s / m) * 100) : 0);
const when = (t) => { const [d, time] = t.split(' '); return `${niceShort(d)} ${time || ''}`.trim(); };

function topLinks() {
  return h('div', { class: 'p-top' }, h('a', { href: '../' }, '← Back to the game'), h('a', { href: '../parentswords/' }, '✏️ Words & students'));
}

function loginScreen(message) {
  const remembered = Store.get('scoresLogin', null);
  const sel = h('select', { class: 'big-select' },
    h('option', { value: '' }, 'Choose…'),
    users.map((u) => h('option', { value: u.name, selected: remembered && remembered.name === u.name }, u.name)));
  const pin = h('input', { type: 'password', inputmode: 'numeric', autocomplete: 'off', placeholder: 'PIN' });
  const remember = h('input', { type: 'checkbox', checked: true });
  const msg = h('p', { class: 'help', 'aria-live': 'polite' }, message || '');
  const go = () => {
    if (!sel.value) { msg.textContent = '⚠️ Choose a student first.'; return; }
    if (!pin.value) { msg.textContent = '⚠️ Type the PIN.'; pin.focus(); return; }
    show(sel.value, pin.value, remember.checked);
  };
  pin.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  app.replaceChildren(topLinks(),
    h('h1', {}, 'Scores 📊'),
    h('p', { class: 'small' }, 'See how your child is getting on with this week’s words.'),
    users.length ? h('section', { class: 'p-card login' },
      h('label', { class: 'field' }, 'Which student?', sel),
      h('label', { class: 'field', style: 'margin-top:12px' }, 'Their PIN', pin),
      h('label', { class: 'remember', style: 'margin-top:8px' }, remember, 'Remember on this device'),
      msg,
      h('div', { class: 'actions', style: 'justify-content:flex-start' }, h('button', { class: 'btn btn-go', onclick: go }, 'Show scores')),
      h('p', { class: 'help' }, 'Don’t know the PIN? Ask whoever runs the game. The grown-ups’ password works here too.'))
      : h('section', { class: 'p-card' }, h('p', {}, 'No students have been added yet. Add them on the ', h('a', { href: '../parentswords/' }, 'Words & students'), ' page (Students tab).')));
}

async function show(name, pin, remember) {
  app.replaceChildren(topLinks(), h('div', { class: 'loading' }, 'Loading scores…'));
  let data;
  try { data = await api('scores.php', { name, pin }); }
  catch (e) { Store.del('scoresLogin'); return loginScreen('⚠️ ' + e.message); }
  if (remember) Store.set('scoresLogin', { name, pin }); else Store.del('scoresLogin');
  report(data, () => show(name, pin, false));
}

function gameTable(rows) {
  const byGame = {};
  for (const r of rows) (byGame[r.game] ||= []).push(r);
  const ids = Object.keys(GAME_NAMES).filter((g) => byGame[g]);
  if (!ids.length) return null;
  return h('div', { class: 'table-wrap' }, h('table', { class: 'score-table' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Game'), h('th', {}, 'Goes'), h('th', {}, 'Best'), h('th', {}, 'Last played'))),
    h('tbody', {}, ids.map((g) => {
      const list = byGame[g];
      const best = list.reduce((a, b) => (pct(b.score, b.max) > pct(a.score, a.max) ? b : a));
      return h('tr', {},
        h('td', {}, GAME_NAMES[g]),
        h('td', {}, list.length),
        h('td', {}, h('span', { class: 'stars' }, stars(best.stars)), h('br'), h('small', {}, `${best.score}/${best.max} (${pct(best.score, best.max)}%)`)),
        h('td', {}, h('small', {}, when(list[list.length - 1].time))));
    }))));
}

function trickyBox(rows) {
  const count = {};
  rows.forEach((r) => r.tricky.forEach((w) => { count[w] = (count[w] || 0) + 1; }));
  const list = Object.entries(count).sort((a, b) => b[1] - a[1]);
  if (!list.length) return null;
  return h('div', {}, h('h3', {}, '🧠 Words that were tricky'),
    h('p', { class: 'help' }, 'Words not got right first time, and how many times. Worth a little extra practice.'),
    h('div', { class: 'week-words' }, list.map(([w, n]) => h('span', { class: n >= 3 ? 'hot' : '' }, w, h('small', {}, ` ×${n}`)))));
}

function subjectCard(subj, user, scores) {
  const S = SUBJECTS[subj];
  const lists = forSet(weeks, subj, user.set);
  const live = liveDate(lists);
  const wk = lists.filter((w) => w.date === live);
  const words = wk.flatMap((w) => w.words);
  const test = wk.map((w) => w.test).find(Boolean);
  const unit = wk.map((w) => w.unit).find(Boolean);
  const rows = scores.filter((r) => r.subject === subj && r.week === live);
  const real = rows.filter((r) => !r.practice);
  const bestStars = Object.keys(GAME_NAMES).reduce((n, g) => n + Math.max(0, ...real.filter((r) => r.game === g).map((r) => r.stars)), 0);
  return h('section', { class: 'p-card' },
    h('h2', {}, `${S.emoji} ${S.name} – this week`),
    live ? h('p', { class: 'small' }, [unit, `from ${nice(live)}`, test ? `test ${nice(test)}` : null].filter(Boolean).join(' · ')) : h('p', {}, 'No words yet.'),
    words.length ? h('div', { class: 'week-words' }, words.map((w) => h('span', {}, w.word))) : null,
    h('div', { class: 'stat-row' },
      h('div', { class: 'stat' }, h('b', {}, rows.length), h('span', {}, rows.length === 1 ? 'go this week' : 'goes this week')),
      h('div', { class: 'stat' }, h('b', {}, `⭐ ${bestStars}`), h('span', {}, 'stars won')),
      h('div', { class: 'stat' }, h('b', {}, new Set(rows.map((r) => r.time.slice(0, 10))).size), h('span', {}, 'days played'))),
    rows.length ? [gameTable(rows), trickyBox(rows)] : h('p', { class: 'empty' }, 'No games played this week yet.'));
}

function history(user, scores) {
  const groups = new Map();
  for (const r of scores) {
    const key = r.subject + '|' + r.week;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const lives = { english: liveDate(forSet(weeks, 'english', user.set)), spanish: liveDate(forSet(weeks, 'spanish', user.set)) };
  const rows = [...groups.entries()].filter(([k]) => { const [s, w] = k.split('|'); return w !== lives[s]; })
    .sort((a, b) => b[0].split('|')[1].localeCompare(a[0].split('|')[1]));
  if (!rows.length) return null;
  const unitOf = (subj, date) => (forSet(weeks, subj, user.set).find((w) => w.date === date && w.unit) || {}).unit;
  return h('section', { class: 'p-card' },
    h('h2', {}, '📅 Earlier weeks'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'score-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Week'), h('th', {}, 'Goes'), h('th', {}, 'Average'), h('th', {}, 'Tricky words'))),
      h('tbody', {}, rows.map(([k, list]) => {
        const [subj, date] = k.split('|');
        const tricky = {};
        list.forEach((r) => r.tricky.forEach((w) => { tricky[w] = (tricky[w] || 0) + 1; }));
        const worst = Object.entries(tricky).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([w]) => w).join(', ');
        const avg = Math.round(list.reduce((n, r) => n + pct(r.score, r.max), 0) / list.length);
        return h('tr', {},
          h('td', {}, SUBJECTS[subj].emoji, ' ', niceShort(date), unitOf(subj, date) ? h('small', {}, ' ' + unitOf(subj, date)) : null),
          h('td', {}, list.length),
          h('td', {}, avg + '%'),
          h('td', {}, h('small', {}, worst || '–')));
      })))));
}

function recent(scores) {
  if (!scores.length) return null;
  return h('details', { class: 'p-card recent' },
    h('summary', {}, h('b', {}, '🕒 Every game played'), h('small', {}, ` (${scores.length})`)),
    h('div', { class: 'table-wrap' }, h('table', { class: 'score-table' },
      h('tbody', {}, [...scores].reverse().map((r) => h('tr', {},
        h('td', {}, h('small', {}, when(r.time))),
        h('td', {}, SUBJECTS[r.subject].emoji, ' ', GAME_NAMES[r.game] || r.game, r.practice ? h('small', { class: 'tag' }, ' practice') : null),
        h('td', {}, `${r.score}/${r.max}`),
        h('td', {}, h('span', { class: 'stars' }, stars(r.stars)))))))));
}

function report(data, refresh) {
  const user = { name: data.name, set: data.set };
  app.replaceChildren(topLinks(),
    h('h1', {}, `${data.name}’s scores 📊`),
    h('p', { class: 'small' }, `English group: ${setLabel(norm(data.set))} · `,
      h('button', { class: 'linkish', onclick: refresh }, '↻ Refresh'), ' · ',
      h('button', { class: 'linkish', onclick: () => { Store.del('scoresLogin'); loginScreen(); } }, 'Change student')),
    subjectCard('english', user, data.scores),
    subjectCard('spanish', user, data.scores),
    ...[history(user, data.scores), recent(data.scores)].filter(Boolean));
}

(async function start() {
  try { users = (await api('users.php')).users; }
  catch (e) {
    app.replaceChildren(topLinks(), h('h1', {}, 'Scores 📊'), h('section', { class: 'p-card' },
      h('p', {}, 'The scores page needs your website to run PHP, so the game can save each child’s scores. See “Students and scores” in the README.'), h('p', { class: 'help' }, e.message)));
    return;
  }
  try { weeks = await fetchWeeks(); } catch { weeks = []; }
  const saved = Store.get('scoresLogin', null);
  if (saved && users.some((u) => u.name === saved.name)) show(saved.name, saved.pin, true);
  else loginScreen();
})();
