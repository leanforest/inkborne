# 精细楼阁样板：石台 + 栏杆 + 红柱 + 格扇门窗 + 额枋彩画 + 斗拱 + 腰檐 + 二层回廊 + 歇山式屋顶（瓦垄、戗脊、正脊、鸱吻）
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
from arch import *

# ───────── 组装
# 台基 + 台阶 + 石栏
box('base', (16, 12, 1.2), (0, 0, 0.6), STONE)
box('base_lip', (16.4, 12.4, 0.18), (0, 0, 1.21), STONE_D)
for i in range(5):
    box('step', (4.2, 0.45, 0.24 * (i + 1)), (0, -6.2 - 0.45 * (4 - i) - 0.2, 0.12 * (i + 1)), STONE_D)
balustrade('base_rail', 7.8, 5.8, 1.3, skip_front=2.3)

# 一层
xs1 = [-5.4, -1.8, 1.8, 5.4]
floor('f1', 5.4, 3.7, 1.3, 4.2, xs1, [-3.7, 0, 3.7])
z_skirt = 1.3 + 4.2 + 0.95
# 匾额挂在一层正中额枋下，檐角挂两盏宫灯
plaque('plaque', 0, -3.7 - 0.25, 1.3 + 4.2 - 0.75, w=2.4, h=0.75)
for sx in (-1, 1):
    lantern('lantern', sx * 4.4, -3.7 - 0.9, 1.3 + 4.2 - 0.9)
roof('skirt', z_skirt, 15.2, 11.2, 4.4, 0.75, 1.6, t0=0.0, t1=0.45)

# 二层回廊
z2 = z_skirt + 4.4 * 0.45 ** 1.7 + 0.05
box('balcony', (11.4, 8.2, 0.3), (0, 0, z2 + 0.15), STONE_D)
balustrade('bal_rail', 5.6, 4.0, z2 + 0.3, h=0.85, gap=0.7, m=RED, post=0.12)
xs2 = [-4.0, -1.35, 1.35, 4.0]
floor('f2', 4.0, 2.7, z2 + 0.3, 3.4, xs2, [-2.7, 0, 2.7], front_doors=False, col_r=0.2)

# 顶层歇山顶
z_top = z2 + 0.3 + 3.4 + 0.95
roof('top', z_top, 12.8, 9.2, 4.1, 1.05, 3.0)
rz = z_top + 4.1 + 0.18
box('ridge_main', (6.4, 0.42, 0.55), (0, 0, rz), RIDGE)
box('ridge_band', (6.2, 0.46, 0.12), (0, 0, rz + 0.12), GOLD)
# 鸱吻：正脊两端向内卷起
for sgn in (-1, 1):
    pts = []
    for i in range(14):
        a = i / 13 * math.pi * 1.3
        pts.append((sgn * (3.2 - 0.55 * math.sin(a)), 0, rz + 0.2 + 0.55 * (1 - math.cos(a)) + i * 0.03))
    tubes('chiwen', [pts], [[0.24 - i * 0.012 for i in range(14)]], RIDGE, res=6)
# 宝顶小装饰
cyl('pearl', 0.22, 0.45, (0, 0, rz + 0.25), GOLD, seg=10, r_top=0.05)

ob = join_all('pavilion')
print('FACES', len(ob.data.polygons), 'DIMS', tuple(round(v, 2) for v in ob.dimensions))
export_glb('pavilion.glb')
preview('pavilion_front.png', target=(0, 0, 7), dist=40, elev=14, azim=-30)
preview('pavilion_detail.png', target=(4, -4, 6.5), dist=14, elev=10, azim=-40)
