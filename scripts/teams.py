"""Every team's name, abbreviation, colors and logo, kept in data/teams.json for the game.

ESPN's team list doesn't allow requests from a web page (no CORS header), so the game can't load it itself; without
it, any team not on this week's slate fell back to gray. This saves it for the page to read. The file only changes
when ESPN's data does. Standard library only.

    {"52": {"name": "Florida State", "abbr": "FSU", "color": "#782f40", "alt": "#ceb888", "logo": "https://..."}}

    python3 scripts/teams.py
"""
import json
import pathlib
import urllib.request

URL = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams?groups=80&limit=1000"
OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "teams.json"


def main():
    req = urllib.request.Request(URL, headers={"User-Agent": "cfb-board/1.0", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.load(r)
    teams = {}
    for entry in data["sports"][0]["leagues"][0]["teams"]:
        t = entry["team"]
        teams[str(t["id"])] = {
            "name": t.get("location"), "abbr": t.get("abbreviation"),
            "color": "#" + t["color"] if t.get("color") else None,
            "alt": "#" + t["alternateColor"] if t.get("alternateColor") else None,
            "logo": (t.get("logos") or [{}])[0].get("href"),
        }
    if len(teams) < 100:
        raise SystemExit(f"only {len(teams)} teams came back; keeping the old file")
    OUT.write_text(json.dumps(dict(sorted(teams.items(), key=lambda kv: int(kv[0]))), separators=(",", ":")) + "\n")
    print(f"{len(teams)} teams")


if __name__ == "__main__":
    main()
