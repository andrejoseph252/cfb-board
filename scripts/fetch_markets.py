"""Fetch open college football game markets from Kalshi and Polymarket.

Writes data/markets.json, which index.html reads first (same origin, so no
browser CORS problems). Standard library only, so the GitHub Action needs no installs.
"""
import json
import pathlib
import urllib.parse
import urllib.request
from datetime import datetime, timezone

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
    if bid and ask and 0 < bid and ask < 1:
        return round((bid + ask) / 2, 4)
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
        p = kalshi_price(m)
        if p is None:
            continue
        ev = events.setdefault(m["event_ticker"], {
            "source": "Kalshi", "title": m.get("title"),
            "close": m.get("expected_expiration_time") or m.get("close_time"),
            "teams": [], "url": "https://kalshi.com/markets/kxncaafgame",
        })
        ev["teams"].append({"name": m.get("yes_sub_title") or m.get("subtitle") or "", "p": p})
    return list(events.values())


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
    data = {"updated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "kalshi": [], "polymarket": [], "errors": []}
    for key, fn in (("kalshi", kalshi), ("polymarket", polymarket)):
        try:
            data[key] = fn()
        except Exception as e:  # keep going if one source is down
            data["errors"].append(f"{key}: {e}")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=1))
    print(f"kalshi={len(data['kalshi'])} polymarket={len(data['polymarket'])} errors={data['errors']}")


if __name__ == "__main__":
    main()
