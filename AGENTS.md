# AGENTS.md

NovaCore is a Lithuanian-language, single-file browser game: phone camera -> MediaPipe Pose -> squat/jack/high-knee counting for 1-2 players. Everything (HTML, CSS, inline module JS) lives in `index.html`. There is no `package.json`, bundler, or installed dependency; MediaPipe and fonts load from CDNs at runtime.

## Run and verify

- Camera requires a secure context: use `npx serve` and open `http://localhost:...`, or deploy over HTTPS (README uses Vercel). Opening `index.html` via `file://` will not work. Testing from a phone over LAN needs HTTPS.
- Only automated check: `node test-detect.cjs` (prints `OK`). Run it after changing `step()`, `armsUp()`, `highlightSegments()`, `NEED`, landmark indices, or detection thresholds.
- There are no build, lint, typecheck, or formatter commands. Vercel deployment is static with no config in the repo; `.vercel` is ignored.

## Test harness constraint

`test-detect.cjs` reads `index.html`, slices from the literal `const EX=[` to `if(typeof module`, and evaluates that slice in Node via `new Function("module", ...)`. Keep both markers, keep `step` / `ang` / `armsUp` / `sideCue` / `highlightSegments` pure, and keep the sliced region free of top-level DOM access and `import` / `export`; otherwise the self-check breaks. Preserve the `if(typeof module!=="undefined") module.exports={step,ang,armsUp,sideCue,highlightSegments}` line.

## Detection and game logic

- `step(s, lm, ex, now)` is the pure per-player state machine (`st=[{},{}]`); `detect()` adds `score[i] += multiplier`.
- Before each game, `readyLoop()` gates the start: every selected player must have both wrists above the nose (`armsUp()`) continuously for `READY_MS=3000`, with a `READY_GRACE=300` ms tolerance for detection dropouts. This replaces the old 3-2-1 countdown.
- `NEED` lists landmarks that must be visible above `VIS=0.5`; otherwise `s.lost` stops reps and shows the "atsitrauk" hint.
- Adding an exercise touches four places: the `EX` table, `NEED`, a branch in `step()`, and cases in `test-detect.cjs`.
- Poses are sorted by mirrored x (`1-lm[0].x`), so P1 is the leftmost player on screen. `numPoses` is fixed from the player count at start.
- Rounds are 30 s, multiplier is `1+round`, exercises cycle through `EX`; duration is 180 s with a 60 s test option.
- Post-game flow is `#end` (results) -> `#toClips` -> `#clips` (highlight video + one download menu for preview/full + Web Share button + back to start). `#dlToggle` opens `#dlMenu`; `#sharePrev` shares the preview `File` via `navigator.share` and falls back to a download.
- `startRec()` records an offscreen canvas that mirrors only the camera, so clips never contain skeleton lines. It sizes the recording by game orientation (`720x1280` portrait / `1280x720` landscape) and center-crops the camera with `drawRecordFrame()`; `makeHighlightClip()` reuses those dimensions, so never fall back to `cv.width/height` for clips.
- `REC_MIME` prefers `video/mp4` (AVC1) and only falls back to WebM when MP4 recording is unavailable; download names/extensions come from `REC_EXT`. Keep the full and preview recorder on the same MIME.
- `highlightSegments()` chooses the highest-scoring 4 s bins but reserves one bin for every exercise present (`ROUND_SECS=30`, `EX.length`), so easy exercises cannot dominate the reel. The full clip is finalized in `finish()`; the preview replays the full blob into a second canvas for 15–30 s.
- Clicking Start shows `#loading` ("Kraunama") while camera/model initialize; it has a 700 ms minimum display and errors return to the start screen. Hide it only when `#ready` appears.
- `#demo` is the in-game exercise coach card, triggered from the round-change block via `showDemo(ex)`. `DEMO` now covers `squat`, `jack`, and `knees`. The SVGs use continuous CSS transforms on articulated groups (`.sq-*`, `.jj-*`, `.rn-*`) with `transform-box:view-box`, plus a floor plane; add a demo via a `DEMO` entry plus an SVG marked `data-ex`.
- Jumping-jack legs are one `.jj-legs` group scaled on X around the floor (`60px 132px`); feet stay planted while spreading. Do not reintroduce a root hop.
- Jumping-jack detection is strict on purpose: both arms must be above the head and swung outward, and both ankles must move outward from their own hip (`NEED` includes hips 23/24). A single stepping foot or hands-up-only motion must not count.
- `#readyBack` calls `backToSettings()`: stops the camera, cancels the readiness RAF and pending start timer, closes the landmarker, resets the ring/chips, and shows `#start` so settings can be changed before another Start.
- `keepScreenAwake()` requests the Screen Wake Lock when readiness starts and reacquires it on visibility changes. `releaseWakeLock()` must run on finish, back-to-settings, and startup errors; do not keep the lock on the results/clip screens.
- Prompt text (`#readyHint`, `#hint`) is now screen-reader-only; visible guidance is driven by `setCue()` into `#readyCue` / `#hintCue` with a bouncing arrow (`back`, `arms`, `left`, `right`). `sideCue()` checks core body points in mirrored screen space; keep the arrow direction and player labels in sync.
- If a player has not scored for ~9 s in a round, the current exercise demo is shown again once (`nudgedRound`). It is suppressed while a movement cue is active.
- The fullscreen control hides itself when the Fullscreen API is missing and moves to the bottom-right while `body.playing` so it doesn't cover P2.

## Conventions

- User-facing copy is Lithuanian; keep new UI text Lithuanian.
- MediaPipe is pinned to `@mediapipe/tasks-vision@0.10.14` in both the import and `FilesetResolver`, plus the `pose_landmarker_lite/float16` model URL. Update version references together.
- Styling and design tokens live in `:root` in `index.html`; there are no separate CSS/JS assets.
