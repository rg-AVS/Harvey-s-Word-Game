# Harvey's Word Game 🚀

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

## Parents' corner (the easy way to add words)

Go to **`/parents/`** in the game's folder, for example `yoursite.com/words/parents/`. You can also get there from ⚙️ Settings → "For grown-ups" in the game.

- Choose **English** or **Spanish**, pick the start date (it suggests the next Monday), add a test day and list name if you like, then type or paste the words, one per line.
  - English: `because`, or `because - I stayed in because it rained.` to add a sentence that gets read out.
  - Spanish: `el perro - the dog`.
- Every list shows as **Live now**, **Coming up** or **Finished**, with buttons to ✏️ Edit, 👀 Try it (opens the game as if it were that date) or 🗑️ Delete.
- Then press **💾 Save** (needs PHP, see below) or **⬇️ Download** and upload `words.csv` yourself.

### Turning on "Save" (one-time setup)

Saving straight from the page needs your web host to run **PHP**. Most normal web hosting (cPanel, Plesk and similar) does.

1. In the `parents` folder on your website, copy `config.example.php` to `config.php`.
2. Open `config.php` and change `change-me` to a password of your own.
3. Make sure the web server is allowed to write to `words.csv` and to create the `parents/backups` folder. Usually this works without changing anything. If saving says it can't write, ask your host about folder permissions.

The page then shows a password box and a Save button. Each save keeps the previous version in `parents/backups/` (the last 30), in case of mistakes.

If your host doesn't run PHP, the Save button won't appear and you use Download instead. In that case, **don't** upload a `config.php`: without PHP running, anyone could open it in a browser and read the password.

## Adding each week's words by hand

Open `words.csv` in Excel, Google Sheets, Numbers or Notepad. Each row is one word:

```
date,subject,word,meaning,sentence,test,unit
30/11/2026,english,island,,We sailed to a small island.,,
27/11/2026,spanish,aunque,even though,,03/12/2026,8A 1-6
```

- **date**: the day those words start, usually the Monday. Use `30/11/2026` (day first) or `2026-11-30`.
- **subject**: `english` or `spanish`.
- **word**: the spelling word, or the Spanish word. Include accents (á é í ó ú ñ). In Listen & Spell, a missed accent still counts as right, but the game points it out.
- **meaning**: the English meaning for Spanish words. For English words, leave it empty or write a short clue.
- **sentence**: optional. An example sentence that is read out loud, with the word blanked out on screen.
- **test** and **unit**: optional. The test date and the list's name (like `8A 1-6`), shown at the top of the page as "8A 1-6 · Test on Thursday 3 December".

The game always uses **the newest week whose date has passed**. You can add several weeks at once, and each one switches on by itself on its date. Leave old weeks in the file: he can still practise them from the "Practise another week" menu.

When you save from Excel, choose **CSV UTF-8** so accents survive.

The Spanish words for the whole year (Year 6 list, 7A 1-6 to 9B 25-30) are already in the file. Each list switches on the Friday after the previous Thursday test, so it shows for the six days up to and including its own test day.

**Check a future week early:** add `?date=2026-12-07` to the end of the web address.

## Putting it on your website

It's plain static files with no server code and no database. Upload these files to the same folder on your site, for example `yoursite.com/words/`:

```
index.html
style.css
app.js
words.csv
parents/   (the whole folder: index.html, parents.js, parents.css, save.php, config.example.php, .htaccess)
```

To change the words, upload a new `words.csv` over the old one. The game always loads a fresh copy.

**Reading aloud** uses the browser's built-in voices. On iPads and iPhones, Safari has good British English and Spanish voices built in. On Windows, Edge has the best voices. Make sure the device isn't on silent.

### Trying it on your computer first

Opening `index.html` by double-clicking it won't let the browser read `words.csv`. That is a browser safety rule. The page will offer a **"Choose words.csv"** button as a fallback. Or you can run a tiny local server from this folder:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Changing the name

The name "Harvey" is set at the top of `app.js` (`KID_NAME`) and in the `<title>` in `index.html`.
