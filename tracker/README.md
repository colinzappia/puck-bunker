# Puck Bunker: daily prospect points

This runs the 2027 NHL Draft prospect points update automatically every morning and shows it on the **Prospect Tracker** page of PuckBunker.com (`prospect-tracker.html`).

Everything lives in the website's own GitHub repository: the update scripts and data are in this `tracker/` folder, the daily job is in `.github/workflows/daily.yml`, and the page that displays the numbers is `prospect-tracker.html` at the top level. Each morning the job saves fresh numbers into `tracker/data/points.json`, and Vercel redeploys the site automatically.

## How each league is covered

| Leagues | Source | Accuracy |
|---|---|---|
| OHL, WHL, QMJHL, USHL/NTDP | Official league game summaries (`daily_points.py`) | **Official**: every goal and assist, by player ID |
| Europe, Russia, NCAA | **1. Elite Prospects official data feed (API)**, if you add a key | **Official**: per-game goals, assists, goals against, saves |
| | **2. Manual entries** in `data/manual.json` | Whatever you enter, e.g. from the daily updates with Claude |
| | **3. Elite Prospects public player pages**, as a fallback | Season-total changes from one day to the next (see below) |

For each player and date, the script keeps the best source available: API first, then manual entries, then public pages.

**How the public-page fallback works.** Each morning, `europe_points.py` saves every player's season totals and compares them with the day before.
- If his totals went up and **exactly one game** was played since the last check, the points go on that game's date. They're counted, and marked with * on the site.
- If **more than one game** was played since the last check, the points are listed as **Probable (not counted)** with the possible dates.
- Goalies aren't read from public pages, because those pages show goals-against average, not goals against per game. Goalie games come from the API or manual entries only.
- The first run only records totals, so public-page points start appearing from the second morning on.

## Files (all paths are inside the website repository)

- **`tracker/daily_points.py`**: OHL, WHL, QMJHL and USHL. **`tracker/players.json`** lists the tracked players in those leagues.
- **`tracker/europe_points.py`**: Europe, Russia and NCAA. **`tracker/players_europe.json`** lists those players, each with an Elite Prospects player number (`ep_id`).
- **`tracker/data/points.json`**: all results, which the Prospect Tracker page reads. It's preloaded with Oct 13–18.
- **`tracker/data/manual.json`**: hand-entered rows. It's preloaded with the Oct 13–18 European results, plus the "probable" ones.
- **`tracker/data/ep_snapshots.json`**: yesterday's season totals, used by the public-page fallback. It's created automatically.
- **`.github/workflows/daily.yml`**: runs both scripts every morning on GitHub (free) and saves the results.
- **`prospect-tracker.html`**: the page on the website. It has a tab for each day plus Totals, shows goalies with 2 or fewer goals against, and lists probable points separately.

## Set it up (about 10 minutes, no coding)

1. **Upload the `tracker` folder** to the website repository on GitHub: **Add file → Upload files**, drag in the whole `tracker` folder, then **Commit changes**.
2. **Add the daily job:** **Add file → Create new file**. In the name box type `.github/workflows/daily.yml` (typing the slashes creates the folders). Paste in the contents of `daily.yml`, then **Commit changes**.
3. **Upload the new and updated web pages** (`prospect-tracker.html`, plus the pages that now show the Prospect Tracker menu link, and `api/sitemap.js`).
4. **Allow the daily run to save its results** (only needed if the first run reports a permissions error): **Settings → Actions → General → Workflow permissions**, choose **Read and write permissions**, and click **Save**.
5. **Optional, the Elite Prospects API key:** once you have a key, go to **Settings → Secrets and variables → Actions → New repository secret**. Name it `EP_API_KEY` and paste the key. Nothing else changes, and the European numbers become official from the next run.
6. **Run it once to test:** go to **Actions → Daily prospect points → Run workflow**. A green check means it worked. From then on it runs every morning around 7:30 am Toronto time.
7. **Check the page:** open `puckbunker.com/prospect-tracker.html`. After each daily run, Vercel redeploys in about a minute and the page shows the new numbers.

## Everyday use

- **Add or move a player:**
  - In the OHL, WHL, QMJHL or USHL, edit `tracker/players.json`.
  - Elsewhere, edit `tracker/players_europe.json` and include the number from his Elite Prospects address. For `eliteprospects.com/player/1010942/milan-sundstrom`, that's `1010942`.
- **Players still missing an Elite Prospects number:** Lazovsky, Martinek, Havel, Pikna, Rautio, Lacelle, Hanson. Add them once you have their pages.
- **Hand-entered results:** add rows to `tracker/data/manual.json`. The format is in the file's notes. Mark anything unconfirmed with `"confidence": "probable"`.
- **Re-run a past date:** Actions → Run workflow, then enter the start and end dates. This re-runs the league feeds, the API and manual entries. The public-page fallback only ever works "since yesterday".
- **Problems** are listed under `"problems"` in `tracker/data/points.json`, and the run shows a red X if something fails outright.
- **How many days show:** the page has a tab for the last 7 days. To change that, edit `DAYS_SHOWN` near the bottom of `prospect-tracker.html`.

## If Elite Prospects' public pages can't be read

- **Pages refuse the request** (status 403 or 429): Elite Prospects may block GitHub's servers. The API isn't affected by this.
- **"Could not read season stats":** the page layout may have changed. Run this, then send Claude the saved `debug_ep_1010942.html` so the reader can be adjusted:
  ```
  python europe_points.py --debug-ep 1010942
  ```
- **Note:** the public-page reader was written without access to live pages and tested on sample pages, so expect to adjust it after the first real run.

## Before going public

- **League stats:** they come from the leagues' official feeds, which the leagues own. The page credits its sources at the bottom. Check that each league is fine with republishing, especially since the site earns money.
- **Elite Prospects data:** Elite Prospects sells access to its data. The API route is the licensed one, and it also fixes the accuracy gaps. Reading their public pages automatically goes against that business, and they may block it. Use the fallback knowing that.
- **Feed keys:** the HockeyTech feed keys in `daily_points.py` are the public ones the league websites use themselves. If a league changes its key, that league's run fails until it's updated.
- **Everything in this repository is public**, including the files in `tracker/`. That is fine for this project (there are no passwords in it; the optional Elite Prospects key lives in GitHub's secrets, not in the files), but never paste a private key into any file here.
