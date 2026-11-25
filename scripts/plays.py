"""Adds what only the play-by-play knows to data/players/<team id>.json. Run after scripts/players.py.

The box scores say nothing about linemen, and ESPN has no college injury reports. The play-by-play of every game
(already cached in .cache/espn by players.py, so this makes no requests) fills some of that in:

  * runs by direction: yards per carry running left, middle and right, for the offense and against the defense,
    each ranked against all FBS teams. That shows which side of a line is moving people and which side is not;
  * penalties by player: "PENALTY FSU Holding (#71 N.Pabst)" names the lineman, so each player gets his flags;
  * "#7 J.Lessard injured on the play": the game and quarter a player went down, to back up who's out.

scripts/players.py calls augment() on every FBS team before writing, so the ranks are national.
"""
import collections
import gzip
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "players"
CACHE = ROOT / ".cache" / "espn"

RUN = re.compile(r"\brush (left|middle|right)\b")
PEN = re.compile(r"PENALTY \S+ (?:[A-Z]{2,4}: )?([A-Za-z][A-Za-z /-]+?) \(#(\d+) ([^)]+)\)")
HURT = re.compile(r"#(\d+) ([A-Z][^#;,()]*?) injured on the play")
SIDES = ("left", "middle", "right")


def key(name):
    """'N.Pabst' / 'C.Richard Jr.' / 'J.Jointer, Jr.' -> 'pabst' / 'richard' / 'jointer'."""
    last = name.split(".", 1)[-1] if "." in name.split(" ")[0] else name
    last = re.sub(r",?\s+(Jr|Sr|II|III|IV|V)\.?$", "", last.strip())
    return re.sub(r"[^a-z]", "", last.lower())


def pct(values, v, lower_better=False):
    """0-99: share of teams this one beats."""
    beat = sum(1 for x in values if (x > v if lower_better else x < v))
    return round(99 * beat / max(len(values) - 1, 1))


def augment(docs):
    """Adds runs, pen/penRank and inj to every team doc in place. Pass every FBS team, so the ranks are national."""
    # who wears what number on each team, to put names on '#71 N.Pabst'
    lookup = {}
    for t, d in docs.items():
        by_no = collections.defaultdict(list)
        for p in d["players"]:
            if p.get("no"):
                by_no[str(p["no"])].append(p)
            p.pop("pen", None), p.pop("inj", None)
        lookup[t] = by_no

    def find(teams, no, name):
        k = key(name)
        hits = [(t, p) for t in teams for p in lookup.get(t, {}).get(no, []) if key(p.get("last") or p.get("name", "")) == k or re.sub(r"[^a-z]", "", (p.get("name") or "").lower()).endswith(k)]
        if len(hits) > 1:   # same number and last name on both teams, or two Thomases: the first initial decides
            hits = [(t, p) for t, p in hits if (p.get("name") or "")[:1].upper() == name[:1].upper()]
        return hits[0] if len(hits) == 1 else (None, None)

    runs = collections.defaultdict(lambda: {"off": {s: [0, 0] for s in SIDES}, "def": {s: [0, 0] for s in SIDES}})
    seen = set()
    for t, d in docs.items():
        for gi, g in enumerate(d["games"]):
            f = CACHE / f"summary-{g['id']}.json.gz"
            if g["id"] in seen or not f.exists():
                continue
            seen.add(g["id"])
            s = json.loads(gzip.decompress(f.read_bytes()))
            ids = [c["team"]["id"] for c in s["header"]["competitions"][0]["competitors"]]
            gidx = {tid: next((i for i, x in enumerate(docs[tid]["games"]) if x["id"] == g["id"]), None) for tid in ids if tid in docs}
            for dr in (s.get("drives") or {}).get("previous", []):
                for pl in dr.get("plays", []):
                    text = pl.get("text", "")
                    m = RUN.search(text)
                    if m and pl.get("type", {}).get("text") in ("Rush", "Rushing Touchdown") and not pl.get("isPenalty"):
                        parts = {x.get("type"): x.get("id") for x in pl.get("teamParticipants", [])}
                        o, dd = parts.get("offense"), parts.get("defense")
                        y = pl.get("statYardage") or 0
                        if o in docs:
                            runs[o]["off"][m.group(1)][0] += 1; runs[o]["off"][m.group(1)][1] += y
                        if dd in docs:
                            runs[dd]["def"][m.group(1)][0] += 1; runs[dd]["def"][m.group(1)][1] += y
                    for kind, no, name in PEN.findall(text):
                        tid, p = find(ids, no, name)
                        if p is not None and gidx.get(tid) is not None:
                            kind = re.split(r" declined \S+ ", kind, flags=re.I)[-1]   # 'Pass Interference declined FSU Roughing the Passer'
                            kind = "Holding" if "Holding" in kind else kind.strip().title()
                            pen = p.setdefault("pen", {})
                            pen[kind] = pen.get(kind, 0) + 1
                    for no, name in HURT.findall(text):
                        tid, p = find(ids, no, name)
                        if p is not None and gidx.get(tid) is not None:
                            p.setdefault("inj", []).append({"gi": gidx[tid], "q": (pl.get("period") or {}).get("number")})

    # Linemen: where each one's flag count sits among every FBS offensive lineman (1 = most flagged).
    ol = [p for d in docs.values() for p in d["players"] if p.get("pos") == "OL"]
    for p in ol:
        p.pop("penRank", None)
        n = sum(p.get("pen", {}).values())
        if n:
            p["penRank"] = [1 + sum(1 for q in ol if sum(q.get("pen", {}).values()) > n), len(ol)]

    # yards per carry each way, ranked against every FBS team (defense: fewer is better). 'left' is the offense's left.
    ypc = {t: {side: {s: (r[side][s][1] / r[side][s][0] if r[side][s][0] >= 20 else None) for s in SIDES} for side in ("off", "def")} for t, r in runs.items()}
    for t, d in docs.items():
        out = {}
        for side in ("off", "def"):
            out[side] = {}
            for s in SIDES:
                v = ypc.get(t, {}).get(side, {}).get(s)
                car, yds = runs[t][side][s] if t in runs else (0, 0)
                if v is None:
                    out[side][s] = {"car": car, "yds": yds}
                    continue
                pool = [x[side][s] for x in ypc.values() if x[side][s] is not None]
                gr = pct(pool, v, lower_better=side == "def")
                rank = 1 + sum(1 for x in pool if (x < v if side == "def" else x > v))
                out[side][s] = {"car": car, "yds": yds, "ypc": round(v, 1), "grade": gr, "rank": rank, "of": len(pool)}
        d["runs"] = out
        for p in d["players"]:
            if "inj" in p:
                p["inj"] = sorted({(x["gi"], x["q"]): x for x in p["inj"]}.values(), key=lambda x: x["gi"])
    print(f"play-by-play: {len(seen)} games read")


def main():
    """Standalone: redo the play-by-play extras on the team files already written. Ranks then compare only the teams
    with files, so players.py (which runs augment on every FBS team before writing) is the normal way."""
    docs = {f.stem: json.loads(f.read_text()) for f in sorted(OUT.glob("*.json")) if f.stem.isdigit()}
    augment(docs)
    for t, d in docs.items():
        (OUT / f"{t}.json").write_text(json.dumps(d, separators=(",", ":")))


if __name__ == "__main__":
    main()
