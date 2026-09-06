# 更新日志（Changelog）

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范，并使用 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.3.0] - 2026-09-06

### 新增（Added）

- **长内容理解工作流（核心场景）**：`digest`（章节摘要 + 关键词索引）、`search`（转录稿片段检索，带时间戳）、
  `read`（按行分块读取本地文本）——转录/摘要/检索全部本地计算，**零 API token**
- `video` / `media` 新增 `--quiet` 精简输出模式（只输出摘要与文件路径）
- MCP 工具扩展为 15 个（新增 digest/search/read），并为每个工具设置输出上限，
  长内容按需分块读取

### 变更（Changed）

- MCP 工具定义全面精简（描述与 schema 瘦身）：工具定义开销约 1500 tokens/请求
- 技能文档（SKILL.md）新增「核心工作流」与「Token 效率铁律」章节，指导 AI 按省 token 方式工作

## [1.2.0] - 2026-09-06

### 新增（Added）

- 终端演示动图 `assets/demo.gif`（生成脚本 `tools/gen_demo.py`），嵌入双语 README
- DSH 原生 MCP 接入的实测配置方法（`docs/MCP.md` 新增 DeepSeek Harness 章节：
  profile 补丁写法、PATH 环境变量要点、热重载与验证方法）

### 变更（Changed）

- README 双语完全同步：新增「给 AI 装上眼睛和手」价值主张、「为什么选择 web-agent」对比表、CI 与 Release 徽章
- 默认分支由 `master` 更名为 `main`（CI 同步更新），启用分支保护
  （禁止强制推送/删除，PR 合并要求 CI 通过）
- GitHub 主题标签扩充至 20 个，开启 Discussions 讨论区

## [1.1.0] - 2026-09-05

### 新增（Added）

- **MCP 适配层**：`mcp/server.mjs` 将全部能力注册为 12 个 MCP 工具
  （fetch/shot/open/act/video/media/download/vision_ocr/vision_describe/vision_stop/desktop/cleanup），
  任何支持 Model Context Protocol 的 AI 客户端（Claude Desktop、Cursor、VS Code Copilot、
  DeepSeek Harness、Cherry Studio 等）均可即插即用
- **接入文档**：`docs/MCP.md`（各客户端配置示例、工具清单、安全说明）
- **MCP 自测脚本**：`tests/mcp_test.mjs`（全链路测试与 `--list-only` CI 模式）
- CI 新增 MCP 服务器启动与工具列表测试

## [1.0.0] - 2026-09-05

### 新增（Added）

- **网页能力**：`fetch`（读取网页并输出 Markdown/JSON/文本）、`shot`（截图）、`open`（观看页面/视频并周期性抓帧）
- **自动化**：`act`（表单自动化：goto/fill/click/type/press/extract/shot 步骤脚本，含危险动作熔断）
- **视频能力**：`video`（字幕优先 + faster-whisper 本地语音识别）、`media`（拦截页面真实媒体流，含风控站点备用通道）、`download`（通用文件下载）
- **识图能力**：`vision ocr`（本地 RapidOCR 文字识别）、`vision describe`（本地 Qwen2.5-VL-3B 视觉大模型，llama-server 常驻服务）
- **桌面能力**：`desktop`（屏幕信息/前台窗口确认/窗口聚焦/鼠标键盘/截图，pyautogui FAILSAFE 紧急停止）
- **自动清理**：转录完成自动删除原始视频、音频及中间产物，只保留 transcript.txt/srt；临时 Cookie 与地址清单用完即删；`cleanup` 手动全局清扫
- **一键安装**：`install.bat`（Windows，自动识别 NVIDIA 显卡，国内镜像加速）
- **AI 技能**：`skill/web-agent/SKILL.md` 适配层，可接入 DeepSeek Harness 等 Agent Skills 环境
- **合规文档**：`docs/COMPLIANCE.md`（使用条款与合规边界）、`docs/PRIVACY.md`（隐私与数据说明）
- **品牌素材**：`assets/banner.png`、`assets/logo.png`（生成脚本 `tools/gen_assets.py`）
- **工程化**：CI 流水线（Node/Python 语法检查）、Issue/PR 模板、Dependabot 配置

[1.3.0]: https://github.com/Philosophy79/web-agent/releases/tag/v1.3.0
[1.2.0]: https://github.com/Philosophy79/web-agent/releases/tag/v1.2.0
[1.1.0]: https://github.com/Philosophy79/web-agent/releases/tag/v1.1.0
[1.0.0]: https://github.com/Philosophy79/web-agent/releases/tag/v1.0.0
