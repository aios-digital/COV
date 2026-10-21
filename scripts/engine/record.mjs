// Records a scripted walkthrough of any web app with Playwright (1920x1080 video + timeline + screenshots), pacing every scene to
// its narration. The scenes live in a walkthrough config (see templates/walkthrough.config.mjs); each scene's run(h) uses the
// helper toolkit `h` below.
// Usage: node record.mjs --config=<cfg> [--out=<project folder>] [--final] [--only=id1,id2] [--<anything>=<value>]
//   rehearsal (default): scenes must not change data (h.final is false);  --final: the real take (scenes may create/save).
//   Extra --key=value flags are exposed to scenes as h.args.key (for example --ticket=14).
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, loadConfig, loadPlaywright, browserOptions } from './env.mjs';
import { checkPlan } from './planlib.mjs';

const args = parseArgs(process.argv);
const { config, dirs } = await loadConfig(args);
const plan = checkPlan(config, dirs);
if (!plan.ok && !args['skip-plan-check']) { console.error(`PLAN_NOT_APPROVED: ${plan.reason}`); process.exit(2); }
const { chromium } = await loadPlaywright();
const FINAL = !!args.final;
const only = String(args.only || '').split(',').filter(Boolean);
const outDir = FINAL ? dirs.video : path.join(dirs.root, 'rehearsal');
const shotDir = FINAL ? dirs.screens : path.join(dirs.root, 'rehearsal');
fs.mkdirSync(outDir, { recursive: true }); fs.mkdirSync(shotDir, { recursive: true });
const durations = JSON.parse(fs.readFileSync(path.join(dirs.audio, 'durations.json'), 'utf8'));
const viewport = config.viewport || { width: 1920, height: 1080 };
const baseUrl = config.baseUrl.endsWith('/') ? config.baseUrl : config.baseUrl + '/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- overlay injected into every page: cursor dot, click ripple, step-title badge
const overlay = (badgeSide) => {
  const boot = () => {
    if (document.getElementById('__cur')) return;
    const css = document.createElement('style');
    css.textContent = `#__cur{position:fixed;z-index:2147483647;width:28px;height:28px;border-radius:50%;background:rgba(255,64,64,.55);border:2px solid #fff;box-shadow:0 0 6px #000;pointer-events:none;transform:translate(-50%,-50%);left:-50px;top:-50px}
    .__rip{position:fixed;z-index:2147483646;width:14px;height:14px;border-radius:50%;border:3px solid #ff4040;pointer-events:none;transform:translate(-50%,-50%);animation:__r .6s ease-out forwards}
    @keyframes __r{to{width:70px;height:70px;opacity:0}}
    #__cap{position:fixed;z-index:2147483647;${badgeSide}:24px;top:72px;max-width:34%;padding:8px 18px;border-radius:10px;background:rgba(10,20,35,.88);color:#fff;font:600 21px/1.3 Segoe UI,Arial,sans-serif;text-align:left;pointer-events:none}
    .__hl{outline:4px solid #ff4040 !important;outline-offset:3px;border-radius:4px}`;
    document.head.appendChild(css);
    const cur = document.createElement('div'); cur.id = '__cur'; document.body.appendChild(cur);
    const cap = document.createElement('div'); cap.id = '__cap'; cap.style.display = 'none'; document.body.appendChild(cap);
    document.addEventListener('mousemove', (e) => { cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px'; }, true);
    document.addEventListener('mousedown', (e) => { const r = document.createElement('div'); r.className = '__rip'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; document.body.appendChild(r); setTimeout(() => r.remove(), 700); }, true);
    window.__setCaption = (t) => { cap.textContent = t || ''; cap.style.display = t ? 'block' : 'none'; };
  };
  if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
};

const context = await chromium.launchPersistentContext(dirs.profile, {
  ...browserOptions(), headless: false, viewport, recordVideo: { dir: outDir, size: viewport },
});
await context.addInitScript(overlay, config.badgeSide === 'left' ? 'left' : 'right');
const page = context.pages()[0] || await context.newPage();
const t0 = Date.now();
let caption = '';
const setCaption = async (text) => { caption = text; await page.evaluate((t) => window.__setCaption && window.__setCaption(t), text).catch(() => {}); };
page.on('domcontentloaded', () => { setCaption(caption); });

const timeline = {}; const cuts = []; const log = [];
const note = (m) => { console.log(m); log.push(m); };

// ---- helper toolkit handed to every scene
const h = {
  page, context, final: FINAL, args, state: {}, note, sleep, baseUrl,
  url: (p) => (/^https?:/.test(p) ? p : new URL(p.replace(/^\//, ''), baseUrl).href),
  async settleFast() { await page.waitForLoadState('domcontentloaded').catch(() => {}); await sleep(1300); if (config.onSettled) await config.onSettled(h); },
  async settle() { await page.waitForLoadState('domcontentloaded').catch(() => {}); await page.waitForLoadState('networkidle', { timeout: 3500 }).catch(() => {}); await sleep(900); if (config.onSettled) await config.onSettled(h); },
  async goto(p) { await page.goto(h.url(p), { waitUntil: 'domcontentloaded' }); await h.settle(); },
  /** A visible link whose whole visible text is `text` (menu text often sits in child spans; scope narrows to a container). */
  linkText: (text, scope = '') => page.locator(`${scope} a:visible`.trim()).filter({ hasText: new RegExp('^\\s*' + text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$') }).first(),
  async moveTo(loc) { await loc.scrollIntoViewIfNeeded().catch(() => {}); const b = await loc.boundingBox(); if (!b) throw new Error('target not visible'); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 36 }); await sleep(350); return b; },
  async click(loc, opts = {}) { await h.moveTo(loc); await loc.click({ timeout: 8000, ...opts }); await sleep(700); },
  /** Highlights then clicks, and does not wait for the navigation to finish (use settle() afterwards). */
  async clickHighlighted(loc) { await h.moveTo(loc); await loc.evaluate((e) => e.classList.add('__hl')); await sleep(900); await loc.click({ noWaitAfter: true }); await h.settle(); },
  async type(loc, text) { await h.moveTo(loc); await loc.click(); await loc.pressSequentially(text, { delay: 55 }); await sleep(450); },
  async scroll(px, ms) { const steps = Math.max(1, Math.round(ms / 100)); for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, px / steps); await sleep(100); } },
  async highlight(selector) { return page.evaluate((s) => { document.querySelectorAll('.__hl').forEach((e) => e.classList.remove('__hl')); const el = document.querySelector(s); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('__hl'); } return !!el; }, selector).catch(() => false); },
  /** Sets a <select> by visible option text and refreshes bootstrap-select pickers when present. */
  choose: (id, text) => page.evaluate(({ id, text }) => { const s = document.getElementById(id); const o = s && [...s.options].find((x) => x.text.trim() === text); if (!o) return false; s.value = o.value; const $ = window.jQuery; if ($) { $(s).selectpicker && $(s).selectpicker('refresh'); $(s).trigger('change'); } return true; }, { id, text }),
  shot: (name) => page.screenshot({ path: path.join(shotDir, `${name}.png`) }).catch(() => {}),
  /** Runs an async action that waits on a slow server. If it takes over 6 s the wait is recorded so mux.mjs cuts it out. */
  async slowWait(action) {
    const from = Date.now() - t0; const result = await action(); const to = Date.now() - t0;
    if (to - from > 6000) cuts.push({ from: from + 1500, to: to - 500 });
    return result;
  },
};

async function runScene(scene) {
  if (only.length && !only.includes(scene.id)) return;
  const start = Date.now(); timeline[scene.id] = start - t0;
  await setCaption(scene.caption || '');
  try { await scene.run(h); } catch (e) { note(`SCENE ${scene.id} PROBLEM: ${String(e.message).split('\n')[0]}`); await h.shot(`${scene.id}-problem`); }
  const min = (durations[scene.id] || 4000) + 1200; const spent = Date.now() - start;
  if (spent < min) await sleep(min - spent);
  note(`scene ${scene.id} ${((Date.now() - start) / 1000).toFixed(1)}s (audio ${((durations[scene.id] || 0) / 1000).toFixed(1)}s)`);
}

await page.goto(h.url(config.startPath || ''), { waitUntil: 'domcontentloaded' }); await h.settle();
if (config.setup) await config.setup(h);
note(`mode=${FINAL ? 'final' : 'rehearsal'}`);
for (const scene of config.scenes) await runScene(scene);
await sleep(3500); // keep recording after the last scene so the closing words are never cut off

const total = Date.now() - t0;
await setCaption('');
const video = page.video();
await context.close();
const kind = FINAL && !only.length ? 'final' : only.length ? 'partial' : 'rehearsal'; // partial/rehearsal runs never overwrite the final take
const name = config.name || 'walkthrough';
const dest = path.join(outDir, kind === 'final' ? `${name}-silent.webm` : `${kind}.webm`);
fs.copyFileSync(await video.path(), dest);
fs.writeFileSync(path.join(outDir, kind === 'final' ? 'timeline.json' : `${kind}-timeline.json`), JSON.stringify({ name, total, timeline, cuts, state: h.state, log }, null, 2));
console.log(`DONE ${dest} total ${(total / 1000).toFixed(0)}s`);
