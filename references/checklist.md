# Customer onboarding video checklist

## Before recording
- [ ] Module, audience, language, length target and the "story" (one realistic record's life) are agreed. Ask the owner if unclear.
- [ ] The module was scanned (`scan.mjs`) and `plan.md` was shown to the user and **approved** (`plan.mjs approve`) before any recording. The voice was chosen in the picker (`voices.mjs`).
- [ ] Environment is a DEMO/TEST site, not production. No real customer data on screen. Follow the project's own rules (for example AGENTS.md) about which environments may be touched.
- [ ] The owner signed in via `login.mjs`; you did not handle credentials. Profile folder is outside git and treated as private.
- [ ] Demo data is clearly labelled ("Onboarding demo ..."). Customer email uses `example.invalid`. No scene sends an email, SMS or message.
- [ ] Narration written in the human style (references/narration-style.md) and every claim verified in the product.
- [ ] `scripts/setup.mjs` ran (tools present). `prepare.mjs` produced audio and `durations.json`.

## Rehearsal (no data changes)
- [ ] `node record.mjs --config=...` finishes with no `PROBLEM` lines. Fix selectors/waits until clean.
- [ ] Scene durations are close to their audio (extras fill gaps). Menu/navigation stays visible and highlighted as the user would click it.
- [ ] Any leftovers from failed attempts are closed (not deleted) and noted.

## Final take and build
- [ ] `node record.mjs --config=... --final` once; note created record ids from the log.
- [ ] `node mux.mjs --config=...` builds `<name>-captioned.mp4`, `<name>.mp4`, `.srt`, `.vtt`.

## Quality checks (do not skip)
- [ ] Extract frames at the start, middle and last 1.5 s: subtitles readable, menu visible, nothing cut off.
- [ ] Ending: last subtitle cue ends before the video ends (hold of about 3 s) and the audio stream finishes with the last words.
- [ ] `silencedetect` shows no silent stretch over about 6 s (`ffmpeg -i video.mp4 -af silencedetect=noise=-45dB:d=5 -f null -`).
- [ ] Peak level not clipping (volumedetect max below 0 dB); audio present throughout.
- [ ] Test records are in a safe state (closed, no running timers, no half-saved forms); background queues healthy if the module has them.

## Deliver
- [ ] Videos and project folder saved outside git (for example `~/Documents/onboarding/<module>-<date>/`) with a short README.
- [ ] A short report (what was covered, findings, test data left, file locations); scenes and config committed to the project's repo if it has one (never the videos or the profile folder).
- [ ] Findings from the run (slow pages, confusing labels, bugs) listed, not hidden. Offer follow-up issues.
- [ ] Update whatever tracker or documentation the project uses (issue comment, changelog). Commit; push only if asked.
