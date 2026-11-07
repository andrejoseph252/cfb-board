"""The College Football Playoff committee's rankings, every week of the season, kept in data/cfp.json.

ESPN's rankings feed (the one the board reads live) only has this week's. Its core API keeps every week's, one call
each (the committee's poll is ranking 21). The committee ranks from early November, every Tuesday, then a final
ranking on selection Sunday; ESPN files them all as regular-season weeks (2025: weeks 11 to 16). Rankings > Playoff >
Movement draws from this file. Standard library only.

    {"season": 2026, "updated": "...",
     "weeks": {"10": {"label": "Week 10", "date": "2026-11-03T08:00Z",
                      "ranks": [["2390", 1, "8-0"], ["61", 2, "7-1"], ...]}}}

Each rank row is [ESPN team id, rank, record at the time]. Names, colors and logos come from data/teams.json.

    python3 scripts/cfp.py            # the GitHub Action: any week not saved yet, plus the newest again
    python3 scripts/cfp.py --all      # every week again
"""
import json
import pathlib
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

CORE = "https://sports.core.api.espn.com/v2/sports/football/leagues/college-football"
OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "cfp.json"
UA = "cfb-board data refresh"
WEEKS = range(1, 18)


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def season_now():
    """The season the board is on: the calendar year, until February (bowls and the title game run into January)."""
    now = datetime.now(timezone.utc)
    return now.year if now.month >= 2 else now.year - 1


def week(season, w):
    d = get(f"{CORE}/seasons/{season}/types/2/weeks/{w}/rankings/21")
    if not d or not d.get("ranks"):
        return None
    ranks = []
    for r in d["ranks"]:
        m = re.search(r"/teams/(\d+)", (r.get("team") or {}).get("$ref", ""))
        if m:
            ranks.append([m.group(1), r.get("current"), (r.get("record") or {}).get("summary", "")])
    return {"label": (d.get("occurrence") or {}).get("displayValue") or f"Week {w}", "date": d.get("date"), "ranks": ranks}


def main():
    season = season_now()
    data = json.loads(OUT.read_text()) if OUT.exists() else {}
    if data.get("season") != season:
        data = {"season": season, "weeks": {}}
    have = data["weeks"]
    redo = "--all" in sys.argv
    newest = max(map(int, have), default=0)
    changed = False
    # Saved weeks don't change, so once there's one the hourly run reads only the newest again (ESPN can fix it up
    # after the release) and the next two (the next ranking). Nothing saved yet: look through the whole season.
    for w in (WEEKS if redo or not have else range(newest, newest + 3)):
        wk = week(season, w)
        if wk and wk != have.get(str(w)):
            have[str(w)] = wk
            changed = True
            print(f"week {w}: {len(wk['ranks'])} teams ({wk['date']})")
    if changed:
        data["updated"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        data["weeks"] = dict(sorted(have.items(), key=lambda kv: int(kv[0])))
        OUT.write_text(json.dumps(data, separators=(",", ":")) + "\n")
    else:
        print("no change")


if __name__ == "__main__":
    main()
