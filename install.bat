@echo off
chcp 65001 >nul
title web-agent 一键安装
echo ============================================================
echo   web-agent 一键安装（Windows）
echo   说明：首次安装会下载依赖、视觉模型（约3.3GB）
echo         与 llama.cpp 推理引擎（约0.6GB），请保持网络畅通。
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js，请先到 https://nodejs.org 安装 Node.js 20 以上版本
  pause & exit /b 1
)
where python >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Python，请安装 Python 3.10 以上版本并勾选 Add to PATH
  pause & exit /b 1
)
where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo [提示] 未检测到 ffmpeg，视频转录功能将不可用（可选安装：winget install ffmpeg）
)

echo [1/4] 安装 Node 依赖...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo [错误] npm 安装失败，请检查网络后重试
  pause & exit /b 1
)

echo [2/4] 安装 Python 依赖...
pip install --disable-pip-version-check yt-dlp faster-whisper pyautogui pyperclip rapidocr
if errorlevel 1 (
  echo [提示] pip 安装失败，可换国内源重试：
  echo        pip install -i https://pypi.tuna.tsinghua.edu.cn/simple yt-dlp faster-whisper pyautogui pyperclip rapidocr
)

echo [3/4] 下载视觉大模型（约3.3GB，走国内镜像，仅首次）...
python python\download_vlm.py
if errorlevel 1 (
  echo [提示] 视觉模型下载失败，识图描述功能暂不可用（OCR 不受影响），可稍后重跑本脚本
)

echo [4/4] 下载 llama.cpp 推理引擎（约0.6GB，仅首次）...
if not exist bin mkdir bin
nvidia-smi >nul 2>nul
if errorlevel 1 (
  echo   （未检测到 NVIDIA 显卡，使用 CPU 版推理引擎）
  curl -sL -o bin\llama_main.zip "https://ghfast.top/https://github.com/ggml-org/llama.cpp/releases/download/b10819/llama-b10819-bin-win-cpu-x64.zip"
) else (
  curl -sL -o bin\llama_cuda12.zip "https://ghfast.top/https://github.com/ggml-org/llama.cpp/releases/download/b10819/cudart-llama-bin-win-cuda-12.4-x64.zip"
  curl -sL -o bin\llama_main.zip "https://ghfast.top/https://github.com/ggml-org/llama.cpp/releases/download/b10819/llama-b10819-bin-win-cuda-12.4-x64.zip"
)
python -c "import zipfile; [zipfile.ZipFile('bin/'+n).extractall('bin') for n in ['llama_cuda12.zip','llama_main.zip'] if __import__('os').path.exists('bin/'+n)]"
del bin\*.zip 2>nul

echo.
echo ============================================================
echo   安装完成！
echo   试用：node agent.mjs fetch https://example.com
echo   帮助：node agent.mjs help
echo ============================================================
pause
