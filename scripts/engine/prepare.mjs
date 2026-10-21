// Synthesizes the narration offline with Piper. Each sentence is synthesized separately so its real start time is known (exact
// subtitle timing); sentences are joined with a natural pause into one WAV per clip. Unchanged clips are reused (hash cache).
// Writes <project>/audio/<id>.wav, durations.json ({id: ms}) and parts.json ({id: {hash, parts: [{text,start,end}]}}).
// Usage: node prepare.mjs --config=<walkthrough.config.mjs> [--out=<project folder>] [--force]
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, loadConfig, ffmpegBin, piperExe, voiceModel, allClips, resolveVoice } from './env.mjs';

const args = parseArgs(process.argv);
const { config, dirs } = await loadConfig(args);
const { ffmpeg, ffprobe } = ffmpegBin();
const piper = piperExe();
const choice = resolveVoice(config, dirs);
const voice = choice.voice;
const model = voiceModel(voice);
const lengthScale = String(choice.lengthScale);
const gapMs = choice.gapMs;
console.log(`voice ${voice} (speed factor ${lengthScale})`);
const tmp = path.join(dirs.audio, 'sentences');
fs.mkdirSync(tmp, { recursive: true });

const probe = (file) => Math.round(parseFloat(spawnSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).stdout) * 1000);
const sentencesOf = (text) => (text.match(/[^.!?]+[.!?]+/g) || [text]).map((s) => s.trim()).filter(Boolean);
const cacheFile = path.join(dirs.audio, 'parts.json');
const cache = fs.existsSync(cacheFile) && !args.force ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {};

const durations = {}; const parts = {};
for (const clip of allClips(config)) {
  const hash = crypto.createHash('sha1').update([clip.text, voice, lengthScale, gapMs].join('|')).digest('hex');
  const out = path.join(dirs.audio, `${clip.id}.wav`);
  if (cache[clip.id]?.hash === hash && fs.existsSync(out)) { parts[clip.id] = cache[clip.id]; durations[clip.id] = probe(out); console.log(clip.id, 'cached'); continue; }
  const list = []; const files = []; let cursor = 0;
  sentencesOf(clip.text).forEach((sentence, i) => {
    const file = path.join(tmp, `${clip.id}-${i}.wav`);
    const run = spawnSync(piper, ['--model', model, '--output_file', file, '--length_scale', lengthScale], { input: sentence, encoding: 'utf8' });
    if (run.status !== 0 || !fs.existsSync(file)) throw new Error(`piper failed for ${clip.id}/${i}: ${run.stderr}`);
    const dur = probe(file);
    list.push({ text: sentence, start: cursor, end: cursor + dur }); files.push({ file, start: cursor }); cursor += dur + gapMs;
  });
  const inputs = files.flatMap((f) => ['-i', f.file]);
  const filters = files.map((f, i) => `[${i}:a]adelay=${f.start}|${f.start}[s${i}]`);
  filters.push(`${files.map((_, i) => `[s${i}]`).join('')}amix=inputs=${files.length}:normalize=0[o]`);
  const mix = spawnSync(ffmpeg, ['-y', '-v', 'error', ...inputs, '-filter_complex', filters.join(';'), '-map', '[o]', '-ar', '22050', out], { encoding: 'utf8' });
  if (mix.status !== 0) throw new Error(`ffmpeg join failed for ${clip.id}: ${mix.stderr}`);
  durations[clip.id] = probe(out); parts[clip.id] = { hash, parts: list };
  console.log(clip.id, (durations[clip.id] / 1000).toFixed(1) + 's', list.length + ' sentences');
}
fs.writeFileSync(path.join(dirs.audio, 'durations.json'), JSON.stringify(durations, null, 2));
fs.writeFileSync(cacheFile, JSON.stringify(parts, null, 2));
fs.rmSync(tmp, { recursive: true, force: true });
console.log('total narration', (Object.values(durations).reduce((a, b) => a + b, 0) / 1000).toFixed(0) + 's');
