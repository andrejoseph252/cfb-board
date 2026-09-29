"""Price history for every game market, kept in data/lines.json so the board can show how a line moved during the week.

Shape (compact JSON; timestamps are epoch minutes, prices whole percents for the first team listed):
    {"updated": "...", "m": [{"s": "K", "t": ["USC", "Penn St."], "c": "2026-10-11T02:30:00Z", "h": [[29345678, 44], ...], "l": 29349999}]}

A point is added only when the price moves a full percent, so a quiet market costs nothing. "l" is the last time
the market was seen, so a flat line still reaches the present. Markets are dropped 10 days after the game, which
keeps the file to about two weeks of games.
"""
import json
import pathlib
from datetime import datetime, timedelta, timezone

OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "lines.json"
KEEP = timedelta(days=10)
# Kalshi's time is when the game is expected to end; kickoff is about three and a half hours earlier.
# Stop a little before that so an early kickoff can't sneak live prices into the pregame line.
KALSHI_GAME_LENGTH = timedelta(hours=4)
SRC = {"Kalshi": "K", "Polymarket": "P"}


def parse_time(s):
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except (AttributeError, ValueError):
        return None


def load():
    """The saved history, or an empty one on the very first run. A file that exists but can't be read raises
    instead, so a bad file is never silently replaced by an empty history."""
    if not OUT.exists():
        return {"m": []}
    hist = json.loads(OUT.read_text())
    if not isinstance(hist.get("m"), list):
        raise ValueError(f"{OUT.name} has no market list")
    return hist


def save(hist, now):
    hist["updated"] = now.isoformat(timespec="seconds")
    # Write to a temp file and swap it in, so an interrupted run can't leave half a file behind.
    tmp = OUT.with_suffix(".tmp")
    tmp.write_text(json.dumps(hist, separators=(",", ":")))
    tmp.replace(OUT)


def find(hist, s, names, close):
    """The same market seen earlier: same source and teams, with a game time within five days (close times drift)."""
    key = sorted(names)
    for m in hist["m"]:
        if m["s"] == s and sorted(m["t"]) == key:
            c = parse_time(m["c"])
            if c and close and abs(c - close) < timedelta(days=5):
                return m
    return None


def record(hist, markets, now):
    """Add one snapshot of markets.json-shaped entries taken at `now`."""
    minute = int(now.timestamp() // 60)
    for ev in markets:
        s, teams, close = SRC.get(ev.get("source")), ev.get("teams") or [], parse_time(ev.get("close"))
        if not s or len(teams) != 2 or not close:
            continue
        kickoff = close - KALSHI_GAME_LENGTH if s == "K" else close
        if now >= kickoff:
            continue
        a, b = teams[0]["p"], teams[1]["p"]
        if not a or not b or a + b <= 0:
            continue
        names = [teams[0]["name"], teams[1]["name"]]
        m = find(hist, s, names, close)
        if not m:
            m = {"s": s, "t": names, "c": ev["close"], "h": []}
            hist["m"].append(m)
        # Stored from the first-listed team's side, whichever order this snapshot lists them in.
        p = a / (a + b) if names == m["t"] else b / (a + b)
        p = round(100 * p)
        if not m["h"] or m["h"][-1][1] != p:
            m["h"].append([minute, p])
        m["l"] = minute


def prune(hist, now):
    hist["m"] = [m for m in hist["m"] if (parse_time(m["c"]) or now) > now - KEEP and m["h"]]
