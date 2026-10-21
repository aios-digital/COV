# Customer Onboarding with TTS

An agent skill for **Claude Code** and **Codex** (and any agent that reads `SKILL.md` skills) with two uses:

- **Customer onboarding videos:** turns a web app or module into a customer-ready, narrated, subtitled walkthrough video.
- **Plain text to speech:** type or paste any text and get an MP3 file, offline and free, from the dashboard or the command line.

Full installation steps for Claude Code and Codex are in **[INSTALL.md](INSTALL.md)**.

How the onboarding video works:

1. **Scans the module first** (read-only) and writes a **recording plan** that you read and approve before anything is recorded.
2. Opens a **voice picker dashboard** so you choose the narrator by listening, and test it on your own script.
3. Records the walkthrough in a **real browser** (Playwright): highlighted menu clicks, visible cursor, 1920x1080.
4. Narrates it with an **offline, human-sounding voice** ([Piper](https://github.com/rhasspy/piper)): no API keys, no cloud, no cost.
5. Burns in **English subtitles** timed sentence by sentence, and writes `.srt` / `.vtt` files.

The same run doubles as an end-to-end acceptance test of the module: scenes that cannot find their buttons fail loudly.

## What you get

```
<project folder>/
  plan.md                       the recording plan you approved
  scan/scan.md, scan.json       what the module contains (pages, tabs, buttons, form fields), plus screenshots
  voice.json                    the narrator you chose
  video/<name>-captioned.mp4    subtitles burned in: the one to share
  video/<name>.mp4              clean version
  video/<name>.srt, .vtt        subtitle files
  screens/*.png                 step screenshots
```

## Requirements

- Node.js 18 or newer, and `tar` (included with Windows 10+, macOS and Linux).
- Google Chrome (otherwise setup downloads Playwright Chromium).
- About 350 MB of disk for the tools (ffmpeg, Piper, one voice, Playwright). They live in `~/.customer-onboarding-tts`, never inside your repo.
- ffmpeg is reused from your PATH when it has libx264 and libass. Otherwise Windows and Linux get a checksum-verified build automatically; on macOS run `brew install ffmpeg`.
- Tested on Windows 11. The Linux and macOS code paths are written but not yet tested: please report issues.

## Install

The short version is below; the complete guide with requirements, updating and troubleshooting is **[INSTALL.md](INSTALL.md)**.

Clone this repository into your agent's skills folder.

**Claude Code**
```bash
git clone https://github.com/<you>/customer-onboarding-with-tts ~/.claude/skills/customer-onboarding-with-tts
```
(Windows PowerShell: `git clone ... "$env:USERPROFILE\.claude\skills\customer-onboarding-with-tts"`.) To share it with a team, clone it into `.claude/skills/` inside the project instead.

**Codex**
```bash
git clone https://github.com/<you>/customer-onboarding-with-tts ~/.codex/skills/customer-onboarding-with-tts
```
(Codex reads user skills from `~/.codex/skills`. Restart Codex if it does not list the skill; check your Codex version's documentation if the folder differs.)

**Any other agent or no agent:** every step is a plain Node script; see "Run it by hand".

Then install the tools once:
```bash
node ~/.claude/skills/customer-onboarding-with-tts/scripts/setup.mjs
```
(Or just ask your agent; the skill runs it for you.)

## Text to speech without an onboarding video

```bash
node scripts/engine/voices.mjs        # dashboard: pick a voice, then use the "Text to speech" tab
node scripts/engine/tts.mjs --text="Hello, this is a test." --out=./hello.mp3
```

The dashboard has dark and light modes, shows how many voices exist per language, plays a sample of every voice, and lets you type any text
(up to 5000 characters), generate it, then **play** it and **download** the MP3. The command line version needs no dashboard
(`--file=script.txt`, `--voice=`, `--speed=`, `--format=mp3|wav`, `--out=`; MP3 is the default and the file is saved in the current folder when `--out` is omitted).

## Use it with your agent

Say something like:

> Use customer-onboarding-with-tts to record an onboarding video for the Invoices module at https://demo.mycompany.com. I will sign in myself.

The agent then:
1. asks only what it cannot infer (audience, story, demo URL),
2. has you sign in once in a browser window it opens (it never sees your password),
3. scans the module and shows you what it found,
4. opens the voice picker; you choose a narrator and press **Finish**,
5. writes **`plan.md`** (scenes, narration, data the video will create, safety checks) and **waits for your approval**,
6. rehearses (changes no data), records the final take, builds the video, checks it, and reports.

Editing a scene after approval voids the approval, so you always approve what will actually be recorded.

## Run it by hand

```bash
S=~/.claude/skills/customer-onboarding-with-tts        # or wherever you cloned it
cp $S/templates/walkthrough.config.mjs ~/onboarding/invoices/walkthrough.config.mjs   # edit baseUrl, startPath, scenes
C=~/onboarding/invoices/walkthrough.config.mjs
node $S/scripts/setup.mjs                         # once per machine
node $S/scripts/engine/login.mjs   --config=$C    # you sign in, in the window that opens
node $S/scripts/engine/scan.mjs    --config=$C    # read-only scan -> scan/scan.md
node $S/scripts/engine/voices.mjs  --config=$C    # voice picker dashboard
node $S/scripts/engine/plan.mjs draft   --config=$C   # writes plan.md: read it
node $S/scripts/engine/plan.mjs approve --config=$C --by="Your Name"   # only after you read it
node $S/scripts/engine/prepare.mjs --config=$C    # offline voice for every sentence
node $S/scripts/engine/record.mjs  --config=$C    # rehearsal (no data changes)
node $S/scripts/engine/record.mjs  --config=$C --final
node $S/scripts/engine/mux.mjs     --config=$C    # builds the videos and subtitles
```

## How a scene looks

```js
{ id: '02-open', caption: 'Invoices: your home base',
  does: 'Opens Invoices from the menu and scrolls the list.', covers: ['/invoices'],
  text: 'We open Invoices from the main menu. This is the page your team will come back to every day.',
  run: async (h) => { await h.clickHighlighted(h.page.locator('nav a[href$="/invoices"]:visible').first()); await h.scroll(800, 6000); } }
```

`text` is what the voice says, `does` and `covers` feed the plan, and `run(h)` is the browser choreography. Helpers (`h.click`,
`h.type`, `h.choose`, `h.slowWait`, ...) are documented in [references/adapting-to-other-software.md](references/adapting-to-other-software.md).
A full worked example (a 14-scene support-module walkthrough, including rehearsal-safe write steps) is in
[examples/crm-support-module.config.mjs](examples/crm-support-module.config.mjs).

## Safety model

- **Demo or test environments only.** The plan asks you to confirm there is no real customer data on screen.
- **You sign in.** The skill never types or stores a password. The signed-in browser session lives in the project's `profile/` folder: keep it private and out of git (the included `.gitignore` does).
- **The scan is read-only:** it opens pages and reads them. It never clicks buttons or submits forms, and skips links that look destructive (logout, delete, remove, export...). A few apps change data on a plain link visit, so scan a demo, not production.
- **Rehearsals never write.** Only `--final` creates the demo records listed in the approved plan. Test records are closed, never deleted.
- **No outbound messages:** use internal notes and reserved addresses such as `example.invalid`.
- The voice picker listens on `127.0.0.1` only and checks the host and origin of every request.

## Voices and languages

Voices come from the [Piper voice catalog](https://huggingface.co/rhasspy/piper-voices) (about 180 voices in many languages). The
picker streams the official sample for listening, and downloads a voice (60 to 120 MB, once) only when you try it or choose it. Each voice has
its own licence in its model card: check it before publishing videos commercially. Write native narration for other languages; do not
machine-translate blindly, and check right-to-left subtitle rendering.

## Troubleshooting

See the table in [SKILL.md](SKILL.md) and [references/gotchas.md](references/gotchas.md) (menu collapse races, slow pages that never fire `load`,
subtitle sizing, closing words cut off).

## Development

```bash
npm run check   # syntax-check every script
npm test        # offline tests for the plan gate
```

## Third-party software (downloaded at setup time, not included)

[Playwright](https://playwright.dev) (Apache-2.0), [Piper](https://github.com/rhasspy/piper) (MIT) and its voices (per-voice licences),
[FFmpeg](https://ffmpeg.org) (LGPL/GPL builds from [BtbN](https://github.com/BtbN/FFmpeg-Builds)). This project is MIT licensed, see [LICENSE](LICENSE).
