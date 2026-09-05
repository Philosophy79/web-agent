---
name: web-agent
description: >-
  通过本地 web-agent 工具包读取网页、截图、表单自动化、视频转录、识图（OCR/视觉大模型）与桌面控制。
  当用户需要抓取网页内容、整理资料、转录视频、自动填写表单、识别图片文字或操作桌面时使用。
  调用方式：在终端执行 node <web-agent 目录>/agent.mjs <命令>，先确认工具已安装
  （install.bat 或 README 手动安装步骤），安装完成后用 node agent.mjs help 查看命令。
---

# web-agent 技能使用说明

> 本工具同时提供 **MCP 接入**（`mcp/server.mjs`，12 个 MCP 工具，兼容 Claude/Cursor/DSH 等
> 所有 MCP 客户端，见 docs/MCP.md）。若当前环境已配置 MCP Server，优先使用 MCP 工具；
> 本技能作为 CLI 直调方式使用。

## 何时使用

- 用户给出链接，要求读取网页内容、整理成资料 → `fetch`
- 需要"看"页面/视频画面 → `shot`（截图）或 `open`（抓帧），再用 `vision ocr`/`vision describe` 识图
- 用户要求转录视频口播内容 → `video`（B站/YouTube 等）；抖音等有风控的站点 → `media` 拦流 + `video.py --video-file`
- 用户要求代替其在网页上填写/操作 → `act`
- 用户要求下载某个文件 → `download`
- 用户要求操作桌面（打开程序、输入文字）→ `desktop`，**输入前必须先 focus 目标窗口**

## 工作目录

本技能假定 web-agent 已安装在某一目录（记为 `<WA>`）。所有命令在该目录下执行：

```bash
cd <WA>
node agent.mjs <命令> ...
```

## 命令速查

| 命令 | 用途 |
| --- | --- |
| `node agent.mjs help` | 查看全部命令 |
| `node agent.mjs fetch <url> [--format markdown\|text\|json] [--selector css]` | 读取网页 |
| `node agent.mjs shot <url> [--file out.png] [--seconds 2]` | 截图 |
| `node agent.mjs open <url> [--seconds 15] [--every 3] [--prefix out/frame]` | 播放并抓帧 |
| `node agent.mjs act --json '{"steps":[...]}' [--approve] [--dry-run]` | 表单自动化 |
| `node agent.mjs video <url> [--model small] [--lang zh]` | 视频转录 |
| `node agent.mjs media <url> [--seconds 25] [--save-audio out.mp4]` | 拦截媒体流 |
| `node agent.mjs download <url> [--out file]` | 下载文件 |
| `node agent.mjs vision ocr <img>` / `vision describe <img> [--prompt ...]` | 识图 |
| `node agent.mjs desktop foreground \| focus \| type \| key \| shot` | 桌面控制 |
| `node agent.mjs cleanup [--dry-run]` | 清理残留 |

## 必须遵守的安全规则

1. **危险动作熔断**：`act` 步骤命中密码/支付/转账/删除/注销等词时必须先向用户确认，
   得到同意后加 `--approve` 执行
2. **密码铁律**：任何密码都由用户本人在弹出的可见窗口里输入，禁止代输密码
3. **桌面输入先确认窗口**：`desktop type` 之前先 `desktop foreground` 查看前台窗口，
   再用 `desktop focus "窗口标题"` 精确激活目标，确认无误后才输入
4. **用完即清理**：视频转录完成后检查产物目录只保留 transcript.txt/srt；
   必要时运行 `node agent.mjs cleanup`
5. **合规**：只处理用户有权访问的公开或自有内容；不绕过付费/登录墙；不采集他人个人信息；
   见 docs/COMPLIANCE.md
6. **大图处理**：vision describe 会自动压缩超长边 1600px 的图片

## 首次使用检查

```bash
cd <WA>
node --version && python --version          # Node≥20 / Python≥3.10
node agent.mjs fetch https://example.com    # 验证浏览器自动化
node agent.mjs vision ocr <任意截图>        # 验证 OCR
```

若某功能报"未找到依赖"，运行 `install.bat`（Windows）或按 README 手动安装对应组件。
