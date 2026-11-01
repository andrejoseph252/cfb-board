"""Each finished FBS game's excitement index, kept in data/excitement.json, so final cards can show it.

The index is the game drawer's number (realizedExcitement in js/excitement.js): the total swing in ESPN's per-play
win probability, after the same 3-point median that parseProbabilities in js/models.js uses to remove one-play
glitches. Working it out takes a ~100 KB per-play feed per game, so it's done here once per game instead of in every
visitor's browser. A finished game's feed doesn't change, so a game is only ever fetched once. Standard library only.

    {"updated": "...", "g": {"401858282": [1.93, 0, "2026-10-25"]}}

Each entry is [index, times the favorite flipped, kickoff date]. Entries older than 200 days are dropped.

    python3 scripts/excitement.py              # the GitHub Action: this week's finished games not yet saved
    python3 scripts/excitement.py --backfill   # once: every finished game this season
"""
import json
import pathlib
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone

SITE = "https://site.api.espn.com/apis/site/v2/sports/football/college-football"
CORE = "https://sports.core.api.espn.com/v2/sports/football/leagues/college-football"
OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "excitement.json"


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "cfb-board/1.0", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def load():
    try:
        return json.loads(OUT.read_text()).get("g", {})
    except (OSError, ValueError):
        return {}


def save(games):
    cutoff = (datetime.now(timezone.utc) - timedelta(days=200)).date().isoformat()
    keep = {k: v for k, v in games.items() if v[2] > cutoff}
    OUT.write_text(json.dumps({"updated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "g": keep}, separators=(",", ":")))
    return len(keep)


def index(gid):
    """[index, flips] from ESPN's per-play feed, or None when it has too few points (as the drawer shows none)."""
    items = get(f"{CORE}/events/{gid}/competitions/{gid}/probabilities?limit=1000").get("items", [])
    pts = [p["homeWinPercentage"] for p in sorted(items, key=lambda x: float(x.get("sequenceNumber") or 0)) if p.get("homeWinPercentage") is not None]
    if len(pts) < 5:
        return None
    wp = [pts[0]] + [sorted(pts[i - 1:i + 2])[1] for i in range(1, len(pts) - 1)] + [pts[-1]]
    swing = sum(abs(b - a) for a, b in zip(wp, wp[1:]))
    # A flip only when the favorite changes decisively (past 55/45), not wobbles around 50%.
    flips, side = 0, 1 if wp[0] >= .5 else -1
    for p in wp:
        if side > 0 and p <= .45:
            flips, side = flips + 1, -1
        elif side < 0 and p >= .55:
            flips, side = flips + 1, 1
    return [round(swing, 2), flips]


def add(games, events):
    added = 0
    for ev in events:
        if ev["id"] in games or not ev["status"]["type"].get("completed"):
            continue
        try:
            x = index(ev["id"])
        except Exception as e:
            print(f"{ev['id']}: {e}")
            continue
        if x:
            games[ev["id"]] = x + [ev["date"][:10]]
            added += 1
        time.sleep(.15)
    return added


def week_events(week=None, season_type=2):
    return get(f"{SITE}/scoreboard?groups=80&limit=400" + (f"&week={week}&seasontype={season_type}" if week else "")).get("events", [])


def update():
    games = load()
    added = add(games, week_events())
    print(f"excitement: {added} games added, {save(games)} kept")


def backfill():
    games, added = load(), 0
    first = get(f"{SITE}/scoreboard?groups=80&limit=400")
    season_type, cur = first.get("season", {}).get("type", 2), first.get("week", {}).get("number") or 1
    for week in range(1, cur + 1):
        added += add(games, first.get("events", []) if week == cur else week_events(week, season_type))
        print(f"week {week}: {added} so far")
    print(f"backfill: {added} games added, {save(games)} kept")


if __name__ == "__main__":
    backfill() if "--backfill" in sys.argv else update()
