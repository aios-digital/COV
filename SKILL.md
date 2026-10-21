---
name: customer-onboarding-with-tts
description: Create customer onboarding videos, product walkthroughs, software tutorials and demo videos automatically: a narrated, subtitled training video of any web app or module. The skill first scans the module and writes a recording plan for the user to approve, lets the user pick the narrator voice in a local dashboard, then records the walkthrough with a real browser (Playwright), an offline human-sounding text-to-speech voice (Piper), and burned-in subtitles (ffmpeg). Also works as a plain offline text-to-speech tool (dashboard tab or command line) that produces MP3 files. Use when asked to record an onboarding, tutorial, demo, training or "how it works" video, to re-record or extend one, to turn a product module into a customer-ready walkthrough, or to convert text to speech. Produces a 1920x1080 MP4 (captioned and clean), SRT/VTT files and a short report, or an MP3 audio file.
---

# Customer onboarding with TTS

A scripted walk through a web app becomes a customer-ready onboarding video: a real browser clicks through the product the way a person
would (menu navigation highlighted, visible cursor and click ripples), a friendly offline voice narrates, English subtitles are burned in
and timed to the voice, and the run doubles as an end-to-end acceptance test of the module.

In this file `<skill>` is the folder that contains this SKILL.md (for example `~/.claude/skills/customer-onboarding-with-tts` or
`~/.codex/skills/customer-onboarding-with-tts`). All commands are Node scripts and work on Windows, macOS and Linux. Use `--config=<project>/walkthrough.config.mjs` on every engine script.

## Plain text to speech (no video)
When the user only wants audio from text: run `node <skill>/scripts/setup.mjs` once, then either `node <skill>/scripts/engine/tts.mjs --text="..." [--voice=] [--speed=] [--format=mp3|wav] [--out=<file or folder>]` (MP3 by default; saved in the current folder when `--out` is omitted),
or open the dashboard with `node <skill>/scripts/engine/voices.mjs` (run it in the background) and tell the user to use its **Text to speech** tab: they can generate, play and download the MP3 themselves.

## The gates for onboarding videos (never skip)
1. **Scan, then plan, then approval, then record.** Never start recording until the user has read `plan.md` and said yes. `record.mjs` refuses to run without a matching approval.
2. **The user chooses the voice** in the voice picker dashboard (dark/light, voices per language, samples, and a Text to speech tab) before the audio is generated.
3. **Demo or test environments only.** Never record production or real customer data. Follow the project's own rules (AGENTS.md, CLAUDE.md, security notes) about which environments may be touched.
4. **The user signs in; you never handle passwords.** `login.mjs` opens a visible window with a dedicated profile folder.
5. **Nothing may reach a real person.** Internal notes only, reserved addresses (`example.invalid`), no emails, SMS or messages. Never hard-delete: close or archive test records and report strays.
6. **Rehearsals change nothing** (`h.final` is false). Only `--final` creates the demo records listed in the approved plan.
7. **Claim only what the screen shows and you verified.** Report findings (slow pages, bugs, confusing labels); do not hide them.
8. Videos, audio and the browser profile stay **outside git**. Commit only the config/scenes and the report. Push or deploy only when the user asks.

## Workflow
0. **Clarify** only what you cannot infer: which module, who watches, language (English default), the story to follow (one realistic record from creation to resolution), the demo environment URL, and who will sign in.
1. **Tools, once per machine:** `node <skill>/scripts/setup.mjs`. Installs ffmpeg (a system one with libx264/libass is reused), Piper, a default voice and Playwright into `~/.customer-onboarding-tts` (override with `ONBOARDING_TOOLS`). Idempotent; about 350 MB the first time; needs Node 18+. Uses your installed Chrome, otherwise downloads Chromium.
2. **Project folder** outside git, for example `~/Documents/onboarding/<module>-<date>/`. Copy `<skill>/templates/walkthrough.config.mjs` there as `walkthrough.config.mjs`; set `name`, `baseUrl`, `startPath`, `loginPath`.
3. **Sign in:** `node <skill>/scripts/engine/login.mjs --config=<cfg>`. Tell the user a window opens and they sign in themselves. Wait for `SIGNED_IN`. (Skip when the module needs no login.)
4. **Scan the module (read-only):** `node <skill>/scripts/engine/scan.mjs --config=<cfg> [--scope=/path,/other/path] [--max=25]`. It opens pages (GET only, no clicks, no submits) and writes `scan/scan.md`, `scan/scan.json` and screenshots: menu entries, headings, tabs, buttons, form fields (real ids), tables. Read `scan/scan.md` and the screenshots. Add `--headed` to watch it.
5. **Voice:** `node <skill>/scripts/engine/voices.mjs --config=<cfg>` (run it in the background). A dashboard opens in the user's browser (the line `VOICE_PICKER http://127.0.0.1:<port>/` shows the address): they listen to samples, try a voice with the first lines of the real narration, set speed and pause, press **Use this voice** and then **Finish and close**. Tell the user to do that and wait for `VOICE_CHOSEN` in the output. The choice is saved in `<project>/voice.json`.
6. **Write the scenes** in the config (`scenes`, `extras`): human tone, short sentences, one idea per scene (`references/narration-style.md`). Give each scene a plain `does` sentence, `covers` (scanned paths it shows) and `writes` (what the final take creates). Take real element ids from the scan; see `references/adapting-to-other-software.md`. Make every write step rehearsal-safe.
7. **Plan and approval (STOP here):** `node <skill>/scripts/engine/plan.mjs draft --config=<cfg>` writes `plan.md`: goal, environment, pages found and which are covered, scene-by-scene table (screen action, narration, seconds), data that will be created, safety checks, voice and outputs. Fill in any blank goal/audience/story, then **show the plan to the user and ask for approval**. Change the scenes if they ask; every change voids the approval. Only after an explicit yes, run `node <skill>/scripts/engine/plan.mjs approve --config=<cfg> --by="<their name>"`. Never approve on the user's behalf.
8. **Voice audio:** `node <skill>/scripts/engine/prepare.mjs --config=<cfg>` (offline per-sentence TTS, cached; re-run after any text or voice change).
9. **Rehearse:** `node <skill>/scripts/engine/record.mjs --config=<cfg>` until the log has no `PROBLEM` lines and scene lengths are near their audio. Use `--only=idA,idB` to retest scenes; any `--key=value` reaches `h.args`.
10. **Final take and build:** `node <skill>/scripts/engine/record.mjs --config=<cfg> --final`, then `node <skill>/scripts/engine/mux.mjs --config=<cfg>`. Long steps exceed typical tool time limits: run them in the background and read the output when they finish.
11. **QA with evidence** (`references/checklist.md`): frames at the start, middle and last 1.5 s; `silencedetect` for gaps over about 6 s; the last subtitle ends before the video; closing words complete; audio not clipping. Close stray test records.
12. **Deliver:** `video/<name>-captioned.mp4` (share this), `video/<name>.mp4`, `.srt`, `.vtt`, screenshots, a short report (coverage, findings, test data left, paths), and a README in the project folder. Offer follow-ups for any findings.

## Quality bar
Human, calm pacing; the navigation is visible and highlighted as each screen is opened; the frame is wide enough to show all options; subtitles readable in two lines; no silent stretch over about 6 s; closing words complete; no spinner dead time (cut with `h.slowWait`).

## When something fails
| Symptom | Fix |
| --- | --- |
| `PLAN_NOT_APPROVED` | Show `plan.md` to the user, get a yes, run `plan.mjs approve`. After editing scenes, redraft and re-approve |
| `Piper ... not found` / voice missing | `node <skill>/scripts/setup.mjs`, then pick a voice with `voices.mjs` |
| Page closes at launch (`TargetClosedError`) | Playwright video encoder missing: run `setup.mjs` |
| `NOT_SIGNED_IN` in the scan | Run `login.mjs` and have the user sign in, then scan again |
| `boundingBox` timeout on a link | Text sits in a child span or a hidden duplicate matches: use `h.linkText`, scope to the menu container (`references/gotchas.md`) |
| Scene waits 30+ s then fails | Page never fires `load`: wait for URL `commit` with `h.slowWait` |
| Subtitles huge or tiny | libass uses a 384x288 canvas: tune `subtitleStyle` `FontSize` (11 is about 41 px at 1080p) |
| Closing words cut off | Do not use `-shortest`; the engine records 3.5 s extra and holds the last frame |
| Strange state from a failed take | Clean up in the scene's first lines (stop timers, close modals); close stray records |

## Files
`scripts/setup.mjs` | `scripts/engine/{env,voicelib,planlib}.mjs` (helpers) | `scripts/engine/{login,scan,voices,tts,plan,prepare,record,mux}.mjs` | `INSTALL.md` |
`templates/walkthrough.config.mjs` | `examples/crm-support-module.config.mjs` (+ `.notes.md`) | `references/{narration-style,adapting-to-other-software,gotchas,checklist}.md`.
