import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { extname, join, normalize } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { once } from 'node:events';

const root = process.cwd();
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 4187;
const debugPort = 9337;
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg', '.mp4': 'video/mp4' };

const server = createServer(async (request, response) => {
  try {
    const relativePath = decodeURIComponent(new URL(request.url, `http://127.0.0.1:${port}`).pathname).replace(/^\/+/, '') || 'index.html';
    const filePath = normalize(join(root, relativePath));
    if (!filePath.startsWith(root)) throw new Error('Invalid path');
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('Not a file');
    response.writeHead(200, { 'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream' });
    response.end(await readFile(filePath));
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});

await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
const userDataDir = await mkdtemp(join(tmpdir(), 'mingyun-edge-'));
const browser = spawn(edgePath, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${userDataDir}`,
  `http://127.0.0.1:${port}/index.html#home`,
], { stdio: 'ignore' });

async function waitForPage() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const pages = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
      const page = pages.find((item) => item.type === 'page');
      if (page?.webSocketDebuggerUrl) return page;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Unable to connect to Edge');
}

const page = await waitForPage();
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let commandId = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  const resolver = pending.get(message.id);
  if (resolver) {
    pending.delete(message.id);
    resolver(message);
  }
});

function command(method, params = {}) {
  commandId += 1;
  return new Promise((resolve) => {
    pending.set(commandId, resolve);
    socket.send(JSON.stringify({ id: commandId, method, params }));
  });
}

async function evaluate(expression) {
  const response = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (response.result?.exceptionDetails) throw new Error(response.result.exceptionDetails.text);
  return response.result?.result?.value;
}

try {
  await command('Runtime.enable');
  await command('Page.enable');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate(`new Promise((resolve) => document.readyState === 'complete' ? setTimeout(resolve, 500) : addEventListener('load', () => setTimeout(resolve, 500), { once: true }))`);

  const oracle = await evaluate(`(async()=>{document.querySelector('[data-spirit-action="momo"]').click();await new Promise(r=>setTimeout(r,250));const p=document.querySelector('[data-spirit="momo"] .mingyun-result-panel');return {visible:!p.hidden,style:p.textContent.includes('Suno Style'),quests:p.querySelectorAll('.mingyun-quest').length};})()`);
  const dual = await evaluate(`(async()=>{document.querySelector('[data-spirit-action="yeye"]').click();await new Promise(r=>setTimeout(r,250));const p=document.querySelector('[data-spirit="yeye"] .mingyun-result-panel');return {visible:!p.hidden,quests:p.querySelectorAll('.mingyun-quest').length,coherent:p.textContent.includes('合理配樂'),collision:p.textContent.includes('碰撞配樂')};})()`);
  const blindbox = await evaluate(`(async()=>{document.querySelector('[data-spirit-action="lulu"]').click();await new Promise(r=>setTimeout(r,150));const p=document.querySelector('[data-spirit="lulu"] .mingyun-result-panel');const choices=p.querySelectorAll('.mingyun-blindbox-choice').length;p.querySelector('.mingyun-blindbox-choice').click();await new Promise(r=>setTimeout(r,150));return {choices,outcome:p.textContent.includes('你抽中了'),quest:p.querySelectorAll('.mingyun-quest').length,overflow:Math.max(p.scrollWidth-p.clientWidth,0)};})()`);
  const result = { oracle, dual, blindbox };
  if (!oracle.visible || !oracle.style || oracle.quests !== 1) throw new Error(`Oracle failed: ${JSON.stringify(oracle)}`);
  if (!dual.visible || dual.quests !== 2 || !dual.coherent || !dual.collision) throw new Error(`Dual failed: ${JSON.stringify(dual)}`);
  if (blindbox.choices !== 3 || !blindbox.outcome || blindbox.quest !== 1 || blindbox.overflow > 1) throw new Error(`Blindbox failed: ${JSON.stringify(blindbox)}`);
  console.log(JSON.stringify(result));
} finally {
  socket.close();
  browser.kill();
  await Promise.race([
    once(browser, 'exit'),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);
  await new Promise((resolve) => server.close(resolve));
  await rm(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
