// Plain text-to-speech from the command line, no onboarding project needed (same offline Piper voices as the dashboard).
//   node tts.mjs --text="Hello there." [--voice=en_US-ryan-high] [--speed=1.08] [--format=mp3|wav] [--out=<file or folder>]
//   node tts.mjs --file=script.txt --out=./audio
// Without --voice it uses your saved default (voices.mjs) or en_US-ryan-high. MP3 is the default; without --out the file is saved in the current folder.
// A voice that is not installed yet is downloaded once (60 to 120 MB).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs, toolsDir, DEFAULT_VOICE, ffmpegBin } from './env.mjs';
import { ensureVoice, synth } from './voicelib.mjs';

const args = parseArgs(process.argv);
const text = String(args.file ? fs.readFileSync(path.resolve(args.file), 'utf8') : args.text || '').replace(/\r/g, '').trim().slice(0, 50000);
if (!text) { console.error('Usage: node tts.mjs --text="Hello" [--voice=en_US-ryan-high] [--speed=1.08] [--format=mp3|wav] [--out=<file or folder>]'); process.exit(1); }
const saved = (() => { try { return JSON.parse(fs.readFileSync(path.join(toolsDir(), 'default-voice.json'), 'utf8')); } catch { return {}; } })();
const voice = args.voice || saved.voice || DEFAULT_VOICE;
const speed = Number(args.speed) || saved.lengthScale || 1.08;
const format = args.format === 'wav' ? 'wav' : 'mp3';
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
let out = args.out ? path.resolve(String(args.out).replace(/^~(?=$|[\\/])/, os.homedir())) : process.cwd();
if (!path.extname(out)) out = path.join(out, `tts-${voice}-${stamp}.${format}`);
fs.mkdirSync(path.dirname(out), { recursive: true });

await ensureVoice(voice);
const wav = format === 'wav' ? out : `${out}.tmp.wav`;
synth(text, voice, wav, speed);
if (format === 'mp3') {
  const r = spawnSync(ffmpegBin().ffmpeg, ['-y', '-v', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-q:a', '3', out], { encoding: 'utf8' });
  fs.rmSync(wav, { force: true });
  if (r.status !== 0) throw new Error('MP3 needs an ffmpeg with libmp3lame. Use --format=wav, or run scripts/setup.mjs.');
}
console.log(`TTS_SAVED ${out} (voice ${voice}, speed ${speed})`);
