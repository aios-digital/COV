// Voice picker: a small local dashboard to listen to Piper voices and choose the narrator for your onboarding video.
//   node voices.mjs [--config=<cfg> | --out=<project folder>] [--port=0] [--no-open]
// - Lists every voice of the Piper catalog with a ready-made sample (streamed, nothing to install to listen).
// - "Try with my script" downloads that voice once and reads the first lines of YOUR narration, at the chosen speed.
// - "Use this voice" saves <project>/voice.json (or the tools-folder default when no project is given).
// The server listens on 127.0.0.1 only and stops when you press Finish (or after 60 idle minutes).
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { parseArgs, toolsDir, IS_WIN, resolveVoice, DEFAULT_VOICE, ffmpegBin } from './env.mjs';
import { loadCatalog, describeVoice, ensureVoice, synth, download } from './voicelib.mjs';

const args = parseArgs(process.argv);
let project = null; let sampleText = 'Hi, and welcome. In this short video I will show you how your team uses this module day to day. Take your time, and do not worry, we will go step by step.';
let config = {};
if (args.config) {
  const { loadConfig } = await import('./env.mjs');
  const loaded = await loadConfig(args); config = loaded.config; project = loaded.dirs;
  const first = (config.scenes || []).find((s) => s.text && !/<.+>/.test(s.text));
  if (first) sampleText = (first.text.match(/[^.!?]+[.!?]+/g) || [first.text]).slice(0, 3).join(' ').trim();
} else if (args.out) { project = { root: path.resolve(args.out) }; fs.mkdirSync(project.root, { recursive: true }); }
const saveTarget = project ? path.join(project.root, 'voice.json') : path.join(toolsDir(), 'default-voice.json');
const current = () => { try { return JSON.parse(fs.readFileSync(saveTarget, 'utf8')); } catch { return project ? resolveVoice(config, project) : { voice: DEFAULT_VOICE }; } };

const PAGE = fs.readFileSync(new URL('./voices.html', import.meta.url), 'utf8');
const catalog = await loadCatalog();
const voices = Object.entries(catalog).map(([k, v]) => describeVoice(k, v)).sort((a, b) => a.language.localeCompare(b.language) || a.name.localeCompare(b.name) || a.quality.localeCompare(b.quality));
const cacheDir = path.join(toolsDir(), 'voice-samples'); fs.mkdirSync(cacheDir, { recursive: true });
let lastHit = Date.now();


/** Text to speech for the studio: MP3 through ffmpeg (default), or WAV straight from Piper. Returns { buf, mime, ext }. */
async function render(key, text, lengthScale, format) {
  const v = voices.find((x) => x.key === key); if (!v) throw new Error('unknown voice');
  const clean = String(text || '').replace(/\r/g, '').trim().slice(0, 5000); if (!clean) throw new Error('Type some text first.');
  const ls = Math.min(1.6, Math.max(0.8, Number(lengthScale) || 1.08));
  await ensureVoice(v.key);
  const id = crypto.randomUUID(); const wav = path.join(os.tmpdir(), `cotts-${id}.wav`); const mp3 = path.join(os.tmpdir(), `cotts-${id}.mp3`);
  try {
    synth(clean, v.key, wav, ls);
    if (format === 'wav') return { buf: fs.readFileSync(wav), mime: 'audio/wav', ext: 'wav' };
    const r = spawnSync(ffmpegBin().ffmpeg, ['-y', '-v', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-q:a', '3', mp3], { encoding: 'utf8' });
    if (r.status !== 0 || !fs.existsSync(mp3)) throw new Error('MP3 needs an ffmpeg with libmp3lame. Install a full ffmpeg (with libmp3lame) or run scripts/setup.mjs.');
    return { buf: fs.readFileSync(mp3), mime: 'audio/mpeg', ext: 'mp3' };
  } finally { fs.rmSync(wav, { force: true }); fs.rmSync(mp3, { force: true }); }
}
const fileLabel = (key, text, ext) => {
  const slug = String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').split('-').slice(0, 6).join('-') || 'speech';
  const t = new Date(); const p = (n) => String(n).padStart(2, '0');
  return `tts-${slug}-${key}-${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}-${p(t.getHours())}${p(t.getMinutes())}${p(t.getSeconds())}.${ext}`;
};

const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((resolve, reject) => { let b = ''; req.on('data', (c) => { b += c; if (b.length > 30000) { reject(new Error('too large')); req.destroy(); } }); req.on('end', () => resolve(b)); });

const server = http.createServer(async (req, res) => {
  lastHit = Date.now();
  const port = server.address().port;
  const hostOk = [`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host);
  if (!hostOk) return json(res, 403, { error: 'forbidden host' });
  if (req.method === 'POST' && req.headers.origin && ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(req.headers.origin)) return json(res, 403, { error: 'forbidden origin' });
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(PAGE); }
    if (url.pathname === '/api/state') return json(res, 200, { voices: voices.map((v) => ({ ...v, installed: fs.existsSync(path.join(toolsDir(), 'piper', `${v.key}.onnx`)) })), current: current(), sampleText, project: project ? project.root : null, saveTarget, piperReady: (() => { try { return !!fs.existsSync(JSON.parse(fs.readFileSync(path.join(toolsDir(), 'tools.json'), 'utf8')).piper); } catch { return false; } })() });
    if (url.pathname === '/api/sample') {
      const v = voices.find((x) => x.key === url.searchParams.get('key')); if (!v) return json(res, 404, { error: 'unknown voice' });
      const file = path.join(cacheDir, `${v.key}.mp3`);
      if (!fs.existsSync(file)) await download(v.sampleUrl, file);
      res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': fs.statSync(file).size }); return fs.createReadStream(file).pipe(res);
    }
    if (req.method === 'POST' && url.pathname === '/api/preview') {
      const b = JSON.parse(await readBody(req));
      const out = await render(b.key, String(b.text || sampleText).slice(0, 600), b.lengthScale, 'wav');
      res.writeHead(200, { 'Content-Type': out.mime, 'Cache-Control': 'no-store' }); return res.end(out.buf);
    }
    if (req.method === 'POST' && url.pathname === '/api/tts') {
      const b = JSON.parse(await readBody(req));
      const out = await render(b.key, b.text, b.lengthScale, b.format);
      res.writeHead(200, { 'Content-Type': out.mime, 'Cache-Control': 'no-store', 'X-File-Name': fileLabel(b.key, b.text, out.ext) }); return res.end(out.buf);
    }
    if (req.method === 'POST' && url.pathname === '/api/choose') {
      const b = JSON.parse(await readBody(req)); const v = voices.find((x) => x.key === b.key); if (!v) return json(res, 404, { error: 'unknown voice' });
      await ensureVoice(v.key);
      const choice = { voice: v.key, lengthScale: Math.min(1.6, Math.max(0.8, Number(b.lengthScale) || 1.08)), gapMs: Math.min(1500, Math.max(150, Number(b.gapMs) || 450)), chosenAt: new Date().toISOString() };
      fs.mkdirSync(path.dirname(saveTarget), { recursive: true }); fs.writeFileSync(saveTarget, JSON.stringify(choice, null, 2));
      console.log(`VOICE_CHOSEN ${choice.voice} speed ${choice.lengthScale} -> ${saveTarget}`);
      return json(res, 200, { saved: saveTarget, choice });
    }
    if (req.method === 'POST' && url.pathname === '/api/finish') { json(res, 200, { bye: true }); console.log('VOICE_PICKER_CLOSED'); setTimeout(() => process.exit(0), 300); return; }
    json(res, 404, { error: 'not found' });
  } catch (e) { json(res, 500, { error: String(e.message || e) }); }
});
setInterval(() => { if (Date.now() - lastHit > 60 * 60 * 1000) process.exit(0); }, 60000).unref();
server.listen(Number(args.port) || 0, '127.0.0.1', () => {
  const link = `http://127.0.0.1:${server.address().port}/`;
  console.log(`VOICE_PICKER ${link}   (choice is saved to ${saveTarget})`);
  if (!args['no-open']) { const [cmd, a] = IS_WIN ? ['cmd', ['/c', 'start', '', link]] : process.platform === 'darwin' ? ['open', [link]] : ['xdg-open', [link]]; spawn(cmd, a, { detached: true, stdio: 'ignore' }).on('error', () => {}).unref(); }
});
