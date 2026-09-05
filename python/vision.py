#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
vision.py —— 本地识图能力（OCR 文字识别 + 本地视觉大模型描述）
用法:
  python vision.py ocr <图片路径> [--json]             # 识别图中所有文字（RapidOCR，本地运行）
  python vision.py describe <图片路径> [--model ...] [--mmproj ...] [--prompt ...]
                                                      # 本地 VLM 图像理解（Qwen2.5-VL GGUF + llama.cpp）
输出:
  ocr:      逐行文字（按从上到下排序），--json 输出带坐标与置信度
  describe: 自然语言描述 + 图中文字转写
"""
import argparse
import json
import logging
import os
import sys

# 控制台统一 UTF-8
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# 关闭 rapidocr 的 INFO 日志噪音
logging.getLogger("rapidocr").setLevel(logging.ERROR)
logging.getLogger("rapidocr_onnxruntime").setLevel(logging.ERROR)

TOOL_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(TOOL_DIR, "..", "models")
DEFAULT_GGUF = os.path.join(MODEL_DIR, "Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf")
DEFAULT_MMPROJ = os.path.join(MODEL_DIR, "mmproj-F16.gguf")

_ocr_engine = None


def get_ocr():
    global _ocr_engine
    if _ocr_engine is None:
        from rapidocr import RapidOCR
        _ocr_engine = RapidOCR()
    return _ocr_engine


def cmd_ocr(image, as_json=False):
    engine = get_ocr()
    out = engine(image)
    # 兼容不同版本返回值：(result, elapse) 或 result 对象
    if isinstance(out, tuple):
        result = out[0]
    else:
        result = out
    if result is None:
        print("未识别到文字")
        return
    # result 可能是 RapidOCROutput 对象（含 txts/scores/boxes）或列表
    txts = getattr(result, "txts", None)
    boxes = getattr(result, "boxes", None)
    scores = getattr(result, "scores", None)
    items = []
    if txts is not None:
        n = len(txts)
        for i in range(n):
            text = str(txts[i]) if txts[i] else ""
            score = float(scores[i]) if scores is not None and i < len(scores) else None
            box = boxes[i].tolist() if boxes is not None and i < len(boxes) else None
            items.append((box, text, score))
    else:
        for entry in result:
            box, text, score = entry[0], str(entry[1]), float(entry[2])
            items.append((box, text, score))
    # 按 y 坐标从上到下排序
    items.sort(key=lambda it: (it[0][0][1] if it[0] is not None else 0))
    if as_json:
        print(json.dumps([
            {"text": t, "score": round(s, 3) if s is not None else None,
             "box": [[round(float(p[0])), round(float(p[1]))] for p in b] if b is not None else None}
            for (b, t, s) in items
        ], ensure_ascii=False, indent=2))
    else:
        for (box, text, score) in items:
            y = int(box[0][1]) if box is not None else 0
            print(f"[y={y:4d}] {text}")


def cmd_describe(image, model, mmproj, prompt, stop=False, port=8089):
    """通过 llama-server.exe 本地服务做视觉问答（OpenAI 兼容 HTTP 接口）"""
    import urllib.request
    import urllib.error

    base = f"http://127.0.0.1:{port}"
    # 本机回环请求不走系统代理（否则被本地代理 502）
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def alive():
        try:
            with opener.open(base + "/health", timeout=2) as r:
                return r.status == 200
        except Exception:
            return False

    if stop:
        if alive():
            try:
                opener.open(base + "/shutdown", timeout=5)
            except Exception:
                pass
            print("视觉服务已停止")
        else:
            print("视觉服务未在运行")
        return

    if not os.path.exists(image):
        print(f"图片不存在: {image}")
        sys.exit(2)
    if not os.path.exists(model):
        print(f"未找到 VLM 模型文件: {model}")
        print("请先执行: python python/download_vlm.py")
        sys.exit(2)
    if not os.path.exists(mmproj):
        print(f"未找到视觉投影文件: {mmproj}")
        sys.exit(2)
    server_exe = os.path.join(TOOL_DIR, "..", "bin", "llama-server.exe")
    if not os.path.exists(server_exe):
        print(f"未找到 llama-server.exe: {server_exe}")
        print("请下载 llama.cpp Windows CUDA 包并解压到 web-agent/bin/（见 README）")
        sys.exit(2)

    if not alive():
        print("启动本地视觉服务 llama-server...（首次加载模型约 30-120 秒）", flush=True)
        log_path = os.path.join(TOOL_DIR, "..", "logs", "llama-server.log")
        with open(log_path, "ab") as lf:
            import subprocess
            proc = subprocess.Popen(
                [server_exe, "-m", model, "--mmproj", mmproj,
                 "--host", "127.0.0.1", "--port", str(port),
                 "-ngl", "99", "-c", "8192", "-t", str(max(4, os.cpu_count() - 2))],
                cwd=os.path.dirname(server_exe),
                stdout=lf, stderr=lf,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(subprocess, "DETACHED_PROCESS", 0),
            )
        import time
        waited = 0
        while not alive() and waited < 240:
            time.sleep(2)
            waited += 2
        if not alive():
            print("视觉服务启动失败，请查看 logs/llama-server.log")
            sys.exit(3)
        print("视觉服务已就绪", flush=True)

    import base64
    import json as _json
    # 大图先等比缩小（最长边 1600px），避免图片 token 超出上下文
    send_path = image
    try:
        import cv2
        import numpy as np
        img = cv2.imdecode(np.fromfile(image, dtype=np.uint8), cv2.IMREAD_COLOR)
        if img is not None and max(img.shape[0], img.shape[1]) > 1600:
            scale = 1600.0 / max(img.shape[0], img.shape[1])
            img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
            tmp = image + ".vlm_tmp.jpg"
            cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 92])[1].tofile(tmp)
            send_path = tmp
    except Exception:
        pass
    ext = os.path.splitext(send_path)[1].lower() or ".png"
    mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp", "gif": "image/gif", "bmp": "image/bmp"}.get(ext.lstrip("."), "image/jpeg")
    with open(send_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    if send_path != image:
        try:
            os.remove(send_path)
        except Exception:
            pass
    payload = {
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                {"type": "text", "text": prompt or "请详细描述这张图片的内容，并完整转写图中出现的所有文字。"},
            ],
        }],
        "max_tokens": 1024,
        "temperature": 0.3,
        "top_p": 0.9,
        "repeat_penalty": 1.15,
    }
    req = urllib.request.Request(
        base + "/v1/chat/completions",
        data=_json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with opener.open(req, timeout=600) as r:
        resp = _json.loads(r.read().decode("utf-8"))
    reply = resp["choices"][0]["message"]["content"]
    print(reply)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p_ocr = sub.add_parser("ocr")
    p_ocr.add_argument("image")
    p_ocr.add_argument("--json", action="store_true")
    p_desc = sub.add_parser("describe")
    p_desc.add_argument("image", nargs="?")
    p_desc.add_argument("--model", default=DEFAULT_GGUF)
    p_desc.add_argument("--mmproj", default=DEFAULT_MMPROJ)
    p_desc.add_argument("--prompt", default=None)
    p_desc.add_argument("--stop", action="store_true", help="关闭常驻的本地视觉服务")
    a = ap.parse_args()
    if a.cmd == "ocr":
        cmd_ocr(a.image, a.json)
    elif a.cmd == "describe":
        cmd_describe(a.image or "", a.model, a.mmproj, a.prompt, a.stop)


if __name__ == "__main__":
    main()
