// Read-only scan of the module you are about to record. It opens pages (GET only) and writes down what is there:
// menu entries, headings, tabs, buttons, form fields and tables, with a screenshot of each page. Nothing is clicked or submitted.
// The result (scan/scan.json + scan/scan.md) is what you use to write the scenes and the recording plan.
//   node scan.mjs --config=<cfg> [--scope=/admin/mymodule,/admin/related] [--max=25] [--headed] [--no-shots]
// Scope defaults to the path of config.startPath. Links outside the scope are listed as "related" but not opened.
// Sign in first with login.mjs when the module needs it; the scan reuses that profile.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, loadConfig, loadPlaywright, browserOptions } from './env.mjs';

const args = parseArgs(process.argv);
const { config, dirs } = await loadConfig(args);
const { chromium } = await loadPlaywright();
const base = new URL(config.baseUrl.endsWith('/') ? config.baseUrl : config.baseUrl + '/');
const start = new URL((config.startPath || '').replace(/^\//, ''), base);
const scope = String(args.scope || start.pathname.replace(/\/$/, '')).split(',').map((s) => s.trim()).filter(Boolean);
const max = Number(args.max) || 25;
const SKIP = /(log-?out|sign-?out|delete|remove|destroy|disable|deactivate|unsubscribe|export|download|print|\.(pdf|zip|csv|xlsx?|docx?|png|jpe?g|gif|svg|mp4)(\?|$))/i;
const inScope = (u) => u.origin === base.origin && scope.some((s) => u.pathname === s || u.pathname.startsWith(s.endsWith('/') ? s : s + '/'));
const norm = (u) => { const x = new URL(u); x.hash = ''; return x.href; };
const shotDir = path.join(dirs.scan, 'screens'); fs.mkdirSync(shotDir, { recursive: true });

const context = await chromium.launchPersistentContext(dirs.profile, { ...browserOptions(), headless: !args.headed, viewport: config.viewport || { width: 1920, height: 1080 } });
const page = context.pages()[0] || await context.newPage();

// Runs inside the page: collects what a person would see and use. Reads only.
const harvest = () => {
  const text = (e) => (e.innerText || e.value || e.getAttribute('aria-label') || e.title || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
  const uniq = (a) => [...new Set(a.filter(Boolean))];
  const links = [...document.querySelectorAll('a[href]')].filter(vis).map((a) => ({ href: a.href, text: text(a), nav: !!a.closest('nav, aside, [role=navigation], .sidebar, #side-menu, .menu') }));
  const labelFor = (f) => (f.id && document.querySelector(`label[for="${CSS.escape(f.id)}"]`)?.innerText?.trim()) || f.closest('label')?.innerText?.trim() || f.placeholder || f.getAttribute('aria-label') || '';
  return {
    title: document.title.trim(), url: location.href,
    headings: uniq([...document.querySelectorAll('h1, h2, h3')].filter(vis).map(text)).slice(0, 20),
    links,
    tabs: uniq([...document.querySelectorAll('[role=tab], .nav-tabs a, .tabs a')].filter(vis).map(text)),
    buttons: uniq([...document.querySelectorAll('button, input[type=submit], input[type=button], a.btn, [role=button]')].filter(vis).map(text)).slice(0, 40),
    forms: [...document.querySelectorAll('form')].filter(vis).map((f) => ({
      action: f.getAttribute('action') || '', method: (f.method || 'get').toLowerCase(),
      fields: [...f.querySelectorAll('input:not([type=hidden]), select, textarea')].filter(vis).map((x) => ({ tag: x.tagName.toLowerCase(), type: x.type || '', id: x.id || '', name: x.name || '', label: labelFor(x).slice(0, 60), required: !!x.required })).slice(0, 40),
    })).slice(0, 8),
    tables: [...document.querySelectorAll('table')].filter(vis).map((t) => ({ headers: [...t.querySelectorAll('thead th, tr:first-child th')].map(text).filter(Boolean).slice(0, 20), rows: t.querySelectorAll('tbody tr').length })).slice(0, 6),
  };
};

const seen = new Set(); const queue = [norm(start.href)]; const pages = []; const related = new Map();
while (queue.length && pages.length < max) {
  const url = queue.shift();
  if (seen.has(url)) continue; seen.add(url);
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(600);
    if (res && res.status() >= 400) { console.log(`skip ${url} (HTTP ${res.status()})`); continue; }
    const data = await page.evaluate(harvest);
    const u = new URL(data.url);
    if (/login|signin|authentication/i.test(u.pathname) && !/login|signin|authentication/i.test(start.pathname)) { console.log('NOT_SIGNED_IN: run login.mjs first, then scan again.'); break; }
    const shot = args['no-shots'] ? null : path.join('screens', `${String(pages.length + 1).padStart(2, '0')}-${(u.pathname.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home').slice(0, 50)}.png`);
    if (shot) await page.screenshot({ path: path.join(dirs.scan, shot) }).catch(() => {});
    const menu = []; const content = [];
    for (const l of data.links) {
      let t; try { t = new URL(l.href); } catch { continue; }
      if (!/^https?:$/.test(t.protocol) || SKIP.test(t.pathname + t.search) || t.origin !== base.origin) continue;
      if (inScope(t)) { content.push({ href: norm(t.href), path: t.pathname, text: l.text, nav: l.nav }); if (!seen.has(norm(t.href))) queue.push(norm(t.href)); }
      else if (l.nav && l.text) related.set(t.pathname, l.text);
      if (l.nav && l.text) menu.push(l.text);
    }
    pages.push({ url: data.url, path: u.pathname + (u.search || ''), title: data.title, headings: data.headings, menu: [...new Set(menu)].slice(0, 40), tabs: data.tabs, buttons: data.buttons, forms: data.forms, tables: data.tables, links: content.filter((c) => !c.nav).slice(0, 30), screenshot: shot });
    console.log(`scanned ${pages.length}/${max}: ${u.pathname} - ${data.title}`);
  } catch (e) { console.log(`skip ${url}: ${String(e.message).split('\n')[0]}`); }
  await page.waitForTimeout(500); // be gentle with the server
}
await context.close();

const out = { scannedAt: new Date().toISOString(), base: base.href, scope, truncated: queue.some((q) => !seen.has(q)), pages, related: [...related].map(([p, text]) => ({ path: p, text })) };
fs.writeFileSync(path.join(dirs.scan, 'scan.json'), JSON.stringify(out, null, 2));

const md = [`# Module scan: ${config.name || base.hostname}`, '', `Scanned ${pages.length} page(s) under \`${scope.join(', ')}\` on ${base.origin} at ${out.scannedAt}. Read-only: nothing was clicked or submitted.${out.truncated ? ` More pages exist: raise --max (now ${max}).` : ''}`, ''];
for (const p of pages) {
  md.push(`## ${p.title || p.path}`, `\`${p.path}\``, '');
  if (p.headings.length) md.push(`- **Headings:** ${p.headings.join(' | ')}`);
  if (p.tabs.length) md.push(`- **Tabs:** ${p.tabs.join(' | ')}`);
  if (p.buttons.length) md.push(`- **Buttons:** ${p.buttons.join(' | ')}`);
  p.forms.forEach((f) => md.push(`- **Form** (${f.method.toUpperCase()} ${f.action || 'same page'}): ${f.fields.map((x) => x.label || x.name || x.id).filter(Boolean).join(', ')}`));
  p.tables.forEach((t) => md.push(`- **Table** (${t.rows} rows): ${t.headers.join(' | ')}`));
  if (p.screenshot) md.push(`- **Screenshot:** ${p.screenshot}`);
  md.push('');
}
if (out.related.length) md.push('## Related menu entries outside the scope (not opened)', '', ...out.related.map((r) => `- ${r.text} (\`${r.path}\`)`), '');
fs.writeFileSync(path.join(dirs.scan, 'scan.md'), md.join('\n'));
console.log(`SCAN_DONE ${pages.length} pages -> ${path.join(dirs.scan, 'scan.md')}`);
