"""This week's slate, kept in data/slate.json, so a first visit can draw the board before ESPN answers.

The board's first screen waits on ESPN's scoreboard: about 76 KB from a server the browser hasn't connected to yet.
This saves the same scoreboard trimmed to the fields the board reads (js/models.js), served from the site itself.
The board only uses it when nothing can have changed since it was saved: no game in progress and no game whose
kickoff has passed (see firstSlate in js/data.js); otherwise it waits for ESPN as before. Either way ESPN's live
scoreboard replaces it a moment later. Standard library only.

    {"at": "2026-10-23T08:00:00Z", "sb": {... ESPN's scoreboard, trimmed ...}}

    python3 scripts/slate.py
"""
import json
import pathlib
import urllib.request
from datetime import datetime, timezone

# The same address js/api.js asks for (scoreboardUrl() with no week: ESPN's current week).
URL = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80&limit=400"
OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "slate.json"


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "cfb-board/1.0", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def pick(d, *keys):
    """The given keys of a dict, leaving out missing ones."""
    return {k: d[k] for k in keys if isinstance(d, dict) and k in d}


def odds(o):
    side = lambda s: pick(s or {}, "moneyLine", "favorite")
    ml = o.get("moneyline") or {}
    line = lambda s: {p: pick((ml.get(s) or {}).get(p) or {}, "odds") for p in ("close", "open") if (ml.get(s) or {}).get(p)}
    out = pick(o, "spread", "details", "overUnder")
    out["homeTeamOdds"], out["awayTeamOdds"] = side(o.get("homeTeamOdds")), side(o.get("awayTeamOdds"))
    if ml:
        out["moneyline"] = {s: line(s) for s in ("home", "away")}
    return out


def competitor(k):
    out = pick(k, "homeAway", "curatedRank", "rank", "score", "winner")
    if k.get("records"):
        out["records"] = [pick(k["records"][0], "summary")]
    t = k.get("team") or {}
    out["team"] = pick(t, "id", "location", "shortDisplayName", "displayName", "abbreviation", "logo", "color", "alternateColor", "conferenceId")
    if not t.get("logo") and t.get("logos"):
        out["team"]["logos"] = [pick(t["logos"][0], "href")]
    return out


def event(e):
    c = (e.get("competitions") or [{}])[0]
    st = c.get("status") or {}
    comp = pick(c, "timeValid", "neutralSite", "conferenceCompetition")
    comp["status"] = {**pick(st, "period", "clock"), "type": pick(st.get("type") or {}, "state", "shortDetail", "completed")}
    if c.get("venue"):
        comp["venue"] = pick(c["venue"], "fullName")
    if c.get("broadcasts"):
        b = c["broadcasts"][0]
        comp["broadcasts"] = [{**pick(b, "names"), **({"media": pick(b["media"], "shortName")} if b.get("media") else {})}]
    if c.get("odds"):
        comp["odds"] = [odds(c["odds"][0])]
    comp["competitors"] = [competitor(k) for k in c.get("competitors") or []]
    out = pick(e, "id", "date", "timeValid")
    out["competitions"] = [comp]
    if e.get("week"):
        out["week"] = pick(e["week"], "number")
    if e.get("seasonType"):
        out["seasonType"] = pick(e["seasonType"], "type")
    if e.get("season"):
        out["season"] = pick(e["season"], "type", "year")
    return out


def main():
    j = get(URL)
    lg = (j.get("leagues") or [{}])[0]
    sb = {"leagues": [{"calendar": lg.get("calendar", [])}], "season": pick(j.get("season") or {}, "year", "type"),
          "week": pick(j.get("week") or {}, "number"), "events": [event(e) for e in j.get("events") or []]}
    at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    OUT.write_text(json.dumps({"at": at, "sb": sb}, separators=(",", ":")) + "\n")
    print(f"slate: {len(sb['events'])} games, {OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
