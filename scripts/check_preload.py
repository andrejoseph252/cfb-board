"""Check that index.html and demo.html preload every module main.js imports (and nothing that's gone).

    python3 scripts/check_preload.py

Run after adding, renaming or removing a JS module. A missing preload still works, just slower; a stale one wastes
a request.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def modules():
    seen = []

    def walk(f):
        f = f.resolve()
        if f in seen:
            return
        seen.append(f)
        for m in re.findall(r"^import .*? from '(\.[^']+)';", f.read_text(), re.M):
            walk(f.parent / m)

    walk(ROOT / "js" / "main.js")
    return {str(f.relative_to(ROOT)) for f in seen if f.name != "main.js"}


def main():
    want, ok = modules(), True
    for page in ("index.html", "demo.html"):
        have = set(re.findall(r'<link rel="modulepreload" href="([^"]+)">', (ROOT / page).read_text()))
        for m in sorted(want - have):
            print(f"{page}: missing <link rel=\"modulepreload\" href=\"{m}\">")
            ok = False
        for m in sorted(have - want):
            print(f"{page}: preloads {m}, which main.js no longer imports")
            ok = False
    print("preloads match the imports" if ok else "")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
