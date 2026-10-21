// Worked example: a full onboarding walkthrough of a support/ticketing module in a Perfex CRM style admin (left sidebar with module groups,
// bootstrap-select dropdowns, TinyMCE editor). It is a REFERENCE for how scenes, helpers, slow pages and rehearsal-safe writes are written;
// the selectors are specific to that kind of app, so adapt them to yours (see ../references/adapting-to-other-software.md).
// Set DEMO_BASE_URL to your demo/test site, for example: DEMO_BASE_URL=https://demo.example.com/admin/
// Demo-only: the --final take creates ONE "Onboarding demo" ticket, works it and closes it (internal note, no customer reply/email).

const MENU = {
  dashboard: '#side-menu a[href$="/admin/aios_support"]',
  tickets: '#side-menu a[href$="/admin/tickets"]',
  settings: '#side-menu a[href$="/admin/aios_support/settings"]',
};
const menuLink = (h, key) => h.page.locator(MENU[key] + ':visible').first();

// Keep Main Menu > Operations expanded so the viewer always sees where they are. The menu re-expands itself a moment after each page
// load, so wait for it to settle before clicking (clicking a group that is about to open would collapse it).
async function showOperations(h) {
  const rail = h.page.locator('#mmm-icon-main_menu');
  const open = async () => { await h.sleep(900); return menuLink(h, 'dashboard').isVisible().catch(() => false); };
  if (await open()) return;
  if ((await rail.count()) && !(await rail.evaluate((e) => e.classList.contains('active')).catch(() => false))) { await h.click(rail); if (await open()) return; }
  for (let i = 0; i < 2; i++) { await h.click(h.linkText('Operations', '#side-menu')); if (await open()) return; }
}
async function nav(h, key) {
  await showOperations(h);
  await h.clickHighlighted(menuLink(h, key));
  await showOperations(h);
  await menuLink(h, key).evaluate((e) => e.classList.add('__hl')).catch(() => {});
}
const tab = async (h, name) => { await h.click(h.linkText(name)); await h.settle(); };
const onTicket = async (h) => {
  const id = h.state.ticketId;
  if (!h.page.url().includes(`/ticket/${id}`)) await h.goto(`tickets/ticket/${id}`);
  await showOperations(h);
};

export default {
  name: 'support-onboarding',
  baseUrl: process.env.DEMO_BASE_URL || 'https://demo.example.com/admin/',
  startPath: 'aios_support',
  loginPath: 'authentication',
  signedIn: (url) => /\/admin\//.test(url) && !/authentication/.test(url),
  viewport: { width: 1920, height: 1080 },
  // Narrator voice and speed come from the voice picker (voices.mjs). Set voice/lengthScale/gapMs here only to force them.
  plan: { audience: 'New support agents and their managers', goal: 'Log, work, time and close a ticket, and read the agent activity report', story: 'One customer request from first contact to closed ticket' },
  onSettled: async (h) => { if (await h.page.locator('#side-menu').count()) await showOperations(h); },
  setup: async (h) => { h.state.ticketId = Number(h.args.ticket) || (h.final ? null : 14); },

  scenes: [
    { id: '01-intro', does: 'Highlights the module group in the main menu.', caption: 'Welcome to Support Operations',
      text: 'Hi, and welcome to Support Operations. I am going to walk you through a real support request, from the moment it comes in, to the moment it is closed. Along the way, you will see how your team tracks time, keeps an eye on deadlines, and stays on top of their workload. Everything starts here, in the Operations group of the main menu.',
      run: async (h) => { await showOperations(h); await menuLink(h, 'dashboard').evaluate((e) => e.classList.add('__hl')); await h.sleep(1500); } },
    { id: '02-dashboard', does: 'Opens the module home page and scrolls through the command center and the queue.', covers: ['/admin/aios_support'], caption: 'Support Operations: your home base',
      text: 'Let us open Support Operations. This is your home base. At the top, the command center shows what needs attention: open tickets, anything overdue, and escalations. Below that is the queue, where every open ticket is listed with its customer, its stage, its deadlines, and who is looking after it. Take a moment to look around. You will be back here a lot.',
      run: async (h) => { await nav(h, 'dashboard'); await h.sleep(1500); await h.scroll(900, 8000); await h.shot('dashboard-queue'); await h.page.evaluate(() => window.scrollTo(0, 0)); } },
    { id: '03-settings', does: 'Opens settings from the menu and highlights the one-timer option.', covers: ['/admin/aios_support/settings'], caption: 'Support settings: General',
      text: 'Before we start, a quick look at how Support is set up. Support settings lives in the same Operations menu. On the General tab, you decide whether agents use the work timer, and whether they run one ticket timer at a time. With that switched on, when an agent starts a new ticket, the timer on the previous one stops by itself.',
      run: async (h) => { await nav(h, 'settings'); await h.highlight('#aios_support_timer_single'); await h.shot('settings-general'); } },
    { id: '04-sla', does: 'Opens the SLA policies tab and scrolls the policy list.', caption: 'SLA policies',
      text: 'Next, S L A policies. This is where you decide how fast you promise to respond. For each priority, you set a first response time, a follow up time, and a resolution time. And do not worry about changing them later. Tickets that are already open keep the targets they started with.',
      run: async (h) => { await tab(h, 'SLA policies'); await h.sleep(1200); await h.scroll(500, 6000); await h.shot('settings-sla'); } },
    { id: '05-routing', does: 'Opens the assignment and routing tab.', caption: 'Assignment and routing',
      text: 'Then, assignment and routing. These rules decide who gets a new ticket, based on skills, availability, and how busy each person already is. That way, the work is shared fairly.',
      run: async (h) => { await tab(h, 'Assignment and routing'); await h.sleep(1200); await h.scroll(500, 4000); await h.shot('settings-routing'); } },
    { id: '06-create', does: 'Opens All tickets, fills the New Ticket form step by step, then submits it (final take only).', writes: ['creates 1 demo ticket (customer address uses example.invalid, nothing is emailed)'], caption: 'Logging a new request',
      text: 'Now, let us log a request, just like your team would. We go to All tickets, and choose New Ticket. A customer cannot sign in to the portal, so we type that in as the subject, add the customer name and email, and describe the problem.',
      run: async (h) => {
        const { page } = h; const form = 'form[action*="tickets/add"]';
        await nav(h, 'tickets');
        const newBtn = page.locator('a:has-text("New Ticket"):visible, button:has-text("New Ticket"):visible').first();
        if (await newBtn.count()) { await h.click(newBtn); await h.settle(); } else { h.note('New Ticket button not found: opening the form by address'); await h.goto('tickets/add'); }
        await h.type(page.locator(`${form} #subject`), 'Onboarding demo: cannot sign in to the customer portal');
        await h.click(page.getByText('Ticket without contact', { exact: false }).first()); await h.sleep(600);
        await h.type(page.locator(`${form} #name`), 'Onboarding Demo Customer');
        await h.type(page.locator(`${form} #email`), 'onboarding.demo@example.invalid'); // reserved, undeliverable domain: no real customer is ever mailed
        await h.choose('department', 'Support'); await h.sleep(700);
        await h.choose('priority', 'High'); await h.sleep(700);
        await h.choose('assigned', 'Demo Agent'); await h.sleep(700);
        await page.evaluate(() => { const ed = window.tinymce && window.tinymce.get('message'); if (ed) ed.setContent('<p>The customer reports that the portal rejects their password after the latest reset. Please check the account and confirm access.</p>'); });
        await h.sleep(1200); await h.shot('create-filled');
        if (!h.final) { h.note('rehearsal: form filled, not submitted'); return; }
        const openBtn = page.getByRole('button', { name: 'Open Ticket' }); await h.moveTo(openBtn); await openBtn.click({ noWaitAfter: true });
        // The demo needs 30-40 s to answer (probably a notification email): wait for the URL change, not the load event.
        await h.slowWait(() => page.waitForURL(/tickets\/ticket\/\d+/, { timeout: 150000, waitUntil: 'commit' }));
        h.state.ticketId = Number(page.url().match(/ticket\/(\d+)/)[1]); h.note(`created ticket #${h.state.ticketId}`);
        await h.settle();
      } },
    { id: '07-opened', does: 'Shows the new ticket and highlights the Support panel.', caption: 'The ticket and its Support panel',
      text: 'And there is our ticket. Look at the right hand side. The Support Operations panel gives the agent everything in one place: the work timer, the customer context, and the activity for this ticket.',
      run: async (h) => { await onTicket(h); await h.sleep(1000); await h.highlight('#aios-support-timer-heading'); await h.sleep(1000); await h.shot('ticket-panel'); } },
    { id: '08-timer', does: 'Starts, pauses, resumes and stops the work timer, then shows the time history.', writes: ['1 timer session on the demo ticket'], caption: 'Tracking work time',
      text: 'When the agent starts working, they press Start. If they get pulled away, they can pause, and resume when they are back. When they are finished, they press Stop. Every session is saved in the time history. And the timer is kept by the server, so no time is ever lost, even if the browser is closed.',
      run: async (h) => {
        await onTicket(h);
        const act = (a) => h.page.locator(`.aios-support-timer-action[data-action="${a}"]`);
        // A timer left running by an earlier attempt would hide the Start button: stop it quietly first.
        if ((await act('start').count()) === 0 && (await act('stop').count())) { await act('stop').first().click(); await h.settle(); }
        for (const [a, wait] of [['start', 2500], ['pause', 1500], ['resume', 2000], ['stop', 1000]]) { await h.click(act(a)); await h.settleFast(); await h.sleep(Math.max(300, wait - 900)); }
        await h.highlight('details[open]'); await h.shot('time-history');
      } },
    { id: '09-note-status', does: 'Adds an internal note and moves the ticket to In Progress (final take only).', writes: ['1 internal note and a status change on the demo ticket'], caption: 'An internal note, then the status',
      text: 'Now the agent leaves a note for the team. They write what they have done, and what is still pending, and save it.',
      run: async (h) => {
        const { page } = h; await onTicket(h);
        await h.click(page.locator('a[href="#note"]').first());
        await h.type(page.locator('textarea[name="note_description"]'), 'Checked the portal account and reset the sign-in lock. Waiting for the customer to confirm.');
        const toggle = page.locator('.dropdown:has(.dropdown-menu a:text-is("In Progress")) > .dropdown-toggle').first();
        if (h.final) {
          await h.click(page.getByText('Add Note', { exact: true }).last()); await h.sleep(1800); await showOperations(h);
          await h.click(toggle); await h.click(page.locator('.dropdown-menu a:text-is("In Progress")').first()); await h.sleep(1200); await showOperations(h);
        } else { h.note('rehearsal: status toggle found: ' + (await toggle.count()) + '; note typed, not saved'); await h.click(toggle); await h.sleep(1200); await page.keyboard.press('Escape'); }
        await h.shot('note-status');
      } },
    { id: '10-close', does: 'Closes the demo ticket (final take only).', writes: ['closes the demo ticket'], caption: 'Closing the ticket',
      text: 'Once the customer is happy, the ticket can be closed. If a timer is still running on it, it stops automatically, so nobody has to remember.',
      run: async (h) => {
        await onTicket(h);
        const toggle = h.page.locator('.dropdown:has(.dropdown-menu a:text-is("Closed")) > .dropdown-toggle').first();
        if (!h.final) { h.note('rehearsal: close toggle found: ' + (await toggle.count()) + ' (not closing)'); return; }
        await h.click(toggle); await h.click(h.page.locator('.dropdown-menu a:text-is("Closed")').first()); await h.sleep(1800); await showOperations(h); await h.shot('ticket-closed');
      } },
    { id: '11-dashboard', does: 'Returns to the module home and switches the agent activity period.', caption: 'Agent activity',
      text: 'Let us go back to Support Operations, and see how that work shows up. In Agent activity, supervisors can see how much time each agent tracked. You can switch between today, this week, this month, last month, and this year. A running timer counts up to the current second, and each row links to the ticket that agent is working on right now. Totals only include tickets from the departments the supervisor can access.',
      run: async (h) => {
        await nav(h, 'dashboard'); await h.highlight('#support-agent-activity-heading'); await h.sleep(1500);
        for (const label of ['This week', 'This month', 'This year', 'Last month', 'Today']) {
          const btn = h.page.locator('#support-agent-activity-heading').locator('xpath=ancestor::section').getByRole('link', { name: label, exact: true });
          await h.click(btn); await h.settleFast(); await h.highlight('#support-agent-activity-heading'); await h.sleep(700);
        }
        await h.shot('agent-activity');
      } },
    { id: '12-running', does: 'Highlights the running timers list.', caption: 'Running ticket timers',
      text: 'Right above it, the running timers list shows every timer that is in progress. Supervisors see every timer, and each agent sees only their own.',
      run: async (h) => { await h.highlight('#support-running-timers-heading'); await h.sleep(1800); await h.shot('running-timers'); } },
    { id: '13-workflow', does: 'Opens the Integrations tab and highlights the workflow health notice.', caption: 'Workflow health',
      text: 'One last place worth knowing. The Integrations tab in Support settings shows the health of the Workflow connection. Every ticket event, including timers, is queued here and delivered to the Workflow engine.',
      run: async (h) => {
        await nav(h, 'settings'); await tab(h, 'Integrations'); await h.sleep(800);
        await h.page.evaluate(() => { const el = [...document.querySelectorAll('.alert')].find((a) => /Workflow adapter/.test(a.innerText)); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('__hl'); } });
        await h.shot('workflow-health');
      } },
    { id: '14-outro', does: 'Returns to the module home page for the closing words.', caption: 'Log, assign, work, track, close, report',
      text: 'And that is the whole journey. Log the request, assign it, do the work, track the time, close it, and report on it. Thanks for watching, and welcome to your support module.',
      run: async (h) => { await nav(h, 'dashboard'); await h.page.evaluate(() => window.scrollTo(0, 0)); await h.sleep(800); } },
  ],

  // Extra narration clips placed inside long scenes (anchor = scene id, offset = ms after that scene starts) to avoid silent stretches.
  extras: [
    { id: '06b-create', anchor: '06-create', offset: 16000, text: 'Then we pick the Support department, set the priority to High, because the customer is blocked, and assign it to the agent who will handle it. When we are ready, we open the ticket.' },
    { id: '06c-create', anchor: '06-create', offset: 32500, text: 'Creating a ticket can take a few seconds, so give it a moment.' },
    { id: '08b-timer', anchor: '08-timer', offset: 19800, text: 'You can also add a work category and a short note, so the time is easy to understand later.' },
    { id: '08c-timer', anchor: '08-timer', offset: 26500, text: 'Notice how the time history lists every session: who worked, when it started, and for how long.' },
    { id: '09b-note-status', anchor: '09-note-status', offset: 8000, text: 'Notes stay in the ticket history, and are never sent to the customer. Then the agent moves the ticket to In Progress, so everyone can see where it stands. The queue and the reports update straight away.' },
    { id: '09c-note-status', anchor: '09-note-status', offset: 20500, text: 'If someone forgets to stop a timer, a supervisor can correct the time later, and every correction needs a reason.' },
  ],
};
