// Worked example for a Windows DESKTOP application (record-desktop.mjs): a one minute tutorial of the Laragon local development environment.
// Coordinates are relative to the captured window (its top-left corner is 0,0). Nothing here clicks Stop, Exit or Delete: the only
// clicks are a right click on the empty area to open the main menu, and everything else is hovering. Menus are closed with Escape.
// Run:  node scripts/engine/record-desktop.mjs --config=<this file copied to your project folder> [--final]

const BUTTONS = { stop: [145, 607], web: [329, 607], database: [513, 607], terminal: [697, 607], root: [881, 607] };
const MENU_AT = [253, 120];             // where we right click (empty area)
const MAIN = { quickApp: [310, 178], tools: [310, 200], php: [310, 306] };

export default {
  name: 'laragon-tutorial',
  desktop: {
    title: '^Laragon [0-9]{4} v',
    inspected: 'I looked at the Laragon window and opened its right-click menu and the Quick app, Tools and PHP submenus (hover only, then Escape). Found: the buttons Stop (the services are running), Web, Database, Terminal and Root; and the menu entries Laragon, www, Quick app, Tools, Apache, MySQL, Node.js, PHP, Python, Stop, Profile, Preferences and Exit. The scenes never click Stop, Exit or Delete project.',
  },   // the main window, for example "Laragon 2026 v8.6.1 ..."
  // Shown in the plan under "What was inspected" (the desktop equivalent of the web scan)
  // desktop.inspected is set below.
  plan: { audience: 'Developers new to Laragon', goal: 'Know what each button and menu is for in one minute', story: 'A quick tour of the main window and menu' },
  // The narrator voice comes from the voice picker (voices.mjs), saved in voice.json or the tools folder default.

  scenes: [
    { id: '01-intro', caption: 'Welcome to Laragon', does: 'Brings the Laragon window to the front and rests the pointer on its title bar.',
      text: 'Hi, and welcome. In one minute, I will show you Laragon, a fast, lightweight development environment for Windows.',
      run: async (h) => { await h.move(200, 15); await h.sleep(800); } },
    { id: '02-start', caption: 'Start and stop everything', does: 'Moves the pointer to the first button (shows Stop because the services are running). Does not click it.',
      text: 'The first button starts and stops all your services in one click. Right now Apache and MySQL are running.',
      run: async (h) => { await h.hover(...BUTTONS.stop, 1500); } },
    { id: '03-buttons', caption: 'Your daily shortcuts', does: 'Moves the pointer across Web, Database, Terminal and Root. Does not click them.',
      text: 'Next to it are your daily shortcuts: Web for your local sites, Database for your database manager, Terminal for a command line, and Root for your projects folder.',
      run: async (h) => { for (const k of ['web', 'database', 'terminal', 'root']) await h.hover(...BUTTONS[k], 2200); } },
    { id: '04-menu', caption: 'Right click for the main menu', does: 'Right clicks the empty area of the window to open the main menu.',
      text: 'Right click anywhere in the window to open the main menu.',
      run: async (h) => { await h.rightClick(...MENU_AT); await h.sleep(600); } },
    { id: '05-quickapp', caption: 'Quick app', does: 'Hovers Quick app, then WordPress and Laravel in its submenu. Does not click.',
      text: 'Quick app creates a new project in seconds: blank, WordPress, Laravel, or Symfony. Laragon can even give each project a friendly address ending in dot test.',
      run: async (h) => { await h.hover(...MAIN.quickApp, 1200); await h.hover(440, 178, 800); await h.hover(440, 200, 1200); await h.hover(440, 231, 1500); } },
    { id: '06-tools', caption: 'Tools', does: 'Hovers Tools, then phpMyAdmin and HeidiSQL in its submenu. Does not click.',
      text: 'Tools holds phpMyAdmin, HeidiSQL, and a cron manager.',
      run: async (h) => { await h.hover(...MAIN.tools, 900); await h.hover(463, 200, 1000); await h.hover(463, 244, 1200); } },
    { id: '07-php', caption: 'PHP and the other services', does: 'Hovers PHP, then its settings entries. Does not click.',
      text: 'Need another PHP version? The PHP menu lets you switch versions and edit php dot ini. Apache, MySQL, Node, and Python have their own menus too.',
      run: async (h) => { await h.hover(...MAIN.php, 1000); await h.hover(440, 306, 900); await h.hover(440, 337, 1100); await h.hover(443, 381, 1500); } },
    { id: '08-outro', caption: 'That is Laragon', does: 'Closes the menu with Escape and rests the pointer on the Stop button area.',
      text: 'That is Laragon. Start your services, create a project, and start building. Thanks for watching.',
      run: async (h) => { await h.closeMenus(); await h.move(...BUTTONS.web, 900); await h.sleep(600); } },
  ],
  extras: [],
};
