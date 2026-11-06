# 游人角色 v3：椭圆截面放样的躯干、交领右衽（白中衣领 + 青领缘）、前开襟后开衩的青衫、宽袖、
# 雕过的脸（眼窝 / 鼻 / 唇 / 剑眉）、按发际线裁出的发壳 + 披发 + 发髻、编织纹斗笠、腰结与飘带。
# 部件原点在关节处，three.js 直接转动部件做走路 / 坐船 / 抛竿 / 御剑与飘带动画；
# 衣摆左右两片（hero_skirtL/R）跟着腿摆一半，迈步时腿不再穿出袍子。正面朝 -Y。
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
from figure import *

reset()
C = palette('hero')
knot = Vector((0.065, -0.15, 0.995))
HEAD_DZ = -0.026   # 头部整体略降，脖子不显长


def torso():
    build_torso(C)
    build_sash(C)


objs = [
    part('hero_legL', lambda: build_leg(C, 1), (0.09, 0, 0.95)),
    part('hero_legR', lambda: build_leg(C, -1), (-0.09, 0, 0.95)),
    part('hero_skirtL', lambda: build_skirts(C, 1), (0.09, 0, 0.97)),
    part('hero_skirtR', lambda: build_skirts(C, -1), (-0.09, 0, 0.97)),
    part('hero_torso', torso, (0, 0, 0.95)),
    part('hero_head', lambda: shifted(lambda: (build_head(C), build_hat(C)), (0, 0, HEAD_DZ)), (0, 0, 1.5)),
    part('hero_armL', lambda: build_arm(C, 1), (ARM_J, 0, 1.42)),
    part('hero_armR', lambda: build_arm(C, -1), (-ARM_J, 0, 1.42)),
    part('hero_ribbon', lambda: shifted(lambda: build_ribbon(C), (0, 0, HEAD_DZ)), (0, 0.058, 1.79 + HEAD_DZ)),
    part('hero_sash', lambda: build_sash_tail(C, knot), tuple(knot)),
]
tot = 0
for o in objs:
    tot += len(o.data.polygons)
    print(o.name, 'origin', tuple(round(v, 3) for v in o.location), 'faces', len(o.data.polygons))
print('TOTAL faces', tot)
export_glb('hero.glb')

bpy.context.scene.display.shading.show_backface_culling = True
P = {o.name[5:]: o for o in objs}
preview('hero.png', target=(0, 0, 0.95), dist=4.0, elev=8, azim=-30, res=(700, 800))
preview('hero_back.png', target=(0, 0, 0.95), dist=4.0, elev=14, azim=160, res=(700, 800))
preview('hero_side.png', target=(0, 0, 0.95), dist=4.0, elev=4, azim=-90, res=(700, 800))
preview('hero_face.png', target=(0, -0.02, 1.63), dist=0.9, elev=2, azim=-18, res=(600, 600))
preview('hero_game.png', target=(0, 0, 1.2), dist=7.5, elev=22, azim=180, res=(700, 700))
# 走路姿势：腿 ±0.5、衣摆跟一半、手臂反向
for k, v in (('legL', -0.5), ('legR', 0.5), ('skirtL', -0.25), ('skirtR', 0.25), ('armL', 0.4), ('armR', -0.4)):
    P[k].rotation_euler.x = v
preview('hero_walk.png', target=(0, 0, 0.95), dist=4.0, elev=8, azim=-70, res=(700, 800))
preview('hero_walk_back.png', target=(0, 0, 0.95), dist=4.0, elev=14, azim=150, res=(700, 800))
# 坐船：腿前伸、衣摆前掀、手臂前伸
for k, v in (('legL', -1.45), ('legR', -1.45), ("skirtL", -1.2), ("skirtR", -1.2), ('armL', -0.9), ('armR', -0.9)):
    P[k].rotation_euler.x = v
preview('hero_sit.png', target=(0, 0, 0.8), dist=4.0, elev=10, azim=-60, res=(700, 800))
