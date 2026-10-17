"""Локальный браузерный стенд: статика из рабочего дерева, /api из отдельного тестового backend."""
import functools
import http.server
import pathlib
import urllib.request
import urllib.error

ROOT = pathlib.Path(__file__).resolve().parents[1]


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def api(self):
        data = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        headers = {k: v for k, v in self.headers.items() if k.lower() not in ("host", "connection", "content-length")}
        request = urllib.request.Request("http://127.0.0.1:8097" + self.path,
                                         data=data if self.command != "GET" else None,
                                         method=self.command, headers=headers)
        try:
            response = urllib.request.urlopen(request, timeout=30)
        except urllib.error.HTTPError as error:
            response = error
        self.send_response(response.status)
        for key, value in response.headers.items():
            if key.lower() not in ("transfer-encoding", "connection", "content-length"):
                self.send_header(key, value)
        self.end_headers()
        self.wfile.write(response.read())

    def do_GET(self):
        if "If-Modified-Since" in self.headers:
            del self.headers["If-Modified-Since"]
        if self.path.startswith("/api/"):
            self.api()
        else:
            super().do_GET()

    do_POST = api
    do_PUT = api
    do_PATCH = api
    do_DELETE = api


if __name__ == "__main__":
    handler = functools.partial(Handler, directory=str(ROOT))
    http.server.ThreadingHTTPServer(("127.0.0.1", 5198), handler).serve_forever()
