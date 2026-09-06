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

### DeepSeek Harness（实测可用，0.1.2-rc.1）

DSH 通过 profile 补丁层加载 MCP 客户端。编辑
`~/.dsh/profiles/<你的 profile>/cordis.patch.yml`，追加：

```yaml
# web-agent MCP 服务器（不需要时删除本段，配置热重载）
- insert:
    - id: mcp-web-agent
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: web-agent
        transport: stdio
        command: node
        args:
          - 'C:\你的路径\web-agent\mcp\server.mjs'   # 绝对路径
        cwd: 'C:\你的路径\web-agent'
        env:
          PATH: '<你的完整 Windows PATH>'             # 必填：MCP 子进程环境被净化
          PYTHONIOENCODING: 'utf-8'
```

要点：

1. **PATH 必须显式给出**——DSH 会净化 MCP 子进程的环境变量，不写 PATH 会导致工具内部的
   python/ffmpeg 找不到（取 `[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + User`）
2. profile 默认 `patchReload: live`，**保存即热重载**，无需重启 DSH
3. 验证：任务管理器/进程列表出现 `node ...\web-agent\mcp\server.mjs` 即注册成功；
   新会话工具名为 `mcp__web-agent__*`（12 个）
4. 卸载：删除上面整段即可；注意 12 个工具定义会计入每个会话的 token 开销

备选方案：把 `skill/web-agent/` 复制到 `~/.dsh/skills/web-agent/` 或
`<工作区>/.dsh/skills/web-agent/`，新会话的任务匹配时会自动加载技能（CLI 直调方式）。

### 其他客户端

任何支持 stdio MCP 的客户端（Cherry Studio、Kimi、豆包、Windsurf 等）配置方式一致：
`command: node` + `args: [<绝对路径>/mcp/server.mjs]`。

## 注册的 15 个工具

| 工具名 | 功能 |
| --- | --- |
| `fetch` | 读取网页（标题/正文/表格/链接） |
| `shot` | 网页截图 |
| `open` | 观看页面/视频并抓帧 |
| `act` | 表单自动化（危险动作默认拒绝，需 `approve:true`） |
| `video` | 视频转录（字幕优先 + 本地 Whisper，自动清理；MCP 默认 --quiet） |
| `media` | 拦截页面真实媒体流 |
| `download` | 下载任意文件 |
| `vision_ocr` | 本地 OCR 识别图中文字 |
| `vision_describe` | 本地视觉大模型理解图片 |
| `vision_stop` | 关闭常驻视觉服务 |
| `desktop` | 桌面控制（输入前需先 focus 目标窗口） |
| `cleanup` | 清理中间残留文件 |
| `digest` | 长内容章节摘要与关键词索引（本地零 token） |
| `search` | 在转录稿中检索相关片段（带时间戳） |
| `read` | 分块读取本地文本文件（省 token 关键） |

> 每个工具都有输出长度上限，截断时提示改用 `read`/`search` 按需获取，
> 长视频/长文章请遵循「video --quiet → digest → read 摘要 → search/read 片段」工作流。

## 安全说明

- MCP Server 只在**本机**运行（stdio），不监听任何网络端口
- 危险动作熔断、密码不接触、本地零上传等安全策略与 CLI 完全一致（见 docs/PRIVACY.md、docs/COMPLIANCE.md）
- 建议只把本工具配置给**你信任的 AI 客户端**；桌面控制类工具请谨慎授权
