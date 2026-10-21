# Adapting the engine to another module or another web app

## The helper toolkit `h` (passed to every `scene.run(h)`)
| Helper | Use |
| --- | --- |
| `h.page`, `h.context` | the Playwright page and context for anything not covered below |
| `h.final` | false in rehearsal, true in the real take. Gate every save, submit, delete and status change on it |
| `h.args` | extra CLI flags, for example `--ticket=14` becomes `h.args.ticket` |
| `h.state` | scratch object shared between scenes (for example the id of the record you just created) |
| `h.goto(path)` | open a page (relative to `baseUrl`) and settle |
| `h.settle()` / `h.settleFast()` | wait for the page to calm down (settleFast skips the network-idle wait; use after reloads or on busy pages) |
| `h.click(loc)` | move the visible cursor smoothly to the element, then click |
| `h.clickHighlighted(loc)` | outline the element in red for about a second, click it without waiting for the navigation, then settle (menu clicks) |
| `h.type(loc, text)` | click and type at a human speed |
| `h.choose(id, text)` | pick an option in a `<select>` by its visible text (also refreshes bootstrap-select pickers when jQuery is present) |
| `h.highlight(selector)` | scroll to an element and outline it |
| `h.scroll(px, ms)` | smooth scroll |
| `h.linkText(text, scope?)` | a visible link by its whole text (works when the text sits in child spans) |
| `h.slowWait(action)` | run an action that waits on a slow server; waits over 6 s are recorded and cut out of the final video |
| `h.shot(name)` | screenshot into the project's `screens` folder |
| `h.note(msg)`, `h.sleep(ms)` | log line, pause |

Config hooks: `onSettled(h)` runs after every settle (use it to keep a menu expanded); `setup(h)` runs once after the first page loads.

## Finding robust selectors (do this first, with a read-only look)
0. Run `scan.mjs` first: `scan/scan.md` lists each page's headings, tabs, buttons, form fields (ids, names, labels) and tables, plus screenshots.
1. Open the module in a normal browser session (or with the Chrome tools) and list real elements before guessing:
   `document.querySelectorAll('a,button,input,select,textarea')` with their `id`, `name`, `href`, visible text.
2. Prefer ids, `href$="..."` endings, `name=` attributes and accessible roles (`getByRole`) over CSS classes.
3. Scope menu selectors to the sidebar container. The same link often also exists as a page button elsewhere ("Back to ..."),
   and `:visible` does not mean "in the viewport".
4. `a:text-is("Text")` fails when the text is inside a child span. Use `h.linkText('Text')` or `getByRole('link', { name })`.
5. Never use `locator.locator('visible=true')` to filter the element itself (it searches descendants). Use the `:visible` suffix.
6. `getByText('Save', { exact: true }).last()` picks the real button when the same word is also a tab label.

## Typical patterns
- **Menu that collapses after reloads**: write `showOperations(h)`-style helper (see `examples/crm-support-module.config.mjs`): wait about a second, check whether
  a known sidebar link is visible, click the group only if it is not, re-check. Call it from `onSettled`.
- **Forms with rich-text editors**: set content through the editor API (`tinymce.get('message').setContent(...)`), not by typing.
- **Forms that submit slowly**: click with `{ noWaitAfter: true }` then `h.slowWait(() => page.waitForURL(re, { waitUntil: 'commit', timeout: 150000 }))`.
  The `load` event may never fire on pages that keep polling, so never wait for it.
- **Dropdown menus that open on click**: click the toggle, then click the item by exact text inside `.dropdown-menu`.
- **Leftover state from an earlier attempt** (a running timer hiding a Start button, an open modal): detect it and clean it up quietly at the
  start of the scene, otherwise the scene fails and wastes the take.

## Writing a rehearsal-safe scene
Rehearsal runs the same scenes against existing demo records. It must open, scroll, type into forms and open menus, but never save.
End a write scene with `if (!h.final) { h.note('rehearsal: ...'); return; }` right before the destructive click. Rehearse until the log has
no `PROBLEM` lines and every scene's duration is close to its audio length, then do the real take.

## Outputs per project folder (all outside git)
`video\<name>-captioned.mp4` (subtitles burned in), `video\<name>.mp4`, `.srt`, `.vtt`, `<name>-silent.webm`, `timeline.json`;
`audio\*.wav`, `durations.json`, `parts.json`; `screens\*.png`; `profile\` (the signed-in browser session: private).
