# CFB Board

Personal college football board: weekly FBS slate, Top 25, conference standings and games, AP and ESPN FPI
rankings, live scores and box scores, team schedules, Kalshi/Polymarket odds, a poll-vs-FPI-vs-market
view, pregame excitement scores, themes (gear button), and pins and picks (saved in your browser).

## Run locally
    python3 -m http.server 8000
then open http://localhost:8000. The app uses ES modules, so it must be served over HTTP;
opening index.html straight from disk won't work.

## Deploy to GitHub Pages
1. Push this folder to a repo.
2. Settings → Pages → Deploy from branch → `main` / root.
3. Settings → Actions → General → Workflow permissions → Read and write.
4. Actions tab → "Refresh market odds" → Run workflow once to seed `data/markets.json`.

## Layout
    index.html            shell: header, tabs, drawer
    css/app.css           all styles (light/dark tokens at the top)
    js/main.js            boot, tab registry, event delegation
    js/state.js           shared state + batched rendering (invalidate('main'|'detail'|'header'))
    js/api.js             every ESPN request, with a per-URL session cache and in-flight dedupe
    js/models.js          ESPN payload → small plain objects
    js/data.js            loaders (scoreboard polling, standings, FPI, per-game predictor)
    js/markets.js         Kalshi / Polymarket / sportsbook matching
    js/excitement.js      pregame excitement score + in-game excitement index
    js/picks.js           pins and picks (localStorage)
    js/settings.js        appearance (system/light/dark) and theme palettes
    js/detail.js          drawer + hash routing (#team/ID, #game/ID)
    js/resource.js        render-time fetch hook for drawer views
    js/views/*.js         one file per view; components.js holds shared pieces

Adding a tab means adding a file in `js/views/` and one line in the `TABS` list in `main.js`.

## Data
- Games, scores, rankings, logos, sportsbook lines: ESPN scoreboard.
- Team schedules, box scores, drives, win probability: ESPN team schedule + game summary.
- Standings: ESPN standings. Rankings: ESPN AP poll + FPI.
- Per-game FPI win probability and Matchup Quality: ESPN predictor.
- Kalshi: series `KXNCAAFGAME`. Polymarket: Gamma API, `cfb` tag. The page reads
  `data/markets.json` first, then tries the market APIs directly, then falls back to
  de-vigged sportsbook moneylines.

None of these need an API key.

## Excitement score
A 0-100 pregame score, shown as an itemized sum on every card (tap "Why?"):
- Matchup quality, up to 55: ESPN's Matchup Quality (both teams' FPI strength and how even they are).
- Competitiveness, up to 25: how close the market price is to 50/50.
- Scoring pace, up to 10: the over/under, or both teams' points per game when there's no total.
- Stakes, up to 10: ranked teams, conference game, both teams with 1 loss or fewer.

Box scores also show an in-game excitement index, the total swing in ESPN's win probability during the game.
