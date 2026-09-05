# MCP 接入指南（docs/MCP.md）

web-agent 内置一个 **MCP Server**（`mcp/server.mjs`，stdio 模式），把全部 12 项能力注册为
MCP 工具。任何支持 **Model Context Protocol** 的 AI 客户端都能即插即用。

## 前置条件

1. 在本目录执行过 `npm install`（安装 playwright-core 与 MCP SDK）
2. 视频转录/识图/桌面控制还需要 Python 依赖（`install.bat` 或 README 手动安装）
3. 客户端能访问本机的 `node`（Windows 上通常已加入 PATH）

## 快速验证

```bash
node tests/mcp_test.mjs
```

## 各客户端配置

### Claude Desktop

编辑 `claude_desktop_config.json`（Claude → Settings → Developer → Edit Config）：

```json
{
  "mcpServers": {
    "web-agent": {
      "command": "node",
      "args": ["C:\\path\\to\\web-agent\\mcp\\server.mjs"]
    }
  }
}
```

macOS / Linux 同理，把路径换成 `/Users/you/web-agent/mcp/server.mjs`。

### Cursor

项目根目录创建 `.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "web-agent": {
      "command": "node",
      "args": ["C:\\path\\to\\web-agent\\mcp\\server.mjs"]
    }
  }
}
```

### VS Code（Copilot）

项目根目录创建 `.vscode/mcp.json`，内容同上。

### DeepSeek Harness

在 DSH 的 MCP 客户端设置中新增一个 stdio 类型的 MCP Server：

- 命令：`node`
- 参数：`<你的路径>/web-agent/mcp/server.mjs`

（具体入口位置以你所用的 DSH 版本界面为准：设置 → MCP / 插件配置。）

### 其他客户端

任何支持 stdio MCP 的客户端（Cherry Studio、Kimi、豆包、Windsurf 等）配置方式一致：
`command: node` + `args: [<绝对路径>/mcp/server.mjs]`。

## 注册的 12 个工具

| 工具名 | 功能 |
| --- | --- |
| `fetch` | 读取网页（标题/正文/表格/链接） |
| `shot` | 网页截图 |
| `open` | 观看页面/视频并抓帧 |
| `act` | 表单自动化（危险动作默认拒绝，需 `approve:true`） |
| `video` | 视频转录（字幕优先 + 本地 Whisper，自动清理） |
| `media` | 拦截页面真实媒体流 |
| `download` | 下载任意文件 |
| `vision_ocr` | 本地 OCR 识别图中文字 |
| `vision_describe` | 本地视觉大模型理解图片 |
| `vision_stop` | 关闭常驻视觉服务 |
| `desktop` | 桌面控制（输入前需先 focus 目标窗口） |
| `cleanup` | 清理中间残留文件 |

## 安全说明

- MCP Server 只在**本机**运行（stdio），不监听任何网络端口
- 危险动作熔断、密码不接触、本地零上传等安全策略与 CLI 完全一致（见 docs/PRIVACY.md、docs/COMPLIANCE.md）
- 建议只把本工具配置给**你信任的 AI 客户端**；桌面控制类工具请谨慎授权
