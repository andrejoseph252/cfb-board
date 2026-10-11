"""Closing point spreads for FBS games, kept in data/spreads.json.

ESPN's scoreboard lists each game's sportsbook spread until kickoff, then drops it at the final. This records the
spread on every run while a game is still upcoming, so the last value saved is the closing line, and the board can
still say who covered after the game. Standard library only.

    {"updated": "...", "g": {"401871053": {"s": -3.0, "d": "JXST -3", "k": "2026-10-17T19:00Z"}}}

"s" is the home team's spread (negative: home favored), "d" ESPN's text, "k" kickoff. Entries older than 200 days
are dropped.

    python3 scripts/spreads.py              # the GitHub Action: this week's and next week's upcoming games
    python3 scripts/spreads.py --backfill   # once: every finished game this season, from ESPN's game summaries
"""
import json
import pathlib
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone

SITE = "https://site.api.espn.com/apis/site/v2/sports/football/college-football"
OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "spreads.json"


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "cfb-board/1.0", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def home_spread(o):
    """The home team's spread from an ESPN odds/pickcenter entry, or None."""
    s = o.get("spread")
    if s is None:
        return None
    s = float(s)
    # ESPN's number is from the home side; the favorite flags settle the sign if it ever isn't.
    if o.get("homeTeamOdds", {}).get("favorite") is True and s > 0 or o.get("awayTeamOdds", {}).get("favorite") is True and s < 0:
        s = -s
    return s


def load():
    try:
        return json.loads(OUT.read_text()).get("g", {})
    except (OSError, ValueError):
        return {}


def save(games):
    cutoff = datetime.now(timezone.utc) - timedelta(days=200)
    keep = {k: v for k, v in games.items() if datetime.fromisoformat(v["k"].replace("Z", "+00:00")) > cutoff}
    OUT.write_text(json.dumps({"updated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "g": keep}, separators=(",", ":")))
    return len(keep)


def week_events(week=None, season_type=2):
    url = f"{SITE}/scoreboard?groups=80&limit=400" + (f"&week={week}&seasontype={season_type}" if week else "")
    return get(url)


def update():
    games, n = load(), 0
    first = week_events()
    weeks = [first]
    cur = first.get("week", {}).get("number")
    if cur:   # next week's lines usually open early in the week
        try:
            weeks.append(week_events(cur + 1, first.get("season", {}).get("type", 2)))
        except Exception as e:
            print(f"next week: {e}")
    for sb in weeks:
        for ev in sb.get("events", []):
            comp = ev["competitions"][0]
            odds = (comp.get("odds") or [None])[0]
            if not odds or ev["status"]["type"]["state"] != "pre":
                continue   # only before kickoff, so the closing line is never overwritten
            s = home_spread(odds)
            if s is None:
                continue
            games[ev["id"]] = {"s": s, "d": odds.get("details"), "k": ev["date"]}
            n += 1
    print(f"spreads: {n} upcoming games updated, {save(games)} kept")


def backfill():
    games, added = load(), 0
    first = week_events()
    season_type, cur = first.get("season", {}).get("type", 2), first.get("week", {}).get("number") or 1
    for week in range(1, cur + 1):
        sb = first if week == cur else week_events(week, season_type)
        for ev in sb.get("events", []):
            if ev["id"] in games or not ev["status"]["type"].get("completed"):
                continue
            try:
                pc = (get(f"{SITE}/summary?event={ev['id']}").get("pickcenter") or [None])[0]
            except Exception as e:
                print(f"{ev['id']}: {e}")
                continue
            s = home_spread(pc) if pc else None
            if s is not None:
                games[ev["id"]] = {"s": s, "d": pc.get("details"), "k": ev["date"]}
                added += 1
            time.sleep(.15)
        print(f"week {week}: {added} so far")
    print(f"backfill: {added} games added, {save(games)} kept")


if __name__ == "__main__":
    backfill() if "--backfill" in sys.argv else update()
