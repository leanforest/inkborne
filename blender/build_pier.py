# 木栈桥：沿 +x 伸向水面（0 → L），桥面高 0.9；带岸端石阶
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *

reset()
rnd = random.Random(3)
PLANK = mat('wood_plank', '#a9825a')
PLANK2 = mat('wood_plank_old', '#93714f')
BEAM = mat('wood_beam', '#6c4e36')
POST = mat('wood_post', '#5a412e')
ROPE = mat('rope', '#a08a5e')
STONE = mat('stone', '#d5cfc0')

L, W, Z = 12.0, 2.2, 0.9
# 桥面木板：横铺，留缝，长短/高低略有参差
x = 0.0
while x < L:
    w = rnd.uniform(0.2, 0.28)
    box('plank', (w - 0.03, W + rnd.uniform(-0.12, 0.12), 0.07), (x + w / 2, rnd.uniform(-0.04, 0.04), Z + rnd.uniform(-0.01, 0.01)),
        PLANK if rnd.random() < 0.7 else PLANK2, rot_z=rnd.uniform(-0.02, 0.02))
    x += w
# 纵梁
for y in (-W / 2 + 0.2, 0, W / 2 - 0.2):
    box('stringer', (L, 0.14, 0.16), (L / 2, y, Z - 0.12), BEAM)
# 桩与横担
for px in [k * 2.0 for k in range(7)]:
    for y in (-W / 2 + 0.1, W / 2 - 0.1):
        cyl('pile', 0.1, 2.6, (px, y, Z - 2.4), POST, seg=10)
    box('cross', (0.14, W + 0.1, 0.14), (px, 0, Z - 0.3), BEAM)
# 单侧栏杆（左舷）与绳
rail_y = W / 2 - 0.1
for px in [k * 1.5 for k in range(9)]:
    cyl('rail_post', 0.06, 1.0, (px, rail_y, Z), POST, seg=8)
tubes('rail', [[(0, rail_y, Z + 0.95), (L, rail_y, Z + 0.95)]], 0.04, BEAM, res=4)
# 尽头系船桩 + 缠绳
for y in (-W / 2 + 0.1, W / 2 - 0.1):
    cyl('bollard', 0.13, 1.3, (L - 0.1, y, Z - 0.2), POST, seg=10, r_top=0.11)
    tubes('rope', [[(L - 0.1 + 0.15 * math.cos(a), y + 0.15 * math.sin(a), Z + 0.55 + 0.012 * a) for a in [k * 0.45 for k in range(30)]]], 0.022, ROPE, res=2)
# 岸端石阶：三级，向岸上抬
for i in range(3):
    box('step', (0.9, W + 0.6, 0.3), (-0.45 - i * 0.9, 0, Z - 0.1 + i * 0.28), STONE)

ob = join_all('pier')
print('FACES', len(ob.data.polygons), 'DIMS', tuple(round(v, 2) for v in ob.dimensions))
export_glb('pier.glb')
preview('pier.png', target=(5, 0, 0.8), dist=16, elev=20, azim=-35)
