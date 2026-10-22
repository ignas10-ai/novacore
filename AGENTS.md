# AGENTS.md

NovaCore is a Lithuanian-language, single-file browser game: phone camera -> MediaPipe Pose -> squat/jack/high-knee counting for 1-2 players. Everything (HTML, CSS, inline module JS) lives in `index.html`. There is no `package.json`, bundler, or installed dependency; MediaPipe and fonts load from CDNs at runtime.

## Run and verify

- Camera requires a secure context: use `npx serve` and open `http://localhost:...`, or deploy over HTTPS (README uses Vercel). Opening `index.html` via `file://` will not work. Testing from a phone over LAN needs HTTPS.
- Only automated check: `node test-detect.cjs` (prints `OK`). Run it after changing `step()`, `armsUp()`, `highlightSegments()`, `clipSpec()`, `NEED`, landmark indices, or detection thresholds.
- There are no build, lint, typecheck, or formatter commands. Vercel deployment is static with no config in the repo; `.vercel` is ignored.

## Test harness constraint

`test-detect.cjs` reads `index.html`, slices from the literal `const EX=[` to `if(typeof module`, and evaluates that slice in Node via `new Function("module", ...)`. Keep both markers, keep `step` / `ang` / `armsUp` / `sideCue` / `highlightSegments` / `clipSpec` pure, and keep the sliced region free of top-level DOM access and `import` / `export`; otherwise the self-check breaks. Preserve the `if(typeof module!=="undefined") module.exports={step,ang,armsUp,sideCue,highlightSegments,clipSpec}` line.

## Detection and game logic

- `step(s, lm, ex, now)` is the pure per-player state machine (`st=[{},{}]`); `detect()` adds `score[i] += multiplier`.
- Before each game, `readyLoop()` gates the start: every selected player must have both wrists above the nose (`armsUp()`) continuously for `READY_MS=3000`, with a `READY_GRACE=300` ms tolerance for detection dropouts. This replaces the old 3-2-1 countdown.
- `NEED` lists landmarks that must be visible above `VIS=0.5`; otherwise `s.lost` stops reps and shows the "atsitrauk" hint.
- Tracking is camera-frame driven, not screen-refresh driven: `sampleCamera()` draws and infers only when `cam.currentTime` changes, lets inference follow the camera rate (target ~60 fps, `DETECT_TARGET=16`), and widens `detectGap` when a detection takes long so low-end phones keep rendering. Pose inference runs on `detCv`, a copy capped at 1280 px on its long side, so a 1080p preview does not force MediaPipe to upload a 1080p texture while 720p detection stays unchanged. Keep camera/pose work inside the fresh-frame branch of `loop()` / `readyLoop()`; HUD text and the progress bar are throttled separately (`lastHudSec`, `lastBarAt`).
- The camera is requested with `width/height/frameRate` ideal at **1920×1080 / 60 fps**. After `getUserMedia()`, `getSettings().frameRate` plus the video dimensions determine the real mode; the browser is allowed to fall back. `clipSpec(videoW,videoH,fps,portrait)` then picks the clip tier: 1080p60 (`1080×1920`/`1920×1080`), 1080p30, 720p60, or 720p30. The live canvas always uses the camera's native dimensions. Recording draws on fresh camera frames with `recFrameMs` (15 ms at 60 fps, 28 ms at 30 fps), and the skeleton is one batched `stroke()` per player, not one per bone; line width and the P label scale from the 720px short-side baseline so 1080p previews do not get hairline overlays.
- Adding an exercise touches four places: the `EX` table (the picker dialog renders its grid automatically from `EX`), `NEED`, a branch in `step()`, and cases in `test-detect.cjs` (plus an optional `DEMO` entry and SVG for the coach card).
- Poses are sorted by mirrored x (`1-lm[0].x`), so P1 is the leftmost player on screen. `numPoses` is fixed from the player count at start.
- Rounds are 30 s, multiplier is `1+round`, exercises cycle through the start-screen selection (`activeEX`, a non-empty subset of `EX`); duration is 180 s with a 60 s test option. `#exOpen` summarizes the choice and opens the native `#exSheet` dialog; its `#exGrid` is regenerated from `EX` on every open (for the staggered `zen-tile-in` animation). Selection is multi-select, keeps `activeEX` in sync, persists in `localStorage`, and refuses to deselect the last exercise (deny wobble + note warning).
- Post-game flow is `#end` (results) -> `#toClips` -> `#clips` (highlight video + one download menu for preview/full + Web Share button + back to start). `#dlToggle` opens `#dlMenu`; `#sharePrev` shares the preview `File` via `navigator.share` and falls back to a download.
- `startRec()` records an offscreen canvas that mirrors only the camera, so clips never contain skeleton lines. It sizes the recording from the actual camera mode via `clipSpec()`: `1080x1920`/`1920x1080` when the camera gives at least 1080p, otherwise `720x1280`/`1280x720`; fps follows the camera (60 fps when it reports at least 50). It center-crops with `drawRecordFrame()`; `makeHighlightClip()` reuses `recCv` dimensions plus the same `clipProfile` fps and bitrate, so never fall back to `cv.width/height` for clips.
- `REC_MIME` prefers MP4/H.264 level 4.2 (required for 1080p60), then lower H.264 levels, generic MP4, and finally WebM. Both the full recorder and the highlight recorder use the same MIME and `videoBitsPerSecond` from `clipProfile`; high-quality clips are intentionally much larger. Download names/extensions come from `REC_EXT`.
- `highlightSegments()` chooses the highest-scoring 4 s bins but reserves one bin for every selected exercise present (`ROUND_SECS=30`, exercise count passed as the fifth argument); `finish()` passes `activeEX.length`, so easy or excluded exercises cannot dominate the reel. The full clip is finalized in `finish()`; the preview replays the full blob into a second canvas for 15–30 s.
- Clicking Start shows `#loading` ("Kraunama") while camera/model initialize; it has a 700 ms minimum display and errors return to the start screen. Hide it only when `#ready` appears. Once the camera is negotiated, `#loadMsg` shows the actual mode (e.g. "Kamera 1080p · 60 fps") before the model finishes loading.
- `#demo` is the in-game exercise coach card, triggered from the round-change block via `showDemo(ex)`. `DEMO` now covers `squat`, `jack`, and `knees`. The SVGs use continuous CSS transforms on articulated groups (`.sq-*`, `.jj-*`, `.rn-*`) with `transform-box:view-box`, plus a floor plane; add a demo via a `DEMO` entry plus an SVG marked `data-ex`.
- `#demo` and `#hintCue` can be visible at the same time. The hint cue is placed above the demo card in portrait, and in phone landscape it becomes a compact row tucked below the demo card, so it never covers the exercise animation.
- Jumping-jack legs are one `.jj-legs` group scaled on X around the floor (`60px 132px`); feet stay planted while spreading. Do not reintroduce a root hop.
- Jumping-jack detection is strict on purpose: both arms must be above the head and swung outward, and both ankles must move outward from their own hip (`NEED` includes hips 23/24). A single stepping foot or hands-up-only motion must not count.
- `#readyBack` calls `backToSettings()`: stops the camera, cancels the readiness RAF and pending start timer, closes the landmarker, resets the ring/chips, and shows `#start` so settings can be changed before another Start.
- `keepScreenAwake()` requests the Screen Wake Lock when readiness starts and reacquires it on visibility changes. `releaseWakeLock()` must run on finish, back-to-settings, and startup errors; do not keep the lock on the results/clip screens.
- Prompt text (`#readyHint`, `#hint`) is now screen-reader-only; visible guidance is driven by `setCue()` into `#readyCue` / `#hintCue` with a bouncing arrow (`back`, `arms`, `left`, `right`). `sideCue()` checks core body points in mirrored screen space; keep the arrow direction and player labels in sync.
- If a player has not scored for ~5 s in a round, the current exercise demo is shown again once (`nudgedRound`, `IDLE_DEMO_SECS`). It may appear even while a movement cue is active.
- The fullscreen control hides itself when the Fullscreen API is missing and moves to the bottom-right while `body.playing` so it doesn't cover P2.

## Conventions

- User-facing copy is Lithuanian; keep new UI text Lithuanian.
- MediaPipe is pinned to `@mediapipe/tasks-vision@0.10.14` in both the import and `FilesetResolver`, plus the `pose_landmarker_lite/float16` model URL. Update version references together.
- Styling and design tokens live in `:root` in `index.html`; there are no separate CSS/JS assets.
