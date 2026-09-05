#!/usr/bin/env node
/**
 * web-agent —— AI 本地浏览器与桌面自动化插件
 *
 * 能力一览：
 *   fetch  <url>          读取网页（标题/正文/链接/表格/截图文字），支持 --selector、--format
 *   shot   <url>          打开页面并截图（支持 --seconds 等待视频/动画）
 *   open   <url>          打开可见浏览器窗口"看"页面/视频，可周期性截图帧
 *   act    <任务JSON>     在页面里执行 goto/fill/click/type/extract 等步骤（表单自动化）
 *   video  <url>          视频转录：优先抓自带字幕，缺失时下载+ffmpeg+Whisper 语音识别
 *   desktop ...           鼠标键盘桌面级控制（move/click/type/key/shot/screen）
 *   help                  帮助
 *
 * 安全策略（信任模式 + 危险动作熔断）：
 *   1) 普通读取/操作自动执行；2) 命中危险词（密码/支付/转账/删除/注销等）的步骤必须加 --approve 才执行；
 *   3) 密码永远由用户本人在弹出的可见窗口里输入；4) 全程写日志 logs/agent.log。
 */
import { chromium } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const LOG_DIR = path.join(ROOT, 'logs');
const OUTPUT_DIR = path.join(ROOT, 'output');
const DOWNLOAD_DIR = path.join(ROOT, 'downloads');
const PY_DIR = path.join(ROOT, 'python');

const SENSITIVE = [
  /password|passwd|pwd/i,
  /支付|付款|转账|汇款|充值|购买|下单|续费|扣费|付费|pay(ment)?|checkout/i,
  /删除|注销|解绑|销户|清空|销毁|取消订单|确认收货|永久/i,
];

function log(cmd, args) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(path.join(LOG_DIR, 'agent.log'),
      `${new Date().toISOString()} [${cmd}] ${JSON.stringify(args)}\n`);
  } catch { /* 日志失败不影响主流程 */ }
}

function flagValue(args, flag, dft = null) {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : dft;
}

function hasFlag(args, flag) { return args.includes(flag); }

async function launch(headless = true) {
  const opts = {
    headless,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--autoplay-policy=no-user-gesture-required'],
  };
  try {
    return await chromium.launch({ ...opts, channel: 'msedge' });
  } catch {
    return chromium.launch({ ...opts, executablePath: EDGE_PATH });
  }
}

/* Cookie 采集：抖音等站点要求"新鲜 Cookie"（访问过页面即可，无需登录） */
async function harvestCookies(url) {
  const browser = await launch(true);
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4000); // 等待 JS 写入 ttwid/msToken 等 Cookie
    return await ctx.cookies();
  } finally {
    await browser.close();
  }
}

function toNetscape(cookies) {
  const lines = ['# Netscape HTTP Cookie File'];
  for (const c of cookies) {
    if (!c.domain || !c.name) continue;
    const exp = c.expires && c.expires > 0 ? Math.floor(c.expires) : 0;
    lines.push([
      c.domain.startsWith('.') ? c.domain : `.${c.domain}`,
      'TRUE', c.path || '/', c.secure ? 'TRUE' : 'FALSE', exp, c.name, c.value,
    ].join('\t'));
  }
  return lines.join('\n') + '\n';
}

function runPython(script, args, timeoutMs = 120000) {
  const r = spawnSync('python', [path.join(PY_DIR, script), ...args], {
    encoding: 'utf8', timeout: timeoutMs, windowsHide: true,
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  return r.status ?? 1;
}

/* ============ fetch：读取网页 ============ */
async function cmdFetch(args) {
  const url = args.find(a => /^https?:/i.test(a));
  if (!url) return console.error('用法: node agent.mjs fetch <url> [--selector css] [--wait ms] [--format json|markdown|text] [--links N]');
  const selector = flagValue(args, '--selector');
  const waitMs = Number(flagValue(args, '--wait', '1500'));
  const format = flagValue(args, '--format', 'markdown');
  const linksLimit = Number(flagValue(args, '--links', '50'));
  log('fetch', { url, selector, waitMs, format });

  const browser = await launch(true);
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(waitMs);

  const data = await page.evaluate((linksLimit) => {
    const t = el => (el && el.innerText ? el.innerText.trim() : '');
    const meta = {};
    document.querySelectorAll('meta[name], meta[property]').forEach(m => {
      const k = m.getAttribute('name') || m.getAttribute('property');
      const v = (m.getAttribute('content') || '').trim();
      if (k && v && ['description', 'og:title', 'og:description', 'keywords', 'author'].includes(k)) meta[k] = v.slice(0, 500);
    });
    const headings = [...document.querySelectorAll('h1,h2,h3')]
      .map(h => ({ tag: h.tagName.toLowerCase(), text: t(h) }))
      .filter(h => h.text).slice(0, 80);
    const paragraphs = [...document.querySelectorAll('p')].map(p => t(p)).filter(x => x.length > 20).slice(0, 200);
    const seen = new Set();
    const links = [...document.querySelectorAll('a[href]')]
      .map(a => ({ href: a.href, text: t(a).slice(0, 80) || a.href }))
      .filter(l => /^https?:/i.test(l.href) && !seen.has(l.href) && seen.add(l.href));
    const tables = [...document.querySelectorAll('table')].slice(0, 10).map(tb => t(tb).slice(0, 3000));
    return {
      title: document.title,
      finalUrl: location.href,
      meta, headings, paragraphs,
      links: links.slice(0, linksLimit), linksTotal: links.length,
      tables,
      body: t(document.body).slice(0, 30000),
    };
  }, linksLimit);

  let selected = null;
  if (selector) {
    selected = await page.evaluate(sel => {
      const el = document.querySelector(sel);
      return el ? (el.innerText || el.value || '').slice(0, 30000) : null;
    }, selector);
  }
  await browser.close();

  if (format === 'json') {
    return console.log(JSON.stringify({ ...data, selected }, null, 2));
  }
  if (format === 'text') {
    console.log(`标题: ${data.title}\n网址: ${data.finalUrl}\n\n${data.body}`);
    if (selected) console.log(`\n===== 选择器 ${selector} =====\n${selected}`);
    return;
  }
  // markdown
  const lines = [];
  lines.push(`# ${data.title}`, '', `> ${data.finalUrl}`, '');
  if (data.meta.description) lines.push(data.meta.description, '');
  if (data.headings.length) {
    lines.push('## 标题结构', '');
    data.headings.forEach(h => lines.push(`- (${h.tag}) ${h.text}`));
    lines.push('');
  }
  if (data.paragraphs.length) {
    lines.push('## 正文段落', '');
    data.paragraphs.forEach(p => lines.push(p, ''));
  }
  if (data.tables.length) {
    lines.push('## 表格', '');
    data.tables.forEach(tb => lines.push('```', tb, '```', ''));
  }
  if (data.links.length) {
    lines.push(`## 链接（共 ${data.linksTotal} 个，展示前 ${data.links.length} 个）`, '');
    data.links.forEach(l => lines.push(`- [${l.text}](${l.href})`));
    lines.push('');
  }
  if (selected) {
    lines.push(`## 选择器 ${selector} 的内容`, '', '```', selected, '```');
  }
  console.log(lines.join('\n'));
}

/* ============ shot：截图 ============ */
async function cmdShot(args) {
  const url = args.find(a => /^https?:/i.test(a));
  if (!url) return console.error('用法: node agent.mjs shot <url> [--file out.png] [--seconds 2] [--full] [--selector css]');
  const file = flagValue(args, '--file', path.join(OUTPUT_DIR, `shot_${Date.now()}.png`));
  const seconds = Number(flagValue(args, '--seconds', '2')) * 1000;
  const full = hasFlag(args, '--full');
  const selector = flagValue(args, '--selector');
  log('shot', { url, file, seconds, full, selector });

  const browser = await launch(false);
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(seconds);
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  if (selector) await page.locator(selector).first().screenshot({ path: file, timeout: 15000 });
  else await page.screenshot({ path: file, fullPage: full });
  await browser.close();
  console.log(`截图已保存: ${file}`);
}

/* ============ open：打开可见窗口"看"页面/视频，可周期性抓帧 ============ */
async function cmdOpen(args) {
  const url = args.find(a => /^https?:/i.test(a));
  if (!url) return console.error('用法: node agent.mjs open <url> [--seconds 15] [--every 3] [--prefix out/frame] [--keep]');
  const seconds = Number(flagValue(args, '--seconds', '15'));
  const every = Number(flagValue(args, '--every', '3')) * 1000;
  const prefix = flagValue(args, '--prefix');
  const keep = hasFlag(args, '--keep');
  log('open', { url, seconds, every, prefix, keep });

  const browser = await launch(false);
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

  // 尝试点击"字幕"开关（常见于抖音/B站播放器）
  try {
    const cands = await page.$$('button, [role="button"], div[class*="subtitle"], div[class*="caption"]');
    for (const el of cands) {
      const txt = (await el.innerText().catch(() => '')) || '';
      if (txt.trim() === '字幕') { await el.click().catch(() => {}); console.log('已尝试开启字幕'); break; }
    }
  } catch { /* 忽略 */ }

  const shots = [];
  const deadline = Date.now() + seconds * 1000;
  let i = 0;
  while (Date.now() < deadline) {
    const remain = deadline - Date.now();
    await page.waitForTimeout(Math.min(every, Math.max(remain, 500)));
    if (prefix) {
      fs.mkdirSync(path.dirname(path.resolve(prefix)), { recursive: true });
      const f = `${prefix}_${String(i).padStart(3, '0')}.png`;
      await page.screenshot({ path: f });
      shots.push(f);
      console.log(`帧已保存: ${f}`);
    }
    // 尝试抓取 DOM 里的字幕文本（若平台把字幕渲染为 DOM 元素）
    try {
      const cap = await page.evaluate(() => {
        const els = document.querySelectorAll('[class*="subtitle"],[class*="caption"],[class*="Subtitle"],[class*="Caption"]');
        return [...els].map(e => e.innerText).filter(Boolean).join('\n').slice(0, 3000);
      });
      if (cap) console.log(`[DOM字幕] ${cap}`);
    } catch { /* 忽略 */ }
    i++;
  }
  if (keep) {
    console.log('浏览器保持打开（--keep），用完请关闭或由后续命令接管');
  } else {
    await browser.close();
  }
  console.log(`共抓取 ${shots.length} 帧`);
}

/* ============ act：表单/页面操作 ============ */
async function cmdAct(args) {
  const inline = flagValue(args, '--json');
  const file = flagValue(args, '--file');
  const approve = hasFlag(args, '--approve');
  const dryRun = hasFlag(args, '--dry-run');
  const keep = hasFlag(args, '--keep');
  if (!inline && !file) {
    return console.error('用法: node agent.mjs act --json \'{"steps":[...]}\' [--approve] [--dry-run]\n' +
      '步骤类型: goto{url} | wait{ms} | fill{selector,value} | type{selector,value,delay} | click{selector} | press{selector,key} | check{selector} | select{selector,value} | hover{selector} | extract{selector,label} | shot{file,full}');
  }
  let task;
  try {
    task = JSON.parse(inline || fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return console.error('任务 JSON 解析失败: ' + e.message);
  }
  const steps = task.steps || [];
  log('act', { steps: steps.map(s => ({ action: s.action, selector: s.selector })), approve, dryRun });

  // 危险动作检测
  const flagged = steps.filter(s => {
    const hay = `${s.selector || ''} ${s.text || ''} ${s.value || ''} ${s.url || ''} ${s.label || ''}`;
    return SENSITIVE.some(r => r.test(hay));
  });
  if (flagged.length && !approve) {
    console.error('⛔ 检测到危险动作，已中止。如需执行，请与我确认后加 --approve 重跑。');
    console.error(JSON.stringify(flagged.map(f => ({ action: f.action, selector: f.selector, value: f.value && String(f.value).slice(0, 30), label: f.label })), null, 2));
    process.exit(3);
  }
  if (dryRun) {
    console.log('DRY RUN，将执行以下步骤:');
    steps.forEach((s, i) => console.log(` ${i + 1}. ${s.action} ${s.selector || ''} ${s.value ?? ''}`));
    if (flagged.length) console.log('⚠ 其中包含危险动作，正式执行需要 --approve');
    return;
  }

  const browser = await launch(task.headless !== false);
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const results = [];
  for (const s of steps) {
    try {
      switch (s.action) {
        case 'goto': await page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 45000 }); break;
        case 'wait': await page.waitForTimeout(s.ms ?? 1000); break;
        case 'fill': await page.fill(s.selector, String(s.value)); break;
        case 'type': await page.type(s.selector, String(s.value), { delay: s.delay ?? 30 }); break;
        case 'click': await page.click(s.selector, { timeout: 15000 }); break;
        case 'press': await page.press(s.selector || 'body', s.key); break;
        case 'check': await page.check(s.selector); break;
        case 'uncheck': await page.uncheck(s.selector); break;
        case 'select': await page.selectOption(s.selector, String(s.value)); break;
        case 'hover': await page.hover(s.selector); break;
        case 'extract': {
          const txt = await page.evaluate(sel => {
            const el = document.querySelector(sel);
            return el ? ((el.innerText || el.value || '').slice(0, 10000)) : null;
          }, s.selector);
          results.push({ label: s.label || s.selector, text: txt });
          console.log(`[extract] ${s.label || s.selector}:\n${txt}`);
          break;
        }
        case 'shot': {
          const f = s.file || path.join(OUTPUT_DIR, `act_${Date.now()}.png`);
          fs.mkdirSync(path.dirname(path.resolve(f)), { recursive: true });
          await page.screenshot({ path: f, fullPage: !!s.full });
          results.push({ shot: f });
          console.log(`[shot] ${f}`);
          break;
        }
        default: results.push({ error: `unknown action: ${s.action}` });
      }
    } catch (e) {
      results.push({ action: s.action, selector: s.selector, error: String(e.message).slice(0, 300) });
      console.error(`[失败] ${s.action} ${s.selector || ''}: ${e.message}`);
    }
  }
  if (!keep) await browser.close();
  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

/* ============ video：视频转录（Python 桥接） ============ */
async function cmdVideo(args) {
  const url = args.find(a => /^https?:/i.test(a));
  if (!url) {
    return console.error('用法: node agent.mjs video <url> [--model small|base|medium] [--lang zh] [--cookies edge|none] [--keep-video] [--list-subs]');
  }
  const pyArgs = [url];
  const model = flagValue(args, '--model'); if (model) pyArgs.push('--model', model);
  const lang = flagValue(args, '--lang'); if (lang) pyArgs.push('--lang', lang);
  const cookies = flagValue(args, '--cookies'); if (cookies) pyArgs.push('--cookies', cookies);
  if (hasFlag(args, '--keep-video')) pyArgs.push('--keep-video');
  if (hasFlag(args, '--list-subs')) pyArgs.push('--list-subs');

  // 抖音/头条系站点需要新鲜 Cookie：先用本机 Edge 访问一次页面采集
  let cookiesFile = flagValue(args, '--cookies-file');
  let autoCookie = false;
  let host = '';
  try { host = new URL(url).hostname; } catch { /* 忽略 */ }
  if (!cookiesFile && /(^|\.)(douyin|iesdouyin|toutiao)\.com$/i.test(host)) {
    cookiesFile = path.join(DOWNLOAD_DIR, `cookies_${host.split('.').slice(-2)[0] || 'site'}.txt`);
    try {
      console.log('正在用 Edge 访问页面采集新鲜 Cookie（无需登录）...');
      const cks = await harvestCookies(url);
      fs.mkdirSync(path.dirname(cookiesFile), { recursive: true });
      fs.writeFileSync(cookiesFile, toNetscape(cks), 'utf8');
      console.log(`Cookie 已采集 ${cks.length} 条 -> ${cookiesFile}`);
      autoCookie = true;
    } catch (e) {
      console.warn('Cookie 采集失败: ' + e.message);
    }
  }
  if (cookiesFile && fs.existsSync(cookiesFile)) pyArgs.push('--cookies-file', cookiesFile);

  log('video', { url, model, lang, cookies, cookiesFile });
  const status = runPython('video.py', pyArgs, 45 * 60 * 1000);
  // 自动清理：本次自动采集的临时 Cookie 用完即删（下次访问会自动重新采集）
  if (status === 0 && autoCookie && !hasFlag(args, '--keep-cookies') && fs.existsSync(cookiesFile)) {
    try {
      fs.unlinkSync(cookiesFile);
      console.log(`已自动清理临时 Cookie 文件: ${cookiesFile}`);
    } catch { /* 忽略 */ }
  }
  return status;
}

/* ============ media：拦截页面真实媒体流地址（对付抖音等风控站点） ============ */
async function cmdMedia(args) {
  const url = args.find(a => /^https?:/i.test(a));
  if (!url) return console.error('用法: node agent.mjs media <url> [--seconds 25] [--out file.txt]');
  const seconds = Number(flagValue(args, '--seconds', '25'));
  const out = flagValue(args, '--out');
  log('media', { url, seconds, out });

  const found = [];
  const browser = await launch(true);
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('request', req => {
      const u = req.url();
      const rt = req.resourceType();
      const isMediaStream = rt === 'media'
        || /\.(m3u8|mp4|flv|ts)(\?|$)/i.test(u)
        || /(douyinvod|byteicdn|bytevideocdn|aweme.*player|playwm|watermark|\.ts\b)/i.test(u);
      if (isMediaStream && !found.includes(u)) {
        found.push(u);
        console.log(`[media:${rt}] ${u.slice(0, 400)}`);
      }
    });
    page.on('response', async res => {
      try {
        const u = res.url();
        if (/aweme\/v1\/web\/player/i.test(u) || /obpk.*video|play_addr/i.test(u)) {
          const body = await res.text().catch(() => '');
          console.log(`[api] ${u.slice(0, 200)}\n${body.slice(0, 1500)}`);
        }
      } catch { /* 忽略 */ }
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    // 尝试点击"播放"按钮（图标按钮可能无文字，多选几种）
    try {
      outer:
      for (const sel of ['button', '[role="button"]', 'div[class*="play"]', 'video']) {
        const els = await page.$$(sel).catch(() => []);
        for (const el of els) {
          const t = (await el.innerText().catch(() => '')) || '';
          if (/^播放$/.test(t.trim()) || sel === 'div[class*="play"]') {
            await el.scrollIntoViewIfNeeded().catch(() => {});
            await el.click().catch(() => {});
            console.log(`[播放] 已点击 ${sel}`);
            break outer;
          }
        }
      }
    } catch { /* 忽略 */ }
    await page.waitForTimeout(seconds * 1000);
    // 兜底：从 DOM 里找 video 元素当前源
    try {
      const info = await page.evaluate(() => {
        const v = document.querySelector('video');
        return {
          src: v ? v.src : '', currentSrc: v ? v.currentSrc : '',
          paused: v ? v.paused : null, readyState: v ? v.readyState : null,
          sources: v ? [...v.querySelectorAll('source')].map(s => s.src) : [],
        };
      });
      console.log('[video元素]', JSON.stringify(info));
      for (const s of [info.currentSrc, info.src, ...info.sources]) {
        if (s && !found.includes(s)) found.unshift(s);
      }
    } catch { /* 忽略 */ }
  } finally {
    await browser.close();
  }
  console.log(`共捕获 ${found.length} 个媒体地址`);
  if (out && found.length) {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(out, found.join('\n') + '\n', 'utf8');
    console.log(`已保存: ${out}`);
  }
  // 一键下载音频流（优先 media-audio/music，用于后续语音转录）
  const saveAudio = flagValue(args, '--save-audio');
  if (saveAudio && found.length) {
    const audio = found.find(u => /media-audio|music|m4a|audio/i.test(u)) || found[0];
    console.log(`正在下载音频流...`);
    try {
      const res = await fetch(audio, {
        headers: {
          'Referer': url,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.mkdirSync(path.dirname(path.resolve(saveAudio)), { recursive: true });
      fs.writeFileSync(saveAudio, buf);
      console.log(`音频已保存: ${saveAudio} (${(buf.length / 1048576).toFixed(2)} MB)`);
    } catch (e) {
      console.error('音频下载失败: ' + e.message);
    }
  }
  // 自动清理：媒体地址清单是中间产物，用完即删（加 --keep-urls 可保留）
  if (out && fs.existsSync(out) && !hasFlag(args, '--keep-urls')) {
    try { fs.unlinkSync(out); console.log(`已自动清理地址清单: ${out}`); } catch { /* 忽略 */ }
  }
  console.log(found.join('\n'));
}

/* ============ cleanup：清理下载/输出目录中的临时残留文件 ============ */
function cmdCleanup(args) {
  const dryRun = hasFlag(args, '--dry-run');
  const images = hasFlag(args, '--images');
  const oldLogs = hasFlag(args, '--logs');
  log('cleanup', { dryRun, images, oldLogs });

  const isJunk = (name) => {
    const n = name.toLowerCase();
    return n.startsWith('video.') || n.startsWith('audio.')
      || n.endsWith('.part') || n.endsWith('.ytdl') || n.endsWith('.vtt')
      || n.endsWith('.tmp') || /^cookies_.+\.txt$/i.test(n) || n === 'media_urls.txt';
  };

  const removed = [];
  let freed = 0;
  const consider = (p) => {
    try {
      const st = fs.statSync(p);
      removed.push(p);
      freed += st.size;
      if (!dryRun) fs.unlinkSync(p);
    } catch { /* 忽略 */ }
  };

  if (fs.existsSync(DOWNLOAD_DIR)) {
    for (const d of fs.readdirSync(DOWNLOAD_DIR, { recursive: true, withFileTypes: true })) {
      if (!d.isFile()) continue;
      const p = path.join(d.parentPath ?? d.path, d.name);
      const base = path.basename(p);
      if (isJunk(base) && !base.startsWith('transcript.')) consider(p);
    }
  }
  if (images && fs.existsSync(OUTPUT_DIR)) {
    const day = 24 * 3600 * 1000;
    for (const f of fs.readdirSync(OUTPUT_DIR)) {
      const p = path.join(OUTPUT_DIR, f);
      try {
        const st = fs.statSync(p);
        if (st.isFile() && /\.(png|jpe?g|webp)$/i.test(f) && Date.now() - st.mtimeMs > day) consider(p);
      } catch { /* 忽略 */ }
    }
  }
  if (oldLogs && fs.existsSync(LOG_DIR)) {
    const week = 7 * 24 * 3600 * 1000;
    for (const f of fs.readdirSync(LOG_DIR)) {
      const p = path.join(LOG_DIR, f);
      try {
        const st = fs.statSync(p);
        if (st.isFile() && f !== 'agent.log' && Date.now() - st.mtimeMs > week) consider(p);
      } catch { /* 忽略 */ }
    }
  }

  console.log(`[cleanup${dryRun ? ' 预览' : ''}] ${dryRun ? '将删除' : '已删除'} ${removed.length} 个文件，释放 ${(freed / 1048576).toFixed(2)} MB`);
  removed.forEach(f => console.log('  - ' + f));
  if (!dryRun) console.log('保留: transcript.* 转录产物、截图、日志等有效内容');
}
/* ============ vision：本地识图（OCR / 视觉大模型） ============ */
function cmdVision(args) {
  if (!args.length) {
    return console.error('用法: node agent.mjs vision ocr <图片路径> [--json] | vision describe <图片路径> [--prompt ...]');
  }
  log('vision', { args });
  return runPython('vision.py', args, 30 * 60 * 1000);
}

/* ============ download：通用文件下载 ============ */
async function cmdDownload(args) {
  const url = args.find(a => /^https?:/i.test(a));
  if (!url) return console.error('用法: node agent.mjs download <url> [--out 文件名] [--referer 来源页]');
  let base = '';
  try { base = path.basename(new URL(url).pathname); } catch { /* 忽略 */ }
  const out = flagValue(args, '--out', path.join(DOWNLOAD_DIR, base || `file_${Date.now()}`));
  const referer = flagValue(args, '--referer', '');
  log('download', { url, out, referer });

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0',
      ...(referer ? { Referer: referer } : {}),
    },
    redirect: 'follow',
  });
  if (!res.ok) return console.error(`下载失败: HTTP ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, buf);
  console.log(`已下载: ${out} (${(buf.length / 1024 / 1024).toFixed(2)} MB)`);
}

/* ============ desktop：鼠标键盘控制（Python 桥接） ============ */
function cmdDesktop(args) {
  if (!args.length) {
    return console.error('用法: node agent.mjs desktop <子命令> <参数...>\n' +
      '  screen | pos | move x y [dur] | click [x y] [left|right] | dclick [x y] | scroll n |\n' +
      '  type "文本" | key ctrl+c | shot 保存路径');
  }
  log('desktop', { args });
  return runPython('desktop.py', args, 120000);
}

/* ============ 入口 ============ */
const HELP = `
web-agent —— AI 本地浏览器与桌面自动化插件
用法: node agent.mjs <命令> [参数]

命令:
  fetch <url> [--selector css] [--wait 1500] [--format markdown|text|json] [--links 50]
        读取网页内容（标题/正文/表格/链接），输出为资料
  shot <url> [--file out.png] [--seconds 2] [--full] [--selector css]
        打开页面截图（可见窗口，可等视频加载）
  open <url> [--seconds 15] [--every 3] [--prefix out/frame] [--keep]
        打开可见浏览器"观看"页面/视频，周期性抓帧、尝试开启字幕、抓取DOM字幕
  act  --json '{"steps":[...]}' [--approve] [--dry-run] [--keep]
        表单自动化。步骤: goto/wait/fill/type/click/press/check/select/hover/extract/shot
        危险动作（密码/支付/删除/注销等）必须加 --approve
  video <url> [--model small] [--lang zh] [--cookies edge|none] [--keep-video] [--list-subs]
        视频转录：优先自带字幕，缺失时下载+Whisper 本地语音识别
  media <url> [--seconds 25] [--out file.txt] [--save-audio out.mp4]
        拦截页面真实媒体流地址（m3u8/mp4），用于抖音等有风控的站点
  download <url> [--out 文件名] [--referer 来源页]
        通用文件下载（图片/PDF/JSON/安装包等任意文件）
  vision ocr <图片路径> [--json] | vision describe <图片路径> [--prompt ...]
        本地识图：OCR 识别图中文字 / 本地视觉大模型理解描述图片
  cleanup [--dry-run] [--images] [--logs]
        清理 downloads/ 中的视频/音频/字幕等中间残留文件，只保留 transcript.* 提取产物
  desktop <子命令>
        桌面控制: screen/pos/move/click/dclick/scroll/type/key/shot
        紧急停止: 鼠标甩到屏幕左上角（pyautogui 安全熔断）

安全策略: 普通操作自动执行；危险动作熔断需 --approve；密码由用户本人在可见窗口输入；
          所有操作记录在 logs/agent.log。
`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case 'fetch': return await cmdFetch(rest);
    case 'shot': return await cmdShot(rest);
    case 'open': return await cmdOpen(rest);
    case 'act': return await cmdAct(rest);
    case 'video': return await cmdVideo(rest);
    case 'media': return await cmdMedia(rest);
    case 'download': return await cmdDownload(rest);
    case 'vision': return cmdVision(rest);
    case 'cleanup': return cmdCleanup(rest);
    case 'desktop': return cmdDesktop(rest);
    case 'help': case undefined: console.log(HELP); return;
    default: console.log(HELP); process.exit(2);
  }
}

main().catch(e => { console.error('[agent error]', e.message); process.exit(1); });
