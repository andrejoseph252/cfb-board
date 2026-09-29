"""Fetch open college football game markets from Kalshi and Polymarket.

Writes data/markets.json, which index.html reads first (same origin, so no
browser CORS problems), and appends to the price history in data/lines.json (see lines.py). Standard library only, so the GitHub Action needs no installs.
"""
import json
import pathlib
import urllib.parse
import urllib.request
from datetime import datetime, timezone

import lines

KALSHI = "https://api.elections.kalshi.com/trade-api/v2/markets"
POLY = "https://gamma-api.polymarket.com/events"
OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "markets.json"


def get(url, params=None):
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "cfb-board/1.0", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def num(x):
    try:
        return None if x in (None, "") else float(x)
    except (TypeError, ValueError):
        return None


# A quote wider than this is an empty order book (often a 1c bid and 99c ask), not a price. Those games fall back
# to the sportsbook line instead of showing the midpoint as a coin flip.
MAX_SPREAD = 0.15


def kalshi_price(m):
    bid = num(m.get("yes_bid_dollars"))
    ask = num(m.get("yes_ask_dollars"))
    last = num(m.get("last_price_dollars"))
    if bid is None and m.get("yes_bid") is not None:
        bid = m["yes_bid"] / 100
    if ask is None and m.get("yes_ask") is not None:
        ask = m["yes_ask"] / 100
    if last is None and m.get("last_price") is not None:
        last = m["last_price"] / 100
    if ask is not None and 0 < ask <= 1:
        bid = bid or 0
        return round((bid + ask) / 2, 4) if ask - bid <= MAX_SPREAD else None
    return last if last and last > 0 else None


def kalshi():
    markets, cursor = [], None
    for _ in range(10):
        params = {"series_ticker": "KXNCAAFGAME", "status": "open", "limit": 1000}
        if cursor:
            params["cursor"] = cursor
        j = get(KALSHI, params)
        markets += j.get("markets", [])
        cursor = j.get("cursor")
        if not cursor:
            break
    events = {}
    for m in markets:
        ev = events.setdefault(m["event_ticker"], {
            "source": "Kalshi", "title": m.get("title"),
            "close": m.get("expected_expiration_time") or m.get("close_time"),
            "teams": [], "url": "https://kalshi.com/markets/kxncaafgame",
        })
        ev["teams"].append({"name": m.get("yes_sub_title") or m.get("subtitle") or "", "p": kalshi_price(m)})
    # Each team is its own market; when only one side has a real quote, the other is its complement.
    out = []
    for ev in events.values():
        t = ev["teams"]
        if len(t) != 2:
            continue
        if t[0]["p"] is None and t[1]["p"] is not None:
            t[0]["p"] = round(1 - t[1]["p"], 4)
        elif t[1]["p"] is None and t[0]["p"] is not None:
            t[1]["p"] = round(1 - t[0]["p"], 4)
        if t[0]["p"] is not None:
            out.append(ev)
    return out


def polymarket():
    skip = ("spread", "o/u", "total", "over", "under", "(")
    for tag in ("cfb", "ncaaf", "college-football"):
        try:
            events = get(POLY, {"tag_slug": tag, "closed": "false", "limit": 500})
        except Exception:
            continue
        out = []
        for ev in events or []:
            for m in ev.get("markets", []):
                try:
                    oc = m.get("outcomes"); pr = m.get("outcomePrices")
                    oc = json.loads(oc) if isinstance(oc, str) else oc
                    pr = json.loads(pr) if isinstance(pr, str) else pr
                except (ValueError, TypeError):
                    continue
                q = (m.get("question") or ev.get("title") or "")
                if not oc or len(oc) != 2 or oc[0].lower() in ("yes", "no") or any(s in q.lower() for s in skip):
                    continue
                out.append({
                    "source": "Polymarket", "title": q,
                    "close": m.get("gameStartTime") or m.get("endDate") or ev.get("endDate"),
                    "teams": [{"name": n, "p": float(pr[i])} for i, n in enumerate(oc)],
                    "url": f"https://polymarket.com/event/{ev.get('slug')}",
                })
        if out:
            return out
    return []


def main():
    now = datetime.now(timezone.utc)
    data = {"updated": now.isoformat(timespec="seconds"), "kalshi": [], "polymarket": [], "errors": []}
    for key, fn in (("kalshi", kalshi), ("polymarket", polymarket)):
        try:
            data[key] = fn()
        except Exception as e:  # keep going if one source is down
            data["errors"].append(f"{key}: {e}")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=1))
    # Line history is extra; if it fails, today's odds still go out and the error shows in the run log.
    tracked = "?"
    try:
        hist = lines.load()
        lines.record(hist, data["kalshi"] + data["polymarket"], now)
        lines.prune(hist, now)
        lines.save(hist, now)
        tracked = len(hist["m"])
    except Exception as e:
        print(f"::warning::line history not updated: {e}")
    print(f"tracked={tracked} kalshi={len(data['kalshi'])} polymarket={len(data['polymarket'])} errors={data['errors']}")


if __name__ == "__main__":
    main()
