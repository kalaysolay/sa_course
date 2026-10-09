"""Static server for the AnalystGym clickable mockup.

Serves tasks-mockup/ over HTTP so that <script defer> loading, localStorage
and vendored Mermaid/PlantUML libraries work exactly like in production.

Usage:
    python tasks-mockup/server.py            # http://127.0.0.1:5180
    python tasks-mockup/server.py --port 8080
"""

import functools
import http.server
import os
import sys

MOCKUP_ROOT = os.path.dirname(os.path.abspath(__file__))
DEFAULT_PORT = 5180

# Explicit MIME types: on some Windows machines the registry maps .js
# to text/plain, which breaks <script> loading. We override it here.
http.server.SimpleHTTPRequestHandler.extensions_map.update(
    {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".svg": "image/svg+xml",
    }
)


def main(argv):
    port = DEFAULT_PORT
    for index, arg in enumerate(argv):
        if arg == "--port" and index + 1 < len(argv):
            port = int(argv[index + 1])
        elif arg.startswith("--port="):
            port = int(arg.split("=", 1)[1])

    handler = functools.partial(
        http.server.SimpleHTTPRequestHandler, directory=MOCKUP_ROOT
    )
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    print(f"AnalystGym mockup: http://127.0.0.1:{port}")
    print(f"Folder: {MOCKUP_ROOT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main(sys.argv[1:])
