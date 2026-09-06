# The signature of matter

Second Age of Wonders onboarding segment: hard-science discovery through an
illustrative flame-spectroscopy experiment. The returning paper explorer works
in a Victorian laboratory overlooking an expedition landscape.

## Deliverables

- `the-signature-of-matter.mp4`: silent 24-second H.264 video, 1280×720, 24 fps.
- `preview.html`: self-contained browser animation with pause and replay.
- `stage.html`: editable deterministic Canvas animation source.
- `render.cjs`: Playwright and FFmpeg renderer.
- `asset-prompts.txt`: exact background and apparatus prompts used with the
  built-in image-generation tool.
- `puppet-atlas.png`: the same original character artwork used in the first clip.
- `equipment-atlas.png` and `laboratory.png`: original generated art.

## Action

1. A continuous-light source passes through a collimator and prism.
2. The source is removed and the scientist introduces a mineral salt sample
   into a burner flame using a rigid sampling rod.
3. The sample produces a narrow yellow spectral feature.
4. A magnified paper comparison shows the sample and sodium reference aligned.
5. The scientist writes down the finding: sodium is present in the sample.

Motion uses eight distinct poses per second, each held for three export frames.
The articulated sampling arm and rod sit behind the torso, preserving the
layering correction from the first film. The notebook and writing arm are near-side
pieces. Flame cutouts, head movement, the sampling gesture and written marks
advance in held poses. There is no motion smoothing or camera pan.

## Scientific basis and visual conventions

The sodium D lines are approximately 588.995 and 589.5924 nm, rounded to 589.0
and 589.6 nm in the film. Source: [NIST, Persistent Lines of Neutral Sodium](https://physics.nist.gov/PhysRefData/Handbook/Tables/sodiumtable3.htm).

The main screen represents the nearby lines as one unresolved yellow feature;
the comparison sheet expands the 588–591 nm region so the doublet can be seen.
The comparison demonstrates matching a known element, not discovering a new one.
Light paths, source changes, instrument proportions and spectrum visibility are
schematic paper-theatre conventions, not a calibrated optical simulation or a
procedure for reproducing the experiment. The reference chart is a narrative
visualization of a recorded measurement, not a claimed real measurement.

## Rendering

Run `node output/onboarding-hard-science-v1/render.cjs` from the repository root.
Requires FFmpeg, Google Chrome and Playwright. Set `AOW_NODE_MODULES` to the
directory containing Playwright if not using this machine's bundled runtime.
Use `--stills` to render inspection poses. The script embeds the original artwork
into `preview.html` and renders 192 poses into a 576-frame export.

Source art is preserved intact. Background removal for the sprite atlases happens
inside the animation compositor. This output does not change application code or
domain contracts; the AI-facing domain guide requires no update.
