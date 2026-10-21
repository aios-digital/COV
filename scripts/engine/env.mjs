// Shared helpers for the engine: tool locations, CLI args, config loading, voice resolution, Playwright import.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_VOICE = 'en_US-ryan-high';
export const IS_WIN = process.platform === 'win32';
export const exe = (name) => (IS_WIN ? `${name}.exe` : name);

export function parseArgs(argv) {
  const args = { _: [] };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--')) { const i = a.indexOf('='); if (i < 0) args[a.slice(2)] = true; else args[a.slice(2, i)] = a.slice(i + 1); } else args._.push(a);
  }
  return args;
}

/** Shared, project-independent tools (ffmpeg, Piper + voices, Playwright). Created by scripts/setup.mjs. Never inside a git repo. */
export const toolsDir = () => process.env.ONBOARDING_TOOLS || path.join(os.homedir(), '.customer-onboarding-tts');

export function readToolsManifest() {
  try { return JSON.parse(fs.readFileSync(path.join(toolsDir(), 'tools.json'), 'utf8')); } catch { return {}; }
}

function firstExisting(candidates, what) {
  const found = candidates.find((p) => p && fs.existsSync(p));
  if (!found) throw new Error(`${what} not found. Run: node scripts/setup.mjs   (tools folder: ${toolsDir()})`);
  return found;
}

export function ffmpegBin() {
  const m = readToolsManifest();
  if (m.ffmpeg && fs.existsSync(m.ffmpeg)) return { ffmpeg: m.ffmpeg, ffprobe: m.ffprobe };
  const base = path.join(toolsDir(), 'ffmpeg_bin');
  const dirs = fs.existsSync(base) ? fs.readdirSync(base).map((d) => path.join(base, d, 'bin')) : [];
  const dir = firstExisting(dirs.filter((d) => fs.existsSync(path.join(d, exe('ffmpeg')))), 'ffmpeg');
  return { ffmpeg: path.join(dir, exe('ffmpeg')), ffprobe: path.join(dir, exe('ffprobe')) };
}

export const piperExe = () => firstExisting([readToolsManifest().piper, path.join(toolsDir(), 'piper_bin', 'piper', exe('piper'))], 'Piper');
export const voiceFile = (voice) => path.join(toolsDir(), 'piper', `${voice}.onnx`);
export const voiceModel = (voice) => firstExisting([voiceFile(voice)], `Piper voice ${voice} (pick or download one with: node scripts/engine/voices.mjs)`);

/** Loads the walkthrough config (default export) and resolves the project folder where video/audio/screens/profile live. */
export async function loadConfig(args) {
  if (!args.config) throw new Error('Pass --config=<path to walkthrough.config.mjs>');
  const file = path.resolve(args.config);
  const config = (await import(pathToFileURL(file).href)).default;
  const root = path.resolve(args.out || path.dirname(file));
  const dirs = { root, video: path.join(root, 'video'), audio: path.join(root, 'audio'), screens: path.join(root, 'screens'), profile: path.join(root, 'profile'), scan: path.join(root, 'scan') };
  [dirs.root, dirs.video, dirs.audio, dirs.screens, dirs.profile].forEach((d) => fs.mkdirSync(d, { recursive: true }));
  return { config, file, dirs };
}

/** Voice precedence: config.voice, then <project>/voice.json (written by voices.mjs), then the tools-folder default, then DEFAULT_VOICE. */
export function resolveVoice(config, dirs) {
  const read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; } };
  const chosen = { ...read(path.join(toolsDir(), 'default-voice.json')), ...read(path.join(dirs.root, 'voice.json')) };
  return {
    voice: config.voice || chosen.voice || DEFAULT_VOICE,
    lengthScale: config.lengthScale ?? chosen.lengthScale ?? 1.08,
    gapMs: config.gapMs ?? chosen.gapMs ?? 450,
  };
}

/** Browser launch options: the installed Google Chrome when available, otherwise Playwright's own Chromium (set by setup.mjs). */
export function browserOptions() {
  const m = readToolsManifest();
  return m.browserChannel === 'chromium' ? {} : { channel: 'chrome' };
}

export async function loadPlaywright() {
  process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(toolsDir(), 'pw-browsers');
  const entry = firstExisting([path.join(toolsDir(), 'node_modules', 'playwright', 'index.mjs')], 'Playwright');
  return import(pathToFileURL(entry).href);
}

export const allClips = (config) => [...config.scenes.map((s) => ({ id: s.id, text: s.text })), ...(config.extras || []).map((e) => ({ id: e.id, text: e.text }))];
