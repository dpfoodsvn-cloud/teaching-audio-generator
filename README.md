# Teaching Audio Generator v5.3

A multi-speaker TTS batch processor for EFL/ESL teachers and content creators, built with React + Vite + FastAPI + Microsoft Edge TTS.

## ✨ What's New in v5.3 — Inline Emotion Tags

Write voice directions directly in your scripts using [tag] prefixes:

`
Teacher: [cheerful] Good morning, class!
Student A: [confused] Wait, what page are we on?
Narrator: [whisper] Don't tell anyone, but this will be on the test.
Teacher: [slow] Let... me... repeat... that.
`

Tags are stripped from the UI display and auto-converted to Microsoft SSML <mstts:express-as> directives at generation time. No XML knowledge required.

### Supported Tags

| Tag | Effect |
|-----|--------|
| [cheerful] | Upbeat, bright tone |
| [excited] | High energy |
| [serious] | Neutral, authoritative |
| [sad] | Slower, lower register |
| [angry] | Forceful, emphatic |
| [whisper] | Quiet, breathy |
| [hopeful] | Warm, forward-looking |
| [terrified] | Tense, alarmed |
| [slow] | Reduced speaking pace |
| [fast] | Increased speaking pace |

> Best results with en-US-AriaNeural and en-US-JennyNeural.

---

## Features

- **Batch mode** — Upload or paste multi-segment scripts, get a ZIP of individually named WAV files
- **Single mode** — Generate one segment with custom voice mapping
- **Multi-engine** — Edge TTS (free), Browser TTS (free), OpenAI, ElevenLabs, Google Gemini
- **Dialect filter** — Choose en-US, en-GB, en-AU, en-IN to control accent pool
- **Per-speaker fine-tuning** — Pitch (±50Hz) and Rate (±30%) sliders per speaker
- **Smart parsing** — Detects SCRIPT ID, SECTION, SPEAKERS headers, speaker genders
- **Symbol sanitizer** — Strips directional arrows (↗ ↑) to prevent awkward TTS readings
- **SSML passthrough** — Backend monkey-patches edge-tts to allow full SSML support

---

## Quick Start

### 1. Install dependencies

`ash
npm install
pip install fastapi uvicorn edge-tts
`

### 2. Start the TTS backend

`ash
python tts_server.py
`

Runs on http://localhost:5000

### 3. Start the frontend

`ash
npm run dev
`

Runs on http://localhost:5173

---

## Script Format

### Standard Format (SCRIPT ID headers)

`
SCRIPT ID: WB_E9_U12_LIST_01
SECTION: Unit 12
NAME: Listening Practice
DURATION: 90s
SPEAKERS: 2 (Teacher, Female; Student, Male)
---
Teacher: [cheerful] Good morning everyone!
Student: Hello, teacher!
`

### Simple Format (Audio N: headers)

`
Audio 1: Introduction
Speaker A: Welcome to today's lesson.
Speaker B: Thank you!
`

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Vanilla CSS (dark mode) |
| Backend | FastAPI + Python |
| TTS Engine | Microsoft Edge TTS (edge-tts) |
| Audio | JSZip, Web Audio API |
| Docs | DOCX via mammoth, PDF via pdf.js |

---

## Version History

| Version | Highlights |
|---------|-----------|
| v5.3 | Inline emotion tags [cheerful], [whisper], etc. |
| v5.2 | Round-robin voice diversity, per-speaker pitch/rate sliders, dialect filter |
| v5.1 | ZIP batch download, unit-named files, gender parsing fix |
| v5.0 | Multi-engine architecture, batch + single modes |

---

## License

MIT
