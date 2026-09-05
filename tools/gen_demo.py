#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""生成终端演示动图 assets/demo.gif（内容为 web-agent 真实命令与真实输出）"""
import os
from PIL import Image, ImageDraw, ImageFont

F = "C:/Windows/Fonts/"
CONSOLA = F + "consola.ttf"
MSYH = F + "msyh.ttc"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "demo.gif")

W, H = 900, 560
BG = (11, 18, 32)          # 终端背景
BAR = (17, 24, 39)         # 标题栏
GRAY = (148, 163, 184)     # 普通输出
WHITE = (226, 232, 240)    # 命令
CYAN = (34, 211, 238)      # 提示符 $
GREEN = (74, 222, 128)     # 成功/高亮
BLUE = (96, 165, 250)      # 标题

f_cmd = ImageFont.truetype(CONSOLA, 21)
f_out = ImageFont.truetype(CONSOLA, 19)
f_cjk = ImageFont.truetype(MSYH, 19, index=0)
f_cjk_cmd = ImageFont.truetype(MSYH, 21, index=0)
f_bar = ImageFont.truetype(MSYH, 13, index=0)

# 场景：(类型, 文本)：类型 cmd(命令,打字机) / head(蓝色标题) / out(普通) / ok(绿色)
SCENES = [
    [
        ("cmd", "$ node agent.mjs help"),
        ("head", "web-agent —— 给 AI 装上眼睛和手"),
        ("out", "命令:"),
        ("out", "  fetch <url>       读取网页 → Markdown 资料"),
        ("out", "  video <url>       视频转录（字幕 + 本地 Whisper）"),
        ("out", "  vision ocr/describe    本地识图（OCR + 视觉大模型）"),
        ("out", "  act / shot / open / download / desktop / cleanup"),
        ("out", "  mcp/server.mjs    MCP 接入（12 个工具）"),
    ],
    [
        ("cmd", "$ node agent.mjs fetch https://example.com"),
        ("ok", "# Example Domain"),
        ("out", "> https://example.com/"),
        ("out", "## 标题结构"),
        ("out", "- (h1) Example Domain"),
        ("out", "## 正文段落"),
        ("out", "This domain is for use in documentation examples ..."),
    ],
    [
        ("cmd", '$ node agent.mjs video "<抖音视频链接>" --model small'),
        ("out", "标题: #计算机 #大一新生"),
        ("out", "正在采集新鲜 Cookie...（无需登录）"),
        ("out", "[ 0.5s -  3.0s] 作为一个大学计算机专业一年"),
        ("out", "[ 3.0s -  5.7s] 建完了肆意语言数据结构与算法"),
        ("ok", "== 转录完成 =="),
        ("ok", "已自动清理临时文件: audio.wav"),
        ("ok", "目录现仅保留: transcript.srt, transcript.txt"),
    ],
    [
        ("cmd", "$ node agent.mjs vision ocr output/bing_search.png"),
        ("out", "[y= 63] 计算机网络入门教程"),
        ("out", "[y=117] 学术  网页  图片  视频"),
        ("cmd", "$ node agent.mjs vision describe output/bing_search.png"),
        ("out", "这是一张搜索引擎结果页面，展示了关于计算机网络"),
        ("out", "入门教程的相关信息，并列出页面上的主要按钮。"),
    ],
    [
        ("cmd", '$ node agent.mjs act --json \'{"steps":[goto → fill → extract]}\''),
        ("out", "[extract] 输入框值:"),
        ("ok", "测试输入"),
        ("out", "[shot] output/act_result.png"),
    ],
    [
        ("cmd", "$ node tests/mcp_test.mjs"),
        ("out", "tools/list: 共 12 个工具"),
        ("ok", "MCP 全链路测试通过"),
        ("", ""),
        ("head", "web-agent · 本地运行 · 数据零上传"),
        ("head", "github.com/Philosophy79/web-agent"),
        ("ok", "觉得有用就点个 Star"),
    ],
]

f_p = ImageFont.truetype(CONSOLA, 18)
f_p_cjk = ImageFont.truetype(MSYH, 18, index=0)


def draw_mixed(d, xy, text, ascii_font, cjk_font, color):
    x, y = xy
    for ch in text:
        font = ascii_font if ord(ch) < 128 else cjk_font
        d.text((x, y), ch, font=font, fill=color)
        bbox = d.textbbox((x, y), ch, font=font)
        x = bbox[2] + 1


def render_base():
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 36], fill=BAR)
    for i, col in enumerate([(239, 68, 68), (250, 204, 21), (74, 222, 128)]):
        d.ellipse([16 + i * 24, 12, 26 + i * 24, 22], fill=col)
    tw = d.textlength("web-agent — Git Bash", font=f_bar)
    d.text(((W - tw) / 2, 11), "web-agent — Git Bash", font=f_bar, fill=(100, 116, 139))
    return img, d


frames = []
LH = 27  # 行高
for scene in SCENES:
    # 场景帧序列：记录当前可见的行列表
    visible = []  # list of (kind, text)
    pending = list(scene)
    typing = None  # (text, revealed)
    cmd_index = 0

    def snap(kind, text):
        img, d = render_base()
        lines = visible + ([(kind, text)] if text else [])
        y = 58
        for k, t in lines:
            color = {"cmd": WHITE, "out": GRAY, "ok": GREEN, "head": BLUE}.get(k, GRAY)
            if k == "cmd":
                d.text((24, y + 1), "$", font=f_cmd, fill=CYAN)
                draw_mixed(d, (24 + d.textlength("$", font=f_cmd) + 10, y + 1), t, f_cmd, f_cjk_cmd, WHITE)
            elif k == "head":
                draw_mixed(d, (24, y + 2), t, f_out, f_cjk, BLUE)
            else:
                draw_mixed(d, (24, y + 2), t, f_out, f_cjk, color)
            y += LH
        return img

    # 逐帧推进
    while pending or typing:
        if typing:
            text, n = typing
            n = min(len(text), n + 3)
            if n >= len(text):
                visible.append(("cmd", text))
                typing = None
            else:
                frames.append(snap("cmd", text[:n]))
                typing = (text, n)
                continue
        elif pending:
            kind, text = pending.pop(0)
            if kind == "cmd":
                typing = (text, 0)
                continue
            else:
                visible.append((kind, text))
        # 静止若干帧，让观众看清
        for _ in range(2):
            img, d = render_base()
            y = 58
            for k, t in visible:
                color = {"cmd": WHITE, "out": GRAY, "ok": GREEN, "head": BLUE}.get(k, GRAY)
                if k == "cmd":
                    d.text((24, y + 1), "$", font=f_cmd, fill=CYAN)
                    draw_mixed(d, (24 + d.textlength("$", font=f_cmd) + 10, y + 1), t, f_cmd, f_cjk_cmd, WHITE)
                elif k == "head":
                    draw_mixed(d, (24, y + 2), t, f_out, f_cjk, BLUE)
                else:
                    draw_mixed(d, (24, y + 2), t, f_out, f_cjk, color)
                y += LH
            frames.append(img)

    # 场景末尾：定格 + 淡出
    for _ in range(12):
        img, d = render_base()
        y = 58
        for k, t in visible:
            color = {"cmd": WHITE, "out": GRAY, "ok": GREEN, "head": BLUE}.get(k, GRAY)
            if k == "cmd":
                d.text((24, y + 1), "$", font=f_cmd, fill=CYAN)
                draw_mixed(d, (24 + d.textlength("$", font=f_cmd) + 10, y + 1), t, f_cmd, f_cjk_cmd, WHITE)
            elif k == "head":
                draw_mixed(d, (24, y + 2), t, f_out, f_cjk, BLUE)
            else:
                draw_mixed(d, (24, y + 2), t, f_out, f_cjk, color)
            y += LH
        frames.append(img)
    for i in range(1, 7):
        img, d = render_base()
        y = 58
        for k, t in visible:
            color = {"cmd": WHITE, "out": GRAY, "ok": GREEN, "head": BLUE}.get(k, GRAY)
            if k == "cmd":
                d.text((24, y + 1), "$", font=f_cmd, fill=CYAN)
                draw_mixed(d, (24 + d.textlength("$", font=f_cmd) + 10, y + 1), t, f_cmd, f_cjk_cmd, WHITE)
            elif k == "head":
                draw_mixed(d, (24, y + 2), t, f_out, f_cjk, BLUE)
            else:
                draw_mixed(d, (24, y + 2), t, f_out, f_cjk, color)
            y += LH
        overlay = Image.new("RGB", (W, H), BG)
        img = Image.blend(img, overlay, i / 7)
        frames.append(img)

print("总帧数:", len(frames))
frames[0].save(OUT, save_all=True, append_images=frames[1:], duration=83, loop=0, optimize=True)
print("已生成:", OUT, f"({os.path.getsize(OUT) / 1048576:.2f} MB)")

# 导出首帧与中间帧用于人工/视觉校验
first = OUT.replace("demo.gif", "demo_frame0.png")
frames[0].save(first)
print("首帧:", first)
