# Something beyond the glass

Third Age of Wonders onboarding segment: an indistinct Gothic horror threat in
a ruined Victorian conservatory. The returning expedition character approaches
frosted glazing, notices an uncertain presence, and backs away. The presence
withdraws from the window, while its detached floor shadow remains.

## Deliverables

- `something-beyond-the-glass.mp4`: silent, 28 seconds, H.264, 1280×720, 24 fps.
- `preview.html`: self-contained animated browser preview with pause/replay.
- `stage.html`: editable deterministic Canvas animation.
- `render.cjs`: reproducible Playwright/FFmpeg export.
- `conservatory.png`: original background art generated with the built-in image tool.
- `asset-prompt.txt`: exact background generation prompt.
- `puppet-atlas.png`: original artwork reused from the first segment.

The silhouette combines the existing geological and botanical paper cutouts
inside the animation compositor. It has no face, eyes or definite anatomy.
Multiply compositing preserves the frosted-paper texture and iron mullions;
slight blur places the mass behind the glass rather than on its surface.

## Timing and motion

| Time | Action |
| --- | --- |
| 0–6 seconds | Explorer enters the conservatory and pauses. |
| 6.6–9 seconds | Lantern rises toward the empty window. |
| 8.6–15 seconds | A large uncertain shape shifts behind the frosted glazing. |
| 12.25 and 16.5 seconds | Brief localized reductions in lantern light. |
| 15–20 seconds | The floor shadow advances as the explorer recoils and steps back. |
| 22–24 seconds | The presence withdraws from the window. |
| 24–28 seconds | The detached shadow remains; the explorer holds still. |

Eight held poses per second, exported at 24 fps. The explorer's limbs articulate;
the shadow advances in a slower, staggered cadence. The lantern and its supporting
arm stay behind the torso and near-side leg, preserving the earlier layering fixes.
The camera remains fixed. No captions, audio, gore, explicit monster reveal or
full-screen flash is included.

## Re-render

Run `node output/onboarding-gothic-horror-v1/render.cjs` from the repository root.
Requires FFmpeg, Google Chrome and Playwright. Set `AOW_NODE_MODULES` to the
directory containing Playwright to override the local bundled dependencies.
Use `--stills` for four inspection poses. The render contains 224 held poses and
672 output frames. Source art is embedded into the generated browser preview.

This is a standalone film asset. Application code and domain contracts are
unchanged; no AI-facing domain-model guide update is required.
