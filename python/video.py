#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
video.py —— 视频下载 + 转录
用法:
  python video.py <url> [--outdir DIR] [--model small|base|medium] [--lang zh]
                         [--cookies none|edge|chrome] [--cookies-file FILE]
                         [--media-url URL] [--video-file PATH]
                         [--keep-video] [--list-subs]
流程:
  1) 若提供 --video-file: 直接转录本地视频（跳过下载）
  2) 若提供 --media-url:   用 yt-dlp 下载该媒体流（配合 Cookie/Referer），再转录
  3) 否则: 读取视频元信息 -> 平台有字幕就直接下载字幕转文字（最快最准）
           -> 无字幕则 yt-dlp 下载 -> ffmpeg 提取 16kHz 单声道音频 -> faster-whisper 语音识别
输出:
  <outdir>/transcript.txt   逐句文字稿（带时间戳）
  <outdir>/transcript.srt   标准 SRT 字幕
"""
import argparse
import glob
import json
import os
import re
import subprocess
import sys

TOOL_DIR = os.path.dirname(os.path.abspath(__file__))

# 控制台统一 UTF-8，避免 Windows GBK 乱码
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


def sh(cmd, timeout=900):
    sys.stderr.write("+ %s\n" % " ".join(cmd))
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def find_ytdlp():
    candidates = [
        os.path.join(TOOL_DIR, "yt-dlp.exe"),
        os.path.join(TOOL_DIR, "yt-dlp"),
        "yt-dlp",
    ]
    for c in candidates:
        try:
            r = subprocess.run([c, "--version"], capture_output=True, text=True, timeout=60)
            if r.returncode == 0:
                return c
        except Exception:
            continue
    sys.exit("ERROR: yt-dlp 不可用，请先执行: pip install yt-dlp")


def vtt_to_text(path):
    lines, out = [], []
    with open(path, encoding="utf-8") as f:
        lines = f.readlines()
    for line in lines:
        line = line.strip()
        if not line or line.startswith(("WEBVTT", "NOTE", "Kind:", "Language:")):
            continue
        if re.match(r"^\d{2}:\d{2}", line) or "-->" in line:
            continue
        line = re.sub(r"<[^>]+>", "", line)
        if line and (not out or out[-1] != line):
            out.append(line)
    return "\n".join(out)


def srt_to_text(path):
    out = []
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if not line or line.isdigit() or "-->" in line:
            continue
        if line and (not out or out[-1] != line):
            out.append(line)
    return "\n".join(out)


def fmt_ts(sec):
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = sec % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}".replace(".", ",")


def find_video_file(outdir):
    for ext in ["mp4", "webm", "mov", "mkv", "flv", "m4a", "ts"]:
        p = os.path.join(outdir, f"video.{ext}")
        if os.path.exists(p):
            return p
    cands = [c for c in glob.glob(os.path.join(outdir, "video.*"))
             if not c.endswith((".part", ".ytdl"))]
    return cands[0] if cands else None


def transcribe(wav, outdir, model_size, lang, device="cpu"):
    # Windows 下 ctranslate2 与 MKL 的 OpenMP 库冲突修复（KMP Error #15）
    os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        sys.exit("缺少 faster-whisper，请先执行: pip install faster-whisper")

    compute = "float16" if device == "cuda" else "int8"
    print(f"加载语音识别模型: {model_size} (device={device}, compute={compute})（首次运行会自动下载模型，请耐心等待）", flush=True)
    model = WhisperModel(model_size, device=device, compute_type=compute)
    segments, info = model.transcribe(wav, language=lang, vad_filter=True, beam_size=5)

    tp = os.path.join(outdir, "transcript.txt")
    sp = os.path.join(outdir, "transcript.srt")
    idx = 0
    with open(tp, "w", encoding="utf-8") as ft, open(sp, "w", encoding="utf-8") as fs:
        for seg in segments:
            line = seg.text.strip()
            if not line:
                continue
            idx += 1
            ft.write(f"[{seg.start:7.1f}s - {seg.end:7.1f}s] {line}\n")
            fs.write(f"{idx}\n{fmt_ts(seg.start)} --> {fmt_ts(seg.end)}\n{line}\n\n")
            print(f"[{seg.start:7.1f}s - {seg.end:7.1f}s] {line}", flush=True)

    print("== 转录完成 ==")
    print("文字稿:", tp)
    print("字幕文件:", sp)
    return tp


def auto_cleanup(outdir, keep_video=False, keep_audio=False):
    """自动清理临时/中间文件，只保留提取产物（transcript.txt / transcript.srt）"""
    removed = []

    def rm(p):
        try:
            if os.path.isfile(p):
                os.remove(p)
                removed.append(os.path.basename(p))
        except Exception:
            pass

    if not keep_video:
        for f in glob.glob(os.path.join(outdir, "video.*")):
            if os.path.isfile(f):
                rm(f)
    if not keep_audio:
        rm(os.path.join(outdir, "audio.wav"))
    for pat in ("*.part", "*.ytdl", "*.vtt", "*.tmp", "*.vlm_tmp*"):
        for f in glob.glob(os.path.join(outdir, pat)):
            rm(f)
    if removed:
        print("已自动清理临时文件: " + ", ".join(removed))
        left = [n for n in sorted(os.listdir(outdir)) if os.path.isfile(os.path.join(outdir, n))]
        print("目录现仅保留: " + (", ".join(left) if left else "(空)"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("url", nargs="?")
    ap.add_argument("--outdir", default=None)
    ap.add_argument("--model", default="small", help="whisper 模型大小: tiny/base/small/medium")
    ap.add_argument("--device", default="cpu", help="cpu | cuda（本机 cublas 缺失，默认 CPU+int8）")
    ap.add_argument("--lang", default="zh")
    ap.add_argument("--cookies", default="none", choices=["none", "edge", "chrome", "firefox"])
    ap.add_argument("--cookies-file", default=None, help="Netscape 格式 Cookie 文件（agent.mjs 会自动采集）")
    ap.add_argument("--media-url", default=None, help="直接下载该媒体流地址（配合 Cookie 绕过风控）")
    ap.add_argument("--video-file", default=None, help="直接转录本地视频文件（跳过下载）")
    ap.add_argument("--keep-video", action="store_true")
    ap.add_argument("--keep-audio", action="store_true")
    ap.add_argument("--list-subs", action="store_true")
    a = ap.parse_args()

    if not a.url and not a.video_file and not a.media_url:
        sys.exit("必须提供 url 或 --video-file 或 --media-url")

    ytdlp = find_ytdlp()
    if a.video_file:
        video = os.path.abspath(a.video_file)
        slug = os.path.splitext(os.path.basename(video))[0]
        # 默认输出到 downloads/<文件名>_transcript/，避免清理误删用户目录文件
        outdir = a.outdir or os.path.join(TOOL_DIR, "..", "downloads", f"{slug}_transcript")
        title = slug
        os.makedirs(outdir, exist_ok=True)
    else:
        ref = a.url or a.media_url
        slug = re.sub(r"[^\w\-]+", "_", ref)[:60]
        outdir = a.outdir or os.path.join(TOOL_DIR, "..", "downloads", slug)
        os.makedirs(outdir, exist_ok=True)
        if a.cookies_file and os.path.exists(a.cookies_file):
            cookies_args = ["--cookies", a.cookies_file]
        elif a.cookies != "none":
            cookies_args = ["--cookies-from-browser", a.cookies]
        else:
            cookies_args = []
        title = "video"
        video = None

    # ============ 模式1：本地视频文件，直接转录 ============
    if a.video_file:
        if not os.path.exists(video):
            sys.exit("视频文件不存在: " + video)
        print("标题:", title)
        print("使用本地视频文件:", video)

    # ============ 模式2：直接下载媒体流地址 ============
    elif a.media_url:
        print("标题:", "媒体流下载")
        r = sh([ytdlp, "--no-progress", "-o", os.path.join(outdir, "video.%(ext)s"),
                *cookies_args, "--referer", "https://www.douyin.com/", a.media_url], timeout=1800)
        if r.returncode != 0:
            sys.exit("媒体流下载失败: " + (r.stderr or r.stdout)[-2000:])
        video = find_video_file(outdir)
        if not video:
            sys.exit("找不到下载的媒体文件，目录内容: " + str(os.listdir(outdir)))

    # ============ 模式3：完整平台流程（字幕优先 → 下载 → 转录） ============
    else:
        # 1) 元信息与字幕探测
        r = sh([ytdlp, "--no-progress", "--no-warnings", "-J", *cookies_args, a.url], timeout=120)
        meta = {}
        if r.returncode == 0:
            try:
                meta = json.loads(r.stdout)
            except Exception:
                pass
        title = meta.get("title") or "video"
        subs = meta.get("subtitles") or {}
        auto_subs = meta.get("automatic_captions") or {}
        print("标题:", title)
        print("自带字幕:", list(subs.keys()) or "无", "| 自动字幕:", list(auto_subs.keys()) or "无")

        if a.list_subs:
            for lang, fmts in {**subs, **auto_subs}.items():
                print(f"  {lang}: {[f.get('ext') for f in fmts]}")
            return

        # 2) 字幕优先
        if subs or auto_subs:
            r = sh([ytdlp, "--no-progress", "--skip-download", "--write-subs", "--write-auto-subs",
                    "-o", os.path.join(outdir, "video.%(ext)s"), *cookies_args, a.url], timeout=600)
            txt = None
            for f in glob.glob(os.path.join(outdir, "video.*.vtt")):
                txt = vtt_to_text(f)
                if txt:
                    break
            if not txt:
                for f in glob.glob(os.path.join(outdir, "video.*.srt")):
                    txt = srt_to_text(f)
                    if txt:
                        break
            if txt:
                tp = os.path.join(outdir, "transcript.txt")
                with open(tp, "w", encoding="utf-8") as f:
                    f.write(txt)
                print("== 已获取自带字幕 ==")
                print("文字稿文件:", tp)
                print(txt[:6000])
                auto_cleanup(outdir, keep_video=a.keep_video, keep_audio=a.keep_audio)
                return
            print("字幕文件抓取失败，转入本地语音识别")

        # 3) 下载视频
        if not meta:
            print("警告: 元信息获取失败（平台可能需要 Cookie），继续尝试下载流程")
        r = sh([ytdlp, "--no-progress", "-f", "best[ext=mp4]/best",
                "-o", os.path.join(outdir, "video.%(ext)s"), *cookies_args, a.url], timeout=1200)
        if r.returncode != 0:
            sys.exit("下载失败: " + (r.stderr or r.stdout)[-2000:])
        video = find_video_file(outdir)
        if not video:
            sys.exit("找不到下载的视频文件，目录内容: " + str(os.listdir(outdir)))

    print("视频文件:", video, f"({os.path.getsize(video) / 1048576:.1f} MB)")

    # ============ ffmpeg 提取音频 ============
    wav = os.path.join(outdir, "audio.wav")
    r = sh(["ffmpeg", "-y", "-i", video, "-vn", "-ac", "1", "-ar", "16000", wav], timeout=600)
    if r.returncode != 0:
        sys.exit("ffmpeg 失败: " + r.stderr[-1500:])

    # ============ Whisper 转录 ============
    tp = transcribe(wav, outdir, a.model, a.lang, a.device)
    auto_cleanup(outdir, keep_video=a.keep_video, keep_audio=a.keep_audio)
    # 若输入源是我们下载目录里的中间产物（如抖音音频流），提取完成后一并删除；
    # 用户自己目录里的文件绝不触碰
    if a.video_file and not a.keep_video:
        try:
            src = os.path.normpath(os.path.abspath(a.video_file))
            dl_root = os.path.normpath(os.path.join(TOOL_DIR, "..", "downloads"))
            if src.startswith(dl_root + os.sep) and os.path.isfile(src):
                os.remove(src)
                print(f"已删除源中间文件: {src}")
        except Exception:
            pass
    print("DONE")


if __name__ == "__main__":
    main()
