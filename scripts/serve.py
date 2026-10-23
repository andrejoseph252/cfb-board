"""Local dev server: serves the board at http://localhost:8000 with caching turned off.

    python3 scripts/serve.py            # or: python3 scripts/serve.py 8080

Python's plain `http.server` lets the browser cache files, so after an edit the browser can mix old and new
JavaScript modules and the page stops at "Loading the slate…". This sends no-store on everything instead, and
accepts enough simultaneous connections for the page's parallel module downloads.
"""
import functools
import http.server
import json
import pathlib
import socket
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


class Server(http.server.ThreadingHTTPServer):
    # The default backlog is 5 waiting connections; the page requests ~26 modules at once (they're preloaded),
    # which overflows it and makes the browser see dropped connections.
    request_queue_size = 128
    # Listen on IPv6 and IPv4 together: browsers often try "localhost" as ::1 first.
    address_family = socket.AF_INET6

    def server_bind(self):
        self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        super().server_bind()


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    # The sound lab (audio-lab/) saves its picks and notes straight into scripts/sounds/.
    SAVES = {"/audio-lab/save/picks": "scripts/sounds/picks.json", "/audio-lab/save/notes": "scripts/sounds/notes.json"}

    def do_POST(self):
        path = self.SAVES.get(self.path)
        if not path:
            return self.send_error(404)
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        try:
            data = json.loads(body)
        except ValueError:
            return self.send_error(400)
        (ROOT / path).write_text(json.dumps(data, indent=1) + "\n")
        self.send_response(204)
        self.end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = functools.partial(NoCache, directory=str(ROOT))
    with Server(("::", port), handler) as server:
        print(f"Serving {ROOT.name} at http://localhost:{port} (no caching). Ctrl+C to stop.")
        server.serve_forever()


if __name__ == "__main__":
    main()
