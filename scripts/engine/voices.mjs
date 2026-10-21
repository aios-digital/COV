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
import { parseArgs, toolsDir, IS_WIN, resolveVoice, DEFAULT_VOICE } from './env.mjs';
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

const catalog = await loadCatalog();
const voices = Object.entries(catalog).map(([k, v]) => describeVoice(k, v)).sort((a, b) => a.language.localeCompare(b.language) || a.name.localeCompare(b.name) || a.quality.localeCompare(b.quality));
const cacheDir = path.join(toolsDir(), 'voice-samples'); fs.mkdirSync(cacheDir, { recursive: true });
let lastHit = Date.now();

const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((resolve, reject) => { let b = ''; req.on('data', (c) => { b += c; if (b.length > 20000) { reject(new Error('too large')); req.destroy(); } }); req.on('end', () => resolve(b)); });

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
      const b = JSON.parse(await readBody(req)); const v = voices.find((x) => x.key === b.key); if (!v) return json(res, 404, { error: 'unknown voice' });
      const text = String(b.text || sampleText).slice(0, 600); const ls = Math.min(1.6, Math.max(0.8, Number(b.lengthScale) || 1.08));
      await ensureVoice(v.key);
      const out = path.join(os.tmpdir(), `cotts-preview-${process.pid}.wav`); synth(text, v.key, out, ls);
      res.writeHead(200, { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' }); return res.end(fs.readFileSync(out));
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

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Choose the narrator voice</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--ink:#14202e;--mute:#5b6878;--line:#dde2e9;--brand:#2563eb;--ok:#15803d;--chip:#eef2f7}
@media(prefers-color-scheme:dark){:root{--bg:#0e141b;--card:#161e28;--ink:#e8edf3;--mute:#9aa7b6;--line:#26323f;--brand:#6ea0ff;--ok:#4ade80;--chip:#1f2a36}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,Segoe UI,Arial,sans-serif}
header{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--line);padding:14px 16px}
.wrap{max-width:1100px;margin:0 auto;padding:0 16px}h1{margin:0 0 4px;font-size:20px}p{margin:0;color:var(--mute)}
.bar{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px;align-items:center}
select,input[type=search],textarea{background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:8px 10px;font:inherit}
textarea{width:100%;min-height:64px;margin-top:6px}label{font-size:13px;color:var(--mute)}
.chosen{margin:14px 0;padding:10px 14px;border:1px solid var(--line);border-left:4px solid var(--ok);background:var(--card);border-radius:8px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:12px;padding-bottom:90px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:8px}
.card.sel{border-color:var(--ok);box-shadow:0 0 0 2px var(--ok) inset}.card h3{margin:0;font-size:16px;text-transform:capitalize}
.meta{display:flex;flex-wrap:wrap;gap:6px}.chip{background:var(--chip);border-radius:999px;padding:2px 9px;font-size:12px;color:var(--mute)}
.row{display:flex;gap:8px;flex-wrap:wrap}button{font:inherit;border-radius:8px;padding:7px 12px;border:1px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer}
button.primary{background:var(--brand);color:#fff;border-color:var(--brand)}button:disabled{opacity:.55;cursor:wait}button:focus-visible,select:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid var(--brand);outline-offset:2px}
.status{font-size:12.5px;color:var(--mute);min-height:18px}.foot{position:fixed;left:0;right:0;bottom:0;background:var(--card);border-top:1px solid var(--line);padding:10px 16px}
.foot .wrap{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.spacer{flex:1}input[type=range]{width:170px}
</style></head><body>
<header><div class="wrap"><h1>Choose the narrator voice</h1><p>Listen to the voices, test one with your own script, then press <b>Use this voice</b>. Voices run offline on your computer.</p>
<div class="bar"><label>Language <select id="lang"></select></label><label>Quality <select id="q"><option value="">any</option><option>high</option><option>medium</option><option>low</option><option>x_low</option></select></label>
<input id="find" type="search" placeholder="Search by name" aria-label="Search by name"><span class="status" id="count"></span></div></div></header>
<main class="wrap"><div class="chosen" id="chosen"></div>
<label for="text">Text to read for "Try with my script" (the first lines of your narration by default)</label><textarea id="text" maxlength="600"></textarea>
<div class="grid" id="grid" role="list"></div></main>
<div class="foot"><div class="wrap"><label>Speed <input type="range" id="speed" min="0.9" max="1.4" step="0.02" value="1.08"> <span id="speedv">1.08</span> <span class="status">(higher is slower and calmer)</span></label>
<label>Pause between sentences <input type="range" id="gap" min="200" max="1000" step="50" value="450"> <span id="gapv">450</span> ms</label><span class="spacer"></span><span class="status" id="msg" role="status"></span><button id="finish">Finish and close</button></div></div>
<script>
const $=s=>document.querySelector(s);let S,cur={};const audio=new Audio();
const msg=t=>{$('#msg').textContent=t};
async function api(p,body){const r=await fetch(p,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:undefined);if(!r.ok){let e=r.statusText;try{e=(await r.json()).error}catch{}throw new Error(e)}return r}
function play(src,btn,label){audio.pause();audio.src=src;btn.disabled=true;return audio.play().catch(e=>msg('Could not play: '+e.message)).finally(()=>{btn.disabled=false;btn.textContent=label})}
function draw(){const L=$('#lang').value,Q=$('#q').value,F=$('#find').value.toLowerCase();const list=S.voices.filter(v=>(!L||v.language===L)&&(!Q||v.quality===Q)&&(!F||v.name.includes(F)||v.key.includes(F)));
$('#count').textContent=list.length+' voices';const g=$('#grid');g.innerHTML='';
for(const v of list){const c=document.createElement('div');c.className='card'+(v.key===cur.voice?' sel':'');c.setAttribute('role','listitem');
c.innerHTML='<h3></h3><div class="meta"></div><div class="row"></div><div class="status"></div>';c.querySelector('h3').textContent=v.name.replace(/_/g,' ');
const m=c.querySelector('.meta');for(const t of [v.languageName+' ('+v.country+')',v.quality,v.speakers>1?v.speakers+' speakers':'1 speaker',v.sizeMb+' MB',v.installed?'installed':'downloads on first use']){const s=document.createElement('span');s.className='chip';s.textContent=t;m.appendChild(s)}
const row=c.querySelector('.row'),st=c.querySelector('.status');
const b1=document.createElement('button');b1.textContent='Listen to sample';b1.onclick=()=>{b1.textContent='Loading...';play('/api/sample?key='+encodeURIComponent(v.key),b1,'Listen to sample')};
const b2=document.createElement('button');b2.textContent='Try with my script';b2.onclick=async()=>{b2.disabled=true;st.textContent=v.installed?'Generating...':'Downloading the voice ('+v.sizeMb+' MB), one time...';
try{const r=await api('/api/preview',{key:v.key,text:$('#text').value,lengthScale:$('#speed').value});const u=URL.createObjectURL(await r.blob());v.installed=true;st.textContent='';await play(u,b2,'Try with my script')}catch(e){st.textContent='Could not preview: '+e.message}b2.disabled=false};
const b3=document.createElement('button');b3.className='primary';b3.textContent='Use this voice';b3.onclick=async()=>{b3.disabled=true;st.textContent=v.installed?'Saving...':'Downloading the voice ('+v.sizeMb+' MB), one time...';
try{const r=await (await api('/api/choose',{key:v.key,lengthScale:$('#speed').value,gapMs:$('#gap').value})).json();cur=r.choice;v.installed=true;msg('Saved: '+v.key);chosen();draw()}catch(e){st.textContent='Could not save: '+e.message;b3.disabled=false}};
row.append(b1,b2,b3);g.appendChild(c)}}
function chosen(){$('#chosen').innerHTML='';const t=document.createElement('div');t.innerHTML='<b>Current narrator:</b> <span></span> &middot; speed <span></span> &middot; saved in <code></code>';const sp=t.querySelectorAll('span'),cd=t.querySelector('code');sp[0].textContent=cur.voice||'(none yet)';sp[1].textContent=cur.lengthScale||1.08;cd.textContent=S.saveTarget;$('#chosen').appendChild(t)}
async function init(){S=await (await api('/api/state')).json();cur=S.current||{};$('#text').value=S.sampleText;$('#speed').value=cur.lengthScale||1.08;$('#gap').value=cur.gapMs||450;
$('#speedv').textContent=$('#speed').value;$('#gapv').textContent=$('#gap').value;
const langs=[...new Map(S.voices.map(v=>[v.language,v.languageName+' ('+v.country+')'])).entries()];const sel=$('#lang');sel.innerHTML='<option value="">all languages</option>'+langs.map(([k,n])=>'<option value="'+k+'">'+n+'</option>').join('');sel.value=cur.voice?cur.voice.split('-')[0]:'en_US';if(sel.value!==(cur.voice||'en_US-').split('-')[0])sel.value='en_US';
if(!S.piperReady)msg('Piper is not installed yet: run  node scripts/setup.mjs  to enable "Try with my script". Samples still work.');
chosen();draw()}
$('#lang').onchange=$('#q').onchange=draw;$('#find').oninput=draw;$('#speed').oninput=e=>{$('#speedv').textContent=e.target.value};$('#gap').oninput=e=>{$('#gapv').textContent=e.target.value};
$('#finish').onclick=async()=>{await api('/api/finish',{});document.body.innerHTML='<div class="wrap"><h1>Done</h1><p>You can close this tab and go back to your assistant.</p></div>'};
init().catch(e=>{document.body.textContent='Could not load voices: '+e.message});
</script></body></html>`;
