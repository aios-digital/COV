// Builds the final videos from the silent recording + narration:
//   video/<name>-captioned.mp4   English subtitles burned in, timed to the voice (main deliverable)
//   video/<name>.mp4             the same without subtitles
//   video/<name>.srt / .vtt      sentence-level subtitle files (real per-sentence timings)
// Server waits recorded by h.slowWait() are cut out, the silent page-load at the start is trimmed, and the last frame is held
// so the closing words always finish.
// Usage: node mux.mjs --config=<walkthrough.config.mjs> [--out=<project folder>]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, loadConfig, ffmpegBin } from './env.mjs';

const args = parseArgs(process.argv);
const { config, dirs } = await loadConfig(args);
const { ffmpeg } = ffmpegBin();
const name = config.name || 'walkthrough';
const tl = JSON.parse(fs.readFileSync(path.join(dirs.video, 'timeline.json'), 'utf8'));
const partsAll = JSON.parse(fs.readFileSync(path.join(dirs.audio, 'parts.json'), 'utf8'));
const OFFSET = 400; // the recording starts slightly before the timeline clock
const HOLD = 3; // seconds the last frame is held after the video ends
const cuts = [...(tl.cuts || [])].sort((a, b) => a.from - b.from);
const removedBefore = (v) => cuts.reduce((n, c) => n + (v >= c.to ? c.to - c.from : 0), 0);
const first = config.scenes[0].id;
const TRIM = Math.max(0, tl.timeline[first] - removedBefore(tl.timeline[first]) + OFFSET - 600); // drop the silent page-load, keep a 0.6 s lead-in
const at = (v) => v - removedBefore(v) - TRIM; // timeline ms -> output ms

const clips = [
  ...config.scenes.map((s) => ({ id: s.id, start: at(tl.timeline[s.id]) })),
  ...(config.extras || []).map((e) => ({ id: e.id, start: at(tl.timeline[e.anchor] + e.offset) })),
];

// ---- audio + video graph
const inputs = ['-i', path.join(dirs.video, `${name}-silent.webm`)];
const audio = []; const labels = [];
clips.forEach((c, i) => {
  inputs.push('-i', path.join(dirs.audio, `${c.id}.wav`));
  const delay = Math.max(0, Math.round(c.start + OFFSET));
  audio.push(`[${i + 1}:a]adelay=${delay}|${delay}[a${i}]`); labels.push(`[a${i}]`);
});
audio.push(`${labels.join('')}amix=inputs=${clips.length}:normalize=0,volume=0.85,aresample=48000[aout]`);
const video = [];
if (cuts.length) {
  const segs = [];
  for (let i = 0; i <= cuts.length; i++) {
    const a = i === 0 ? 0 : (cuts[i - 1].to + OFFSET) / 1000; const b = i === cuts.length ? null : (cuts[i].from + OFFSET) / 1000;
    video.push(`[0:v]trim=start=${a}${b === null ? '' : `:end=${b}`},setpts=PTS-STARTPTS[v${i}]`); segs.push(`[v${i}]`);
  }
  video.push(`${segs.join('')}concat=n=${segs.length}:v=1:a=0[vcut]`);
} else video.push('[0:v]null[vcut]');
video.push(`[vcut]trim=start=${TRIM / 1000},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${HOLD}[vhold]`);

// ---- subtitle cues: one per sentence from the real timings, wrapped to at most two lines
const WIDTH = config.subtitleWidth || 58;
const wrap = (text) => { const lines = []; let line = ''; for (const w of text.split(/\s+/)) { if ((line + ' ' + w).trim().length > WIDTH && line) { lines.push(line); line = w; } else line = (line + ' ' + w).trim(); } if (line) lines.push(line); return lines; };
const cues = [];
for (const c of clips) {
  for (const p of partsAll[c.id].parts) {
    const lines = wrap(p.text); const begin = c.start + OFFSET + p.start; const span = p.end - p.start;
    const groups = []; for (let i = 0; i < lines.length; i += 2) groups.push(lines.slice(i, i + 2));
    const total = groups.reduce((n, g) => n + g.join(' ').length, 0); let t = begin;
    groups.forEach((g) => { const d = span * (g.join(' ').length / total); cues.push({ start: t, end: t + d, text: g.join('\n') }); t += d; });
  }
}
cues.sort((a, b) => a.start - b.start);
const pad = (n, w) => String(Math.floor(n)).padStart(w, '0');
const stamp = (ms, sep) => `${pad(ms / 3600000, 2)}:${pad((ms / 60000) % 60, 2)}:${pad((ms / 1000) % 60, 2)}${sep}${pad(ms % 1000, 3)}`;
fs.writeFileSync(path.join(dirs.video, `${name}.srt`), cues.map((c, i) => `${i + 1}\n${stamp(c.start, ',')} --> ${stamp(c.end, ',')}\n${c.text}\n`).join('\n'));
fs.writeFileSync(path.join(dirs.video, `${name}.vtt`), 'WEBVTT\n\n' + cues.map((c) => `${stamp(c.start, '.')} --> ${stamp(c.end, '.')}\n${c.text}\n`).join('\n'));
fs.copyFileSync(path.join(dirs.video, `${name}.srt`), path.join(dirs.video, 'subs.srt')); // short relative name for the filter

// libass scales SRT subtitles on a 384x288 canvas: FontSize 11 is about 41 px on a 1080p frame; margins use the same units.
const style = config.subtitleStyle || 'FontName=Arial,FontSize=11,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&HB0000000,BorderStyle=3,Outline=1,Shadow=0,MarginV=9,MarginL=40,MarginR=40,Alignment=2';
const encode = (file, withSubs) => {
  const graph = [...video, withSubs ? `[vhold]subtitles=subs.srt:force_style='${style}'[vout]` : '[vhold]null[vout]', ...audio];
  const out = path.join(dirs.video, file);
  const run = spawnSync(ffmpeg, ['-y', '-v', 'error', ...inputs, '-filter_complex', graph.join(';'), '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '25', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out], { encoding: 'utf8', cwd: dirs.video });
  if (run.status !== 0) throw new Error(run.stderr);
  console.log(file, (fs.statSync(out).size / 1048576).toFixed(1) + ' MB');
};
encode(`${name}-captioned.mp4`, true);
encode(`${name}.mp4`, false);
fs.rmSync(path.join(dirs.video, 'subs.srt'), { force: true });
console.log('cues', cues.length);
