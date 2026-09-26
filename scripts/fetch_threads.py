"""Collect r/CFB game and postgame threads into data/threads.json.

Reddit's JSON API needs OAuth, and none of its feeds allow browser (CORS) requests, so this runs in the
GitHub Action. The subreddit search RSS feed still works unauthenticated. Postgame threads link the ESPN
box score, which gives an exact game id; game threads only have team names, which the page matches itself.
Results are merged with the previous file so a busy Saturday can't push earlier threads out of the
100-item feed window.
"""
import html
import json
import pathlib
import re
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "threads.json"
FEED = "https://www.reddit.com/r/CFB/search.rss"
ATOM = {"a": "http://www.w3.org/2005/Atom"}
KEEP_DAYS = 10


def fetch(flair):
    q = urllib.parse.urlencode({"q": f'flair:"{flair}"', "restrict_sr": "on", "sort": "new", "limit": 100})
    req = urllib.request.Request(f"{FEED}?{q}", headers={"User-Agent": "cfb-board/1.0 (personal scoreboard; github.com/andrejoseph252/cfb-board)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return ET.fromstring(r.read())


def sides(title, kind):
    body = re.sub(r"^\[[^\]]+\]\s*", "", title)
    if kind == "game":
        body = re.sub(r"\s*\([^)]*\)\s*$", "", body)
        parts = re.split(r"\s+(?:@|vs\.?|at)\s+", body, maxsplit=1)
    else:
        body = re.sub(r",?\s*\d+\s*-\s*\d+.*$", "", body)
        parts = re.split(r"\s+(?:Defeats|Beats|Tops|Edges|Survives|Upsets|Downs|Ties|and)\s+", body, maxsplit=1, flags=re.I)
    clean = lambda s: re.sub(r"^#\d+\s+", "", s).strip()
    return [clean(p) for p in parts] if len(parts) == 2 else None


def entries(root, kind):
    out = []
    for e in root.findall("a:entry", ATOM):
        title = html.unescape(e.findtext("a:title", "", ATOM))
        link = e.find("a:link", ATOM)
        content = html.unescape(e.findtext("a:content", "", ATOM))
        gid = re.search(r"gameId[=/](\d+)", content)
        out.append({
            "kind": kind, "title": title, "url": link.get("href") if link is not None else None,
            "published": e.findtext("a:published", "", ATOM) or e.findtext("a:updated", "", ATOM),
            "gameId": gid.group(1) if gid else None, "teams": sides(title, kind),
        })
    return [x for x in out if x["url"]]


def main():
    try:
        old = json.loads(OUT.read_text()).get("threads", [])
    except (OSError, ValueError):
        old = []
    fresh, errors = [], []
    for i, (flair, kind) in enumerate((("Game Thread", "game"), ("Postgame Thread", "post"))):
        if i:
            time.sleep(4)  # the unauthenticated feed rate-limits bursts
        try:
            fresh += entries(fetch(flair), kind)
        except Exception as e:  # keep the previous file's threads if Reddit is down or throttling
            errors.append(f"{kind}: {e}")
    by_url = {t["url"]: t for t in old}
    by_url.update({t["url"]: t for t in fresh})
    cutoff = (datetime.now(timezone.utc) - timedelta(days=KEEP_DAYS)).isoformat()
    threads = sorted((t for t in by_url.values() if t["published"] >= cutoff), key=lambda t: t["published"], reverse=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"updated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "threads": threads, "errors": errors}, indent=1))
    print(f"threads={len(threads)} fresh={len(fresh)} errors={errors}")


if __name__ == "__main__":
    main()
