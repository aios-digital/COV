// Piper voice catalog + download + synthesis helpers, shared by setup.mjs, voices.mjs (the voice picker) and prepare.mjs.
// Voices come from https://huggingface.co/rhasspy/piper-voices (each voice has its own licence: see its MODEL_CARD).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawnSync } from 'node:child_process';
import { toolsDir, voiceFile, piperExe } from './env.mjs';

export const HF_ROOT = 'https://huggingface.co';
export const HF = `${HF_ROOT}/rhasspy/piper-voices/resolve/main`;
const CATALOG_TTL_MS = 24 * 3600 * 1000;

export async function download(url, dest, { expectMd5 } = {}) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}) ${url}`);
  const tmp = `${dest}.part`;
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp));
  if (expectMd5) {
    const got = crypto.createHash('md5').update(fs.readFileSync(tmp)).digest('hex');
    if (got !== expectMd5) { fs.rmSync(tmp, { force: true }); throw new Error(`Checksum mismatch for ${url}`); }
  }
  fs.renameSync(tmp, dest);
}

/** The full Piper voice catalog (cached for a day in the tools folder). */
export async function loadCatalog() {
  const cache = path.join(toolsDir(), 'voices-catalog.json');
  try { if (Date.now() - fs.statSync(cache).mtimeMs < CATALOG_TTL_MS) return JSON.parse(fs.readFileSync(cache, 'utf8')); } catch { /* fetch below */ }
  try { await download(`${HF}/voices.json`, cache); } catch (e) { if (!fs.existsSync(cache)) throw e; }
  return JSON.parse(fs.readFileSync(cache, 'utf8'));
}

/** Extra voices that are not in the official Piper catalog (see community-voices.json: each has a source repo and a licence). */
export function loadCommunity() {
  try { return JSON.parse(fs.readFileSync(new URL('./community-voices.json', import.meta.url), 'utf8')); } catch { return []; }
}
export function describeCommunity(c) {
  return {
    key: c.key, name: c.name, quality: 'community', speakers: 1, language: c.language, family: c.language.split('_')[0],
    languageName: c.languageName, country: c.country, sizeMb: c.sizeMb, sampleUrl: null, sampleText: c.sampleText,
    community: true, license: c.license, commercial: c.commercial, notes: c.notes, source: `https://huggingface.co/${c.repo}`,
    installed: fs.existsSync(voiceFile(c.key)),
  };
}

/** Catalog entry reduced to what the picker needs. */
export function describeVoice(key, v) {
  const onnx = Object.entries(v.files).find(([f]) => f.endsWith('.onnx'));
  const dir = onnx[0].split('/').slice(0, -1).join('/');
  return {
    key, name: v.name, quality: v.quality, speakers: v.num_speakers,
    language: v.language.code, family: v.language.family, languageName: v.language.name_english, country: v.language.country_english,
    sizeMb: Math.round(onnx[1].size_bytes / 1048576), sampleUrl: `${HF}/${dir}/samples/speaker_0.mp3`,
    source: `https://huggingface.co/rhasspy/piper-voices/tree/main/${dir}`,
    installed: fs.existsSync(voiceFile(key)), community: false,
  };
}

/** Downloads a voice model + config into the tools folder (checksum verified). Idempotent. */
export async function ensureVoice(key) {
  if (fs.existsSync(voiceFile(key)) && fs.existsSync(`${voiceFile(key)}.json`)) return voiceFile(key);
  const community = loadCommunity().find((c) => c.key === key);
  if (community) {
    await download(`${HF_ROOT}/${community.repo}/resolve/main/${community.onnx}`, voiceFile(key));
    await download(`${HF_ROOT}/${community.repo}/resolve/main/${community.json}`, `${voiceFile(key)}.json`);
    return voiceFile(key);
  }
  const catalog = await loadCatalog();
  const v = catalog[key];
  if (!v) throw new Error(`Unknown Piper voice '${key}'. Run: node scripts/engine/voices.mjs to browse the catalog.`);
  for (const [file, meta] of Object.entries(v.files)) {
    if (!/\.onnx(\.json)?$/.test(file)) continue;
    await download(`${HF}/${file}`, path.join(toolsDir(), 'piper', path.basename(file)), { expectMd5: meta.md5_digest });
  }
  return voiceFile(key);
}

/** Synthesizes `text` with a voice into a WAV file. Returns the path. */
export function synth(text, key, dest, lengthScale = 1.08) {
  const run = spawnSync(piperExe(), ['--model', voiceFile(key), '--output_file', dest, '--length_scale', String(lengthScale)], { input: text, encoding: 'utf8' });
  if (run.status !== 0 || !fs.existsSync(dest)) throw new Error(`Piper failed: ${run.stderr || run.error}`);
  return dest;
}
