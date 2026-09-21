#!/usr/bin/env python3
"""TKGTM Lectures — local dev server.

Serves the PWA statically and proxies lecture downloads (matching the Vercel
function at /api/download) so you can develop & test locally without Node.

    python3 app.py [port]

Requirements: Python 3 (stdlib only). Service workers work on http://localhost.
"""

import os
import re
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36")
ACCEPT = "audio/*,*/*;q=0.8"
SRC_HOST = "https://www.tkgtm.com"

MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "TKGTM/1.0"

    def log_message(self, fmt, *args):
        sys.stderr.write("[%s] %s\n" % (self.address_string(), fmt % args))

    def _send(self, status, body, ctype, extra=None):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _static(self, path):
        if path in ("/", "/index.html"):
            path = "/index.html"
        safe = os.path.normpath(path.lstrip("/"))
        full = os.path.join(HERE, safe)
        if not full.startswith(HERE) or not os.path.isfile(full):
            self.send_error(404, "not found")
            return
        ext = os.path.splitext(full)[1].lower()
        with open(full, "rb") as f:
            body = f.read()
        self._send(200, body, MIME.get(ext, "application/octet-stream"),
                   {"Cache-Control": "no-cache" if ext in (".html", ".js", ".json", ".webmanifest") else "public, max-age=3600"})

    def _download(self, path):
        if not re.match(r"^/MP3audio/MP3_[\w-]+/[\w.,%&'()!\-]+\.mp3$", path):
            self.send_error(400, "invalid path")
            return
        url = SRC_HOST + path
        filename = re.sub(r'[\\"]', "_", path.rsplit("/", 1)[-1])

        # Get length first via HEAD-equivalent (curl -sI)
        head = subprocess.run(
            ["curl", "-sIL", "--http1.1", "-A", UA, "-H", "Accept: %s" % ACCEPT, "--", url],
            capture_output=True, text=True, timeout=60)
        clen = None
        for line in head.stdout.splitlines():
            if line.lower().startswith("content-length:"):
                clen = line.split(":", 1)[1].strip()
                break

        self.send_response(200)
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Content-Disposition", 'attachment; filename="%s"' % filename)
        if clen:
            self.send_header("Content-Length", clen)
        else:
            self.send_header("Transfer-Encoding", "chunked")
            self.close_connection = True
        self.end_headers()

        if self.command == "HEAD":
            return
        proc = subprocess.Popen(
            ["curl", "-s", "-L", "--http1.1", "-A", UA, "-H", "Accept: %s" % ACCEPT, "--", url],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        try:
            if clen:
                while True:
                    chunk = proc.stdout.read(64 * 1024)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
            else:
                while True:
                    chunk = proc.stdout.read(64 * 1024)
                    if not chunk:
                        break
                    self.wfile.write(("%x\r\n" % len(chunk)).encode() + chunk + b"\r\n")
                self.wfile.write(b"0\r\n\r\n")
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path.startswith("/api/download"):
            qs = self.path.split("?", 1)[1] if "?" in self.path else ""
            import urllib.parse
            params = urllib.parse.parse_qs(qs)
            self._download(params.get("path", [""])[0])
        elif path.startswith("/icons/") or path in ("/", "/index.html", "/style.css", "/app.js", "/views.js", "/sw.js", "/manifest.webmanifest", "/lectures.json"):
            self._static(path)
        else:
            self.send_error(404, "not found")

    def do_HEAD(self):
        self.do_GET()


def main():
    port = 8000
    if len(sys.argv) > 1:
        port = int(sys.argv[1])
    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print("TKGTM Lectures (local dev)")
    print("  open http://localhost:%d" % port)
    print("  press Ctrl+C to quit")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nbye")


if __name__ == "__main__":
    main()
