# Matchwise

A mobile-first second-screen companion that explains live soccer commentary, referee calls and crowd reactions to newcomers. Plain HTML/JS + Tailwind (CDN), no backend, no build step.

## Run

Serve the folder (Web Speech and the mic need `http://localhost` or HTTPS, not `file://`):

```bash
python3 -m http.server 8765
```

Open http://localhost:8765. Use Chrome or Safari for live transcription.

Gemini key: set `GEMINI_API_KEY` in `config.js`, or paste it in Settings (stored in localStorage). Without one, built-in cached explanations are used.

## Structure

- `index.html`, `styles.css`: shell and theme
- `config.js`: API key, model, sport id, batch interval
- `js/app.js`: screens (onboarding, quiz, result, listen, settings), Gemini pipeline, demo/live engine
- `js/sports/soccer.js`: all soccer knowledge (glossary, quiz, modes, demo script). Add another sport by adding a module with the same shape.

## Limitations

- The API key is client-side, so use a proxy for anything beyond a prototype.
- Crowd sound is inferred from loudness only (roar vs sustained singing). Real classification of chants would need audio ML, and raw audio is deliberately never stored or uploaded.
- Web Speech needs Chrome/Safari and an internet connection; it picks up TV audio only as well as the room mic allows.
- Offline fallback is cached cards for the demo and a glossary lookup for live mode; "Simple English" and language translation apply only to AI output (language is a preview stub).
- Quiz scoring is a simple heuristic.

## Commentary Simplifier (`translator/`)

Standalone page at `/translator/`. Press **Connect** to attach to a stream; for the demo it plays back a previous commentary sample (`sample-commentary.txt`) as if live. Each line is rewritten in plain words with the soccer jargon explained (Gemini if a key is set, otherwise the built-in glossary). Real livestream URLs aren't supported yet: that needs a backend that transcribes the broadcast.

The main app's **Connect** button works the same way (demo stream); "Use my microphone instead" keeps the mic option.
