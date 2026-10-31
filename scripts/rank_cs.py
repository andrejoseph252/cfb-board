"""Confidence sets for AP ranks from every voter's ballot: Mogstad, Romano, Shaikh & Wilhelm (2024, Review of Economic
Studies), "Inference for Ranks". A standard-library port of ~/APPollAnalysis/analysis/ranks.py (itself checked against
the authors' R package, csranks), so it can run in the GitHub Action with the rest of scripts/ballots.py.

What a set means: the ~70 voters are a sample from a population of AP-like voters. Each team's estimand is its mean
points over that population (25 for 1st ... 1 for 25th, 0 when left off), so ranking by it is ranking by AP points.
A team's set [L, U] covers the rank it would have in that population's consensus, with 95% confidence. It is about how
settled the panel's order is, not about which team is actually better.

Two sets per team (from DESIGN.md in APPollAnalysis):
    marginal       each set on its own: read it for one team ("where is Indiana?")
    simultaneous   all sets hold at once: read it for claims about several teams (tiers, "the top 3 are separated")

Method: bootstrap over whole ballots (R draws of the team means, centered), then for pairs of teams the one-sided
lower bounds d_jk - s_jk * c on theta_j - theta_k, with c the 95% quantile of the largest studentized draw over the
pairs still in play; step-down: drop the pairs that got ordered and recompute c, until nothing new is ordered.
L = 1 + teams surely above, U = teams ranked - teams surely below.

    sets(ballots) -> [[team_id, rank, marg_L, marg_U, simul_L, simul_U], ...]   by rank; ballots = lists of 25 ids
"""
import math
import random

R = 4000          # bootstrap draws (APPollAnalysis used 10,000; sets match to within a rank at the edges, see check())
COVERAGE = 0.95


def _quantile(xs, q):
    """numpy's default (linear) quantile."""
    xs = sorted(xs)
    h = (len(xs) - 1) * q
    lo = math.floor(h)
    return xs[lo] + (h - lo) * (xs[min(lo + 1, len(xs) - 1)] - xs[lo])


def _draws(X, n, p, rng):
    """R bootstrap draws of the team means minus the sample means. X: per voter, a list of (team index, points)."""
    theta = [0.0] * p
    for b in X:
        for j, pts in b:
            theta[j] += pts / n
    out = []
    for _ in range(R):
        m = [0.0] * p
        for b in rng.choices(X, k=n):
            for j, pts in b:
                m[j] += pts
        out.append([m[j] / n - theta[j] for j in range(p)])
    return theta, out


def _sds(X, n, p):
    """Standard deviation of theta_j - theta_k for every pair (sample covariance / n, as np.cov(X) / n)."""
    cols = [[0] * n for _ in range(p)]
    for v, b in enumerate(X):
        for j, pts in b:
            cols[j][v] = pts
    mean = [sum(c) / n for c in cols]
    cen = [[x - mean[j] for x in cols[j]] for j in range(p)]
    cov = [[sum(a * b for a, b in zip(cen[j], cen[k])) / (n - 1) for k in range(p)] for j in range(p)]
    return [[math.sqrt(max(cov[j][j] + cov[k][k] - 2 * cov[j][k], 0) / n) for k in range(p)] for j in range(p)]


def _stepdown(theta, draws, sd, pairs):
    """The pairs (j, k) shown theta_j > theta_k, by the step-down max-t procedure over `pairs`."""
    ordered = set()
    live = [(j, k) for j, k in pairs if sd[j][k] > 0]   # identical columns can never be ordered
    while live:
        terms = [(j, k, 1 / sd[j][k]) for j, k in live]
        c = _quantile([max((d[j] - d[k]) * w for j, k, w in terms) for d in draws], COVERAGE)
        new = {(j, k) for j, k in live if theta[j] - theta[k] - sd[j][k] * c > 0}
        if not new:
            break
        ordered |= new
        live = [pk for pk in live if pk not in new]
    return ordered


def sets(ballots, seed=2026):
    ids = sorted({t for b in ballots for t in b})
    ix = {t: i for i, t in enumerate(ids)}
    n, p = len(ballots), len(ids)
    X = [[(ix[t], 25 - r) for r, t in enumerate(b[:25])] for b in ballots]
    theta, draws = _draws(X, n, p, random.Random(seed))
    sd = _sds(X, n, p)
    rank = [1 + sum(t > theta[j] for t in theta) for j in range(p)]

    every = [(j, k) for j in range(p) for k in range(p) if j != k]
    sure = _stepdown(theta, draws, sd, every)
    simul = [(1 + sum((k, j) in sure for k in range(p)), p - sum((j, k) in sure for k in range(p))) for j in range(p)]
    marg = []
    for j in range(p):
        mine = [(j, k) for k in range(p) if k != j] + [(k, j) for k in range(p) if k != j]
        s = _stepdown(theta, draws, sd, mine)
        marg.append((1 + sum((k, j) in s for k in range(p)), p - sum((j, k) in s for k in range(p))))
    rows = [[ids[j], rank[j], *marg[j], *simul[j]] for j in range(p)]
    return sorted(rows, key=lambda r: (r[1], r[0]))


def check(path="~/APPollAnalysis/results/rank_cs.csv"):
    """Compare with APPollAnalysis's numpy version on the same weeks: how many bounds differ, and by how much."""
    import csv
    import json
    import pathlib
    ref = {}
    for r in csv.DictReader(open(pathlib.Path(path).expanduser())):
        ref[(r["week"], r["team_id"])] = [int(r[k]) for k in ("marg_L", "marg_U", "simul_L", "simul_U")]
    data = json.loads((pathlib.Path(__file__).resolve().parent.parent / "data" / "ballots.json").read_text())
    for w, wk in sorted(data["weeks"].items(), key=lambda x: int(x[0])):
        mine = {r[0]: r[2:] for r in sets([v["b"] for v in wk["voters"]])}
        diffs = [abs(a - b) for t, s in mine.items() if (w, t) in ref for a, b in zip(s, ref[(w, t)])]
        if diffs:
            print(f"week {w}: {sum(d > 0 for d in diffs)} of {len(diffs)} bounds differ, by at most {max(diffs)}")


if __name__ == "__main__":
    check()
