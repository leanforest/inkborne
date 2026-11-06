# 本地静态服务器（禁用缓存，改完刷新即生效）。用法：python tools/serve.py <目录> <端口>
# 额外：POST /__snap?name=xxx 把页面传来的 PNG 存到 tools/snaps/xxx.png（调试截图用）
import http.server, functools, sys, os, base64, urllib.parse, subprocess, threading

SNAPS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'snaps')
os.makedirs(SNAPS, exist_ok=True)


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        if u.path in ('/__frame', '/__clip'):
            return self.save_media(u)
        if u.path in ('/__raw', '/__raw_end'):
            return self.raw_frame(u)
        if u.path != '/__snap':
            self.send_error(404); return
        name = urllib.parse.parse_qs(u.query).get('name', ['snap'])[0]
        name = ''.join(c for c in name if c.isalnum() or c in '-_') or 'snap'
        data = self.rfile.read(int(self.headers.get('Content-Length', 0))).decode()
        png = base64.b64decode(data.split(',', 1)[1])
        with open(os.path.join(SNAPS, name + '.png'), 'wb') as f:
            f.write(png)
        self.send_response(200); self.end_headers(); self.wfile.write(b'ok')


    # 录视频用（spike/capture.js）：
    #   POST /__frame?shot=s01&i=12  → video/frames/s01/000012.png
    #   POST /__clip?name=audio.webm → video/audio.webm
    def save_media(self, u):
        q = urllib.parse.parse_qs(u.query)
        safe = lambda v: ''.join(c for c in v if c.isalnum() or c in '-_.') or 'x'
        if u.path == '/__frame':
            d = os.path.join(VIDEO, 'frames', safe(q.get('shot', ['s'])[0]))
            name = '%06d.png' % int(q.get('i', ['0'])[0])
        else:
            d, name = VIDEO, safe(q.get('name', ['clip.webm'])[0])
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, name), 'wb') as f:
            f.write(self.rfile.read(int(self.headers.get('Content-Length', 0))))
        self.send_response(200); self.end_headers(); self.wfile.write(b'ok')

    # 逐帧原始像素（RGBA）直接灌进 ffmpeg，边收边编码，不落盘：
    #   POST /__raw?shot=s01&w=1080&h=1920  （按顺序发送每一帧）
    #   POST /__raw_end?shot=s01            → promo/public/clips/s01.mp4
    #   加 &dir=clips_wide（两个请求都要带）→ promo/public/clips_wide/s01.mp4（横屏版）
    def raw_frame(self, u):
        q = urllib.parse.parse_qs(u.query)
        shot = ''.join(c for c in q.get('shot', ['s'])[0] if c.isalnum() or c in '-_')
        sub = q.get('dir', ['clips'])[0]
        if sub not in CLIP_DIRS:
            sub = 'clips'
        key = sub + '/' + shot
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        w, h = q.get('w', ['1080'])[0], q.get('h', ['1920'])[0]
        if u.path == '/__raw' and len(body) != int(w) * int(h) * 4:
            # 半截的帧（连接中断）不写进编码器，让页面重试
            self.send_response(400); self.end_headers(); self.wfile.write(b'bad frame size'); return
        with ENC_LOCK:
            # 第 0 帧：同名镜头若还有上次中断留下的编码器，先关掉重来
            if u.path == '/__raw' and q.get('i', [''])[0] == '0' and key in ENCODERS:
                old = ENCODERS.pop(key)
                try:
                    old.stdin.close()
                except OSError:
                    pass
                old.kill(); old.wait()
            if u.path == '/__raw_end':
                p = ENCODERS.pop(key, None)
                if p:
                    p.stdin.close(); p.wait()
                self.send_response(200); self.end_headers(); self.wfile.write(b'ok'); return
            p = ENCODERS.get(key)
            if p is None:
                out_dir = os.path.join(ROOT, 'promo', 'public', sub)
                os.makedirs(out_dir, exist_ok=True)
                p = ENCODERS[key] = subprocess.Popen([
                    ffmpeg_exe(), '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{w}x{h}', '-r', '30', '-i', '-',
                    '-vf', 'scale=out_color_matrix=bt709:out_range=tv', '-c:v', 'libx264', '-preset', 'slow', '-crf', '8',
                    '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
                    '-movflags', '+faststart', os.path.join(out_dir, shot + '.mp4')], stdin=subprocess.PIPE)
            p.stdin.write(body)
        self.send_response(200); self.end_headers(); self.wfile.write(b'ok')


def ffmpeg_exe():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLIP_DIRS = ('clips', 'clips_wide')   # 竖版 / 横版成片目录
ENCODERS, ENC_LOCK = {}, threading.Lock()

VIDEO = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'video')
directory = sys.argv[1] if len(sys.argv) > 1 else '.'
# 预览工具分配了别的端口时会通过 PORT 环境变量告知，优先用它
port = int(os.environ.get('PORT') or (sys.argv[2] if len(sys.argv) > 2 else 5173))
with http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(NoCache, directory=directory)) as server:
    url = f'http://127.0.0.1:{server.server_port}/'
    print(f'Serving {directory} at {url} (Ctrl+C to stop)', flush=True)
    if '--open' in sys.argv[3:]:
        import webbrowser
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
