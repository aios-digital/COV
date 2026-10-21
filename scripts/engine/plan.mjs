// Recording plan: generate it from the scan + the scenes, show it to the user, and record their approval.
//   node plan.mjs draft   --config=<cfg>   writes <project>/plan.md (Status: DRAFT)
//   node plan.mjs status  --config=<cfg>   says whether the current scenes are approved
//   node plan.mjs approve --config=<cfg> [--by="Name"]   run ONLY after the user has read plan.md and explicitly said yes
// record.mjs refuses to run without a matching approval (override for experts: --skip-plan-check).
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, loadConfig, resolveVoice } from './env.mjs';
import { fingerprint, checkPlan, approvalFile, planFile, estimateSeconds } from './planlib.mjs';

const args = parseArgs(process.argv);
const cmd = args._[0] || 'status';
const { config, dirs } = await loadConfig(args);
const { voice, lengthScale } = resolveVoice(config, dirs);

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
function readScan() { try { return JSON.parse(fs.readFileSync(path.join(dirs.scan, 'scan.json'), 'utf8')); } catch { return null; } }

function draft() {
  const scan = readScan();
  const p = config.plan || {};
  const scenes = config.scenes;
  const clips = [...scenes, ...(config.extras || [])];
  const total = clips.reduce((n, c) => n + estimateSeconds(c.text, lengthScale), 0);
  const covered = new Set(scenes.flatMap((s) => s.covers || []));
  const writes = scenes.filter((s) => s.writes && s.writes.length);
  const missingDoes = scenes.filter((s) => !s.does).map((s) => s.id);

  const L = [];
  L.push(`# Recording plan: ${config.name || 'walkthrough'}`, '', '**Status:** DRAFT (waiting for your approval)', '');
  L.push('## 1. Goal and audience', '', `- **Audience:** ${p.audience || '(describe who will watch: new customer, new agent, manager...)'}`, `- **Goal:** ${p.goal || '(what should the viewer be able to do afterwards?)'}`, `- **Story:** ${p.story || '(the one realistic record or task the video follows from start to finish)'}`, '');
  L.push('## 2. Environment', '', `- **Target:** ${config.baseUrl} (start page: \`${config.startPath || '/'}\`)`, '- **Must be a demo or test environment with no real customer data.** Please confirm.', '- You sign in yourself in the browser window the skill opens. Passwords are never typed or stored by the skill.', '');
  if (scan) {
    L.push('## 3. What the scan found', '', `Scanned ${scan.pages.length} page(s) of \`${scan.scope.join(', ')}\` (read-only: pages were opened, nothing was clicked or submitted).`, '');
    L.push('| Page | Title | Covered by a scene |', '| --- | --- | --- |');
    for (const pg of scan.pages) L.push(`| \`${cell(pg.path)}\` | ${cell(pg.title)} | ${covered.has(pg.path) ? 'yes' : 'not in this video'} |`);
    L.push('');
  } else L.push('## 3. What the scan found', '', '_No scan yet. Run `scan.mjs` so the plan is based on the real module._', '');
  L.push('## 4. Scene by scene', '', '| # | Scene | What happens on screen | What the voice says | Seconds |', '| --- | --- | --- | --- | --- |');
  scenes.forEach((s, i) => L.push(`| ${i + 1} | ${cell(s.caption || s.id)} | ${cell(s.does || '(not described: add a does field to the scene)')} | ${cell(s.text)} | ~${estimateSeconds(s.text, lengthScale)} |`));
  if ((config.extras || []).length) L.push('', `Extra narration inside long scenes: ${config.extras.length} clip(s).`);
  L.push('', `**Estimated length:** about ${Math.floor(total / 60)} min ${total % 60} s of narration (the final video is a little longer).`, '');
  L.push('## 5. Data the recording will create or change', '');
  if (writes.length) writes.forEach((s) => L.push(`- **${s.caption || s.id}:** ${s.writes.join('; ')}`));
  else L.push('- Nothing. The scenes only look around.');
  L.push('', 'A rehearsal never saves anything. Only the final take (`--final`) writes the records above. Test records are closed or archived, never deleted.', '');
  L.push('## 6. Safety checks', '', '- [ ] The target is a demo/test environment and the data on screen is not real.', '- [ ] No scene sends an email, SMS or message to a real person (internal notes only, `example.invalid` addresses).', '- [ ] Nothing in the plan deletes data permanently.', '- [ ] You will sign in yourself when asked.', '');
  L.push('## 7. Voice and outputs', '', `- **Voice:** \`${voice}\` at speed factor ${lengthScale} (change it with the voice picker: \`node scripts/engine/voices.mjs\`).`, '- **Outputs** (in the project folder, outside git): captioned MP4 (English subtitles burned in), clean MP4, `.srt` and `.vtt`, step screenshots, and a short report.', '');
  L.push('## 8. Approval', '', 'Reply **approve** to start (rehearsal first, then the real take), or tell me what to change. If the scenes change later, this plan must be approved again.', '');
  if (missingDoes.length) L.push(`<!-- scenes without a does description: ${missingDoes.join(', ')} -->`);
  fs.writeFileSync(planFile(dirs), L.join('\n'));
  fs.rmSync(approvalFile(dirs), { force: true });
  console.log(`PLAN_WRITTEN ${planFile(dirs)} (${scenes.length} scenes, ~${total}s of narration)`);
  if (missingDoes.length) console.log(`WARNING scenes without a "does" description: ${missingDoes.join(', ')}`);
}

if (cmd === 'draft') draft();
else if (cmd === 'approve') {
  if (!fs.existsSync(planFile(dirs))) throw new Error('Write the plan first: plan.mjs draft');
  const fp = fingerprint(config);
  fs.writeFileSync(approvalFile(dirs), JSON.stringify({ approvedAt: new Date().toISOString(), approvedBy: args.by || 'user', fingerprint: fp }, null, 2));
  const md = fs.readFileSync(planFile(dirs), 'utf8').replace(/\*\*Status:\*\*[^\n]*/, `**Status:** APPROVED by ${args.by || 'the user'} on ${new Date().toISOString().slice(0, 10)}`);
  fs.writeFileSync(planFile(dirs), md);
  console.log('PLAN_APPROVED');
} else if (cmd === 'status') {
  const r = checkPlan(config, dirs);
  console.log(r.ok ? `APPROVED (${r.reason})` : `NOT_APPROVED: ${r.reason}`);
  process.exitCode = r.ok ? 0 : 2;
} else throw new Error('Usage: plan.mjs draft|approve|status --config=<cfg>');
