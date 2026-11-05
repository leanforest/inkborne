# 飞剑：剑身沿 -Y（导出到 three.js 后剑尖朝 +Z，与角色正面一致），人可以站在剑身上
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *

reset()
BLADE = mat('sword_blade', '#d5e4ee')
EDGE = mat('sword_edge', '#f4faff')
FULLER = mat('sword_fuller', '#9fb6c8')
GOLD = mat('sword_gold', '#c9a24a')
GRIP = mat('sword_grip', '#3a2f2a')
TASSEL = mat('sword_tassel', '#c0392b')

L, W, T = 1.9, 0.16, 0.035          # 剑身长、宽、厚（放大过，便于站立）
y0 = -0.15                          # 剑格位置；剑身向 -Y 延伸到 y0-L
# 剑身：菱形截面放样，近剑尖收窄
rows = 24
verts, faces = [], []
for i in range(rows + 1):
    t = i / rows
    y = y0 - L * t
    w = W / 2 * (1 - t ** 3.5) * (1 - 0.15 * t)
    if i == rows:
        w = 0.0
    th = T / 2 * (1 - t ** 3)
    verts += [(w, y, 0), (0, y, th), (-w, y, 0), (0, y, -th)]
for i in range(rows):
    a = i * 4
    for k in range(4):
        faces.append((a + k, a + (k + 1) % 4, a + 4 + (k + 1) % 4, a + 4 + k))
faces.append((3, 2, 1, 0))
mesh_obj('blade', verts, faces, BLADE)
# 血槽与刃线
tubes('fuller', [[(0, y0 - 0.05, T / 2 + 0.002), (0, y0 - L * 0.7, T / 2 * 0.7)], [(0, y0 - 0.05, -T / 2 - 0.002), (0, y0 - L * 0.7, -T / 2 * 0.7)]], 0.008, FULLER, res=2)
for side in (1, -1):
    tubes('edge', [[(side * W / 2 * (1 - (k / 12) ** 3.5) * (1 - 0.15 * k / 12), y0 - L * k / 12, 0) for k in range(12)]], 0.006, EDGE, res=2)
# 剑格（护手）：两端上翘的弧
guard = [(x, y0 + 0.02, 0.03 * (abs(x) / 0.2) ** 2) for x in [-0.2 + 0.4 * k / 16 for k in range(17)]]
tubes('guard', [guard], 0.032, GOLD, res=4)
box('guard_core', (0.12, 0.06, 0.06), (0, y0 + 0.02, 0), GOLD)
# 剑柄 + 缠绳纹 + 剑首环
cyl_ = cyl('grip', 0.028, 0.32, (0, y0 + 0.05, 0), GRIP, seg=10)
cyl_.rotation_euler.x = -math.pi / 2
for k in range(7):
    tubes('wrap', [[(0.03 * math.cos(a), y0 + 0.08 + k * 0.04 + a * 0.004, 0.03 * math.sin(a)) for a in [q * 0.6 for q in range(11)]]], 0.006, GOLD, res=2)
ring = [(0.05 * math.cos(a), y0 + 0.43 + 0.05 * math.sin(a), 0) for a in [q * 2 * math.pi / 20 for q in range(21)]]
tubes('pommel', [ring], 0.014, GOLD, res=4)
# 剑穗：一段绳 + 一束穗子
tubes('cord', [[(0, y0 + 0.48, 0), (0.02, y0 + 0.6, -0.04), (0.0, y0 + 0.72, -0.08)]], 0.008, TASSEL, res=2)
strands = []
for k in range(9):
    a = k / 9 * math.pi * 2
    strands.append([(0.0, y0 + 0.72, -0.08), (0.025 * math.cos(a), y0 + 0.82, -0.08 + 0.025 * math.sin(a)), (0.04 * math.cos(a), y0 + 0.98, -0.12 + 0.03 * math.sin(a))])
tubes('tassel', strands, 0.006, TASSEL, res=2)

ob = join_all('sword')
print('FACES', len(ob.data.polygons), 'DIMS', tuple(round(v, 2) for v in ob.dimensions))
export_glb('sword.glb')
preview('sword.png', target=(0, -0.7, 0), dist=3.2, elev=40, azim=-60, res=(900, 600))
