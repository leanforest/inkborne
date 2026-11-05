# 游人角色 v2：内白袍 + 外青衫（前襟开）、交领右衽、圆肩、宽袖、五官、发髻发簪、发带与腰带飘带（可单独摆动）
# 每个部件原点在关节处；three.js 直接转动部件做走路 / 坐船 / 抛竿 / 御剑与飘带动画。正面朝 -Y。
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
import bmesh

reset()
INNER = mat('robe_inner', '#f3f1ea')
ROBE = mat('robe_celadon', '#cfe4da')
TRIM = mat('robe_trim', '#2f6f6a')
SASH = mat('sash_red', '#b8433a')
PANTS = mat('pants', '#3e5a6e')
SHOE = mat('boot', '#2b2826')
SOLE = mat('sole', '#e8e2d4')
SKIN = mat('skin', '#f0cfae')
HAIR = mat('hair', '#26211e')
EYE = mat('eye', '#1d1b1a')
LIP = mat('lip', '#c9796a')
HAT = mat('straw_hat', '#d8bd72')
HAT_B = mat('straw_hat_band', '#8c6a32')
GOLD = mat('hairpin', '#c9a24a')
RIBBON = mat('ribbon', '#3f7f78')


def sphere(name, r, loc, m, scale=(1, 1, 1), seg=16, rings=10):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    for v in bm.verts:
        v.co.x *= scale[0]; v.co.y *= scale[1]; v.co.z *= scale[2]
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(m)
    ob.location = loc
    for p in me.polygons:
        p.use_smooth = True
    return link(ob)


def lathe(name, profile, m, a0=0.0, a1=2 * math.pi, seg=28, center=(0, 0), thick=0.012):
    """沿 z 轴旋转的剖面（r, z 列表），可只转一部分角度（用于前襟开口的外衫）"""
    full = abs(a1 - a0 - 2 * math.pi) < 1e-6
    n = seg if full else seg + 1
    verts, faces = [], []
    for (r, z) in profile:
        for j in range(n):
            a = a0 + (a1 - a0) * j / seg
            verts.append((center[0] + math.cos(a) * r, center[1] + math.sin(a) * r, z))
    for i in range(len(profile) - 1):
        for j in range(seg):
            a, b = i * n + j, i * n + (j + 1) % n
            faces.append((a, b, b + n, a + n))
    ob = mesh_obj(name, verts, faces, m)
    for p in ob.data.polygons:
        p.use_smooth = True
    return solidify(ob, thick) if thick else ob


def smooth(ob):
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def part(name, builder, joint):
    before = set(o.name for o in bpy.context.scene.objects)
    builder()
    objs = [o for o in bpy.context.scene.objects if o.name not in before and o.type == 'MESH']
    ob = join_objs(objs, name)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.context.scene.cursor.location = joint
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    return ob


FRONT = -math.pi / 2          # -Y 方向的角度


def torso():
    def b():
        # 内白袍：直到脚踝
        lathe('inner_skirt', [(0.16, 0.95), (0.2, 0.7), (0.25, 0.35), (0.27, 0.13)], INNER, thick=0.01)
        # 外青衫：前襟开口 ±0.42 弧度，下摆略外张，长到小腿
        lathe('outer_skirt', [(0.185, 0.97), (0.23, 0.72), (0.3, 0.42), (0.34, 0.26)], ROBE, a0=FRONT + 0.42, a1=FRONT + 2 * math.pi - 0.42, seg=30, thick=0.014)
        hem = [(math.cos(a) * 0.345, math.sin(a) * 0.345, 0.26) for a in [FRONT + 0.42 + (2 * math.pi - 0.84) * k / 30 for k in range(31)]]
        tubes('hem', [hem], 0.014, TRIM, res=2)
        for sgn in (-1, 1):   # 前襟两条镶边
            a = FRONT + sgn * 0.42
            tubes('placket', [[(math.cos(a) * r, math.sin(a) * r, z) for r, z in [(0.185, 0.97), (0.23, 0.72), (0.3, 0.42), (0.345, 0.26)]]], 0.013, TRIM, res=2)
        # 上身：胸背 + 圆肩
        lathe('chest', [(0.17, 0.93), (0.175, 1.1), (0.165, 1.3), (0.13, 1.44), (0.06, 1.48)], ROBE, thick=0)
        for sx in (-1, 1):
            sphere('shoulder', 0.085, (sx * 0.165, 0, 1.39), ROBE, scale=(1.1, 1, 0.85))
        # 交领右衽：白色内领 + 青色领缘，左襟压右襟
        # 交领：两襟从颈侧向胸前收成 V，左襟（人物自身的左，-X 一侧在画面右）压在上面并延到右腋下
        def on_chest(x, z, lift=0.004):
            r = 0.17 if z < 1.3 else 0.17 - (z - 1.3) * 0.28
            yy = -math.sqrt(max(0.0, r * r - x * x))
            return (x, yy - lift, z)
        tubes('inner_collar', [[on_chest(-0.05, 1.43, 0.0), on_chest(-0.015, 1.33, 0.0), on_chest(0.0, 1.27, 0.0)]], 0.016, INNER, res=2)
        tubes('collar_r', [[on_chest(-0.075, 1.44), on_chest(-0.03, 1.35), on_chest(0.0, 1.29)]], 0.014, TRIM, res=2)
        tubes('collar_l', [[on_chest(0.075, 1.44), on_chest(0.03, 1.35), on_chest(-0.04, 1.24, 0.008), on_chest(-0.12, 1.12, 0.008)]], 0.015, TRIM, res=2)
        # 腰带 + 结
        lathe('sash', [(0.182, 0.92), (0.185, 1.0)], SASH, thick=0)
        sphere('knot', 0.035, (0.07, -0.18, 0.96), SASH, scale=(1.3, 0.8, 1))
    return part('hero_torso', b, (0, 0, 0.95))


def head():
    def b():
        smooth(cyl('neck', 0.048, 0.12, (0, 0, 1.46), SKIN, seg=12))
        sphere('head', 0.112, (0, -0.005, 1.645), SKIN, scale=(0.9, 0.95, 1.08))
        # 五官（正面 -Y）
        for sx in (-1, 1):
            sphere('eye', 0.012, (sx * 0.038, -0.1, 1.66), EYE, scale=(1.3, 0.6, 0.9), seg=8, rings=6)
            tubes('brow', [[(sx * 0.02, -0.103, 1.69), (sx * 0.06, -0.093, 1.695)]], 0.004, HAIR, res=2)
        sphere('nose', 0.012, (0, -0.112, 1.635), SKIN, scale=(0.8, 1.0, 1.2), seg=8, rings=6)
        tubes('mouth', [[(-0.018, -0.1, 1.6), (0.018, -0.1, 1.6)]], 0.004, LIP, res=2)
        # 头发：后脑与两鬓，头顶发髻 + 金簪
        sphere('hair', 0.116, (0, 0.018, 1.67), HAIR, scale=(0.95, 0.95, 0.92))
        sphere('fringe', 0.1, (0, -0.03, 1.72), HAIR, scale=(1.0, 0.8, 0.45))
        sphere('bun', 0.048, (0, 0.03, 1.79), HAIR)
        tubes('pin', [[(-0.09, 0.03, 1.8), (0.09, 0.03, 1.8)]], 0.006, GOLD, res=2)
        # 斗笠：微凹的笠面 + 笠箍 + 系绳
        lathe('hat', [(0.36, 1.725), (0.3, 1.745), (0.16, 1.82), (0.03, 1.9), (0.0, 1.905)], HAT, thick=0.012)
        lathe('hat_band', [(0.135, 1.81), (0.13, 1.85)], HAT_B, thick=0)
        tubes('hat_string', [[(-0.1, -0.02, 1.74), (-0.07, -0.08, 1.57), (0, -0.1, 1.54), (0.07, -0.08, 1.57), (0.1, -0.02, 1.74)]], 0.005, HAT_B, res=2)
    return part('hero_head', b, (0, 0, 1.5))


def ribbon():
    def b():
        for sx in (-1, 1):
            pts = [(sx * 0.02, 0.1, 1.76), (sx * 0.04, 0.13, 1.6), (sx * 0.05, 0.14, 1.42), (sx * 0.05, 0.14, 1.25)]
            tubes('ribbon', [pts[:3]], [[0.011, 0.009, 0.006]], RIBBON, res=2)
    return part('hero_ribbon', b, (0, 0.1, 1.76))


def sash_tail():
    def b():
        for dx, ln in ((0.0, 0.42), (0.035, 0.34)):
            pts = [(0.07 + dx, -0.19, 0.95), (0.08 + dx, -0.2, 0.95 - ln * 0.5), (0.075 + dx, -0.2, 0.95 - ln)]
            tubes('tail', [pts], [[0.022, 0.02, 0.016]], SASH, res=2)
    return part('hero_sash', b, (0.07, -0.19, 0.95))


def legs(side):
    x = 0.09 * side
    def b():
        smooth(cyl('thigh', 0.075, 0.5, (x, 0, 0.45), PANTS, seg=12, r_top=0.085))
        smooth(cyl('shin', 0.062, 0.4, (x, 0, 0.08), PANTS, seg=12, r_top=0.075))
        sphere('shoe', 0.07, (x, -0.04, 0.05), SHOE, scale=(0.85, 1.6, 0.6))
        box('sole', (0.11, 0.22, 0.02), (x, -0.045, 0.01), SOLE)
    return part('hero_leg' + ('L' if side > 0 else 'R'), b, (x, 0, 0.95))


def arm(side):
    x = 0.2 * side
    def b():
        ax = x + 0.025 * side
        smooth(cyl('upper', 0.07, 0.28, (ax, 0, 1.12), ROBE, seg=14, r_top=0.075))
        # 宽袖：从肘部向下张开成喇叭口，袖口有青边；袖底垂一块“袖袋”
        lathe('sleeve', [(0.075, 1.15), (0.1, 1.05), (0.15, 0.92), (0.17, 0.86)], ROBE, seg=20, center=(ax, 0.01), thick=0.012)
        tubes('cuff', [[(ax + math.cos(a) * 0.172, 0.01 + math.sin(a) * 0.172, 0.86) for a in [k * 2 * math.pi / 24 for k in range(25)]]], 0.012, TRIM, res=2)
        sphere('drape', 0.12, (ax, 0.05, 0.86), ROBE, scale=(0.75, 0.9, 0.75))
        sphere('hand', 0.042, (ax, -0.01, 0.88), SKIN, scale=(0.85, 0.75, 1.15))
    return part('hero_arm' + ('L' if side > 0 else 'R'), b, (x, 0, 1.42))


objs = [legs(1), legs(-1), torso(), head(), arm(1), arm(-1), ribbon(), sash_tail()]
for o in objs:
    print(o.name, 'origin', tuple(round(v, 2) for v in o.location), 'faces', len(o.data.polygons))
export_glb('hero.glb')
preview('hero.png', target=(0, 0, 0.95), dist=4.0, elev=8, azim=-30, res=(700, 800))
preview('hero_face.png', target=(0, 0, 1.62), dist=1.1, elev=4, azim=-15, res=(600, 600))
