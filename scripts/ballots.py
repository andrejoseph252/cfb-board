"""Every AP Top 25 voter's ballot, week by week, kept in data/ballots.json.

ESPN's rankings feed only has the totals (rank, points, first-place votes). AP publishes each voter's full ballot, and
CollegePollTracker lays a week's out on one page (the "grid": one row per voter, their 25 teams in order). This reads
that page and maps each team to its ESPN id, so the board can show, for any ranked team, how every voter had them.
Standard library only.

    {"updated": "...", "season": 2026,
     "weeks": {"7": {"label": "Week 7", "date": "Oct 18, 2026",
                     "voters": [{"n": "Adam Lichtenstein", "o": "South Florida Sun-Sentinel", "b": ["2390", "252", ...]}]}},
     "teams": {"2390": {"name": "Miami (FL)"}}}

"b" is the ballot, 1st to 25th, as ESPN team ids (a team ESPN can't be matched to is kept as "?Name").

    python3 scripts/ballots.py            # the GitHub Action: the current week if it's new (Sunday to Tuesday only)
    python3 scripts/ballots.py --all      # every week of the season the tracker has (fills in anything missing)
"""
import html
import json
import pathlib
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone

BASE = "https://collegepolltracker.com/football"
ESPN_TEAMS = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams?limit=1000"   # every division: an FCS team gets votes now and then
OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "ballots.json"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15"
MIN_VOTERS = 40   # a week with fewer rows than this is still being filled in; read it again next run


def get(url, as_json=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json" if as_json else "text/html"})
    with urllib.request.urlopen(req, timeout=30) as r:
        body = r.read().decode("utf-8", "replace")
    return json.loads(body) if as_json else body


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower().replace("&", "and")).strip("-")


def espn_teams():
    j = get(ESPN_TEAMS, as_json=True)
    return [t["team"] for t in j["sports"][0]["leagues"][0]["teams"]]


def matcher(teams):
    """The tracker names teams by a slug of school and nickname ("miami-fl-hurricanes") and a display name
    ("Miami (FL)"). Match on the nickname (the end of the slug), then the school to tell apart teams sharing one."""
    def find(tslug, title):
        cands = [t for t in teams if tslug.endswith("-" + slug(t.get("name") or ""))]
        if len(cands) > 1:
            norm = slug(re.sub(r"\(.*?\)", "", title))
            best = [t for t in cands if slug(t.get("location") or "") == norm or slug(t.get("shortDisplayName") or "") == norm]
            cands = best or [t for t in cands if tslug.startswith(slug(t.get("location") or "x").split("-")[0])] or cands
        if len(cands) == 1:
            return cands[0]["id"]
        # Last resort: the display name against ESPN's names.
        norm = slug(title)
        for t in teams:
            if norm in (slug(t.get("location") or ""), slug(t.get("shortDisplayName") or ""), slug(t.get("abbreviation") or "")):
                return t["id"]
        return None
    return find


ROW = re.compile(r'<div class="gridRow"><div class="gridPollster"><a href="/football/pollster/[^"]+">(.*?)</a>'
                 r'(?:<br/><span class="gridPollsterAffiliation">(.*?)</span>)?</div>(.*?)(?=<div class="gridRow"|</div></div></div>|$)', re.S)
CELL = re.compile(r'class="gridTeam gi_([a-z0-9-]+)"[^>]*>\s*<img[^>]*title="([^"]*)"')


def parse_week(page, find, teams_out):
    title = re.search(r"Week\s*\d+\s*AP Poll\s*\(([^)]+)\)", page) or re.search(r"\(([A-Z][a-z]{2} \d{1,2}, \d{4})\)", page)
    voters = []
    for m in ROW.finditer(page):
        name = html.unescape(m.group(1)).strip()
        outlet = html.unescape(m.group(2) or "").strip()
        ballot = []
        for tslug, ttitle in CELL.findall(m.group(3))[:25]:
            ttitle = html.unescape(ttitle)
            tid = find(tslug, ttitle)
            key = tid or "?" + ttitle
            ballot.append(key)
            if tid:
                teams_out.setdefault(tid, {"name": ttitle})
        if len(ballot) == 25:
            voters.append({"n": name, "o": outlet, "b": ballot})
    return {"date": title.group(1) if title else None, "voters": voters}


def main():
    full = "--all" in sys.argv
    now = datetime.now(timezone.utc)
    # New polls come out Sunday afternoon; the ballots follow within a day or so.
    if not full and now.weekday() not in (6, 0, 1):
        print("not poll days; nothing to do")
        return
    data = json.loads(OUT.read_text()) if OUT.exists() else {}
    home = get(BASE + "/")
    cur = re.search(r"/football/grid/(\d{4})/week-(\d+)", home)
    if not cur:
        print("couldn't find the current week on the tracker")
        return
    season, week = int(cur.group(1)), int(cur.group(2))
    if data.get("season") != season:
        data = {"season": season, "weeks": {}, "teams": {}}
    weeks = data.setdefault("weeks", {})
    want = list(range(1, week + 1)) if full else [week]
    todo = [w for w in want if len(weeks.get(str(w), {}).get("voters", [])) < MIN_VOTERS]
    if not todo:
        print(f"week {week} already saved")
        return
    find = matcher(espn_teams())
    teams = data.setdefault("teams", {})
    for w in todo:
        page = get(f"{BASE}/grid/{season}/week-{w}")
        got = parse_week(page, find, teams)
        print(f"week {w}: {len(got['voters'])} ballots ({got['date']})")
        if got["voters"]:
            weeks[str(w)] = {"label": f"Week {w}", **got}
        time.sleep(2)   # gently
    unmatched = sorted({t for wk in weeks.values() for v in wk["voters"] for t in v["b"] if t.startswith("?")})
    if unmatched:
        print("not matched to ESPN:", ", ".join(unmatched))
    data["updated"] = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    OUT.write_text(json.dumps(data, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
