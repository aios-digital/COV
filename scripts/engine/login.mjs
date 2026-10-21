// One-time sign-in helper. Opens a visible Chrome window with a dedicated profile (<project>\profile) so the OWNER signs in by hand.
// No credentials pass through this script. The session cookie stays in the profile folder (keep it out of git).
// Usage: node login.mjs --config=<walkthrough.config.mjs> [--out=<project folder>]
import { parseArgs, loadConfig, loadPlaywright, browserOptions } from './env.mjs';

const args = parseArgs(process.argv);
const { config, dirs } = await loadConfig(args);
const { chromium } = await loadPlaywright();
const context = await chromium.launchPersistentContext(dirs.profile, { ...browserOptions(), headless: false, viewport: config.viewport || { width: 1280, height: 720 } });
const page = context.pages()[0] || await context.newPage();
await page.goto(new URL(config.loginPath || '', config.baseUrl.endsWith('/') ? config.baseUrl : config.baseUrl + '/').href);
console.log('WAITING_FOR_SIGN_IN: please sign in in the opened window (15 minutes).');
const signedIn = config.signedIn || ((url) => !/login|signin|authentication/i.test(url));
const deadline = Date.now() + 15 * 60 * 1000;
let ok = false;
while (Date.now() < deadline) {
  if (signedIn(page.url())) { ok = true; break; }
  await page.waitForTimeout(1500).catch(() => {});
}
if (ok) await page.waitForTimeout(2500);
console.log(ok ? 'SIGNED_IN (session saved in the profile folder)' : 'SIGN_IN_TIMEOUT');
await context.close();
