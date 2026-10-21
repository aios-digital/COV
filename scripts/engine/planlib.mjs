// Recording-plan helpers: a fingerprint of everything the video will do, and the approval gate used by record.mjs.
// The plan (plan.md) must be approved by the person who owns the video before anything is recorded. Approval is stored in
// plan.approval.json together with a fingerprint of the scenes; changing a scene (text, caption, steps, extras, target) voids it.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** Fingerprint of the video: target, narration, captions, extras and the source of every scene's browser steps. */
export function fingerprint(config) {
  const payload = {
    baseUrl: config.baseUrl, startPath: config.startPath || '',
    scenes: config.scenes.map((s) => ({ id: s.id, caption: s.caption || '', text: s.text, run: String(s.run) })),
    extras: (config.extras || []).map((e) => ({ id: e.id, anchor: e.anchor, offset: e.offset, text: e.text })),
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export const approvalFile = (dirs) => path.join(dirs.root, 'plan.approval.json');
export const planFile = (dirs) => path.join(dirs.root, 'plan.md');

export function readApproval(dirs) {
  try { return JSON.parse(fs.readFileSync(approvalFile(dirs), 'utf8')); } catch { return null; }
}

/** Returns { ok, reason }. ok is true only when plan.md exists and the approval matches the current scenes. */
export function checkPlan(config, dirs) {
  if (!fs.existsSync(planFile(dirs))) return { ok: false, reason: 'No plan.md yet. Run scan.mjs, write the scenes, then plan.mjs draft, and get the plan approved.' };
  const approval = readApproval(dirs);
  if (!approval) return { ok: false, reason: 'The recording plan has not been approved. Show plan.md to the user and run plan.mjs approve only after they say yes.' };
  if (approval.fingerprint !== fingerprint(config)) return { ok: false, reason: 'The scenes changed after the plan was approved. Update plan.md, show it to the user again and re-approve.' };
  return { ok: true, reason: `plan approved ${approval.approvedAt}` };
}

/** Rough speaking time: about 2.6 words per second at lengthScale 1.08. */
export const estimateSeconds = (text, lengthScale = 1.08) => Math.round((text.trim().split(/\s+/).length / 2.6) * (lengthScale / 1.08) + 0.5);
