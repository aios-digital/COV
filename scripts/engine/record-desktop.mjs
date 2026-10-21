// Records a scripted walkthrough of a Windows DESKTOP application (the web version is record.mjs). It captures the application's window
// with ffmpeg (gdigrab), drives the mouse and keyboard from the scene scripts, and writes the same timeline.json that mux.mjs expects.
// Windows only. The application window is brought to the front for the recording; do not touch the mouse while it runs.
//   node record-desktop.mjs --config=<cfg> [--out=<project folder>] [--final] [--only=id1,id2]
// Config: desktop: { title: 'regex matching the window title', hideWhenDone: true|false (default: restore the tray state it had) }.
// Scene scripts get a toolkit `h` whose coordinates are relative to the captured window (its top-left corner is 0,0):
//   h.move(x, y) | h.hover(x, y, ms) | h.click(x, y) | h.rightClick(x, y) | h.key('{ESC}') | h.closeMenus() | h.shot(name) | h.sleep(ms) | h.note(msg)
//   h.final, h.args, h.state, h.win ({ width, height })
// Same rules as the web recorder: recording is blocked until plan.md is approved (plan.mjs approve); never click anything that stops,
// deletes or sends; list in the plan every action that changes state.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { parseArgs, loadConfig, ffmpegBin } from './env.mjs';
import { checkPlan } from './planlib.mjs';

if (process.platform !== 'win32') { console.error('record-desktop.mjs works on Windows only.'); process.exit(1); }
const args = parseArgs(process.argv);
const { config, dirs } = await loadConfig(args);
const plan = checkPlan(config, dirs);
if (!plan.ok && !args['skip-plan-check']) { console.error(`PLAN_NOT_APPROVED: ${plan.reason}`); process.exit(2); }
if (!config.desktop || !config.desktop.title) { console.error('The config needs desktop: { title: "<regex of the window title>" }'); process.exit(1); }

const FINAL = !!args.final;
const only = String(args.only || '').split(',').filter(Boolean);
const outDir = FINAL ? dirs.video : path.join(dirs.root, 'rehearsal');
const shotDir = FINAL ? dirs.screens : path.join(dirs.root, 'rehearsal');
fs.mkdirSync(outDir, { recursive: true }); fs.mkdirSync(shotDir, { recursive: true });
const durations = JSON.parse(fs.readFileSync(path.join(dirs.audio, 'durations.json'), 'utf8'));
const { ffmpeg } = ffmpegBin();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = []; const note = (m) => { console.log(m); log.push(m); };

// ---- input server (PowerShell) with a simple request/response protocol
const server = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./desktop-input.ps1', import.meta.url))], { stdio: ['pipe', 'pipe', 'inherit'] });
const lines = readline.createInterface({ input: server.stdout });
const waiting = []; let ready;
const readyP = new Promise((r) => { ready = r; });
lines.on('line', (l) => { if (l === 'READY') return ready(); const w = waiting[0]; if (!w) return; if (l.startsWith('ITEM|')) w.items.push(l); else { waiting.shift(); w.done(l.startsWith('ERR') ? Promise.reject(new Error(l)) : { reply: l, items: w.items }); } });
function cmd(line) {
  return new Promise((resolve, reject) => { waiting.push({ items: [], done: (v) => (v instanceof Promise ? v.then(resolve, reject) : resolve(v)) }); server.stdin.write(line + '\n'); });
}
await readyP;

// ---- find and show the window
const found = (await cmd(`find ${config.desktop.title}`)).items.map((l) => { const p = l.split('|'); return { hwnd: p[1], visible: p[2] === 'True', iconic: p[3] === 'True', L: +p[4], T: +p[5], R: +p[6], B: +p[7], title: p.slice(8).join('|') }; }).filter((w) => w.R - w.L > 100 && w.B - w.T > 100);
if (!found.length) { console.error(`No window found for /${config.desktop.title}/. Is the application running?`); server.kill(); process.exit(1); }
const target = found.sort((a, b) => (b.R - b.L) * (b.B - b.T) - (a.R - a.L) * (a.B - a.T))[0];
const wasHidden = !target.visible || target.iconic;
await cmd(`show ${target.hwnd}`); await sleep(1200);
const refreshed = (await cmd(`find ${config.desktop.title}`)).items.map((l) => l.split('|')).find((p) => p[1] === target.hwnd);
const box = refreshed ? { L: +refreshed[4], T: +refreshed[5], R: +refreshed[6], B: +refreshed[7] } : target;
const region = { x: box.L, y: box.T, w: (box.R - box.L) & ~1, h: (box.B - box.T) & ~1 };
if (box.R <= 0 || box.B <= 0 || box.L < -1000) { console.error('The window is not on the screen (it is parked off screen). Open the application yourself, then run again.'); await cmd('quit').catch(() => {}); server.kill(); process.exit(1); }
note(`window: "${target.title}" region ${region.x},${region.y} ${region.w}x${region.h}`);

// ---- screen capture
const name = config.name || 'walkthrough';
const kind = FINAL && !only.length ? 'final' : only.length ? 'partial' : 'rehearsal';
const videoFile = path.join(outDir, kind === 'final' ? `${name}-silent.mp4` : `${kind}.mp4`);
fs.rmSync(videoFile, { force: true });
const cap = spawn(ffmpeg, ['-y', '-v', 'error', '-f', 'gdigrab', '-framerate', '25', '-draw_mouse', '1', '-offset_x', String(region.x), '-offset_y', String(region.y), '-video_size', `${region.w}x${region.h}`, '-i', 'desktop',
  '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '16', '-pix_fmt', 'yuv420p', videoFile], { stdio: ['pipe', 'ignore', 'inherit'] });
const capDone = new Promise((r) => cap.on('exit', r));
for (let i = 0; i < 50 && !(fs.existsSync(videoFile) && fs.statSync(videoFile).size > 0); i++) await sleep(100);
const t0 = Date.now();

// ---- toolkit
// Some tray applications re-park their window off screen when they were not opened by their own tray action. Never click blindly:
// every click checks that the window is still on the screen, and the run stops if it left.
async function onScreen() {
  const it = (await cmd(`find ${config.desktop.title}`)).items.map((l) => l.split('|')).find((p) => p[1] === target.hwnd);
  return !!it && it[2] === 'True' && +it[4] > -1000 && +it[6] > 0;
}
const abs = (x, y) => [Math.round(region.x + x), Math.round(region.y + y)];
let pos = null;
const h = {
  final: FINAL, args, state: {}, note, sleep, win: { width: region.w, height: region.h },
  async move(x, y, ms) {
    const [tx, ty] = abs(x, y);
    if (!pos) { const cur = await cmd('move ' + tx + ' ' + ty); void cur; pos = [tx, ty]; return; }
    const dist = Math.hypot(tx - pos[0], ty - pos[1]); const steps = Math.max(8, Math.min(60, Math.round(dist / 12))); const dt = (ms ?? Math.max(350, dist * 1.1)) / steps;
    for (let i = 1; i <= steps; i++) { const k = i / steps; const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; await cmd(`move ${Math.round(pos[0] + (tx - pos[0]) * e)} ${Math.round(pos[1] + (ty - pos[1]) * e)}`); await sleep(dt); }
    pos = [tx, ty];
  },
  async hover(x, y, ms = 1200) { await h.move(x, y); await sleep(ms); },
  async click(x, y) { if (!(await onScreen())) throw new Error('the application window left the screen'); await h.move(x, y); await sleep(250); await cmd('lclick'); await sleep(500); },
  async rightClick(x, y) { if (!(await onScreen())) throw new Error('the application window left the screen'); await h.move(x, y); await sleep(250); await cmd('rclick'); await sleep(700); },
  async key(keys) { await cmd(`key ${keys}`); await sleep(300); },
  async closeMenus() { await cmd('key {ESC}{ESC}{ESC}'); await sleep(400); },
  shot(shotName) { spawnSync(ffmpeg, ['-y', '-v', 'error', '-f', 'gdigrab', '-framerate', '5', '-offset_x', String(region.x), '-offset_y', String(region.y), '-video_size', `${region.w}x${region.h}`, '-i', 'desktop', '-frames:v', '1', path.join(shotDir, `${shotName}.png`)]); },
};

const timeline = {};
try {
  note(`mode=${FINAL ? 'final' : 'rehearsal'}`);
  for (const scene of config.scenes) {
    if (only.length && !only.includes(scene.id)) continue;
    if (!(await onScreen())) { note('ABORT: the application window left the screen, stopping before the next scene.'); h.aborted = true; break; }
    const start = Date.now(); timeline[scene.id] = start - t0;
    try { await scene.run(h); } catch (e) { note(`SCENE ${scene.id} PROBLEM: ${String(e.message).split('\n')[0]}`); await h.closeMenus().catch(() => {}); }
    const min = (durations[scene.id] || 4000) + 1200; const spent = Date.now() - start;
    if (spent < min) await sleep(min - spent);
    note(`scene ${scene.id} ${((Date.now() - start) / 1000).toFixed(1)}s (audio ${((durations[scene.id] || 0) / 1000).toFixed(1)}s)`);
  }
  await sleep(3500); // keep recording after the last scene so the closing words are never cut off
} finally {
  if (await onScreen().catch(() => false)) await h.closeMenus().catch(() => {});
  const total = Date.now() - t0;
  cap.stdin.write('q\n'); await Promise.race([capDone, sleep(8000)]); if (cap.exitCode === null) cap.kill();
  if (wasHidden && config.desktop.hideWhenDone !== false) await cmd(`hide ${target.hwnd}`).catch(() => {});
  await cmd('quit').catch(() => {}); server.kill();
  fs.writeFileSync(path.join(outDir, kind === 'final' ? 'timeline.json' : `${kind}-timeline.json`), JSON.stringify({ name, total, timeline, cuts: [], offset: 0, desktop: { width: region.w, height: region.h }, state: h.state, log }, null, 2));
  console.log(`DONE ${videoFile} total ${(total / 1000).toFixed(0)}s`);
}
