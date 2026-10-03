#!/usr/bin/env node
// Render pv.html frame by frame to MP4: a local server hands out the files and receives JPEG frames,
// headless Chrome runs js/pv.js, ffmpeg encodes and muxes the song audio.
// Usage: node tools/render-pv.mjs [song numbers 1-9…] [--from s] [--to s] [--jobs n] [--out dir]
//   No song numbers = every song. Output: pv/NN <title> PV.mp4
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf('--' + name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const from = opt('from'), to = opt('to');
const jobs = Math.max(1, +(opt('jobs') || 3));
const outDir = path.resolve(ROOT, opt('out') || 'pv');
const COUNT = (fs.readFileSync(path.join(ROOT, 'songs', 'songs.js'), 'utf8').match(/"id":"s\d+"/g) || []).length;
const songs = args.length ? args.map(Number) : Array.from({ length: COUNT }, (_, i) => i + 1);
if (songs.some((n) => !Number.isInteger(n) || n < 1 || n > COUNT)) { console.error(`歌曲編號為 1–${COUNT}`); process.exit(1); }
const CHROME = process.env.CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome']
  .find((p) => fs.existsSync(p));
if (!CHROME) { console.error('找不到 Google Chrome，可用 CHROME=路徑 指定'); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.json': 'application/json' };
const live = new Map();
const readBody = (req) => new Promise((ok, no) => { const parts = []; req.on('data', (d) => parts.push(d)); req.on('end', () => ok(Buffer.concat(parts))); req.on('error', no); });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/__pv/')) {
    const job = live.get(url.searchParams.get('job')), body = await readBody(req);
    if (!job) { res.writeHead(404).end(); return; }
    const action = url.pathname.slice(6);
    try {
      if (action === 'meta') job.start(JSON.parse(body));
      else if (action === 'frame') await job.frame(body);
      else if (action === 'done') job.finish();
      else if (action === 'error') job.fail(new Error(body.toString()));
      res.writeHead(204).end();
    } catch (e) { res.writeHead(500).end(String(e)); job.fail(e); }
    return;
  }
  const file = path.join(ROOT, decodeURIComponent(url.pathname === '/' ? '/pv.html' : url.pathname));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': fs.statSync(file).size });
  fs.createReadStream(file).pipe(res);
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const PORT = server.address().port;

function runJob(number) {
  return new Promise((resolve, reject) => {
    const id = String(number), profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-chrome-'));
    let ff = null, meta = null, count = 0, done = false, lastLog = 0, outFile = '';
    const t0 = Date.now();
    const query = new URLSearchParams({ song: number - 1, render: 1, job: id });
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    const chrome = spawn(CHROME, ['--headless=new', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--mute-audio',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
      '--window-size=1920,1080', '--enable-unsafe-swiftshader', `http://127.0.0.1:${PORT}/pv.html?${query}`], { stdio: 'ignore' });
    const cleanup = () => { try { chrome.kill(); } catch {} setTimeout(() => fs.rmSync(profile, { recursive: true, force: true }), 1500); };
    const job = {
      start(m) {
        meta = m;
        const part = from || to ? ` (${m.from.toFixed(0)}-${m.to.toFixed(0)}s)` : '';
        outFile = path.join(outDir, `${m.file} PV${part}.mp4`);
        ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(m.fps), '-c:v', 'mjpeg', '-i', 'pipe:0',
          '-ss', String(m.from), '-t', String(m.to - m.from), '-i', path.join(ROOT, m.audio), '-map', '0:v', '-map', '1:a',
          '-c:v', 'libx264', '-preset', 'medium', '-tune', 'animation', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest',
          '-movflags', '+faststart', outFile], { stdio: ['pipe', 'inherit', 'inherit'] });
        ff.on('exit', (code) => {
          cleanup();
          live.delete(id);
          if (code === 0 && done) { console.log(`✔ ${path.relative(ROOT, outFile)}  (${count} 格，${((Date.now() - t0) / 1000).toFixed(0)} 秒)`); resolve(outFile); }
          else reject(new Error(`ffmpeg 結束碼 ${code}（${m.title}）`));
        });
        console.log(`▶ ${number}. ${m.title}  ${m.frames} 格`);
      },
      frame(buf) {
        if (!ff) throw new Error('尚未收到 meta');
        count++;
        if (Date.now() - lastLog > 15000) {
          lastLog = Date.now();
          console.log(`  ${meta.title}: ${(count / meta.frames * 100).toFixed(1)}%  (${(count / ((Date.now() - t0) / 1000)).toFixed(1)} fps)`);
        }
        return ff.stdin.write(buf) ? null : new Promise((ok) => ff.stdin.once('drain', ok));
      },
      finish() { done = true; ff.stdin.end(); },
      fail(e) {
        if (done) return;
        done = true;
        console.error(`✘ 歌曲 ${number}：${e.message}`);
        try { ff?.stdin.destroy(); ff?.kill(); } catch {}
        cleanup();
        live.delete(id);
        reject(e);
      },
    };
    live.set(id, job);
    chrome.on('exit', (code) => { if (!done) job.fail(new Error(`Chrome 提早結束（${code}）`)); });
  });
}

// a few songs at a time; each one is a headless Chrome + ffmpeg pair
const queue = [...songs], results = [];
await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => {
  while (queue.length) {
    const n = queue.shift();
    results.push(await runJob(n).then(() => true, () => false));
  }
}));
server.close();
process.exit(results.every(Boolean) ? 0 : 1);
