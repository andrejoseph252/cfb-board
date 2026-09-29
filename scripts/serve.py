"""Local dev server: serves the board at http://localhost:8000 with caching turned off.

    python3 scripts/serve.py            # or: python3 scripts/serve.py 8080

Python's plain `http.server` lets the browser cache files, so after an edit the browser can mix old and new
JavaScript modules and the page stops at "Loading the slate…". This sends no-store on everything instead, and
accepts enough simultaneous connections for the page's parallel module downloads.
"""
import functools
import http.server
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


class Server(http.server.ThreadingHTTPServer):
    # The default backlog is 5 waiting connections; the page requests ~26 modules at once (they're preloaded),
    # which overflows it and makes the browser see dropped connections.
    request_queue_size = 128


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = functools.partial(NoCache, directory=str(ROOT))
    with Server(("", port), handler) as server:
        print(f"Serving {ROOT.name} at http://localhost:{port} (no caching). Ctrl+C to stop.")
        server.serve_forever()


if __name__ == "__main__":
    main()
