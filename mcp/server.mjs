#!/usr/bin/env node
/**
 * web-agent MCP Server —— 把 web-agent 的全部能力注册为 MCP 工具，
 * 任何支持 Model Context Protocol 的 AI 客户端（Claude Desktop、Cursor、
 * VS Code Copilot、DeepSeek Harness 等）都可以即插即用。
 *
 * 用法（stdio 模式，由 MCP 客户端拉起）：
 *   node mcp/server.mjs
 *
 * 依赖：先在本目录执行 npm install（会安装 playwright-core 与本 SDK）。
 * 视频转录 / 识图 / 桌面控制还需要对应的 Python 依赖（见 README）。
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { z } from 'zod';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(ROOT, '..', 'agent.mjs');

const MAX_OUT = 30000;

function runAgent(args, timeoutMs = 2 * 60 * 1000) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8', timeout: timeoutMs, windowsHide: true, maxBuffer: 10 * 1024 * 1024,
  });
  let text = (r.stdout || '') + (r.stderr || '');
  if (text.length > MAX_OUT) text = text.slice(0, MAX_OUT) + '\n...(输出过长已截断)';
  if (r.status !== 0) text = `[退出码 ${r.status}] ${text}`;
  return text;
}

const server = new McpServer({ name: 'web-agent', version: '1.1.0' });

/* ---------- 网页类 ---------- */

server.registerTool('fetch', {
  title: '读取网页',
  description: '打开网页并提取标题、正文段落、表格、链接等，输出 Markdown/文本/JSON 资料。',
  inputSchema: {
    url: z.string().describe('网页地址'),
    selector: z.string().optional().describe('只提取该 CSS 选择器的内容'),
    format: z.enum(['markdown', 'text', 'json']).optional().describe('输出格式，默认 markdown'),
    wait: z.number().optional().describe('页面加载后额外等待毫秒数'),
  },
}, ({ url, selector, format, wait }) => {
  const args = ['fetch', url];
  if (selector) args.push('--selector', selector);
  if (format) args.push('--format', format);
  if (wait) args.push('--wait', String(wait));
  return { content: [{ type: 'text', text: runAgent(args) }] };
});

server.registerTool('shot', {
  title: '网页截图',
  description: '打开网页（可见浏览器窗口）并截图保存到本地文件。',
  inputSchema: {
    url: z.string().describe('网页地址'),
    file: z.string().optional().describe('截图保存路径，如 output/shot.png'),
    seconds: z.number().optional().describe('加载后等待秒数（等视频/动画）'),
    full: z.boolean().optional().describe('整页截图'),
  },
}, ({ url, file, seconds, full }) => {
  const args = ['shot', url];
  if (file) args.push('--file', file);
  if (seconds) args.push('--seconds', String(seconds));
  if (full) args.push('--full');
  return { content: [{ type: 'text', text: runAgent(args) }] };
});

server.registerTool('open', {
  title: '观看页面/视频并抓帧',
  description: '打开可见浏览器窗口播放页面/视频，周期性截图抓帧，尝试开启字幕并抓取 DOM 字幕。',
  inputSchema: {
    url: z.string().describe('网页地址'),
    seconds: z.number().optional().describe('观看时长（秒），默认 15'),
    every: z.number().optional().describe('每 N 秒抓一帧，默认 3'),
    prefix: z.string().optional().describe('帧文件前缀，如 output/frame'),
  },
}, ({ url, seconds, every, prefix }) => {
  const args = ['open', url];
  if (seconds) args.push('--seconds', String(seconds));
  if (every) args.push('--every', String(every));
  if (prefix) args.push('--prefix', prefix);
  return { content: [{ type: 'text', text: runAgent(args, 10 * 60 * 1000) }] };
});

server.registerTool('act', {
  title: '表单自动化',
  description: '在页面上按步骤执行 goto/fill/type/click/press/check/select/hover/extract/shot 等操作。' +
    '危险动作（密码/支付/转账/删除/注销等）默认拒绝，需要 approve:true 才会执行。',
  inputSchema: {
    steps: z.array(z.object({
      action: z.string().describe('步骤类型'),
      url: z.string().optional(),
      selector: z.string().optional(),
      value: z.string().optional(),
      text: z.string().optional(),
      key: z.string().optional(),
      ms: z.number().optional(),
      label: z.string().optional(),
      file: z.string().optional(),
      full: z.boolean().optional(),
    }).passthrough()).describe('步骤数组'),
    approve: z.boolean().optional().describe('是否批准危险动作，默认 false'),
    dryRun: z.boolean().optional().describe('只预览步骤不执行'),
  },
}, ({ steps, approve, dryRun }) => {
  const args = ['act', '--json', JSON.stringify({ steps })];
  if (approve) args.push('--approve');
  if (dryRun) args.push('--dry-run');
  return { content: [{ type: 'text', text: runAgent(args, 10 * 60 * 1000) }] };
});

/* ---------- 视频/下载类 ---------- */

server.registerTool('video', {
  title: '视频转录',
  description: '下载视频并转成文字稿与 SRT 字幕。优先抓取平台自带字幕，无字幕时用本地 Whisper 语音识别。' +
    '转录完成后自动删除原始视频与音频，只保留 transcript.txt/srt。',
  inputSchema: {
    url: z.string().describe('视频页面地址'),
    model: z.enum(['tiny', 'base', 'small', 'medium']).optional().describe('Whisper 模型大小，默认 small'),
    lang: z.string().optional().describe('语言代码，默认 zh'),
    keepVideo: z.boolean().optional().describe('保留原始视频文件'),
    listSubs: z.boolean().optional().describe('只列出可用字幕不转录'),
  },
}, ({ url, model, lang, keepVideo, listSubs }) => {
  const args = ['video', url];
  if (model) args.push('--model', model);
  if (lang) args.push('--lang', lang);
  if (keepVideo) args.push('--keep-video');
  if (listSubs) args.push('--list-subs');
  return { content: [{ type: 'text', text: runAgent(args, 45 * 60 * 1000) }] };
});

server.registerTool('media', {
  title: '拦截媒体流',
  description: '在真实浏览器中播放页面并拦截其加载的视频/音频流真实地址（适用于有下载风控的站点），可顺便把音频流保存到本地。',
  inputSchema: {
    url: z.string().describe('视频页面地址'),
    seconds: z.number().optional().describe('观察时长（秒），默认 25'),
    saveAudio: z.string().optional().describe('把音频流保存到该路径'),
  },
}, ({ url, seconds, saveAudio }) => {
  const args = ['media', url];
  if (seconds) args.push('--seconds', String(seconds));
  if (saveAudio) args.push('--save-audio', saveAudio);
  return { content: [{ type: 'text', text: runAgent(args, 10 * 60 * 1000) }] };
});

server.registerTool('download', {
  title: '下载文件',
  description: '下载任意 URL 指向的文件（图片/PDF/JSON/安装包等）到本地。',
  inputSchema: {
    url: z.string().describe('文件地址'),
    out: z.string().optional().describe('保存路径'),
    referer: z.string().optional().describe('Referer 头'),
  },
}, ({ url, out, referer }) => {
  const args = ['download', url];
  if (out) args.push('--out', out);
  if (referer) args.push('--referer', referer);
  return { content: [{ type: 'text', text: runAgent(args) }] };
});

/* ---------- 识图类 ---------- */

server.registerTool('vision_ocr', {
  title: '图片文字识别（OCR）',
  description: '用本地 RapidOCR 模型识别图片中所有文字，按位置排序输出（本地处理，不上传）。',
  inputSchema: {
    image: z.string().describe('本地图片路径'),
    json: z.boolean().optional().describe('输出带坐标与置信度的 JSON'),
  },
}, ({ image, json }) => {
  const args = ['vision', 'ocr', image];
  if (json) args.push('--json');
  return { content: [{ type: 'text', text: runAgent(args, 5 * 60 * 1000) }] };
});

server.registerTool('vision_describe', {
  title: '图片理解（本地视觉大模型）',
  description: '用本地 Qwen2.5-VL-3B 视觉大模型描述图片内容、转写图中文字、回答关于图片的问题（本地处理，不上传）。',
  inputSchema: {
    image: z.string().describe('本地图片路径'),
    prompt: z.string().optional().describe('要问的问题，默认详细描述并转写所有文字'),
  },
}, ({ image, prompt }) => {
  const args = ['vision', 'describe', image];
  if (prompt) args.push('--prompt', prompt);
  return { content: [{ type: 'text', text: runAgent(args, 30 * 60 * 1000) }] };
});

server.registerTool('vision_stop', {
  title: '关闭视觉服务',
  description: '停止常驻的本地视觉模型服务以释放内存。',
  inputSchema: {},
}, () => {
  const text = runAgent(['vision', 'describe', '--stop']);
  return { content: [{ type: 'text', text }] };
});

/* ---------- 桌面/管理类 ---------- */

server.registerTool('desktop', {
  title: '桌面控制',
  description: '鼠标键盘与屏幕操作：screen(分辨率)/pos(鼠标位置)/foreground(前台窗口)/focus(激活窗口)/' +
    'move(移动)/click(点击)/scroll(滚动)/type(输入文字)/key(按键)/shot(截屏)。' +
    '输入文字前必须先 focus 激活目标窗口。',
  inputSchema: {
    action: z.enum(['screen', 'pos', 'foreground', 'focus', 'move', 'click', 'scroll', 'type', 'key', 'shot']),
    pattern: z.string().optional().describe('focus 用的窗口标题子串'),
    x: z.number().optional().describe('坐标 X / move、click 用'),
    y: z.number().optional().describe('坐标 Y'),
    text: z.string().optional().describe('type 要输入的文本'),
    key: z.string().optional().describe('key 用的组合键，如 ctrl+c'),
    amount: z.number().optional().describe('scroll 滚动量'),
    path: z.string().optional().describe('shot 保存路径'),
  },
}, ({ action, pattern, x, y, text, key, amount, path }) => {
  const args = ['desktop', action];
  if (pattern) args.push(pattern);
  if (x !== undefined && y !== undefined) args.push(String(x), String(y));
  if (text !== undefined) args.push(text);
  if (key) args.push(key);
  if (amount !== undefined) args.push(String(amount));
  if (path) args.push(path);
  return { content: [{ type: 'text', text: runAgent(args) }] };
});

server.registerTool('cleanup', {
  title: '清理残留文件',
  description: '删除下载目录中的视频/音频/临时文件等中间残留，只保留 transcript.* 提取产物。',
  inputSchema: {
    dryRun: z.boolean().optional().describe('只预览不删除'),
    images: z.boolean().optional().describe('顺带删除 1 天前的旧截图'),
    logs: z.boolean().optional().describe('顺带删除 7 天前的旧日志'),
  },
}, ({ dryRun, images, logs }) => {
  const args = ['cleanup'];
  if (dryRun) args.push('--dry-run');
  if (images) args.push('--images');
  if (logs) args.push('--logs');
  return { content: [{ type: 'text', text: runAgent(args) }] };
});

/* ---------- 启动 ---------- */

const transport = new StdioServerTransport();
await server.connect(transport);
