# Word Game 🚀

A small, dyslexia-friendly website with games for weekly **English spelling** and **Spanish** words.
The words come from one file, `words.csv`, and each week's words switch on by themselves on the date you give them.

## The games

| Game | What it does | English | Spanish |
|---|---|:-:|:-:|
| 🎧 **Listen & Spell** | Says the word (normal, slow, or in a sentence) and he types it. Letters he got right go green. After two tries it shows the word and he copies it. | ✅ | ✅ |
| 🧱 **Word Builder** | Tap shuffled letter blocks to build the word. No typing needed. | ✅ | ✅ |
| 🔍 **Missing Letters** | Pick the missing letters. Wrong answers are letters that are easy to mix up (b/d/p, m/n, vowels). | ✅ | ✅ |
| 🃏 **Memory Match** | Flip cards to match each Spanish word to its English meaning. Every card is read out loud. | * | ✅ |
| ⚡ **Quick Pick** | Choose the right meaning, or the right Spanish word for an English meaning. | * | ✅ |

\* Only shows up if you fill in the `meaning` column for English words.

Each go gives a score and **1–3 stars**. It also lists the **words to practise again** with a "Practise just these" button. The home page shows how many stars he has won this week. Best scores are saved in the browser on that device.

It is built to be easy to read with dyslexia: a cream background, the Lexend font, extra space between letters, big buttons, every word read aloud, no timers, and orange (not red) for mistakes. The ⚙️ Settings button has options for extra-big letters, talking speed, sound and auto read-aloud.

## Students and scores

Several children can use the same game. When a child opens it, they tap their name on a **"Who's playing?"** screen. The device remembers them, and there's a "Change player" button on the home screen.

- Every child gets the same Spanish words.
- English words come in **groups** (Set 1, Set 2, and so on). Each child gets their own group's English lists.
- After every game, the score and the words they found tricky are saved on your website.

This part needs your web host to run **PHP**. Most normal web hosting (cPanel, Plesk and similar) does. Without PHP, the game still works for one child as before, with no name screen and no scores page.

### One-time setup

1. Upload everything (see "Putting it on your website" below).
2. In the `api` folder on your website, copy `config.example.php` to `config.php`. Open it and change `change-me` to a password of your own. This is the **grown-ups' password**.
3. Go to **`/parentswords/`**, unlock it with that password, open the **👧 Students** tab and add each child: name, English group and a PIN (one is made up for you). Press **Save students**.
4. Give each family their child's name and PIN so they can see scores at **`/parents/`**.

The web server needs to be allowed to create a `data` folder next to the game and to write `words.csv`. Usually this just works. If saving says it can't write, ask your host about folder permissions.

The students list and the scores are kept in the `data` folder, in files that the web server refuses to show to anyone who types their address. Scores are kept as one row per game played, so you can see a history week by week.

### `/parents/`: scores

Choose a student and type their PIN (the grown-ups' password also works for any child). It shows:

- **This week**, for English and for Spanish: the words, how many goes, stars won, days played, best score in each game, and the **words that were tricky** (and how often).
- **Earlier weeks**: goes, average score and the trickiest words for each past list.
- **Every game played**, with the date and time.

### `/parentswords/`: words and students

- **English / Spanish tabs**: pick the start date (it suggests the next Tuesday for English and the next Thursday for Spanish, at midday), add a test day and list name if you like, then type or paste the words, one per line.
  - English: `because`, or `because - I stayed in because it rained.` to add a sentence that gets read out.
  - Spanish: `el perro - the dog`.
  - For English, choose which group the list is **for**: Set 1, Set 2, or **Everyone**. The group buttons at the top show who is in each group.
- Every list shows as **Live now**, **Coming up** or **Finished**, with buttons to ✏️ Edit, 👀 Try it (opens the game as if it were that date) or 🗑️ Delete.
- Press **💾 Save words** (after unlocking), or **⬇️ Download** and upload `words.csv` yourself.
- Each save keeps the previous `words.csv` in `data/backups/` (the last 30).
- **👧 Students tab**: add, rename or remove children, change their group or PIN. Removing a child keeps their old scores.

## Adding each week's words by hand

Open `words.csv` in Excel, Google Sheets, Numbers or Notepad. Each row is one word:

```
date,subject,word,meaning,sentence,test,unit,set
01/12/2026,english,island,,We sailed to a small island.,08/12/2026,,set1
26/11/2026,spanish,aunque,even though,,03/12/2026,8A 1-6,
```

- **date**: the day those words start. They switch on at **12:00 midday** that day, straight after the test: Tuesdays for English, Thursdays for Spanish. Use `30/11/2026` (day first) or `2026-11-30`.
- **subject**: `english` or `spanish`.
- **word**: the spelling word, or the Spanish word. Include accents (á é í ó ú ñ). In Listen & Spell, a missed accent still counts as right, but the game points it out.
- **meaning**: the English meaning for Spanish words. For English words, leave it empty or write a short clue.
- **sentence**: optional. An example sentence that is read out loud, with the word blanked out on screen.
- **test** and **unit**: optional. The test date and the list's name (like `8A 1-6`), shown at the top of the page as "8A 1-6 · Test on Thursday 3 December".
- **set**: which group of children an English list is for (`set1`, `set2`…). Leave it empty for everyone. Spanish is always empty.

The game always uses **the newest week whose date has passed**. You can add several weeks at once, and each one switches on by itself on its date. Leave old weeks in the file: he can still practise them from the "Practise another week" menu.

When you save from Excel, choose **CSV UTF-8** so accents survive.

The Spanish words for the whole year (Year 6 list, 7A 1-6 to 9B 25-30) are already in the file. Each Spanish list switches on at midday on the Thursday of the previous test, so the old list is still there on the morning of its test.

**Check a future week early:** add `?date=2026-12-07` to the end of the web address (that shows it as at midday). Add a time to check a morning: `?date=2026-12-01T11:00`.

## Putting it on your website

Upload these files and folders to the same folder on your site, for example `yoursite.com/words/`:

```
index.html
style.css
app.js
words.csv
api/            (the server part – needs PHP; include the hidden .htaccess)
parents/        (the scores page)
parentswords/   (the words and students page)
```

When you upload updates later, don't overwrite or delete the `data` folder on your website (it holds the students and scores) or your `api/config.php` (it holds your password).

To change the words, upload a new `words.csv` over the old one. The game always loads a fresh copy.

**Reading aloud** uses the browser's built-in voices. On iPads and iPhones, Safari has good British English and Spanish voices built in. On Windows, Edge has the best voices. Make sure the device isn't on silent.

### Trying it on your computer first

Opening `index.html` by double-clicking it won't let the browser read `words.csv`. That is a browser safety rule. The page will offer a **"Choose words.csv"** button as a fallback. Or you can run a tiny local server from this folder:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Names

Children's names come from the Students list. With no students set up (or no PHP), the game just says "Hi there!".
