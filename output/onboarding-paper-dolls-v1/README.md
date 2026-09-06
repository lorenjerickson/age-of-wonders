# Into the unknown

First animated segment for the Age of Wonders onboarding direction: a Victorian
field explorer enters a vast ravine, lifts a lantern, and meets a six-legged
creature with botanical antlers. Exploration and curiosity motivate the encounter.

## Deliverables

- `into-the-unknown.mp4`: 18-second silent H.264 video, 1280×720, 24 fps.
- `preview.html`: self-contained browser animation with pause/replay controls.
- `stage.html`: editable animation source.
- `puppet-atlas.png` and `ravine.png`: original generated illustration assets.
- `asset-prompts.txt`: exact prompts, generated using the built-in image tool.
- `render.cjs`: reproducible frame capture and FFmpeg export.

This is articulated animation, not a pan across storyboard stills. Separate arms,
forearms, thighs, boots, head, lantern, creature legs, head, antlers and tail move.
Eight distinct poses per second are held for three output frames each. Uneven
stepping, staggered movement, small registration changes and held reactions give
a deliberately jerky stop-motion effect. The camera remains fixed; no motion blur
or frame interpolation is used.

The generated atlas included a checkerboard rather than alpha. The animation
compositor mattes neutral checkerboard pixels while retaining warm paper edges.
The generated source images remain intact.

## Timing

| Time | Action |
| --- | --- |
| 0–6 seconds | Explorer enters along the paper trail; individual limbs articulate. |
| 4–8 seconds | The mutant creature walks in on six staggered legs. |
| 6.5–8.5 seconds | Explorer raises the lantern toward it. |
| 10–13 seconds | Creature lowers its head; antlers follow the head joint. |
| 14.5–18 seconds | Creature lifts its head and both settle into a held encounter. |

## Re-render

Run `node output/onboarding-paper-dolls-v1/render.cjs` from the repository root.
Requires Google Chrome, FFmpeg and Playwright. The renderer defaults to this
machine's bundled Node dependencies; set `AOW_NODE_MODULES` to a directory
containing Playwright on another machine. Use `--stills` to inspect four poses.
The renderer embeds the source images into preview.html for local playback.

This first clip covers exploration, Victorian expedition dress, field equipment
and mutant life. Society, academic research, industrial development and laboratory
experimentation remain additional segments from the earlier storyboard. No
application integration, audio or domain-model changes are included.

Verification: the MP4 decodes successfully as 432 frames at 24 fps for exactly
18 seconds. FFmpeg duplicate-frame removal retains 144 poses, confirming the
eight-pose-per-second cadence. Rendered poses were inspected and the creature's
antler attachment corrected before final export. The AI-facing domain guide
required no update because no domain contracts changed.
