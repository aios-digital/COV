# Narration style: sound like a friendly human guide, not a manual

The viewer is a new customer or colleague who has never seen the module. The goal is confidence, not a feature list.

## Voice and tone
- Speak to "you" and "your team". Use "let us", "notice", "take a moment", "do not worry". Warm, calm, plain words.
- Short sentences (about 8 to 20 words). The engine pauses between sentences, so every full stop is a breath. Avoid long chains.
- Explain *why* in one clause: "so nobody has to remember", "so the work is shared fairly".
- Say what the screen is showing at the moment it is on screen. Never describe something that is not visible.
- Only claim behaviour you have verified in the product (read the code or try it in the demo). If unsure, leave it out.
- No jargon or internal names (table names, option keys). Spell abbreviations the way they are spoken: "S L A" so the voice reads letters.
- Avoid digits and symbols the voice may misread; write "five" or "one hundred" when it sounds better. Avoid parentheses and URLs.
- Apostrophes are fine in JS template strings or double-quoted strings. In single-quoted strings write "let us", "do not" instead.

## Structure of a video (aim for 3 to 6 minutes)
1. **Welcome** (15 to 20 s): who you are guiding, what they will see, what the story is ("one request from start to finish").
2. **Orientation**: where the module lives in the menu, what the home page shows.
3. **Setup tour** (optional, only what a customer configures): 2 or 3 settings that change behaviour.
4. **The story**: follow one realistic record through its life (create, assign, work, track, close). One idea per scene.
5. **Reporting**: where a manager sees the result.
6. **Outro**: a one-sentence recap and a thank-you.

## Pacing
- Scene length = narration + about 1.2 s. If the on-screen action is much longer than the voice, either shorten the waits in `run(h)`
  or add an `extras` clip inside the scene (anchor + offset) that explains a related detail. Aim for no silent stretch over about 6 s.
- The viewer needs time to read. After a click, let the new page sit for a moment (`h.sleep(1000)`) before moving on.
- Put the narration of an action slightly before the action, not after: "We choose New Ticket" while the cursor is moving to the button.

## Subtitles
- Subtitles are the narration sentences, shown in a two-line box at the bottom. Keep sentences short enough to read in the time spoken.
- The step-title `caption` is a separate small badge (top-right): 2 to 6 words, a label, not a sentence.

## Other languages
- Piper has voices for many languages (for example `ar_JO-kareem-medium`, `fr_FR-siwis-medium`). Pick it in the voice picker (`node scripts/engine/voices.mjs`, language filter) or run `node scripts/setup.mjs --voice=<name>`.
- Write natural narration in that language; do not machine-translate the English script blindly. Check right-to-left subtitle rendering
  and use a font that supports the script (`subtitleStyle` in the config). The step-title badge should flip with `badgeSide: 'left'` for RTL.
