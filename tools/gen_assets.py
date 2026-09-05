#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""生成项目品牌素材 assets/banner.png 与 assets/logo.png"""
import os
from PIL import Image, ImageDraw, ImageFont

F = "C:/Windows/Fonts/"
SEGOE_BD = F + "segoeuib.ttf"
SEGOE = F + "segoeui.ttf"
MSYH = F + "msyh.ttc"
CONSOLA = F + "consola.ttf"

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets")
os.makedirs(OUT, exist_ok=True)


def vgrad(w, h, top, bottom):
    img = Image.new("RGB", (w, h), top)
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(1, h - 1)
        c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        d.line([(0, y), (w, y)], fill=c)
    return img


# ============ banner 1280x320 ============
W, H = 1280, 320
img = vgrad(W, H, (15, 23, 42), (30, 41, 59))
d = ImageDraw.Draw(img)

# 装饰：右侧渐变大圆
d.ellipse([W - 320, -200, W + 120, 240], fill=(37, 99, 235, 60))
d.ellipse([W - 420, -80, W - 100, 240], fill=(14, 165, 233, 50))
d.ellipse([-160, H - 260, 160, H + 60], fill=(37, 99, 235, 40))

# 左侧 logo 圆角块
d.rounded_rectangle([56, 64, 216, 224], radius=28, fill=(37, 99, 235))
d.rounded_rectangle([88, 96, 184, 160], radius=12, fill=(255, 255, 255))
d.ellipse([102, 110, 118, 126], fill=(239, 68, 68))
d.ellipse([126, 110, 142, 126], fill=(250, 204, 21))
d.ellipse([150, 110, 166, 126], fill=(74, 222, 128))
d.rounded_rectangle([88, 172, 184, 196], radius=8, fill=(14, 165, 233))

# 标题
f_title = ImageFont.truetype(SEGOE_BD, 92)
f_sub = ImageFont.truetype(SEGOE, 27)
f_cn = ImageFont.truetype(MSYH, 25, index=0)
d.text((256, 92), "web-agent", font=f_title, fill=(248, 250, 252))
d.text((262, 200), "Local-first Web & Desktop Automation Toolkit",
       font=f_sub, fill=(148, 163, 184))
d.text((262, 240), "本地优先的网页与桌面自动化 · 数据零上传",
       font=f_cn, fill=(100, 116, 139))

# 右侧终端卡片
card = [820, 52, 1224, 268]
d.rounded_rectangle(card, radius=18, fill=(2, 6, 23), outline=(51, 65, 85), width=2)
d.line([858, 78, 1186, 78], fill=(30, 41, 59), width=2)
for i, col in enumerate([(239, 68, 68), (250, 204, 21), (74, 222, 128)]):
    d.ellipse([846 + i * 30, 62, 864 + i * 30, 80], fill=col)
f_mono = ImageFont.truetype(CONSOLA, 22)
lines = [
    ("$", (148, 163, 184), " agent fetch <url>"),
    ("$", (148, 163, 184), " agent video <url>"),
    ("$", (148, 163, 184), " agent vision describe"),
]
for i, (pfx, col, rest) in enumerate(lines):
    y = 116 + i * 44
    d.text((848, y), pfx, font=f_mono, fill=(34, 211, 238))
    d.text((872, y), rest, font=f_mono, fill=(226, 232, 240))
img.save(os.path.join(OUT, "banner.png"))
print("banner.png 已生成")

# ============ logo 512x512 ============
L = 512
img = vgrad(L, L, (37, 99, 235), (14, 165, 233))
d = ImageDraw.Draw(img)
# 圆角方底
d.rounded_rectangle([32, 32, 480, 480], radius=96, fill=(30, 64, 175, 0))
# 浏览器窗口
d.rounded_rectangle([96, 96, 416, 416], radius=28, fill=(248, 250, 252))
for i, col in enumerate([(239, 68, 68), (250, 204, 21), (74, 222, 128)]):
    d.ellipse([124 + i * 44, 124, 152 + i * 44, 152], fill=col)
d.rounded_rectangle([124, 180, 388, 204], radius=10, fill=(203, 213, 225))
# 页面线条
for i, (x0, x1, col) in enumerate([
    (124, 340, (148, 163, 184)), (124, 380, (100, 116, 139)), (124, 300, (100, 116, 139))]):
    d.rounded_rectangle([124, x0, x1, x0 + 16], radius=8, fill=col)
# WA 字标
f_wa = ImageFont.truetype(SEGOE_BD, 92)
d.text((128, 210), "WA", font=f_wa, fill=(30, 41, 59))
img.save(os.path.join(OUT, "logo.png"))
print("logo.png 已生成")
