#!/usr/bin/env node
/**
 * MCP 服务器自测脚本
 * 用法：
 *   node tests/mcp_test.mjs             # 全链路：initialize → tools/list → tools/call(fetch)
 *   node tests/mcp_test.mjs --list-only # 仅启动与列工具（CI 用，无浏览器环境）
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import readline from 'node:readline';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(ROOT, '..', 'mcp', 'server.mjs');
const listOnly = process.argv.includes('--list-only');

const child = spawn(process.execPath, [SERVER], { stdio: ['pipe', 'pipe', 'pipe'] });
child.stderr.on('data', d => process.stderr.write('[server] ' + d));

let nextId = 1;
const pending = new Map();
const rl = readline.createInterface({ input: child.stdout });
rl.on('line', line => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.id !== undefined && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});

function rpc(method, params = {}, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(method + ' 超时'));
      }
    }, timeoutMs);
  });
}

try {
  const init = await rpc('initialize', {
    protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'mcp-test', version: '0.0.0' },
  });
  console.log('initialize:', JSON.stringify(init.result?.serverInfo ?? init));
  await rpc('notifications/initialized', {});

  const list = await rpc('tools/list', {});
  const tools = list.result?.tools ?? [];
  console.log(`tools/list: 共 ${tools.length} 个工具`);
  console.log('  ' + tools.map(t => t.name).join(', '));
  if (tools.length < 10) throw new Error('工具数量异常');

  if (!listOnly) {
    const call = await rpc('tools/call', { name: 'fetch', arguments: { url: 'https://example.com' } }, 120000);
    const text = call.result?.content?.[0]?.text ?? '';
    console.log('tools/call fetch 返回（前 6 行）:');
    console.log(text.split('\n').slice(0, 6).join('\n'));
    if (!text.includes('Example Domain')) throw new Error('fetch 结果异常');
  }

  console.log(listOnly ? '✅ MCP 启动与工具列表测试通过' : '✅ MCP 全链路测试通过');
} catch (e) {
  console.error('❌ 测试失败:', e.message);
  process.exitCode = 1;
} finally {
  child.kill();
}
