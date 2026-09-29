"""One-off: seed data/lines.json from every data/markets.json the Action has committed, then add a live snapshot.

    python3 scripts/backfill_lines.py

Safe to re-run; it rebuilds the file from scratch. Snapshots from before the spread filter existed can hold
empty Kalshi order books priced near 50/50 (the midpoint of a 1c bid and 99c ask); Kalshi prices within
five points of even in those snapshots are skipped, which also drops a few real coin flips from the seed.
"""
import json
import subprocess
from datetime import datetime, timezone

import fetch_markets
import lines


def git(*args):
    return subprocess.run(["git", "-C", str(lines.OUT.parent.parent), *args], capture_output=True, text=True, check=True).stdout


def dead(ev):
    t = ev.get("teams") or []
    return ev.get("source") == "Kalshi" and len(t) == 2 and all(abs(x["p"] - 0.5) <= 0.05 for x in t)


def main():
    hist = {"m": []}
    commits = git("log", "--reverse", "--format=%H", "--", "data/markets.json").split()
    for c in commits:
        try:
            snap = json.loads(git("show", f"{c}:data/markets.json"))
        except (subprocess.CalledProcessError, ValueError):
            continue
        when = lines.parse_time(snap.get("updated"))
        if when:
            lines.record(hist, [e for e in snap.get("kalshi", []) + snap.get("polymarket", []) if not dead(e)], when)
    now = datetime.now(timezone.utc)
    live = []
    for fn in (fetch_markets.kalshi, fetch_markets.polymarket):
        try:
            live += fn()
        except Exception as e:
            print("live fetch failed:", e)
    lines.record(hist, live, now)
    lines.prune(hist, now)
    lines.save(hist, now)
    pts = sum(len(m["h"]) for m in hist["m"])
    print(f"{len(commits)} snapshots -> {len(hist['m'])} markets, {pts} points, {lines.OUT.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
