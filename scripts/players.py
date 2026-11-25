"""Every FBS team's players and units, graded against the whole country, saved as data/players/<team id>.json.

For each FBS team: ESPN's roster (photos, size, class, hometown), every box score this season (each player's stats game
by game) and the team's season stats for and against. From those:

  * each player gets a 0-99 grade: where his numbers rank among every FBS player at his position with enough snaps
    (QBs by yards per attempt with TDs and INTs counted, backs by yards per carry and per game, and so on);
  * each unit (passing game, run game, receivers, offensive line, defensive line, run defense, secondary, special
    teams) gets a 0-99 grade: where the team's numbers rank among all FBS teams.

ESPN has no college injury reports or depth charts; the page works those out from the box scores (who's been playing,
who has stopped). Players ESPN's roster leaves out but who show up in box scores are kept, with their profile looked
up separately. Standard library only. The first run takes a few minutes; finished games are cached in .cache/espn.

    python3 scripts/players.py            # files for the Power 4 and Notre Dame (+ next opponents); grades use all FBS
    python3 scripts/players.py 52 57      # just these teams' files (grades still compare against everyone)

Also adds run directions, penalties and injuries from the play-by-play (scripts/plays.py), ranked across all of FBS.
"""
import concurrent.futures as cf
import datetime
import gzip
import json
import pathlib
import sys
import threading
import time
import urllib.request

SITE = "https://site.api.espn.com/apis/site/v2/sports/football/college-football"
CORE = "https://sports.core.api.espn.com/v2/sports/football/leagues/college-football"
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "players"
CACHE = ROOT / ".cache" / "espn"   # finished games' box scores never change; kept so reruns don't fetch them again
SCOUT_CONFS = {"acc", "big10", "big12", "sec"}   # ESPN's conference abbreviations: the Power 4
SCOUT_EXTRA = {"87"}                             # Notre Dame


_gate, _last = threading.Lock(), [0.0]
GAP = 0.12   # at most about 8 requests a second, all threads together: a fresh run (no cache) stays under ESPN's limit


def get(url, tries=3):
    for i in range(tries):
        with _gate:
            wait = _last[0] + GAP - time.time()
            if wait > 0:
                time.sleep(wait)
            _last[0] = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "cfb-board/1.0", "Accept-Encoding": "gzip"})
            with urllib.request.urlopen(req, timeout=30) as r:
                body = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    body = gzip.decompress(body)
                return json.loads(body)
        except Exception:
            if i == tries - 1:
                return None
            time.sleep(1 + i)


def summary(event):
    f = CACHE / f"summary-{event}.json.gz"
    if f.exists():
        return json.loads(gzip.decompress(f.read_bytes()))
    j = get(f"{SITE}/summary?event={event}")
    if j and j.get("boxscore", {}).get("players"):
        CACHE.mkdir(parents=True, exist_ok=True)
        f.write_bytes(gzip.compress(json.dumps(j, separators=(",", ":")).encode()))
    return j


# ESPN starts refusing (403) after a burst of about a thousand quick requests, so this stays at a handful at a time.
def pmap(fn, items, workers=6):
    with cf.ThreadPoolExecutor(workers) as ex:
        return list(ex.map(fn, items))


# ---------------------------------------------------------------- box scores
CATS = {
    "passing": {"C/ATT": ("cmp", "att"), "YDS": "yds", "TD": "td", "INT": "int"},
    "rushing": {"CAR": "car", "YDS": "yds", "TD": "td", "LONG": "long"},
    "receiving": {"REC": "rec", "YDS": "yds", "TD": "td", "LONG": "long"},
    "defensive": {"TOT": "tot", "SOLO": "solo", "SACKS": "sacks", "TFL": "tfl", "PD": "pd", "QB HUR": "qbh", "TD": "td"},
    "interceptions": {"INT": "int", "YDS": "yds", "TD": "td"},
    "kickReturns": {"NO": "no", "YDS": "yds", "TD": "td"},
    "puntReturns": {"NO": "no", "YDS": "yds", "TD": "td"},
    "kicking": {"FG": ("fgm", "fga"), "XP": ("xpm", "xpa"), "PTS": "pts", "LONG": "long"},
    "punting": {"NO": "no", "YDS": "yds", "In 20": "in20", "LONG": "long"},
}
GUESS = {"passing": "QB", "rushing": "RB", "receiving": "WR", "kicking": "PK", "punting": "P", "defensive": "DB", "interceptions": "DB"}
POS = {"K": "PK", "CB": "DB", "S": "DB", "FS": "DB", "SS": "DB", "DE": "DL", "DT": "DL", "NT": "DL", "EDGE": "DL",
       "OLB": "LB", "ILB": "LB", "MLB": "LB", "OT": "OL", "OG": "OL", "G": "OL", "T": "OL", "C": "OL", "IOL": "OL"}


def num(v):
    try:
        return float(str(v).replace(",", ""))
    except ValueError:
        return 0.0


def box_rows(summary, team_id):
    """{athlete id: (athlete, {category: {stat: value}})} for one team in one game."""
    out = {}
    for t in (summary or {}).get("boxscore", {}).get("players", []):
        if str(t.get("team", {}).get("id")) != team_id:
            continue
        for cat in t.get("statistics", []):
            m = CATS.get(cat.get("name"))
            if not m:
                continue
            labels = cat.get("labels", [])
            for a in cat.get("athletes", []):
                ath = a.get("athlete") or {}
                if not ath.get("id"):
                    continue
                row = {}
                for lab, v in zip(labels, a.get("stats", [])):
                    k = m.get(lab)
                    if isinstance(k, tuple):
                        x, _, y = str(v).partition("/")
                        row[k[0]], row[k[1]] = num(x), num(y)
                    elif k:
                        row[k] = num(v)
                out.setdefault(ath["id"], (ath, {}))[1][cat["name"]] = row
    return out


# ---------------------------------------------------------------- grading
def pct_rank(values, v, lower_better=False):
    """Share of the field this value beats, 0-1."""
    if not values:
        return None
    below = sum(1 for x in values if (x > v if lower_better else x < v))
    equal = sum(1 for x in values if x == v)
    return (below + equal / 2) / len(values)


def g(t, c, k):
    return t.get(c, {}).get(k, 0.0)


def rate(a, b):
    return a / b if b else 0.0


# Each position: who qualifies, and the weighted measures (name, function of totals and games played, weight, lower is better).
PLAYER = {
    "QB": (lambda t, n: g(t, "passing", "att") >= 100, [
        ("Yards per attempt (TDs/INTs counted)", lambda t, n: rate(g(t, "passing", "yds") + 20 * g(t, "passing", "td") - 45 * g(t, "passing", "int"), g(t, "passing", "att")), .5, False),
        ("Completion %", lambda t, n: rate(g(t, "passing", "cmp"), g(t, "passing", "att")), .2, False),
        ("Passing yards per game", lambda t, n: rate(g(t, "passing", "yds"), n), .15, False),
        ("Rushing yards per game", lambda t, n: rate(g(t, "rushing", "yds"), n), .15, False)]),
    "RB": (lambda t, n: g(t, "rushing", "car") >= 50, [
        ("Yards per carry", lambda t, n: rate(g(t, "rushing", "yds"), g(t, "rushing", "car")), .4, False),
        ("Rushing yards per game", lambda t, n: rate(g(t, "rushing", "yds"), n), .35, False),
        ("Touchdowns per game", lambda t, n: rate(g(t, "rushing", "td") + g(t, "receiving", "td"), n), .15, False),
        ("Receiving yards per game", lambda t, n: rate(g(t, "receiving", "yds"), n), .1, False)]),
    "WR": (lambda t, n: g(t, "receiving", "rec") >= 15, [
        ("Receiving yards per game", lambda t, n: rate(g(t, "receiving", "yds"), n), .5, False),
        ("Yards per catch", lambda t, n: rate(g(t, "receiving", "yds"), g(t, "receiving", "rec")), .2, False),
        ("Catches per game", lambda t, n: rate(g(t, "receiving", "rec"), n), .15, False),
        ("Touchdowns per game", lambda t, n: rate(g(t, "receiving", "td"), n), .15, False)]),
    "DL": (lambda t, n: n >= 5 and g(t, "defensive", "tot") >= 8, [
        ("Sacks per game", lambda t, n: rate(g(t, "defensive", "sacks"), n), .3, False),
        ("Tackles for loss per game", lambda t, n: rate(g(t, "defensive", "tfl"), n), .3, False),
        ("Tackles per game", lambda t, n: rate(g(t, "defensive", "tot"), n), .25, False),
        ("QB hurries per game", lambda t, n: rate(g(t, "defensive", "qbh"), n), .15, False)]),
    "LB": (lambda t, n: n >= 5 and g(t, "defensive", "tot") >= 12, [
        ("Tackles per game", lambda t, n: rate(g(t, "defensive", "tot"), n), .4, False),
        ("Tackles for loss per game", lambda t, n: rate(g(t, "defensive", "tfl"), n), .25, False),
        ("Sacks per game", lambda t, n: rate(g(t, "defensive", "sacks"), n), .15, False),
        ("Passes defended + INTs per game", lambda t, n: rate(g(t, "defensive", "pd") + 2 * g(t, "interceptions", "int"), n), .2, False)]),
    "DB": (lambda t, n: n >= 5 and g(t, "defensive", "tot") >= 10, [
        ("Passes defended per game", lambda t, n: rate(g(t, "defensive", "pd"), n), .35, False),
        ("Interceptions per game", lambda t, n: rate(g(t, "interceptions", "int"), n), .3, False),
        ("Tackles per game", lambda t, n: rate(g(t, "defensive", "tot"), n), .2, False),
        ("Tackles for loss per game", lambda t, n: rate(g(t, "defensive", "tfl"), n), .15, False)]),
    "PK": (lambda t, n: g(t, "kicking", "fga") >= 6, [
        ("Field goal %", lambda t, n: rate(g(t, "kicking", "fgm"), g(t, "kicking", "fga")), .6, False),
        ("Longest field goal", lambda t, n: g(t, "kicking", "long"), .2, False),
        ("Field goal tries per game", lambda t, n: rate(g(t, "kicking", "fga"), n), .2, False)]),
    "P": (lambda t, n: g(t, "punting", "no") >= 15, [
        ("Yards per punt", lambda t, n: rate(g(t, "punting", "yds"), g(t, "punting", "no")), .75, False),
        ("Inside the 20 %", lambda t, n: rate(g(t, "punting", "in20"), g(t, "punting", "no")), .25, False)]),
}
PLAYER["TE"] = (lambda t, n: g(t, "receiving", "rec") >= 8, PLAYER["WR"][1])


def team_stats(j):
    """{'for': {cat: {stat: value}}, 'vs': {...}} from ESPN's team statistics answer."""
    def flat(cats):
        return {c["name"]: {s["name"]: s.get("value") or 0 for s in c.get("stats", [])} for c in cats or []}
    r = (j or {}).get("results", {})
    mine = r.get("stats", {})
    return {"for": flat(mine.get("categories") if isinstance(mine, dict) else mine), "vs": flat(r.get("opponent"))}


def s(T, side, c, k):
    return T[side].get(c, {}).get(k, 0) or 0


def gp(T):
    return s(T, "for", "passing", "teamGamesPlayed") or 1


def drop(T, side):
    return s(T, side, "passing", "passingAttempts") + s(T, side, "passing", "sacks")


# Each unit: label, and measures (name, function, weight, lower is better, how to show the value).
UNITS = {
    "QB": ("Passing game", [
        ("Net yards per dropback", lambda T: rate(s(T, "for", "passing", "netPassingYards"), drop(T, "for")), .45, False, "{:.1f}"),
        ("Interception rate", lambda T: rate(s(T, "for", "passing", "interceptions"), s(T, "for", "passing", "passingAttempts")), .2, True, "{:.1%}"),
        ("Completion %", lambda T: s(T, "for", "passing", "completionPct") / 100, .15, False, "{:.1%}"),
        ("Passing TDs per game", lambda T: rate(s(T, "for", "passing", "passingTouchdowns"), gp(T)), .2, False, "{:.1f}")]),
    "RB": ("Run game", [
        ("Yards per carry", lambda T: rate(s(T, "for", "rushing", "rushingYards"), s(T, "for", "rushing", "rushingAttempts")), .5, False, "{:.1f}"),
        ("Rushing yards per game", lambda T: rate(s(T, "for", "rushing", "rushingYards"), gp(T)), .3, False, "{:.0f}"),
        ("Rushing TDs per game", lambda T: rate(s(T, "for", "rushing", "rushingTouchdowns"), gp(T)), .2, False, "{:.1f}")]),
    "WR": ("Receivers", [
        ("Yards per catch", lambda T: s(T, "for", "receiving", "yardsPerReception"), .4, False, "{:.1f}"),
        ("Passing yards per game", lambda T: rate(s(T, "for", "passing", "netPassingYards"), gp(T)), .3, False, "{:.0f}"),
        ("Yards after catch per game", lambda T: rate(s(T, "for", "receiving", "receivingYardsAfterCatch"), gp(T)), .3, False, "{:.0f}")]),
    "OL": ("Offensive line", [
        ("Sack rate allowed", lambda T: rate(s(T, "for", "passing", "sacks"), drop(T, "for")), .4, True, "{:.1%}"),
        ("Tackles for loss allowed per game", lambda T: rate(s(T, "vs", "defensive", "tacklesForLoss"), gp(T)), .3, True, "{:.1f}"),
        ("Yards per carry", lambda T: rate(s(T, "for", "rushing", "rushingYards"), s(T, "for", "rushing", "rushingAttempts")), .3, False, "{:.1f}")]),
    "DL": ("Defensive line", [
        ("Sack rate", lambda T: rate(s(T, "for", "defensive", "sacks"), drop(T, "vs")), .4, False, "{:.1%}"),
        ("Tackles for loss per game", lambda T: rate(s(T, "for", "defensive", "tacklesForLoss"), gp(T)), .35, False, "{:.1f}"),
        ("Yards per carry allowed", lambda T: rate(s(T, "vs", "rushing", "rushingYards"), s(T, "vs", "rushing", "rushingAttempts")), .25, True, "{:.1f}")]),
    "LB": ("Run defense", [
        ("Yards per carry allowed", lambda T: rate(s(T, "vs", "rushing", "rushingYards"), s(T, "vs", "rushing", "rushingAttempts")), .45, True, "{:.1f}"),
        ("Rushing yards allowed per game", lambda T: rate(s(T, "vs", "rushing", "rushingYards"), gp(T)), .35, True, "{:.0f}"),
        ("Rushing TDs allowed per game", lambda T: rate(s(T, "vs", "rushing", "rushingTouchdowns"), gp(T)), .2, True, "{:.1f}")]),
    "DB": ("Secondary", [
        ("Net yards per dropback allowed", lambda T: rate(s(T, "vs", "passing", "netPassingYards"), drop(T, "vs")), .4, True, "{:.1f}"),
        ("Completion % allowed", lambda T: s(T, "vs", "passing", "completionPct") / 100, .2, True, "{:.1%}"),
        ("Interceptions per game", lambda T: rate(s(T, "for", "defensiveInterceptions", "interceptions"), gp(T)), .2, False, "{:.1f}"),
        ("Passes defended per game", lambda T: rate(s(T, "for", "defensive", "passesDefended"), gp(T)), .2, False, "{:.1f}")]),
    "ST": ("Special teams", [
        ("Field goal %", lambda T: s(T, "for", "kicking", "fieldGoalPct") / 100, .35, False, "{:.0%}"),
        ("Net punt average", lambda T: s(T, "for", "punting", "netAvgPuntYards"), .25, False, "{:.1f}"),
        ("Kick return average", lambda T: s(T, "for", "returning", "yardsPerKickReturn"), .2, False, "{:.1f}"),
        ("Punt return average", lambda T: s(T, "for", "returning", "yardsPerPuntReturn"), .2, False, "{:.1f}")]),
    "OFF": ("Scoring offense", [("Points per game", lambda T: s(T, "for", "scoring", "totalPointsPerGame"), 1, False, "{:.1f}")]),
    "DEF": ("Scoring defense", [("Points allowed per game", lambda T: s(T, "vs", "scoring", "totalPointsPerGame"), 1, True, "{:.1f}")]),
}


def ordinal(n):
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def grade_units(stats):
    """{team id: {unit: {grade, label, parts: [[name, value shown, grade, rank]]}}}."""
    ids = [t for t, T in stats.items() if T["for"]]
    out = {t: {} for t in ids}
    for key, (label, measures) in UNITS.items():
        comp = {t: 0.0 for t in ids}
        for name, fn, w, low, fmt in measures:
            vals = {t: fn(stats[t]) for t in ids}
            field = list(vals.values())
            for t in ids:
                p = pct_rank(field, vals[t], low)
                rank = 1 + sum(1 for x in field if (x < vals[t] if low else x > vals[t]))
                comp[t] += w * p
                out[t].setdefault(key, {"label": label, "parts": []})["parts"].append([name, fmt.format(vals[t]), round(99 * p), rank])
        field = list(comp.values())
        for t in ids:
            out[t][key]["grade"] = round(99 * pct_rank(field, comp[t]))
            out[t][key]["rank"] = 1 + sum(1 for x in field if x > comp[t])
            out[t][key]["of"] = len(ids)
    return out


def grade_players(everyone):
    """Adds 'grade' and 'parts' to each player who has enough snaps, against every FBS player at his position."""
    for pos, (qual, measures) in PLAYER.items():
        pool = [p for p in everyone if p["pos"] == pos and qual(p["tot"], p["gp"])]
        if len(pool) < 5:
            continue
        comp = {}
        for name, fn, w, low in measures:
            vals = [fn(p["tot"], p["gp"]) for p in pool]
            for p, v in zip(pool, vals):
                q = pct_rank(vals, v, low)
                comp[p["id"]] = comp.get(p["id"], 0) + w * q
                p.setdefault("parts", []).append([name, round(v, 3), round(99 * q)])
        field = list(comp.values())
        for p in pool:
            p["grade"] = round(99 * pct_rank(field, comp[p["id"]]))
            p["pool"] = len(pool)


# ---------------------------------------------------------------- main
def main(only):
    teams = json.loads((ROOT / "data" / "teams.json").read_text())
    st = get("https://site.api.espn.com/apis/v2/sports/football/college-football/standings?group=80")
    fbs, conf = [], {}

    def walk(o, c_=None):
        if isinstance(o, dict):
            for e in o.get("standings", {}).get("entries", []):
                fbs.append(str(e["team"]["id"]))
                conf[str(e["team"]["id"])] = c_
            for c in o.get("children", []):
                walk(c, c_ or c.get("abbreviation"))
    walk(st)
    fbs = sorted(set(fbs))
    if not fbs:
        sys.exit("ESPN's standings came back empty, so there's no FBS team list; try again in a minute.")
    print(f"{len(fbs)} FBS teams")

    t0 = time.time()
    rosters = dict(zip(fbs, pmap(lambda t: get(f"{SITE}/teams/{t}/roster"), fbs)))
    if not any(rosters.values()):
        sys.exit("ESPN refused every roster request (likely a temporary block after too many requests); try again later.")
    scheds = dict(zip(fbs, pmap(lambda t: get(f"{SITE}/teams/{t}/schedule"), fbs)))
    stats = dict(zip(fbs, pmap(lambda t: team_stats(get(f"{SITE}/teams/{t}/statistics")), fbs)))
    print(f"rosters, schedules, team stats: {time.time() - t0:.0f}s")

    # Each team's games, and every finished game's box score (fetched once even though two teams share it).
    games, events = {}, set()
    for t in fbs:
        lst = []
        for e in (scheds[t] or {}).get("events", []):
            c = e["competitions"][0]
            me = next((x for x in c["competitors"] if str(x["id"]) == t), None)
            o = next((x for x in c["competitors"] if str(x["id"]) != t), None)
            if not me or not o:
                continue
            ot = teams.get(str(o["id"]), {})
            g_ = {"id": e["id"], "date": e["date"], "done": bool(c["status"]["type"].get("completed")), "state": c["status"]["type"].get("state"),
                  "home": me.get("homeAway") == "home", "neutral": bool(c.get("neutralSite")),
                  "opp": {"id": str(o["id"]), "name": ot.get("name") or o.get("team", {}).get("location"), "abbr": ot.get("abbr") or o.get("team", {}).get("abbreviation"),
                          "logo": ot.get("logo") or (o.get("team", {}).get("logos") or [{}])[0].get("href")},
                  "res": "W" if me.get("winner") else "L" if o.get("winner") else "",
                  "score": f"{(me.get('score') or {}).get('displayValue', '')}-{(o.get('score') or {}).get('displayValue', '')}" if me.get("score") else ""}
            lst.append(g_)
            if g_["done"]:
                events.add(e["id"])
        games[t] = lst
    t0 = time.time()
    ev = sorted(events)
    summaries = dict(zip(ev, pmap(summary, ev)))
    # ESPN drops some requests under load; try those again, gently, so no game goes missing.
    for attempt in range(3):
        failed = [e for e in ev if not summaries.get(e)]
        if not failed:
            break
        time.sleep(3)
        summaries.update(zip(failed, pmap(summary, failed, workers=3)))
    failed = [e for e in ev if not summaries.get(e)]
    if failed:
        # Grades and depth charts from a partial season would be wrong; keep the last good files instead.
        sys.exit(f"Still missing {len(failed)} box scores ({failed[:10]}); not writing anything. Try again later.")
    print(f"{len(ev)} box scores: {time.time() - t0:.0f}s")

    # Players: roster first, then everyone else who shows up in a box score.
    everyone, by_team = [], {}
    for t in fbs:
        players = {}
        for grp in (rosters[t] or {}).get("athletes", []):
            for a in grp.get("items", []):
                pos = a.get("position", {}).get("abbreviation") or "?"
                players[a["id"]] = {"id": a["id"], "name": a.get("displayName"), "short": a.get("shortName") or a.get("displayName"), "last": a.get("lastName"),
                                    "no": a.get("jersey"), "pos": POS.get(pos, pos), "cls": a.get("experience", {}).get("abbreviation"),
                                    "clsName": a.get("experience", {}).get("displayValue"), "ht": a.get("displayHeight"), "wt": a.get("displayWeight"),
                                    "home": a.get("birthPlace", {}).get("displayText"),
                                    "out": grp.get("position") in ("injuredReserveOrOut", "suspended"), "g": {}, "tot": {}}
        played = [x for x in games[t] if x["done"]]
        for gi, x in enumerate(played):
            for aid, (ath, cats) in box_rows(summaries.get(x["id"]), t).items():
                p = players.get(aid)
                if not p:
                    first = next((GUESS[c] for c in GUESS if c in cats), "DB")
                    p = players[aid] = {"id": aid, "name": ath.get("displayName"), "short": ath.get("shortName") or ath.get("displayName"),
                                        "last": ath.get("lastName"), "no": ath.get("jersey"), "pos": first, "offRoster": True, "g": {}, "tot": {}}
                p["g"][gi] = cats
                for c, row in cats.items():
                    tot = p["tot"].setdefault(c, {})
                    for k, v in row.items():
                        tot[k] = max(tot.get(k, 0), v) if k == "long" else tot.get(k, 0) + v
        for p in players.values():
            p["gp"] = len(p["g"])
        by_team[t] = players
        everyone.extend(players.values())

    # Profiles for box-score players missing from ESPN's roster (only those who've played twice or more).
    missing = [p for p in everyone if p.get("offRoster") and p["gp"] >= 2]
    season = (next(iter(scheds.values())) or {}).get("season", {}).get("year") or datetime.date.today().year

    def profile(p):
        # Kept a week: class, size and hometown don't change mid-season, and this is most of a run's requests.
        f = CACHE / f"athlete-{p['id']}.json"
        if f.exists() and time.time() - f.stat().st_mtime < 7 * 86400:
            a = json.loads(f.read_text())
        else:
            a = get(f"{CORE}/seasons/{season}/athletes/{p['id']}")
            if a:
                CACHE.mkdir(parents=True, exist_ok=True)
                f.write_text(json.dumps({k: a.get(k) for k in ("position", "jersey", "experience", "displayHeight", "displayWeight", "birthPlace")}))
        if not a:
            return
        pos = a.get("position", {}).get("abbreviation")
        p.update({"pos": POS.get(pos, pos) or p["pos"], "no": a.get("jersey") or p.get("no"), "cls": a.get("experience", {}).get("abbreviation"),
                  "clsName": a.get("experience", {}).get("displayValue"), "ht": a.get("displayHeight"), "wt": a.get("displayWeight"),
                  "home": ", ".join(x for x in [a.get("birthPlace", {}).get("city"), a.get("birthPlace", {}).get("state")] if x)})
    t0 = time.time()
    pmap(profile, missing)
    print(f"{len(missing)} off-roster profiles: {time.time() - t0:.0f}s")

    grade_players(everyone)
    units = grade_units(stats)

    now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="minutes")
    docs = {}
    for t in fbs:
        sc = (scheds[t] or {}).get("team", {})
        info = teams.get(t, {})
        played = [x for x in games[t] if x["done"]]
        nxt = next((x for x in games[t] if x["state"] == "pre"), None)
        doc = {"updated": now,
               "team": {"id": t, "name": info.get("name") or sc.get("location"), "full": sc.get("displayName"), "abbr": info.get("abbr"),
                        "color": info.get("color"), "alt": info.get("alt"), "logo": info.get("logo"), "record": sc.get("recordSummary"), "standing": sc.get("standingSummary")},
               "games": [{k: v for k, v in x.items() if k not in ("done", "state")} for x in played],
               "next": {k: v for k, v in nxt.items() if k not in ("done", "state")} if nxt else None,
               "units": units.get(t, {}),
               "players": [{k: v for k, v in p.items() if v not in (None, "", {}, False) or k in ("g", "tot")} for p in by_team[t].values()]}
        docs[t] = doc

    import plays   # what only the play-by-play knows (run directions, penalties, injuries), ranked across all of FBS
    plays.augment(docs)
    publish(docs, conf, only, now)


def publish(docs, conf, only, now):
    """Files only for the teams with scout pages (Power 4 and Notre Dame), plus the FBS team each plays next, which the
    game drawer's Matchup panel compares against. scout.json lists the scouted teams for the app."""
    scout = sorted(t for t in docs if conf.get(t) in SCOUT_CONFS or t in SCOUT_EXTRA)
    write = set(only) if only else set(scout) | {docs[t]["next"]["opp"]["id"] for t in scout if docs[t]["next"] and docs[t]["next"]["opp"]["id"] in docs}
    OUT.mkdir(parents=True, exist_ok=True)
    for t in sorted(write & set(docs)):
        (OUT / f"{t}.json").write_text(json.dumps(docs[t], separators=(",", ":")))
    if not only:
        for f in OUT.glob("*.json"):
            if f.stem.isdigit() and f.stem not in write:
                f.unlink()
        (OUT / "scout.json").write_text(json.dumps({"updated": now, "teams": scout}, separators=(",", ":")))
    print(f"wrote {len(write & set(docs))} team files to {OUT.relative_to(ROOT)} ({len(scout)} scouted)")


if __name__ == "__main__":
    main(sys.argv[1:])
