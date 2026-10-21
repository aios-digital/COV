// One-time, idempotent installer for the tools this skill needs. Works on Windows, Linux and macOS (Node 18+).
//   node scripts/setup.mjs [--tools=<folder>] [--voice=en_US-ryan-high] [--skip-voice]
// Installs into the tools folder (default ~/.customer-onboarding-tts, or $ONBOARDING_TOOLS), outside any git repository:
//   ffmpeg      system ffmpeg when it has libx264 + libass, else a BtbN build (Windows/Linux; checksum verified)   ~190 MB
//   Piper       rhasspy/piper 2023.11.14-2 release binary for your OS                                            ~25 MB
//   voice       one Piper voice from Hugging Face rhasspy/piper-voices (default en_US-ryan-high)                 ~60-120 MB
//   Playwright  npm 'playwright' + its small video encoder; uses your installed Google Chrome, else downloads Chromium
// Nothing is installed system-wide and PATH is never changed. Re-running skips everything already present.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs, toolsDir, exe, IS_WIN, DEFAULT_VOICE, readToolsManifest } from './engine/env.mjs';
import { download, ensureVoice } from './engine/voicelib.mjs';

const args = parseArgs(process.argv);
if (args.tools) process.env.ONBOARDING_TOOLS = path.resolve(args.tools);
const TOOLS = toolsDir();
const PLAYWRIGHT_VERSION = '1.49.1';
const say = (m) => console.log(`[customer-onboarding-with-tts] ${m}`);
const run = (cmd, argv, opts = {}) => spawnSync(cmd, argv, { encoding: 'utf8', shell: IS_WIN && /^(npm|npx)$/.test(cmd), ...opts });
fs.mkdirSync(path.join(TOOLS, 'downloads'), { recursive: true });
const manifest = readToolsManifest();
const save = (patch) => { Object.assign(manifest, patch); fs.writeFileSync(path.join(TOOLS, 'tools.json'), JSON.stringify(manifest, null, 2)); };

// --- Node
if (Number(process.versions.node.split('.')[0]) < 18) throw new Error('Node.js 18 or newer is required.');

// --- helpers
const plat = `${process.platform}-${process.arch}`;
const find = (dir, file) => { // first match of `file` anywhere below dir
  if (!fs.existsSync(dir)) return null;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isFile() && e.name === file) return p;
    if (e.isDirectory()) { const r = find(p, file); if (r) return r; }
  }
  return null;
};
const extract = (archive, dest) => { // bsdtar ships with Windows 10+, macOS and most Linux distributions
  fs.mkdirSync(dest, { recursive: true });
  const r = run('tar', ['-xf', archive, '-C', dest]);
  if (r.status !== 0) throw new Error(`Could not extract ${archive}: ${r.stderr}`);
};

// --- ffmpeg
function ffmpegUsable(bin) {
  const v = run(bin, ['-hide_banner', '-filters']);
  const e = run(bin, ['-hide_banner', '-encoders']);
  return v.status === 0 && /\bsubtitles\b/.test(v.stdout) && /libx264/.test(e.stdout);
}
async function setupFfmpeg() {
  const known = manifest.ffmpeg && fs.existsSync(manifest.ffmpeg) ? manifest.ffmpeg : find(path.join(TOOLS, 'ffmpeg_bin'), exe('ffmpeg'));
  if (known) { save({ ffmpeg: known, ffprobe: path.join(path.dirname(known), exe('ffprobe')) }); say('ffmpeg present'); return; }
  if (ffmpegUsable('ffmpeg')) {
    const which = run(IS_WIN ? 'where' : 'which', ['ffmpeg']).stdout.split(/\r?\n/)[0].trim();
    save({ ffmpeg: which, ffprobe: path.join(path.dirname(which), exe('ffprobe')) }); say(`using system ffmpeg (${which})`); return;
  }
  const asset = { 'win32-x64': 'ffmpeg-master-latest-win64-gpl.zip', 'linux-x64': 'ffmpeg-master-latest-linux64-gpl.tar.xz', 'linux-arm64': 'ffmpeg-master-latest-linuxarm64-gpl.tar.xz' }[plat];
  if (!asset) throw new Error('No ffmpeg build is bundled for this platform. Install ffmpeg with libx264 and libass (macOS: brew install ffmpeg), then re-run.');
  say(`downloading ffmpeg (BtbN build, ~190 MB): ${asset}`);
  const base = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest';
  const sums = path.join(TOOLS, 'downloads', 'btbn-checksums.sha256'); const file = path.join(TOOLS, 'downloads', asset);
  await download(`${base}/checksums.sha256`, sums); await download(`${base}/${asset}`, file);
  const want = fs.readFileSync(sums, 'utf8').split(/\r?\n/).find((l) => l.trim().endsWith(asset))?.split(/\s+/)[0]?.toLowerCase();
  const got = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (!want || want !== got) throw new Error(`ffmpeg checksum mismatch (${got})`);
  extract(file, path.join(TOOLS, 'ffmpeg_bin')); fs.rmSync(file);
  const bin = find(path.join(TOOLS, 'ffmpeg_bin'), exe('ffmpeg'));
  save({ ffmpeg: bin, ffprobe: path.join(path.dirname(bin), exe('ffprobe')) }); say('ffmpeg installed');
}

// --- Piper
async function setupPiper() {
  const known = manifest.piper && fs.existsSync(manifest.piper) ? manifest.piper : find(path.join(TOOLS, 'piper_bin'), exe('piper'));
  if (known) { save({ piper: known }); say('piper present'); return; }
  const asset = { 'win32-x64': 'piper_windows_amd64.zip', 'linux-x64': 'piper_linux_x86_64.tar.gz', 'linux-arm64': 'piper_linux_aarch64.tar.gz', 'darwin-x64': 'piper_macos_x64.tar.gz', 'darwin-arm64': 'piper_macos_aarch64.tar.gz' }[plat];
  if (!asset) throw new Error(`No Piper release binary for ${plat}.`);
  say(`downloading Piper: ${asset}`);
  const file = path.join(TOOLS, 'downloads', asset);
  await download(`https://github.com/rhasspy/piper/releases/download/2023.11.14-2/${asset}`, file);
  extract(file, path.join(TOOLS, 'piper_bin')); fs.rmSync(file);
  const bin = find(path.join(TOOLS, 'piper_bin'), exe('piper'));
  if (!bin) throw new Error('Piper binary not found after extraction.');
  if (!IS_WIN) fs.chmodSync(bin, 0o755);
  save({ piper: bin }); say('piper installed');
}

// --- Playwright + video encoder + browser
function chromeInstalled() {
  const candidates = IS_WIN ? [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean).map((b) => path.join(b, 'Google', 'Chrome', 'Application', 'chrome.exe'))
    : process.platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome'];
  return candidates.some((p) => fs.existsSync(p));
}
function setupPlaywright() {
  const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: path.join(TOOLS, 'pw-browsers'), PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' };
  if (!fs.existsSync(path.join(TOOLS, 'node_modules', 'playwright', 'index.mjs'))) {
    say(`installing Playwright ${PLAYWRIGHT_VERSION} (npm)`);
    if (!fs.existsSync(path.join(TOOLS, 'package.json'))) fs.writeFileSync(path.join(TOOLS, 'package.json'), '{"name":"customer-onboarding-tts-tools","private":true}');
    const r = run('npm', ['install', `playwright@${PLAYWRIGHT_VERSION}`, '--no-audit', '--no-fund'], { cwd: TOOLS, env });
    if (r.status !== 0) throw new Error(`npm install failed: ${r.stderr}`);
  } else say('playwright present');
  const has = (prefix) => fs.existsSync(env.PLAYWRIGHT_BROWSERS_PATH) && fs.readdirSync(env.PLAYWRIGHT_BROWSERS_PATH).some((d) => d.startsWith(prefix));
  const pw = (what) => { const r = run('npx', ['playwright', 'install', what], { cwd: TOOLS, env: { ...env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '' } }); if (r.status !== 0) throw new Error(`playwright install ${what} failed: ${r.stderr}`); };
  if (!has('ffmpeg-')) { say('installing the Playwright video encoder (about 1 MB)'); pw('ffmpeg'); } else say('video encoder present');
  if (chromeInstalled()) { save({ browserChannel: 'chrome' }); say('using your installed Google Chrome'); }
  else { if (!has('chromium-')) { say('Google Chrome not found: downloading Playwright Chromium (about 150 MB)'); pw('chromium'); } save({ browserChannel: 'chromium' }); }
}

await setupFfmpeg();
await setupPiper();
if (!args['skip-voice']) { const v = args.voice || manifest.defaultVoice || DEFAULT_VOICE; say(`voice ${v}`); await ensureVoice(v); save({ defaultVoice: v }); }
setupPlaywright();
say(`ready. Tools folder: ${TOOLS}`);
if (!process.env.ONBOARDING_TOOLS && args.tools) say(`You used a custom folder: set ONBOARDING_TOOLS=${TOOLS} so the other scripts find it.`);
