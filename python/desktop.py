#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
desktop.py —— 桌面控制桥（鼠标 / 键盘 / 截图）
用法:
  python desktop.py screen                  # 屏幕分辨率
  python desktop.py foreground              # 当前前台窗口标题（输入前先确认目标窗口）
  python desktop.py focus <标题子串>         # 按标题查找并激活目标窗口（输入前必做）
  python desktop.py pos                     # 当前鼠标坐标
  python desktop.py move <x> <y> [duration] # 移动鼠标
  python desktop.py click [x y] [left|right|middle] [次数]   # 点击（不写坐标=点当前位置）
  python desktop.py dclick [x y]            # 双击
  python desktop.py scroll <n>              # 滚轮（正=上，负=下）
  python desktop.py type "要输入的文本"      # 在活动窗口输入；含中文时用剪贴板粘贴
  python desktop.py key <组合键>             # 如 ctrl+c / ctrl+v / alt+tab / enter
  python desktop.py shot <保存路径> [x,y,w,h]# 截屏保存

紧急停止: 把鼠标快速甩到屏幕左上角，即可触发 pyautogui 安全熔断（FAILSAFE）。
"""
import argparse
import sys
import time

import pyautogui
import pyperclip

# 控制台统一 UTF-8，避免 Windows GBK 乱码
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0.3


def cmd_focus(pattern):
    """按标题子串查找并激活窗口，输入前必须先聚焦目标窗口"""
    wins = [w for w in pyautogui.getAllWindows() if pattern.lower() in (w.title or "").lower()]
    if not wins:
        print(f"未找到标题包含「{pattern}」的窗口")
        sys.exit(1)
    w = wins[0]
    try:
        w.activate()
        time.sleep(0.5)
        print(f"已激活窗口: {w.title}")
        fg = pyautogui.getActiveWindow()
        if fg and (fg.title or "") != (w.title or ""):
            print(f"警告: 当前前台窗口为「{fg.title}」，激活可能被系统拦截，请勿继续输入")
    except Exception as e:
        print(f"激活失败: {e}")
        sys.exit(1)


def cmd_foreground():
    w = pyautogui.getActiveWindow()
    print(w.title if w else "无法获取前台窗口")


def cmd_screen():
    w, h = pyautogui.size()
    print(f"{w}x{h}")


def cmd_pos():
    x, y = pyautogui.position()
    print(f"{x},{y}")


def cmd_move(x, y, duration=0.3):
    pyautogui.moveTo(x, y, duration=duration)
    print(f"已移动到 ({x},{y})")


def cmd_click(x=None, y=None, button="left", clicks=1):
    if x is not None and y is not None:
        pyautogui.click(x, y, clicks=clicks, button=button)
        print(f"已点击 ({x},{y}) {button} x{clicks}")
    else:
        pyautogui.click(clicks=clicks, button=button)
        print(f"已点击当前位置 {button} x{clicks}")


def cmd_dclick(x=None, y=None):
    if x is not None and y is not None:
        pyautogui.doubleClick(x, y)
    else:
        pyautogui.doubleClick()
    print("已双击")


def cmd_scroll(n):
    pyautogui.scroll(n)
    print(f"已滚动 {n}")


def cmd_type(text):
    if any(ord(ch) > 127 for ch in text):
        # 含非 ASCII 字符（如中文）：pyautogui.typewrite 不支持，改用剪贴板粘贴
        pyperclip.copy(text)
        time.sleep(0.2)
        pyautogui.hotkey("ctrl", "v")
        print(f"已通过剪贴板粘贴: {text[:60]}{'...' if len(text) > 60 else ''}")
    else:
        pyautogui.write(text, interval=0.02)
        print(f"已键入: {text}")


def cmd_key(combo):
    keys = [k.strip() for k in combo.split("+")]
    if len(keys) == 1:
        pyautogui.press(keys[0])
    else:
        pyautogui.hotkey(*keys)
    print(f"已按键: {combo}")


def cmd_shot(path, region=None):
    img = pyautogui.screenshot(region=region)
    img.save(path)
    print(f"截图已保存: {path}")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return
    cmd = sys.argv[1]
    a = sys.argv[2:]
    if cmd == "screen":
        cmd_screen()
    elif cmd == "foreground":
        cmd_foreground()
    elif cmd == "focus":
        cmd_focus(a[0] if a else "")
    elif cmd == "pos":
        cmd_pos()
    elif cmd == "move":
        cmd_move(int(a[0]), int(a[1]), float(a[2]) if len(a) > 2 else 0.3)
    elif cmd == "click":
        if len(a) >= 2 and a[0].lstrip("-").isdigit() and a[1].lstrip("-").isdigit():
            cmd_click(int(a[0]), int(a[1]),
                      a[2] if len(a) > 2 and a[2] in ("left", "right", "middle") else "left",
                      int(a[3]) if len(a) > 3 else 1)
        else:
            btn = a[0] if a and a[0] in ("left", "right", "middle") else "left"
            cmd_click(button=btn)
    elif cmd == "dclick":
        if len(a) >= 2 and a[0].lstrip("-").isdigit() and a[1].lstrip("-").isdigit():
            cmd_dclick(int(a[0]), int(a[1]))
        else:
            cmd_dclick()
    elif cmd == "scroll":
        cmd_scroll(int(a[0]) if a else 3)
    elif cmd == "type":
        cmd_type(" ".join(a))
    elif cmd == "key":
        cmd_key("+".join(a))
    elif cmd == "shot":
        if len(a) >= 1:
            region = None
            if len(a) >= 5:
                region = tuple(int(x) for x in a[1:5])
            cmd_shot(a[0], region)
        else:
            print("用法: desktop.py shot <保存路径> [x,y,w,h]")
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
