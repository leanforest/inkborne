# Inkborne · 山水意境

一幅可以走进去的山水画：在水彩山水间漫步、泛舟、垂钓，或御剑穿行云海。

基于 Three.js 的浏览器交互小样，包含自定义水彩着色、山水场景、时辰切换、细雨和程序化音景。界面为中文。

## 本地运行

需要 Python 3 和支持 WebGL 的现代桌面浏览器。在项目根目录执行：

```sh
python tools/serve.py spike 5173
```

浏览器打开 <http://127.0.0.1:5173>，等待加载后点击“入画”，或按 Enter。

也可以使用标准库静态服务器：

```sh
python -m http.server 5173 --bind 127.0.0.1 --directory spike
```

无需 npm 安装或构建。Three.js 0.170.0、lil-gui 0.19 和 Draco 解码器通过 jsDelivr CDN 加载，首次运行需要联网。请通过 HTTP 访问，不要直接打开 HTML 文件。

## 操作

| 按键 | 功能 |
| --- | --- |
| WASD / Shift | 行走、划船 / 加速 |
| 鼠标拖动 / 滚轮 | 转动视角 / 调整距离 |
| E | 登船 / 上岸 |
| F | 抛竿，咬钩后再次按下收竿 |
| Q | 御剑起飞 / 落地 |
| 空格 / C | 飞行上升 / 下降 |
| T | 切换清晨、正午、黄昏 |
| R / M | 切换细雨 / 静音 |
| G / V / H | 调色面板 / 自由观景 / 操作说明 |

## 项目结构

```text
spike/
  index.html       页面入口及浏览器依赖映射
  main.js          场景、着色器和渲染
  game.js          移动、泛舟、钓鱼和御剑玩法
  audio.js         程序化音景
  atmos.js         时辰和天气
  assets/          运行所需的 GLB 模型
blender/
  common.py        建模、导出及预览工具
  arch.py          古建筑构件库
  build_*.py       模型生成源码
tools/
  serve.py         禁用缓存的本地服务器，支持开发截图
```

`spike` 是保留的原始运行目录。模型已经包含在仓库中，运行网页不需要安装 Blender。

## 重新生成模型

需要带 glTF 导出器和 Draco 压缩支持的 Blender，并将 `blender` 加入 PATH。以下命令从项目根目录执行；脚本会覆盖对应的 `spike/assets/` 模型，并生成本地预览图。

```sh
blender --background --factory-startup --python blender/build_mountains.py
blender --background --factory-startup --python blender/build_mountains.py -- --lo
blender --background --factory-startup --python blender/build_boat.py
blender --background --factory-startup --python blender/build_boat.py -- --empty
```

其他模型分别由 `build_hero.py`、`build_pavilion.py`、`build_peach.py`、`build_plants.py`、`build_structures.py`、`build_pier.py` 和 `build_sword.py` 生成，调用方式相同。`common.py` 和 `arch.py` 是公共模块，不需要单独执行。

预览图保存在 `blender/previews/`，开发截图保存在 `tools/snaps/`，均已加入忽略规则。
