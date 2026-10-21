// Starter walkthrough config for a NEW module or web app. Copy to <project folder>/walkthrough.config.mjs and adapt.
// Flow: scan the module (scan.mjs) -> write the scenes below -> plan.mjs draft -> the user approves -> prepare -> rehearse -> final take.
// A walkthrough is a list of scenes. Each scene has:
//   id       sorts the video, for example '03-settings'
//   caption  short step title shown as a badge (2 to 6 words)
//   text     what the narrator says: friendly, second person, short sentences (see references/narration-style.md)
//   does     one plain sentence describing what happens on screen (shown in the recording plan the user approves)
//   covers   optional: paths from the scan that this scene shows (the plan marks them as covered)
//   writes   optional: what this scene creates or changes in the final take (listed in the plan; rehearsal never writes)
//   run(h)   what the browser does while the voice speaks. `h` is the engine toolkit, see references/adapting-to-other-software.md.
// Rehearsal (default) must not change data: gate every save/submit/delete on `h.final`.

// --- App-specific navigation helper: adapt the selectors after looking at the real page (the scan lists real ids and links).
const SIDEBAR = 'nav'; // the container that holds the menu, so a link of the same name elsewhere on the page cannot match
const menu = (h, hrefEnd) => h.page.locator(`${SIDEBAR} a[href$="${hrefEnd}"]:visible`).first();
async function openModule(h) { await h.clickHighlighted(menu(h, '/my-module')); }

export default {
  name: 'my-module-onboarding',               // file name prefix for the outputs
  baseUrl: process.env.DEMO_BASE_URL || 'https://demo.example.com/', // a DEMO/TEST environment only, never real customer data
  startPath: 'my-module',                     // first page opened (relative to baseUrl)
  loginPath: 'login',                         // used by login.mjs
  signedIn: (url) => !/login|signin|authentication/.test(url), // how login.mjs knows you finished signing in
  viewport: { width: 1920, height: 1080 },    // wide, so the app shows all its options (16:9 like a video)
  plan: { audience: 'who will watch', goal: 'what they can do afterwards', story: 'the one realistic task the video follows' },
  // The narrator voice and speed come from the voice picker (node scripts/engine/voices.mjs). To force one: voice: 'en_US-ryan-high', lengthScale: 1.08, gapMs: 450.
  // onSettled: async (h) => { /* optional: runs after every page settles, for example keep a menu group expanded */ },
  // setup: async (h) => { /* optional: runs once after the first page loads, for example read the signed-in user into h.state */ },

  scenes: [
    { id: '01-intro', caption: 'Welcome to <Module name>', does: 'Shows the start page.',
      text: 'Hi, and welcome to <Module name>. In this short video I will show you what it is for, and how your team uses it day to day.',
      run: async (h) => { await h.sleep(1500); } },
    { id: '02-open', caption: '<Module name>: your home base', does: 'Opens the module from the menu and scrolls the home page.', covers: ['/my-module'],
      text: 'We open <Module name> from the main menu. This is the page your team will come back to every day.',
      run: async (h) => { await openModule(h); await h.sleep(1500); await h.scroll(800, 6000); await h.shot('home'); } },
    // ... one scene per task a new user must learn, in the order they would do it. A write step looks like:
    // { id: '05-create', caption: 'Creating a record', does: 'Fills the form and saves it (final take only).', writes: ['creates 1 demo record'],
    //   text: '...', run: async (h) => {
    //     await h.type(h.page.locator('#name'), 'Onboarding demo record');      // clearly labelled demo data
    //     if (!h.final) { h.note('rehearsal: form filled, not submitted'); return; }
    //     await h.click(h.page.getByRole('button', { name: 'Save' }));
    //     await h.slowWait(() => h.page.waitForURL(/records\/\d+/, { timeout: 120000, waitUntil: 'commit' })); // cuts slow server waits
    //     h.state.recordId = Number(h.page.url().match(/records\/(\d+)/)[1]);
    // } },
    { id: '99-outro', caption: 'That is the whole journey', does: 'Returns to the home page for the closing words.',
      text: 'And that is the whole journey. Thanks for watching, and welcome to <Module name>.',
      run: async (h) => { await h.sleep(800); } },
  ],

  // Extra clips placed inside long scenes (anchor = scene id, offset = ms after that scene starts) to avoid silent stretches over about 6 s.
  extras: [
    // { id: '05b-create', anchor: '05-create', offset: 15000, text: 'Mention a useful detail while the form is being filled.' },
  ],
};
