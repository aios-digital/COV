# Gotchas learned recording the first onboarding videos

**Tooling**
- Playwright's own video encoder is mandatory (`npx playwright install ffmpeg` with `PLAYWRIGHT_BROWSERS_PATH` set). Without it the page closes
  at launch with `TargetClosedError`. `scripts/setup.mjs` installs it. The engine points `PLAYWRIGHT_BROWSERS_PATH` at the tools folder's `pw-browsers` itself.
- The engine drives the installed Google Chrome (`channel: 'chrome'`); without Chrome, setup downloads Playwright's Chromium. The recording profile is separate from the user's own browser.
- The owner signs in once in the opened window (`login.mjs`). Never type or request passwords; never copy a session between browsers or profiles.
- On Windows, Git Bash and Windows programs see paths differently (`/c/...` versus `C:\...`): pass native paths to native programs.
- Piper: synthesize per sentence (exact subtitle times) and join with a pause. A "high" voice is slower to generate (about a minute per ten clips).
- ffmpeg subtitles: libass sizes on a 384x288 canvas. `FontSize=11` is about 41 px on a 1080p video; `original_size` did not help. Use a relative
  subtitle file name in the filter (Windows drive-letter colons break filter parsing).
- `-shortest` cuts the closing narration if the video is shorter. Keep recording 3.5 s after the last scene, hold the final frame 3 s, and do not use `-shortest`.
- Trim the silent page-load at the start; keep a 0.6 s lead-in. Cut recorded server waits (`h.slowWait`).

**Desktop applications (record-desktop.mjs, Windows)**
- Tray applications may "hide" by parking their window at a huge negative x (for example -10000) while it still reports as visible. Showing it from code does not stick: the application moves it back within a second. Ask the user to open it from the tray icon, then confirm its window rectangle is on screen before recording.
- Capture the window with the DWM frame bounds (`DwmGetWindowAttribute` 9), not `GetWindowRect`, which includes invisible resize borders that show a sliver of whatever is behind.
- A click aimed at a window that has vanished lands on the desktop. Check that the window is on screen before every click and before every scene.
- Moving the pointer over menu items is enough to show submenus; keep scenes to hover and Escape so nothing stops, deletes or saves.

**Browser automation**
- Wait for URL `commit`, not `load`, on busy pages; `networkidle` can take its whole timeout on pages that poll (cap it at about 3.5 s).
- Hidden duplicates: a link visible in the page body can also match a hidden sidebar link and make "is the menu open" checks lie. Scope to the sidebar.
- A click with auto-wait can time out merely because the click triggered a slow navigation. Use `noWaitAfter: true` and wait for the URL yourself.
- Menu groups re-expand a moment after each load; clicking during that moment collapses them. Wait, re-check, then click.
- A failed scene leaves state behind (a running timer, a typed note, a half-created ticket). Detect and clean it up; rehearse on safe records.
- Each failed take that already submitted a form creates records. Close the strays (do not delete) and mention them in the report.
