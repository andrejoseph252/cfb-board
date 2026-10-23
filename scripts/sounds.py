"""The game's sound pipeline: real recordings in, balanced game-ready clips out.

    python3 scripts/sounds.py fetch            # download every source in scripts/sounds/sources.json (cached)
    python3 scripts/sounds.py cands [slot...]  # cut candidate clips for the sound lab, with loudness and spectrograms
    python3 scripts/sounds.py build            # render the picks (scripts/sounds/picks.json) into audio/ + manifest

Then audition and pick in the sound lab: python3 scripts/serve.py, open http://localhost:8000/audio-lab/

Why this way: the game's sounds used to be synthesized from oscillators, which never sounds like a stadium. Now
every sound is a real recording. The ear is the judge, so the lab is where clips get picked; this script does
everything around that: it cuts the clips, measures them, and makes every clip in a slot equally loud (K-weighted
loudness, as broadcasters measure it) so the in-game mix only has to balance slots, not individual files.

Needs ffmpeg and yt-dlp (brew install ffmpeg yt-dlp) and numpy. Raw downloads live in .cache/sounds (not committed).
"""
import hashlib
import json
import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
try:
    import numpy as np
except ImportError:   # first run: a private environment with numpy in .cache, then run again inside it
    venv = ROOT / ".cache/venv"
    if not (venv / "bin/python").exists():
        subprocess.run([sys.executable, "-m", "venv", str(venv)], check=True)
        subprocess.run([str(venv / "bin/pip"), "install", "-q", "numpy"], check=True)
    os.execv(str(venv / "bin/python"), [str(venv / "bin/python"), *sys.argv])

SRC = ROOT / "scripts/sounds/sources.json"
PICKS = ROOT / "scripts/sounds/picks.json"
RAW = ROOT / ".cache/sounds/raw"
LAB = ROOT / "audio-lab"
CAND = LAB / "cand"
OUT = ROOT / "audio"
SR = 44100

# Loudness each slot is normalized to, in LUFS. Events are measured at their loudest 400 ms (how loud they hit);
# beds and music by their gated average (how loud they sit). The game's mixer sets the final balance on top.
TARGET = {
    "whistle": -16, "hike": -17, "throw": -20, "catch": -18, "tackle": -15, "juke": -22, "kick": -17, "blip": -22,
    "aww": -18, "gasp": -18, "cheer": -16, "firstdown": -17, "boo": -17, "charge": -16,
    "warchant": -16, "fsufight": -16, "band": -16, "defense": -16, "drumline": -20, "crowd": -20, "crowdhype": -20,
}
STEREO = {"cheer", "firstdown", "boo", "charge", "warchant", "fsufight", "band", "defense", "drumline", "crowd", "crowdhype"}
LOOP = {"crowd", "crowdhype"}
# Fade in and out (seconds) for the crowd and the band, so they swell up and die away the way a stadium does instead
# of switching on and off. Sharp effects (hits, whistles, kicks) keep their attack: a few ms in, 30 ms out.
ENV = {
    "cheer": (.35, 2.5), "boo": (.6, 2.0), "aww": (.12, .9), "gasp": (.06, .9), "firstdown": (.25, 1.5),
    "charge": (.02, 1.2), "warchant": (.4, 2.5), "fsufight": (.3, 2.5), "band": (.3, 2.5), "defense": (.5, 2.5),
    "drumline": (1.0, 2.0),
}


def envelope_of(slot, cfg):
    return ENV.get(slot) or ((.003, .03) if cfg["slots"][slot]["cut"] == "events" else (.08, 1.0))


def run(*cmd, quiet=True):
    return subprocess.run(cmd, check=True, capture_output=quiet)


def load_cfg():
    return json.loads(SRC.read_text())


# ---------- fetch ----------

def fetch():
    RAW.mkdir(parents=True, exist_ok=True)
    for s in load_cfg()["sources"]:
        wav = RAW / f"{s['yt']}.wav"
        if wav.exists():
            continue
        print("fetch", s["yt"], s["slot"])
        tmp = RAW / f"{s['yt']}.dl"
        cmd = ["yt-dlp", "-q", "--no-warnings", "-f", "bestaudio", "-o", str(tmp) + ".%(ext)s"]
        if s.get("section"):
            cmd += ["--download-sections", f"*{s['section']}"]
        try:
            run(*cmd, f"https://www.youtube.com/watch?v={s['yt']}")
            got = next(RAW.glob(f"{s['yt']}.dl.*"))
            run("ffmpeg", "-y", "-v", "error", "-i", str(got), "-ac", "2", "-ar", str(SR), "-c:a", "pcm_s16le", str(wav))
            got.unlink()
        except Exception as e:   # a video that's gone or blocked just drops out of the candidates
            print("  failed:", e)


# ---------- audio helpers ----------

def read(path, start=0.0, dur=None):
    """Float32 stereo samples (n, 2) of a wav, or a slice of it."""
    cmd = ["ffmpeg", "-v", "error", "-ss", str(start)] + (["-t", str(dur)] if dur else []) + \
          ["-i", str(path), "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"]
    return np.frombuffer(subprocess.run(cmd, check=True, capture_output=True).stdout, np.float32).reshape(-1, 2).copy()


def kweight(x):
    """K-weighting (ITU BS.1770: a high shelf around 1.5 kHz and a high pass at 38 Hz), via ffmpeg."""
    p = subprocess.run(["ffmpeg", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-",
                        "-af", "highshelf=f=1500:g=4:t=q:w=0.7,highpass=f=38:p=2", "-f", "f32le", "-"],
                       input=x.astype(np.float32).tobytes(), check=True, capture_output=True)
    return np.frombuffer(p.stdout, np.float32).reshape(-1, 2)


def momentary(x, hop=0.1):
    """Loudness (LUFS) of each 400 ms block, every hop seconds."""
    k = kweight(x)
    ms = (k.astype(np.float64) ** 2).sum(1)
    w, h = int(.4 * SR), int(hop * SR)
    if len(ms) < w:
        return np.array([-0.691 + 10 * np.log10(ms.mean() * len(ms) / w + 1e-12)])
    c = np.concatenate([[0], np.cumsum(ms)])
    starts = np.arange(0, len(ms) - w + 1, h)
    return -0.691 + 10 * np.log10((c[starts + w] - c[starts]) / w + 1e-12)


def integrated(x):
    """Gated integrated loudness (BS.1770: absolute gate -70, relative gate -10 LU)."""
    m = momentary(x)
    m = m[m > -70]
    if not len(m):
        return -70.0
    rel = 10 * np.log10(np.mean(10 ** (m / 10))) - 10
    m = m[m > rel]
    return float(10 * np.log10(np.mean(10 ** (m / 10))))


def loudness(x, slot, cfg):
    return integrated(x) if cfg["slots"][slot]["cut"] == "windows" else float(momentary(x).max())


def envelope(x, frame=0.01):
    """RMS level in dBFS every frame seconds (mono)."""
    m = x.mean(1)
    n = int(frame * SR)
    m = m[: len(m) // n * n].reshape(-1, n)
    return 20 * np.log10(np.sqrt((m ** 2).mean(1)) + 1e-9)


def fade(x, a, b):
    x = x.copy()
    na, nb = min(int(a * SR), len(x) // 2), min(int(b * SR), len(x) // 2)
    if na:
        x[:na] *= np.sin(np.linspace(0, np.pi / 2, na))[:, None] ** 2
    if nb:
        x[-nb:] *= np.cos(np.linspace(0, np.pi / 2, nb))[:, None] ** 2
    return x


def encode(x, path, stereo, kbps):
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-",
                    "-ac", "2" if stereo else "1", "-c:a", "libmp3lame", "-b:a", f"{kbps}k", str(path)],
                   input=np.clip(x, -1, 1).astype(np.float32).tobytes(), check=True, capture_output=True)


def spectrogram(path, png):
    run("ffmpeg", "-y", "-v", "error", "-i", str(path), "-lavfi",
        "showspectrumpic=s=640x240:legend=1:scale=log:fscale=log:stop=16000", str(png))


# ---------- candidates ----------

def cut_events(x, lo, hi):
    """Each separate sound in a sound-effect video: runs above a threshold set from the clip's own peak and floor."""
    e = envelope(x)
    peak, floor = e.max(), np.percentile(e, 10)
    th = max(peak - 32, floor + 12)
    on = e > th
    segs, i = [], 0
    while i < len(on):
        if not on[i]:
            i += 1
            continue
        j = i
        while j < len(on) and (on[j] or on[j:j + 12].any()):   # bridge gaps under 120 ms
            j += 1
        # Let the tail ring out until it's 20 dB further down, so nothing is clipped short.
        k = j
        while k < len(e) and e[k] > th - 20 and (k - i) * .01 < hi:
            k += 1
        segs.append((max(0, i - 2) * .01, min(k, len(e)) * .01))
        i = j
    out = []
    for a, b in segs:
        b = min(b, a + hi)
        if b - a < lo or (out and a < out[-1][1] - .5 * (b - a)):   # too short, or mostly the previous sound again
            continue
        out.append((a, b))
    # Drop scraps: anything 18 LU quieter than the loudest sound in the video is background, not the effect.
    lv = [float(momentary(x[int(a * SR):int(b * SR)]).max()) for a, b in out]
    return [s for s, v in zip(out, lv) if v > max(lv) - 18] if lv else out


def cut_windows(x, lo, hi, slot):
    """The best stretches of a long recording: steady ones for a stadium bed, ones that start on a swell for the
    rest (a cheer that rises, a chant that comes in)."""
    e = envelope(x, .1)
    L = int(hi * 10)
    if len(e) <= L:
        return [(0.0, len(e) / 10)]
    cands = []
    for s in range(0, len(e) - L, 5):
        w = e[s:s + L]
        if slot in LOOP:
            score = -np.std(w) + .05 * w.mean()                          # steady and full
        else:
            rise = e[s + 3:s + 13].mean() - e[max(0, s - 10):s].mean() if s >= 3 else 0
            score = w.mean() + .6 * max(0, rise)                          # loud, and starting on an onset
        cands.append((score, s))
    cands.sort(reverse=True)
    picked = []
    for _, s in cands:
        if all(abs(s - p) >= L * .6 for p in picked):
            picked.append(s)
        if len(picked) == 4:
            break
    return [(s / 10, (s + L) / 10) for s in sorted(picked)]


def cands(only):
    cfg = load_cfg()
    allc = json.loads((LAB / "candidates.json").read_text()) if (LAB / "candidates.json").exists() else []
    allc = [c for c in allc if only and c["slot"] not in only]
    for s in cfg["sources"]:
        slot = s["slot"]
        if only and slot not in only:
            continue
        wav = RAW / f"{s['yt']}.wav"
        if not wav.exists():
            continue
        spec = cfg["slots"][slot]
        x = read(wav)
        lo, hi = spec["len"]
        cuts = s.get("cuts") or (cut_events(x, lo, hi) if spec["cut"] == "events" else cut_windows(x, lo, hi, slot))
        for a, b in cuts[:6]:
            y = x[int(a * SR):int(b * SR)]
            if len(y) < SR * .03:
                continue
            cid = f"{s['yt']}@{a:.2f}-{b:.2f}"
            y = fade(y, *envelope_of(slot, cfg))
            L = loudness(y, slot, cfg)
            y = y * 10 ** ((TARGET[slot] - L) / 20)                     # audition at the level the game will use
            f = CAND / slot / (cid.replace("@", "_") + ".mp3")
            encode(y, f, slot in STEREO, 128)
            spectrogram(f, f.with_suffix(".png"))
            allc.append({"id": cid, "slot": slot, "src": s["yt"], "start": a, "end": b, "dur": round(b - a, 2),
                         "lufs": round(L, 1), "clip": round(float((np.abs(x[int(a * SR):int(b * SR)]) > .98).mean() * 100), 2), "peak": round(float(20 * np.log10(np.abs(x[int(a * SR):int(b * SR)]).max() + 1e-9)), 1),
                         "file": str(f.relative_to(LAB)), "png": str(f.with_suffix('.png').relative_to(LAB))})
            print(f"{slot:10} {cid:28} {b - a:5.2f}s {L:6.1f} LUFS")
    (LAB / "candidates.json").write_text(json.dumps(allc, indent=1))
    (LAB / "slots.json").write_text(json.dumps(cfg["slots"], indent=1))


# ---------- build ----------

def loopify(y, xf=2.0):
    """A seamless loop: the last xf seconds crossfade (equal power) into the start."""
    n = int(xf * SR)
    head, tail, body = y[:n], y[-n:], y[n:-n]
    t = np.linspace(0, np.pi / 2, n)[:, None]
    return np.concatenate([tail * np.cos(t) + head * np.sin(t), body])


def build():
    cfg, picks = load_cfg(), json.loads(PICKS.read_text())
    man = {}
    for f in OUT.glob("*.mp3"):
        f.unlink()
    for slot, lst in picks.items():
        if slot.startswith("_") or not lst:
            continue
        spec, man[slot] = cfg["slots"][slot], []
        for k, p in enumerate(lst):
            src, rng = p["id"].split("@")
            a, b = map(float, rng.split("-"))
            a, b = a + p.get("trimStart", 0), b + p.get("trimEnd", 0)
            y = read(RAW / f"{src}.wav", a, b - a)
            if slot in LOOP:
                y = loopify(y)
            else:
                fi, fo = envelope_of(slot, cfg)
                y = fade(y, p.get("fadeIn", fi), p.get("fadeOut", fo))
            L = loudness(y, slot, cfg)
            g = 10 ** ((TARGET[slot] + p.get("gain", 0) - L) / 20)
            pk = np.abs(y).max() * g
            if pk > .89:                                                   # keep peaks under -1 dBFS
                g *= .89 / pk
                print(f"  {slot}-{k}: peak-limited, {20 * np.log10(.89 / pk):.1f} dB under target")
            tmp = OUT / f"{slot}-{k}.tmp.mp3"
            encode(y * g, tmp, slot in STEREO, 112 if slot in STEREO else 80)
            # A fingerprint in the name, like stamp.py's for scripts: a browser never mixes in a stale cached clip.
            name = f"{slot}-{k}.{hashlib.sha1(tmp.read_bytes()).hexdigest()[:8]}.mp3"
            tmp.rename(OUT / name)
            man[slot].append({"f": name, "dur": round(len(y) / SR, 2)})
            print(f"{name:16} {len(y) / SR:5.2f}s  {L:6.1f} -> {TARGET[slot] + p.get('gain', 0)} LUFS")
    (OUT / "manifest.json").write_text(json.dumps(man, indent=1))
    kb = sum(f.stat().st_size for f in OUT.glob("*.mp3")) / 1024
    print(f"{sum(len(v) for v in man.values())} clips, {kb:.0f} KB")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "fetch":
        fetch()
    elif cmd == "cands":
        cands(set(sys.argv[2:]))
    elif cmd == "build":
        build()
    else:
        print(__doc__)
