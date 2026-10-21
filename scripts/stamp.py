"""Rebuild the script/style block in index.html and demo.html: every module preloaded (except ones loaded on demand
with import()), and every file address
stamped with a fingerprint of its contents (e.g. js/picks.js?v=3f9a1c2e).

    python3 scripts/stamp.py           # update both pages; run before every push that touches js/ or css/
    python3 scripts/stamp.py --check   # only report; exits 1 if a page is out of date
    python3 scripts/stamp.py --minor   # this commit is a feature release (v2.9.3 -> v2.10)
    python3 scripts/stamp.py --major   # this commit starts a new major version (v2.9.3 -> v3.0)

Why: GitHub Pages lets browsers keep each file for 10 minutes. Without fingerprints, a browser can pair a new
module with an older cached copy of another one, and the page stops at "Loading the slate…". A changed file gets a
new address, so it's always fetched fresh; unchanged files keep theirs and stay cached.

How: an import map points each module's plain address (./js/picks.js) at its stamped one, so the modules' own
`import ... from './picks.js'` lines don't change. Preloads let the browser fetch every module at once instead
of discovering them one level at a time.

Version: version.json holds the app's version (v2.9, v2.9.1, v2.10, ...), shown in the Settings panel. Every commit
that changes the app's code moves it up one patch step (v2.9 -> v2.9.1 -> v2.9.2); --minor marks a feature release
(-> v2.10) and --major a new major version (-> v3.0). Steps count from the version in the last commit, so stamping
again and again before a commit still lands as a single step. A version written into version.json by hand is kept. Commits that only change data (the odds bot) don't touch
it. The build is a fingerprint of every stamped file, so the same code always has the same build.
"""
import hashlib
import json
import pathlib
import re
import subprocess
import sys
from datetime import date

ROOT = pathlib.Path(__file__).resolve().parent.parent
START, END = "<!-- build:assets -->", "<!-- /build:assets -->"
VERSION_FILE, FIRST = ROOT / "version.json", (2, 0)
PAGES = {"index.html": [], "demo.html": ["js/demo-live.js"]}   # extra entry scripts per page, loaded before main.js


def modules(entry):
    seen = []

    def walk(f):
        f = f.resolve()
        if f in seen:
            return
        seen.append(f)
        # Both `import x from './a.js';` and bare `import './a.js';` (a module run for its side effects).
        for m in re.findall(r"^import (?:.+? from )?'(\.[^']+)';", f.read_text(), re.M):
            walk(f.parent / m)

    walk(ROOT / entry)
    return [str(f.relative_to(ROOT)) for f in seen]


def lazy_modules(eager):
    """Modules loaded on demand with import('./...'): stamped in the import map like the rest, but not preloaded,
    so a feature like the game doesn't cost anything until it's opened."""
    lazy, queue = [], list(eager)
    while queue:
        f = ROOT / queue.pop()
        for m in re.findall(r"import\('(\.[^']+)'\)", f.read_text()):
            entry = str((f.parent / m).resolve().relative_to(ROOT))
            for x in modules(entry):
                if x not in eager and x not in lazy:
                    lazy.append(x)
                    queue.append(x)
    return lazy


def stamp(path):
    return f"{path}?v={hashlib.sha1((ROOT / path).read_bytes()).hexdigest()[:8]}"


def assets(extra):
    mods = sorted(set(modules("js/main.js")) | set(extra))
    return mods, sorted(set(lazy_modules(mods)) - set(mods))


def build_id():
    files = sorted({f for extra in PAGES.values() for group in assets(extra) for f in group} | {"css/app.css"})
    return hashlib.sha1("".join(stamp(f) for f in files).encode()).hexdigest()[:8]


def read_json(text):
    try:
        return json.loads(text)
    except (TypeError, ValueError):
        return None


def parse(v):
    p = [int(x) for x in v.split(".")]
    return tuple((p + [0, 0])[:3])


def fmt(v):
    """(2, 9, 0) -> "2.9", (2, 9, 1) -> "2.9.1"."""
    return f"{v[0]}.{v[1]}" + (f".{v[2]}" if v[2] else "")


def version(build, step):
    """{"version", "build", "date"}: the last commit's version if the code is unchanged, else one step past it (a patch;
    or a minor / major step with --minor / --major), or a higher version already written here and not yet committed."""
    head = subprocess.run(["git", "show", "HEAD:version.json"], cwd=ROOT, capture_output=True, text=True)
    head = read_json(head.stdout) if head.returncode == 0 else None
    work = read_json(VERSION_FILE.read_text()) if VERSION_FILE.exists() else None
    if head and head.get("build") == build and step == "patch":
        # Code unchanged: the last commit's version, unless one was set here by hand for this same code.
        return work if work and work.get("build") == build and work.get("version") != head.get("version") else head
    if not head:
        v = FIRST + (0,)
    else:
        hv = parse(head["version"])
        v = (hv[0] + 1, 0, 0) if step == "major" else (hv[0], hv[1] + 1, 0) if step == "minor" else (hv[0], hv[1], hv[2] + 1)
        if work and parse(work["version"]) > v:
            v = parse(work["version"])
    v = fmt(v)
    day = work["date"] if work and work.get("version") == v else date.today().isoformat()
    return {"version": v, "build": build, "date": day}


def block(extra, ver):
    mods, lazy = assets(extra)
    imap = json.dumps({"imports": {f"./{m}": f"./{stamp(m)}" for m in mods + lazy}}, indent=1)
    lines = [
        START,
        "<!-- Generated by scripts/stamp.py (run it after changing any file in js/ or css/); don't edit by hand. -->",
        f'<meta name="app-version" content="{ver["version"]}" data-date="{ver["date"]}" data-build="{ver["build"]}">',
        f'<script type="importmap">\n{imap}\n</script>',
        f'<link rel="stylesheet" href="{stamp("css/app.css")}">',
        *[f'<script type="module" src="{stamp(e)}"></script>' for e in extra],
        f'<script type="module" src="{stamp("js/main.js")}"></script>',
        *[f'<link rel="modulepreload" href="{stamp(m)}">' for m in mods if m != "js/main.js" and m not in extra],
        END,
    ]
    return "\n".join(lines)


def main():
    check = "--check" in sys.argv
    stale = []
    ver = version(build_id(), "major" if "--major" in sys.argv else "minor" if "--minor" in sys.argv else "patch")
    vtext = json.dumps(ver, indent=1) + "\n"
    if not VERSION_FILE.exists() or VERSION_FILE.read_text() != vtext:
        stale.append("version.json")
        if not check:
            VERSION_FILE.write_text(vtext)
    for page, extra in PAGES.items():
        p = ROOT / page
        html = p.read_text()
        if START not in html or END not in html:
            sys.exit(f"{page}: missing the {START} ... {END} markers")
        a, b = html.index(START), html.index(END) + len(END)
        new = html[:a] + block(extra, ver) + html[b:]
        if new != html:
            stale.append(page)
            if not check:
                p.write_text(new)
    if check:
        print(f"out of date: {', '.join(stale)} (run python3 scripts/stamp.py)" if stale else "up to date")
        sys.exit(1 if stale else 0)
    print(f"{'updated: ' + ', '.join(stale) if stale else 'already up to date'} (v{ver['version']})")


if __name__ == "__main__":
    main()
