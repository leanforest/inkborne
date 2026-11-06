# 乌篷小船 + 戴斗笠的渔夫（立于船尾撑篙）
# 船身：沿船长放样的横截面（船头船尾上翘、收窄），船舷、横梁、木板缝；船篷：竹篾拱篷 + 篷骨
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
from mathutils import Vector, Matrix

EMPTY = '--empty' in sys.argv   # 空船：给玩家划的，不带渔夫
reset()
HULL = mat('wood_hull', '#7a4630')
HULL_D = mat('wood_dark', '#5a3324')
DECK = mat('wood_deck', '#a7764c')
MAT_ = mat('canopy_mat', '#3e3a36')
RIB = mat('canopy_rib', '#6b5a44')
ROBE = mat('robe_blue', '#3b6a9c')
ROBE_D = mat('robe_dark', '#2c4e78')
SKIN = mat('skin', '#e2b994')
HAT = mat('straw_hat', '#d6b25a')
HAT_D = mat('straw_hat_band', '#a9873d')
POLE = mat('bamboo_pole', '#b49a5a')
ROPE = mat('rope', '#8a7350')

L = 5.6          # 船长（x 方向，船头 +x）
Wmax = 0.78      # 半宽
Dep = 0.55       # 船深


def half_width(u):          # u ∈ [-1, 1]
    return Wmax * (1 - abs(u) ** 2.2) ** 0.7 + 0.02


def sheer(u):               # 船舷线：两头上翘
    return Dep + 0.35 * abs(u) ** 2.6 + (0.08 * u if u > 0 else 0)


def keel(u):                # 船底：中间最低，两头抬起
    return 0.0 + 0.32 * abs(u) ** 2.0


rows, cols = 40, 16
verts, faces = [], []
for i in range(rows + 1):
    u = -1 + 2 * i / rows
    x = u * L / 2
    hw, top, bot = half_width(u), sheer(u), keel(u)
    for j in range(cols + 1):
        a = math.pi * j / cols                    # 0 → π：从右舷顶，经船底，到左舷顶
        y = math.cos(a) * hw
        z = bot + (top - bot) * (1 - math.sin(a) ** 1.3)
        verts.append((x, y, z))
for i in range(rows):
    for j in range(cols):
        a = i * (cols + 1) + j
        b = a + cols + 1
        faces.append((a, a + 1, b + 1, b))
hull = mesh_obj('hull', verts, faces, HULL)
hull = solidify(hull, 0.05)
for p in hull.data.polygons: p.use_smooth = True

# 船舷压条
for side in (1, -1):
    pts = [((-1 + 2 * i / 40) * L / 2, side * half_width(-1 + 2 * i / 40), sheer(-1 + 2 * i / 40) + 0.02) for i in range(41)]
    tubes('gunwale', [pts], 0.045, HULL_D, res=4)
# 船板缝：沿船身参数取几条等角线
for k in (0.25, 0.5, 0.75):
    for side in (0, 1):
        a = (math.pi / 2) * k if side == 0 else math.pi - (math.pi / 2) * k
        pts = []
        for i in range(2, 39):
            u = -1 + 2 * i / 40
            hw, top, bot = half_width(u), sheer(u), keel(u)
            pts.append((u * L / 2, math.cos(a) * hw * 1.03, bot + (top - bot) * (1 - math.sin(a) ** 1.3) + 0.0))
        tubes('seam', [pts], 0.014, HULL_D, res=2)
# 甲板与横梁
box('deck', (L * 0.62, Wmax * 1.6, 0.04), (0, 0, 0.36), DECK)
for x in (-1.9, -0.9, 1.0, 1.9):
    u = x / (L / 2)
    box('thwart', (0.14, half_width(u) * 1.7, 0.06), (x, 0, sheer(u) - 0.06), HULL_D)

# 乌篷：竹篾拱篷（半圆柱壳）+ 篷骨
cx0, cx1, R0 = -0.75, 0.85, 0.66
v, f = [], []
seg, nl = 18, 8
for i in range(nl + 1):
    x = cx0 + (cx1 - cx0) * i / nl
    for j in range(seg + 1):
        a = math.pi * j / seg
        v.append((x, math.cos(a) * R0, 0.42 + math.sin(a) * R0 * 0.95))
for i in range(nl):
    for j in range(seg):
        a = i * (seg + 1) + j
        f.append((a, a + 1, a + seg + 2, a + seg + 1))
canopy = mesh_obj('canopy', v, f, MAT_)
canopy = solidify(canopy, 0.03)
for p in canopy.data.polygons: p.use_smooth = True
ribs = []
for i in range(nl + 1):
    x = cx0 + (cx1 - cx0) * i / nl
    ribs.append([(x, math.cos(math.pi * j / 24) * (R0 + 0.025), 0.42 + math.sin(math.pi * j / 24) * (R0 + 0.025) * 0.95) for j in range(25)])
tubes('ribs', ribs, 0.02, RIB, res=2)

if not EMPTY:
    # 渔夫：立在船尾，面朝船头，双手握竹篙斜撑入水（与主角共用 figure.py 的人体建模）
    import figure as F
    FC = F.palette('boatman', inner='#d9d3c3', robe='#5d7282', trim='#34424e', sash='#7d6b4f', pants='#3d434a',
                   boot='#4a3a2c', sole='#cbbd9c', skin='#e2b994', hat='#d1b066', hat_b='#9a7a3a')
    parts = {
        'legL': F.part('bm_legL', lambda: F.build_leg(FC, 1), (0.09, 0, 0.95)),
        'legR': F.part('bm_legR', lambda: F.build_leg(FC, -1), (-0.09, 0, 0.95)),
        'skirtL': F.part('bm_skirtL', lambda: F.build_skirts(FC, 1, inner=False, outer_prof=F.SHORT_P), (0.09, 0, 0.97)),
        'skirtR': F.part('bm_skirtR', lambda: F.build_skirts(FC, -1, inner=False, outer_prof=F.SHORT_P), (-0.09, 0, 0.97)),
        'torso': F.part('bm_torso', lambda: (F.build_torso(FC), F.build_sash(FC, knot=False)), (0, 0, 0.95)),
        'head': F.part('bm_head', lambda: F.shifted(lambda: (F.build_head(FC, hair_long=False), F.build_hat(FC, tilt=0.12, R=0.4)), (0, 0, -0.026)), (0, 0, 1.5)),
        'armL': F.part('bm_armL', lambda: F.build_arm(FC, 1, wide=False), (F.ARM_J, 0, 1.42)),
        'armR': F.part('bm_armR', lambda: F.build_arm(FC, -1, wide=False), (-F.ARM_J, 0, 1.42)),
    }
    # 站姿：右脚在前；双臂伸直握篙（刚体手臂按手→握点方向转过去）
    for k, v in (('legR', -0.18), ('legL', 0.14), ('skirtR', -0.09), ('skirtL', 0.07)):
        parts[k].rotation_euler.x = v
    grip_hi, grip_lo = Vector((-0.02, -0.47, 1.16)), Vector((-0.2, -0.4, 1.0))
    for k, side, g in (('armL', 1, grip_hi), ('armR', -1, grip_lo)):
        J = Vector((side * F.ARM_J, 0, 1.42))
        hand = Vector((side * (F.ARM_J + 0.024), -0.006, 0.9))
        ob = parts[k]
        ob.rotation_mode = 'QUATERNION'
        ob.rotation_quaternion = (hand - J).rotation_difference(g - J)
    parts['head'].rotation_euler.x = 0.08   # 微微低头看水
    parts['torso'].rotation_euler.x = 0.05
    # 竹篙穿过两手：上端在身前斜上方，下端从右舷外插入水中
    d = (grip_lo - grip_hi).normalized()
    pole_pts = [grip_hi - d * 0.5, grip_hi, grip_lo, grip_lo + d * 2.6]
    F.tubes('pole', [pole_pts], 0.022, POLE, res=4)
    fig = [o for o in bpy.context.scene.objects if o.name.startswith('bm_') or o.name.startswith('pole')]
    bpy.context.view_layer.update()
    place = Matrix.Translation((-1.55, 0.05, 0.38)) @ Matrix.Rotation(math.pi / 2, 4, 'Z')   # 人物 -Y 朝向 → 船头 +X，脚踩甲板
    for o in fig:
        o.matrix_world = place @ o.matrix_world
# 船头盘着的绳子与小竹篓
cyl('basket', 0.18, 0.28, (1.75, 0.2, 0.38), POLE, seg=12, r_top=0.14)
tubes('rope', [[(2.1 + 0.12 * math.cos(a), -0.15 + 0.12 * math.sin(a), 0.42 + 0.01 * a) for a in [k * 0.5 for k in range(26)]]], 0.018, ROPE, res=2)

ob = join_all('boat')
# 让吃水线在 z=0.15 左右：整体下移
ob.location.z = -0.15
bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
print('FACES', len(ob.data.polygons), 'DIMS', tuple(round(v, 2) for v in ob.dimensions))
export_glb('boat_empty.glb' if EMPTY else 'boat.glb')
preview('boat_empty.png' if EMPTY else 'boat.png', target=(0, 0, 0.5), dist=9, elev=14, azim=-35)
if not EMPTY:
    preview('boatman.png', target=(-1.6, 0, 1.15), dist=3.2, elev=10, azim=-55, res=(700, 700))
