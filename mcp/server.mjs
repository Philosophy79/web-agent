#!/usr/bin/env node
/**
 * web-agent MCP Server —— 把 web-agent 的全部能力注册为 MCP 工具。
 * 设计原则（省 token）：
 *   1) 工具描述与 schema 保持精简，减少每个请求的固定开销
 *   2) 每个工具的输出按需截断，长内容通过 read/search/digest 按需取用
 *   3) 转录/检索/摘要全部本地完成，不产生 API token
 *
 * 用法（stdio 模式，由 MCP 客户端拉起）：node mcp/server.mjs
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { z } from 'zod';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(ROOT, '..', 'agent.mjs');

// 每个工具的输出上限（字符），超出截断并提示改用 read 工具
const OUT_CAP = {
  fetch: 4500, shot: 500, open: 1200, act: 4500,
  video: 1500, media: 1200, download: 500,
  vision_ocr: 3000, vision_describe: 3000, vision_stop: 200,
  desktop: 600, cleanup: 1200,
  read: 4000, search: 3000, digest: 3500,
};

function runAgent(args, timeoutMs = 2 * 60 * 1000, cap = 4000) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8', timeout: timeoutMs, windowsHide: true, maxBuffer: 10 * 1024 * 1024,
  });
  let text = (r.stdout || '') + (r.stderr || '');
  if (text.length > cap) text = text.slice(0, cap) + '\n...(输出已截断，共 ' + text.length + ' 字符；用 read/search 工具按需获取)';
  if (r.status !== 0) text = `[退出码 ${r.status}] ${text}`;
  return text;
}

const server = new McpServer({ name: 'web-agent', version: '1.3.0' });

/* ---------- 内容理解（核心场景，本地零 token） ---------- */

server.registerTool('digest', {
  description: '为长内容（转录稿 txt 或网页 URL）生成本地章节摘要与关键词索引，输出 digest.md 路径与预览。' +
    '长视频/长文章的理解工作流：先 video/fetch 得到文本文件，再 digest 建索引，然后按需 search/read。',
  inputSchema: {
    source: z.string(),
    window: z.number().optional(),
    out: z.string().optional(),
  },
}, ({ source, window, out }) => {
  const args = ['digest', source];
  if (window) args.push('--window', String(window));
  if (out) args.push('--out', out);
  return { content: [{ type: 'text', text: runAgent(args, 5 * 60 * 1000, OUT_CAP.digest) }] };
});

server.registerTool('search', {
  description: '在转录稿/文本文件中检索关键词，返回最相关片段（带时间戳）。长内容提问前先用它定位相关段落。',
  inputSchema: {
    query: z.string(),
    file: z.string().optional(),
    top: z.number().optional(),
    window: z.number().optional(),
  },
}, ({ query, file, top, window }) => {
  const args = ['search', query];
  if (file) args.push('--file', file);
  if (top) args.push('--top', String(top));
  if (window) args.push('--window', String(window));
  return { content: [{ type: 'text', text: runAgent(args, 2 * 60 * 1000, OUT_CAP.search) }] };
});

server.registerTool('read', {
  description: '分块读取本地文本文件（如 transcript.txt、digest.md），支持行号偏移，避免把长文一次性读入上下文。',
  inputSchema: {
    path: z.string(),
    offset: z.number().optional(),
    lines: z.number().optional(),
  },
}, ({ path: p, offset, lines }) => {
  const args = ['read', p];
  if (offset) args.push('--offset', String(offset));
  if (lines) args.push('--lines', String(lines));
  return { content: [{ type: 'text', text: runAgent(args, 60000, OUT_CAP.read) }] };
});

/* ---------- 网页类 ---------- */

server.registerTool('fetch', {
  description: '读取网页内容（标题/正文/表格/链接）。长文章配合 digest/search 使用。',
  inputSchema: {
    url: z.string(),
    selector: z.string().optional(),
    format: z.enum(['markdown', 'text', 'json']).optional(),
    wait: z.number().optional(),
  },
}, ({ url, selector, format, wait }) => {
  const args = ['fetch', url];
  if (selector) args.push('--selector', selector);
  if (format) args.push('--format', format);
  if (wait) args.push('--wait', String(wait));
  return { content: [{ type: 'text', text: runAgent(args, 2 * 60 * 1000, OUT_CAP.fetch) }] };
});

server.registerTool('shot', {
  description: '网页截图保存到本地（输出路径）。',
  inputSchema: {
    url: z.string(),
    file: z.string().optional(),
    seconds: z.number().optional(),
  },
}, ({ url, file, seconds }) => {
  const args = ['shot', url];
  if (file) args.push('--file', file);
  if (seconds) args.push('--seconds', String(seconds));
  return { content: [{ type: 'text', text: runAgent(args, 2 * 60 * 1000, OUT_CAP.shot) }] };
});

server.registerTool('open', {
  description: '浏览器播放页面/视频并周期性抓帧（--seconds 时长，--every 间隔秒）。',
  inputSchema: {
    url: z.string(),
    seconds: z.number().optional(),
    every: z.number().optional(),
    prefix: z.string().optional(),
  },
}, ({ url, seconds, every, prefix }) => {
  const args = ['open', url];
  if (seconds) args.push('--seconds', String(seconds));
  if (every) args.push('--every', String(every));
  if (prefix) args.push('--prefix', prefix);
  return { content: [{ type: 'text', text: runAgent(args, 10 * 60 * 1000, OUT_CAP.open) }] };
});

server.registerTool('act', {
  description: '网页表单自动化，步骤数组：goto/fill/type/click/press/check/select/hover/extract/shot/wait。' +
    '危险动作（密码/支付/转账/删除/注销）必须 approve:true。',
  inputSchema: {
    steps: z.array(z.object({ action: z.string() }).passthrough()),
    approve: z.boolean().optional(),
    dryRun: z.boolean().optional(),
  },
}, ({ steps, approve, dryRun }) => {
  const args = ['act', '--json', JSON.stringify({ steps })];
  if (approve) args.push('--approve');
  if (dryRun) args.push('--dry-run');
  return { content: [{ type: 'text', text: runAgent(args, 10 * 60 * 1000, OUT_CAP.act) }] };
});

/* ---------- 视频/下载类 ---------- */

server.registerTool('video', {
  description: '视频转录为文字稿与 SRT（字幕优先，无字幕走本地 Whisper）。' +
    'MCP 通道默认 --quiet 只输出摘要与文件路径；文字稿全文用 read/search 按需读取。原始视频/音频转录后自动删除。',
  inputSchema: {
    url: z.string(),
    model: z.enum(['tiny', 'base', 'small', 'medium']).optional(),
    lang: z.string().optional(),
    listSubs: z.boolean().optional(),
  },
}, ({ url, model, lang, listSubs }) => {
  const args = ['video', url, '--quiet'];
  if (model) args.push('--model', model);
  if (lang) args.push('--lang', lang);
  if (listSubs) args.push('--list-subs');
  return { content: [{ type: 'text', text: runAgent(args, 45 * 60 * 1000, OUT_CAP.video) }] };
});

server.registerTool('media', {
  description: '拦截页面真实媒体流地址（有下载风控的站点用），可保存音频流到本地。',
  inputSchema: {
    url: z.string(),
    seconds: z.number().optional(),
    saveAudio: z.string().optional(),
  },
}, ({ url, seconds, saveAudio }) => {
  const args = ['media', url, '--quiet'];
  if (seconds) args.push('--seconds', String(seconds));
  if (saveAudio) args.push('--save-audio', saveAudio);
  return { content: [{ type: 'text', text: runAgent(args, 10 * 60 * 1000, OUT_CAP.media) }] };
});

server.registerTool('download', {
  description: '下载任意 URL 文件到本地。',
  inputSchema: {
    url: z.string(),
    out: z.string().optional(),
  },
}, ({ url, out }) => {
  const args = ['download', url];
  if (out) args.push('--out', out);
  return { content: [{ type: 'text', text: runAgent(args, 5 * 60 * 1000, OUT_CAP.download) }] };
});

/* ---------- 识图类 ---------- */

server.registerTool('vision_ocr', {
  description: '本地 OCR 识别图片中所有文字（不上传）。',
  inputSchema: {
    image: z.string(),
    json: z.boolean().optional(),
  },
}, ({ image, json }) => {
  const args = ['vision', 'ocr', image];
  if (json) args.push('--json');
  return { content: [{ type: 'text', text: runAgent(args, 5 * 60 * 1000, OUT_CAP.vision_ocr) }] };
});

server.registerTool('vision_describe', {
  description: '本地视觉大模型（Qwen2.5-VL-3B）描述图片或回答问题（不上传）。',
  inputSchema: {
    image: z.string(),
    prompt: z.string().optional(),
  },
}, ({ image, prompt }) => {
  const args = ['vision', 'describe', image];
  if (prompt) args.push('--prompt', prompt);
  return { content: [{ type: 'text', text: runAgent(args, 30 * 60 * 1000, OUT_CAP.vision_describe) }] };
});

server.registerTool('vision_stop', {
  description: '关闭常驻视觉模型服务释放内存。',
  inputSchema: {},
}, () => {
  return { content: [{ type: 'text', text: runAgent(['vision', 'describe', '--stop'], 60000, OUT_CAP.vision_stop) }] };
});

/* ---------- 桌面/管理类 ---------- */

server.registerTool('desktop', {
  description: '桌面鼠标键盘控制。action: screen/pos/foreground/focus/move/click/scroll/type/key/shot。' +
    '输入前必须先 focus 目标窗口。',
  inputSchema: {
    action: z.enum(['screen', 'pos', 'foreground', 'focus', 'move', 'click', 'scroll', 'type', 'key', 'shot']),
    pattern: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    text: z.string().optional(),
    key: z.string().optional(),
    amount: z.number().optional(),
    path: z.string().optional(),
  },
}, ({ action, pattern, x, y, text, key, amount, path: p }) => {
  const args = ['desktop', action];
  if (pattern) args.push(pattern);
  if (x !== undefined && y !== undefined) args.push(String(x), String(y));
  if (text !== undefined) args.push(text);
  if (key) args.push(key);
  if (amount !== undefined) args.push(String(amount));
  if (p) args.push(p);
  return { content: [{ type: 'text', text: runAgent(args, 2 * 60 * 1000, OUT_CAP.desktop) }] };
});

server.registerTool('cleanup', {
  description: '删除下载目录中的视频/音频/临时残留，只保留 transcript.* 产物。',
  inputSchema: {
    dryRun: z.boolean().optional(),
    images: z.boolean().optional(),
    logs: z.boolean().optional(),
  },
}, ({ dryRun, images, logs }) => {
  const args = ['cleanup'];
  if (dryRun) args.push('--dry-run');
  if (images) args.push('--images');
  if (logs) args.push('--logs');
  return { content: [{ type: 'text', text: runAgent(args, 60000, OUT_CAP.cleanup) }] };
});

/* ---------- 启动 ---------- */

const transport = new StdioServerTransport();
await server.connect(transport);
