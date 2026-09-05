# 贡献指南（CONTRIBUTING）

感谢你愿意为 web-agent 贡献力量！请花两分钟阅读本指南。

## 开发环境准备

```bash
git clone https://github.com/Philosophy79/web-agent
cd web-agent
npm install
pip install yt-dlp faster-whisper pyautogui pyperclip rapidocr
# 可选：视觉与转录功能
python python/download_vlm.py
# llama.cpp 引擎见 README「手动安装」
```

## 项目结构

```
web-agent/
├─ agent.mjs              # Node 主程序（命令分发 + Playwright 浏览器自动化）
├─ python/
│  ├─ video.py            # 视频下载 / 字幕 / Whisper 转录 / 自动清理
│  ├─ desktop.py          # pyautogui 桌面控制桥
│  ├─ vision.py           # OCR + 本地视觉大模型（llama-server HTTP 接口）
│  └─ download_vlm.py     # 视觉模型下载（国内镜像）
├─ skill/web-agent/       # AI 助手技能适配层
├─ docs/                  # 隐私与合规文档
├─ tools/gen_assets.py    # 品牌素材生成脚本（Windows 字体路径）
└─ .github/               # Issue/PR 模板、CI、Dependabot
```

## 代码风格

- **Node**：CommonJS 之外全部 ES Module；命令函数统一 `cmdXxx` 命名；新命令需同步更新
  `HELP` 文本、`main()` 分发与 README 功能表
- **Python**：UTF-8 输出统一用 `sys.stdout.reconfigure(encoding="utf-8")`；
  外部命令调用统一走 `sh()` 封装；失败路径用 `sys.exit()` 给出可读错误
- **安全**：所有网络操作只做"拉取"；危险动作沿用 `SENSITIVE` 熔断机制；
  桌面输入前必须先 `foreground`/`focus` 确认目标窗口
- **隐私**：不记录密码；日志不含敏感信息；新增数据产物要纳入自动清理或 `.gitignore`

## 测试

```bash
node agent.mjs fetch https://example.com                    # 浏览器自动化冒烟
node agent.mjs act --json '{"steps":[...]}' --dry-run        # 步骤脚本预览
node --check agent.mjs                                       # Node 语法
python -m py_compile python/*.py                             # Python 语法
```

提交前请确认：

1. `node agent.mjs help` 正常输出
2. 新增/修改的功能在 Windows 上实测通过
3. 没有把 `downloads/ output/ logs/ models/ bin/` 下的生成物纳入提交
4. 文档（README / README.en / CHANGELOG）已同步

## 提交规范

提交信息格式：`<类型>: <简述>`，类型可选 `feat` / `fix` / `docs` / `refactor` / `chore`。
例如：`feat: 新增 xxx 站点字幕抓取`。

## Pull Request 流程

1. Fork 本仓库并创建特性分支
2. 完成修改与测试
3. 提交 PR，描述清楚改动动机与测试情况
4. 等待维护者 review；CI 必须通过

## 行为准则

请遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。
