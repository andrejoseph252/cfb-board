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

"stats" sums up, week by week, how sure the voters are as a group (see uncertainty() below):

    "stats": {"7": {"cons": 79.5, "slots": [2.7, 2.9, ...], "churn": 42.0, "new": 2.97,
                    "most": [["Name", "Outlet", 71.3], ...], "least": [...]}}

    python3 scripts/ballots.py            # the GitHub Action: the current week if it's new (Sunday to Tuesday only)
    python3 scripts/ballots.py --all      # every week of the season the tracker has (fills in anything missing)
    python3 scripts/ballots.py --stats    # just work out "stats" again from the saved ballots
"""
import html
import itertools
import json
import math
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


def rbo(a, b, p=0.9):
    """How alike two top-25 ballots are, 0 to 1 (rank-biased overlap, extrapolated to the end of the list): the share
    of teams they have in common in their top 1, top 2, ... top 25, weighted toward the top, so disagreeing about #3
    counts for far more than disagreeing about #23. p = 0.9 puts about 86% of the weight on the top 10."""
    seen_a, seen_b, x, s = set(), set(), 0, 0.0
    for d, (ta, tb) in enumerate(zip(a, b), 1):
        x += (ta == tb) + (ta in seen_b) + (tb in seen_a)
        seen_a.add(ta)
        seen_b.add(tb)
        s += x / d * p ** d
    k = len(a)
    return x / k * p ** k + (1 - p) / p * s


def uncertainty(weeks):
    """Per week: "cons", the consensus index (0-100, how alike the average pair of ballots is); "slots", for each spot
    1st to 25th, the effective number of teams the voters put there (e^entropy: 1.0 is unanimous, 4.0 is as split as
    four teams sharing it evenly); and, against the week before, "churn" (0-100, how much the average voter's own
    ballot changed, on the same scale), "new" (how many teams the average voter added) and the voters who changed
    theirs the "most" and "least". Voters are matched across weeks by name."""
    out, prev = {}, None
    for w in sorted(weeks, key=int):
        bs = {v["n"]: v["b"] for v in weeks[w]["voters"]}
        outlet = {v["n"]: v["o"] for v in weeks[w]["voters"]}
        ballots = list(bs.values())
        pairs = list(itertools.combinations(ballots, 2))
        st = {"cons": round(100 * sum(rbo(a, b) for a, b in pairs) / len(pairs), 1), "slots": []}
        for r in range(25):
            counts = {}
            for b in ballots:
                counts[b[r]] = counts.get(b[r], 0) + 1
            h = -sum(c / len(ballots) * math.log(c / len(ballots)) for c in counts.values())
            st["slots"].append(round(math.exp(h), 1))
        same = [(n, prev[n], b) for n, b in bs.items() if prev and n in prev]
        if same:
            moved = sorted(((n, 100 * (1 - rbo(a, b))) for n, a, b in same), key=lambda x: -x[1])
            st["churn"] = round(sum(m for _, m in moved) / len(moved), 1)
            st["new"] = round(sum(len(set(b) - set(a)) for _, a, b in same) / len(same), 2)
            st["most"] = [[n, outlet[n], round(m, 1)] for n, m in moved[:3]]
            st["least"] = [[n, outlet[n], round(m, 1)] for n, m in moved[::-1][:3]]
        out[w] = st
        prev = bs
    return out


def main():
    if "--stats" in sys.argv:
        data = json.loads(OUT.read_text())
        data["stats"] = uncertainty(data["weeks"])
        OUT.write_text(json.dumps(data, separators=(",", ":")) + "\n")
        return
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
    data["stats"] = uncertainty(weeks)
    data["updated"] = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    OUT.write_text(json.dumps(data, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
