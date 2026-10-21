# Installation guide

Customer Onboarding with TTS is an agent skill (a folder with a `SKILL.md`) plus a set of Node scripts. You install it in two steps:
**put the folder where your agent looks for skills**, then **install the tools once** (ffmpeg, Piper text-to-speech, a voice and Playwright).

## 1. Requirements

| Need | Details |
| --- | --- |
| Node.js 18 or newer | Check with `node --version`. Get it from https://nodejs.org |
| Git | Only to clone the repository. You can also download the ZIP from GitHub and unzip it |
| `tar` | Included with Windows 10/11, macOS and Linux |
| Google Chrome | Recommended. Without it, setup downloads Playwright's Chromium (about 150 MB) |
| Disk space | About 350 MB for the tools, plus 60 to 120 MB for each extra voice |
| Internet | Needed once, to download the tools and voices. Recording and speech then work offline |
| A demo or test environment | Never record against production or real customer data |

Platform notes: tested on **Windows 11**. The Linux and macOS code paths are written but not yet tested; please open an issue if something fails.
On macOS install ffmpeg with `brew install ffmpeg` first (the skill reuses it). On Linux a system ffmpeg is reused when it has libx264 and libass, otherwise a build is downloaded.

## 2. Put the skill where your agent finds it

Replace `<repo-url>` with this repository's address.

### Claude Code

User-wide (every project):

```bash
# macOS / Linux / Git Bash
git clone <repo-url> ~/.claude/skills/customer-onboarding-with-tts
```
```powershell
# Windows PowerShell
git clone <repo-url> "$env:USERPROFILE\.claude\skills\customer-onboarding-with-tts"
```

Only for one project (commit it so your team gets it too):

```bash
git clone <repo-url> .claude/skills/customer-onboarding-with-tts
rm -rf .claude/skills/customer-onboarding-with-tts/.git   # so the project does not contain a nested repository
```

Start a new Claude Code session, then type `/customer-onboarding-with-tts` or just describe the task ("record an onboarding video for our Invoices module").

### Codex

```bash
git clone <repo-url> ~/.codex/skills/customer-onboarding-with-tts
```
```powershell
git clone <repo-url> "$env:USERPROFILE\.codex\skills\customer-onboarding-with-tts"
```

Restart Codex and ask it to use the `customer-onboarding-with-tts` skill. If your Codex version looks for skills somewhere else, use the folder named in its documentation: the skill needs nothing except that the folder contains `SKILL.md`.

### Any other agent, or no agent

Clone anywhere and run the scripts yourself (see "Run it by hand" in the [README](README.md)). Nothing depends on a particular agent.

## 3. Install the tools (once per computer)

Ask your agent ("set up the onboarding tools"), or run it yourself:

```bash
node ~/.claude/skills/customer-onboarding-with-tts/scripts/setup.mjs
```
```powershell
node "$env:USERPROFILE\.claude\skills\customer-onboarding-with-tts\scripts\setup.mjs"
```

What it does (each step is skipped when already done, so it is safe to re-run):

1. Finds ffmpeg, or downloads a checksum-verified build.
2. Downloads the Piper text-to-speech program for your operating system.
3. Downloads one voice (default `en_US-ryan-high`). Pick another with `--voice=<name>` or later in the dashboard.
4. Installs Playwright with `npm` and its small video encoder; uses Chrome if present, otherwise Chromium.

Everything goes to `~/.customer-onboarding-tts` (`%USERPROFILE%\.customer-onboarding-tts` on Windows), outside any git repository. No system-wide install, no PATH change.

Options: `--tools=<folder>` to install elsewhere (then set the environment variable `ONBOARDING_TOOLS` to that folder for every later command), `--voice=<name>`, `--skip-voice`.

## 4. Check that it works

```bash
cd <skill folder>
npm run check          # syntax check of every script
npm test               # offline tests of the plan approval gate
node scripts/engine/tts.mjs --text="Hello, this is a test." --out=./hello.wav
```

If `hello.wav` plays, text to speech works. Then open the dashboard to pick your voice and try the Text to speech tab:

```bash
node scripts/engine/voices.mjs
```

## 5. Two ways to use it

**Text to speech on its own.** Open the dashboard (`voices.mjs`) and use the **Text to speech** tab to turn any text into a WAV or MP3, download it, or save it to your Desktop. Or use the command line: `node scripts/engine/tts.mjs --text="..." --voice=en_US-ryan-high --format=mp3`.

**Customer onboarding videos.** Ask your agent to record one. The agent scans the module, shows you a recording plan, waits for your approval, then records, narrates and adds subtitles. You sign in yourself; the skill never sees your password.

## Updating

```bash
cd ~/.claude/skills/customer-onboarding-with-tts && git pull
node scripts/setup.mjs     # only needed if the release notes say the tools changed
```

## Uninstalling

Delete the skill folder, and delete the tools folder `~/.customer-onboarding-tts` if you want the disk space back (voices and ffmpeg are in there).

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `Node.js 18 or newer is required` | Install a current Node.js LTS |
| `Could not extract ... tar` | Install `tar` (Windows 10 version 1803 or newer already has it) |
| macOS: "No ffmpeg build is bundled" | `brew install ffmpeg`, then run setup again |
| Download fails or times out | Re-run `setup.mjs`; finished downloads are kept and only missing parts are fetched |
| The agent does not list the skill | The folder name must match, and it must contain `SKILL.md`. Restart the agent after copying |
| `Piper ... not found` or voice missing | Run `setup.mjs`, then pick or download a voice in the dashboard |
| The dashboard does not open a browser | Open the address printed as `VOICE_PICKER http://127.0.0.1:<port>/` yourself |
| Behind a company proxy or firewall | Downloads come from github.com and huggingface.co; allow them or download the files on another network and copy the tools folder |
| More help | See the table in [SKILL.md](SKILL.md) and [references/gotchas.md](references/gotchas.md) |
