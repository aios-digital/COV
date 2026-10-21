# Arabic voices: what exists, what works here

Researched on 2026-10-21 on Hugging Face (model tags, model cards and licences as published that day). The skill speaks with
[Piper](https://github.com/rhasspy/piper), so only Piper-compatible voices can be used directly. Quality is subjective: **listen in the
dashboard** (`node scripts/engine/voices.mjs`, language "Arabic") before choosing. Licences change; check the source page before commercial use.

## Available in the dashboard now (Piper, offline)

| Voice | Dialect / gender | Licence | Commercial use | Source |
| --- | --- | --- | --- | --- |
| kareem (low, medium) | Jordanian, male | "See dataset URL" in the Piper model card: unclear | Check the [dataset](https://github.com/AliMokhammad/arabicttstrain/) | Official Piper catalog |
| emirati female | Emirati, female | MIT | Yes | [vadimbelsky/arabic-emirati-female-piper](https://huggingface.co/vadimbelsky/arabic-emirati-female-piper) |
| miro v2 | Modern Standard Arabic (Saudi data), male | CC BY-NC-ND 4.0 | **No** (hidden until you tick "Include non-commercial voices") | [OpenVoiceOS/phoonnx_ar_miro_espeak_V2](https://huggingface.co/OpenVoiceOS/phoonnx_ar_miro_espeak_V2) |
| dii | Modern Standard Arabic (Saudi data) | CC BY-NC-ND 4.0 | **No** (same toggle) | [OpenVoiceOS/phoonnx_ar_dii_espeak](https://huggingface.co/OpenVoiceOS/phoonnx_ar_dii_espeak) |

The three community voices were downloaded and run through the Piper build this skill installs (exit code 0, audio produced; I could not judge how they sound). The kareem voices come from the official catalog and were not run in this check. Customer onboarding videos are
normally commercial use, so only MIT and similar voices are shown by default.

## Found, not added

| Voice | Why not |
| --- | --- |
| [neurlang/piper-onnx-zayd0-arabic-diacritized](https://huggingface.co/neurlang/piper-onnx-zayd0-arabic-diacritized) (MIT) | Needs the `pygoruut` phonemizer and diacritized input. Piper's bundled espeak front end produces audio, but the phonemes do not match how it was trained, so the result is likely poor. Not verified by ear |
| [kimbolingo/arabic-piper-tts](https://huggingface.co/kimbolingo/arabic-piper-tts) | No licence stated; packaged for sherpa-onnx |
| `speaches-ai/piper-ar_JO-kareem-*`, `csukuangfj/vits-piper-ar_JO-*` | Re-uploads of voices already listed above |
| OpenVoiceOS `phoonnx_ar_miro_espeak` (v1) | Older version of miro v2, same non-commercial licence |

## Arabic voices that need a different engine (not supported by this skill yet)

These would require adding a second text-to-speech engine. Licences are from the Hugging Face model tags.

| Model | Notes | Licence |
| --- | --- | --- |
| [oddadmix/Nabra-82M-v0.1](https://huggingface.co/oddadmix/Nabra-82M-v0.1), [Nabra-Saudi-82M](https://huggingface.co/oddadmix/Nabra-Saudi-82M), Nabra-7M-Distill (+ ONNX), Nabra-Saudi-7M, [Egyptian 82M](https://huggingface.co/masterofaudio2077/Nabra-82M-Egyptian-da7ee7) | Kokoro-based Modern Standard, Saudi and Egyptian Arabic; expects diacritized text (needs a diacritizer step) | Apache-2.0 |
| [onnx-community/chatterbox-multilingual-ONNX](https://huggingface.co/onnx-community/chatterbox-multilingual-ONNX) | Multilingual including Arabic, voice cloning; heavy | MIT |
| [Supertone/supertonic-3](https://huggingface.co/Supertone/supertonic-3) | ONNX, multilingual, listed under Arabic on Hugging Face (Arabic coverage not verified) | OpenRAIL |
| F5-TTS family: [NAMAA Saudi](https://huggingface.co/NAMAA-Space/NAMAA-Saudi-TTS) (MIT), [NAMAA Saudi V2](https://huggingface.co/NAMAA-Space/NAMAA-Saudi-TTS-V2), [Egyptian](https://huggingface.co/MAdel121/f5-tts-egyptian-arabic), [Algerian Darja](https://huggingface.co/touati-kamel/f5tts-algerian-darja) | Dialect voices; GPU recommended | Mixed: MIT, Apache-2.0 and CC BY-NC |
| facebook/mms-tts-ara, MBZUAI speecht5 Arabic, Spark-TTS Arabic, Magpie Saudi | Research models | Non-commercial |

## Adding another Piper-compatible voice yourself

Add an entry to `scripts/engine/community-voices.json` (key, name, language, repo, `onnx` and `json` file names, size, licence, `commercial`
true or false, a sample sentence). It then appears in the dashboard and in `setup.mjs --voice=<key>`. Only add voices whose licence you have read.
