// Offline tests for the plan gate. Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fingerprint, checkPlan, approvalFile, planFile, estimateSeconds } from '../scripts/engine/planlib.mjs';

const cfg = () => ({ baseUrl: 'https://demo.example.com/', startPath: 'x', scenes: [{ id: '01', caption: 'Hi', text: 'Hello there.', run: async () => { /* look */ } }], extras: [] });
const tmp = () => ({ root: fs.mkdtempSync(path.join(os.tmpdir(), 'cotts-')) });

test('no plan file means not approved', () => {
  assert.equal(checkPlan(cfg(), tmp()).ok, false);
});

test('a plan without approval is refused', () => {
  const d = tmp(); fs.writeFileSync(planFile(d), '# plan');
  const r = checkPlan(cfg(), d);
  assert.equal(r.ok, false); assert.match(r.reason, /not been approved/);
});

test('matching approval passes, and any scene change voids it', () => {
  const d = tmp(); const c = cfg();
  fs.writeFileSync(planFile(d), '# plan');
  fs.writeFileSync(approvalFile(d), JSON.stringify({ approvedAt: 'now', fingerprint: fingerprint(c) }));
  assert.equal(checkPlan(c, d).ok, true);
  const text = cfg(); text.scenes[0].text = 'Hello again.';
  const steps = cfg(); steps.scenes[0].run = async () => { await 1; };
  const target = cfg(); target.baseUrl = 'https://prod.example.com/';
  const extra = cfg(); extra.extras = [{ id: 'e', anchor: '01', offset: 1, text: 'More.' }];
  for (const changed of [text, steps, target, extra]) assert.equal(checkPlan(changed, d).ok, false);
});

test('estimateSeconds grows with text length and slows with the speed factor', () => {
  assert.ok(estimateSeconds('word '.repeat(52)) > estimateSeconds('word '.repeat(13)));
  assert.ok(estimateSeconds('word '.repeat(52), 1.3) > estimateSeconds('word '.repeat(52), 1.08));
});
