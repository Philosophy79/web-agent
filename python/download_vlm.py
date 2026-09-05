#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""下载 Qwen2.5-VL-3B GGUF 视觉模型（走 hf-mirror 国内镜像）"""
import os
import sys

os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from huggingface_hub import hf_hub_download

REPO = "unsloth/Qwen2.5-VL-3B-Instruct-GGUF"
FILES = ["Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf", "mmproj-F16.gguf"]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "models")
os.makedirs(OUT, exist_ok=True)

for name in FILES:
    print(f"下载中: {name}", flush=True)
    p = hf_hub_download(REPO, name, local_dir=OUT)
    print(f"完成: {p} ({os.path.getsize(p) / 1048576:.1f} MB)", flush=True)

print("ALL_DONE")
