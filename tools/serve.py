# 本地静态服务器（禁用缓存，改完刷新即生效）。用法：python tools/serve.py <目录> <端口>
# 额外：POST /__snap?name=xxx 把页面传来的 PNG 存到 tools/snaps/xxx.png（调试截图用）
import http.server, functools, sys, os, base64, urllib.parse

SNAPS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'snaps')
os.makedirs(SNAPS, exist_ok=True)


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        if u.path != '/__snap':
            self.send_error(404); return
        name = urllib.parse.parse_qs(u.query).get('name', ['snap'])[0]
        name = ''.join(c for c in name if c.isalnum() or c in '-_') or 'snap'
        data = self.rfile.read(int(self.headers.get('Content-Length', 0))).decode()
        png = base64.b64decode(data.split(',', 1)[1])
        with open(os.path.join(SNAPS, name + '.png'), 'wb') as f:
            f.write(png)
        self.send_response(200); self.end_headers(); self.wfile.write(b'ok')


directory = sys.argv[1] if len(sys.argv) > 1 else '.'
port = int(sys.argv[2]) if len(sys.argv) > 2 else 5173
http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(NoCache, directory=directory)).serve_forever()
