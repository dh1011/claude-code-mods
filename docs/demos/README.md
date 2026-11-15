# README previews

These are scripted demonstrations, not recordings of a live Claude Code session. The runner imports the real mod hooks, supplies fixed events, and saves their returned UI trees and command responses. The clipboard and clock are fixtures. It does not contact external services or change the system clipboard.

`copy-code.gif` is a VHS recording of a small terminal renderer. `inline-image.png` renders the real hook's returned image element with Pillow. The surrounding layout is illustrative and may differ from Claude Code's UI.

## Regenerate

You need Bun, Python with Pillow, VHS, ttyd and ffmpeg on your path. Run from the repository root:

```sh
python docs/demos/build.py
```

On systems where Python is named `python3`, use that instead. The builder supports Windows and POSIX shells. It checks the real button labels, copied text and PNG payload before recording. Intermediate fixtures and tape files go in the ignored `.generated` folder; final media goes in `docs/media`.

- `record.ts` imports the hooks and drives the fixtures, then renders the terminal demo.
- `build.py` draws the sample palette, renders the image preview, and invokes VHS.

The builder passes Bun's classic JSX flags explicitly, using the same `h` factory name as Claude Code.

The runner is deliberately limited to the events these demonstrations need. It is not a replacement for Claude Code's test engine or an end-to-end compatibility test.
