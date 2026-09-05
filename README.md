# web-agent —— 本地优先的网页与桌面自动化工具

> 一个开源的命令行工具包：读网页、截图、表单自动化、视频转录、本地识图（OCR + 视觉大模型）、
> 桌面控制，**全部数据本地处理，不上传任何内容**。
>
> 可独立使用，也可作为 AI 助手（DeepSeek Harness 等支持 skill 的环境）的技能接入。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## 功能总览

| # | 功能 | 命令 |
| --- | --- | --- |
| 1 | 读网页（标题/正文/表格/链接） | `node agent.mjs fetch <url>` |
| 2 | 截图 | `node agent.mjs shot <url> [--file x.png]` |
| 3 | 观看页面/视频并抓帧 | `node agent.mjs open <url> [--every N]` |
| 4 | 表单自动化 | `node agent.mjs act --json '{"steps":[...]}'` |
| 5 | 视频转录（字幕优先 + Whisper） | `node agent.mjs video <url>` |
| 6 | 媒体流地址拦截 | `node agent.mjs media <url> [--save-audio]` |
| 7 | 通用文件下载 | `node agent.mjs download <url>` |
| 8 | 识图 OCR | `node agent.mjs vision ocr <图片>` |
| 9 | 图像理解（本地视觉大模型） | `node agent.mjs vision describe <图片> [--prompt ...]` |
| 10 | 桌面控制（鼠标/键盘/截图） | `node agent.mjs desktop ...` |
| 11 | 残留清理 | `node agent.mjs cleanup [--dry-run]` |

## 快速开始（Windows）

**环境要求**：Node.js ≥ 20、Python 3.10+、ffmpeg（可选，视频转录需要）、Edge 或 Chrome 浏览器。

```bat
:: 一键安装（首次会下载依赖、视觉模型约 3.3GB 与推理引擎约 0.6GB）
install.bat

:: 试用
node agent.mjs fetch https://example.com
```

手动安装：

```bash
npm install --no-audit --no-fund
pip install yt-dlp faster-whisper pyautogui pyperclip rapidocr
python python/download_vlm.py        # 视觉大模型（hf-mirror 国内镜像）
# llama.cpp 推理引擎（Windows + NVIDIA 显卡）：
mkdir bin && curl -sL -o bin/llama_cuda12.zip "https://ghfast.top/https://github.com/ggml-org/llama.cpp/releases/download/b10819/cudart-llama-bin-win-cuda-12.4-x64.zip"
curl -sL -o bin/llama_main.zip "https://ghfast.top/https://github.com/ggml-org/llama.cpp/releases/download/b10819/llama-b10819-bin-win-cuda-12.4-x64.zip"
python -c "import zipfile; [zipfile.ZipFile('bin/'+n).extractall('bin') for n in ['llama_cuda12.zip','llama_main.zip']]"
del bin\*.zip
```

无 NVIDIA 显卡：下载 `llama-b10819-bin-win-cpu-x64.zip` 替代 CUDA 包（CPU 推理较慢）。
macOS / Linux：llama.cpp 官方仓库提供对应预编译包，命令用法与 Windows 相同。

## 常用示例

```bash
# 读网页并输出 Markdown 资料
node agent.mjs fetch "https://example.com/article" --format markdown

# 表单自动化：打开搜索页 → 输入 → 回车 → 提取结果（危险动作会自动熔断）
node agent.mjs act --json '{"steps":[
  {"action":"goto","url":"https://cn.bing.com/"},
  {"action":"fill","selector":"#sb_form_q","value":"关键词"},
  {"action":"press","selector":"#sb_form_q","key":"Enter"},
  {"action":"wait","ms":2000},
  {"action":"extract","selector":"#b_results","label":"搜索结果"}
]}'

# 视频转录：优先抓自带字幕，无字幕时下载 + 本地 Whisper 语音识别
node agent.mjs video "https://www.bilibili.com/video/BVxxxx"

# 部分站点（如抖音）有下载风控：先拦截媒体流拿到音频，再转录
node agent.mjs media "https://www.douyin.com/video/xxxx" --seconds 25 --save-audio downloads/audio.mp4
python python/video.py --video-file downloads/audio.mp4 --model small --lang zh

# 识图：OCR 文字识别 / 视觉大模型描述
node agent.mjs vision ocr screenshot.png
node agent.mjs vision describe screenshot.png --prompt "图中有什么？转写所有文字"
node agent.mjs vision describe --stop   # 关闭常驻视觉服务

# 桌面控制：务必先聚焦目标窗口再输入
node agent.mjs desktop foreground
node agent.mjs desktop focus "记事本"
node agent.mjs desktop type "要输入的文字"
node agent.mjs desktop shot screen.png

# 清理中间残留（只保留 transcript.* 提取产物）
node agent.mjs cleanup --dry-run
```

## 自动清理策略（用完即删）

- 视频转录完成后自动删除：视频文件、`audio.wav`、`.part/.ytdl/.vtt` 等中间产物；
  插件自行下载的源文件一并删除，**只保留 `transcript.txt` + `transcript.srt`**
- 临时 Cookie、媒体地址清单等用完自动删除
- `cleanup` 命令可手动全局清扫；`--keep-video` / `--keep-audio` 等开关可保留指定产物
- 绝不触碰用户自己目录里的文件

## 安全与合规

- **危险动作熔断**：密码/支付/转账/删除/注销等步骤必须显式 `--approve` 才执行
- **密码铁律**：任何密码都由用户本人在可见浏览器窗口亲自输入，工具不接触、不保存
- **桌面控制**：输入前先 `foreground` 确认前台窗口、`focus` 精确激活目标窗口；鼠标甩到
  屏幕左上角可紧急停止（pyautogui FAILSAFE）
- **全程本地**：网页内容、转录、识图全部在本地完成，详见 [docs/PRIVACY.md](docs/PRIVACY.md)
- **合法使用**：仅限处理自己有权访问的公开或自有内容，详见 [docs/COMPLIANCE.md](docs/COMPLIANCE.md)

## AI 技能（skill）接入

仓库自带 `skill/web-agent/SKILL.md`，DeepSeek Harness 等支持 Agent Skills 的环境可将
`skill/web-agent` 目录加入技能目录，之后 AI 助手即可直接调用本工具的全部命令。

## 项目结构

```
web-agent/
├─ agent.mjs              # 主程序（Node + playwright-core，驱动本机 Edge/Chrome）
├─ package.json
├─ install.bat            # Windows 一键安装
├─ python/
│  ├─ video.py            # 视频下载 + 字幕抓取 + Whisper 转录 + 自动清理
│  ├─ desktop.py          # pyautogui 鼠标键盘桥（含前台窗口确认）
│  ├─ vision.py           # 本地识图：RapidOCR + Qwen2.5-VL(llama-server)
│  └─ download_vlm.py     # 视觉模型下载脚本（国内镜像）
├─ skill/web-agent/       # DSH / Agent Skills 适配层
├─ docs/
│  ├─ PRIVACY.md          # 隐私与数据说明
│  └─ COMPLIANCE.md       # 使用条款与合规边界
├─ downloads/ output/ logs/   # 运行时生成（不入库，自动清理）
└─ models/ bin/               # 大文件（不入库，安装时自动下载）
```

## 常见问题

- **下载慢/超时**：国内网络可用镜像（脚本已内置 hf-mirror、ghfast.top 加速通道）
- **抖音等站点风控**：关闭海外代理/加速器后重试；`media` 命令是备用通道
- **无 GPU**：视觉描述走 CPU 推理，较慢但可用
- **pip 源慢**：`pip install -i https://pypi.tuna.tsinghua.edu.cn/simple <包名>`

## License

[MIT](LICENSE) © Philosophy79
