# 更新日志（Changelog）

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范，并使用 [语义化版本](https://semver.org/lang/zh-CN/)。

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

[1.0.0]: https://github.com/Philosophy79/web-agent/releases/tag/v1.0.0
