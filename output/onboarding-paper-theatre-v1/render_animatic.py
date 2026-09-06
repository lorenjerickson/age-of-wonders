"""Render a silent timing animatic from the six-panel storyboard using FFmpeg.

This animates the camera over still art; it does not animate characters.
Run: python3 output/onboarding-paper-theatre-v1/render_animatic.py
Requires ffmpeg and ffprobe on PATH. No third-party Python packages.
"""
from pathlib import Path
import json
import subprocess

ROOT = Path(__file__).resolve().parent
SCENES = [
    "01-the-invitation",
    "02-the-hidden-route",
    "03-beyond-the-city",
    "04-the-field-experiment",
    "05-the-unfamiliar",
    "06-the-open-frontier",
]


def run(*args):
    subprocess.run(args, check=True)


def main():
    source = ROOT / "storyboard.png"
    metadata = json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "stream=width,height",
        "-of", "json", str(source),
    ]))["streams"][0]
    width, height = metadata["width"], metadata["height"]
    for i, name in enumerate(SCENES):
        col, row = i % 3, i // 3
        left, top = round(col * width / 3), round(row * height / 2)
        right, bottom = round((col + 1) * width / 3), round((row + 1) * height / 2)
        # Even crop dimensions for encoding; 12 camera poses/sec held at 24fps.
        cw, ch = (right - left) // 2 * 2, (bottom - top) // 2 * 2
        zoom = "1.055-on*0.00075" if i == 5 else "1.012+on*0.00075"
        filters = (
            f"crop={cw}:{ch}:{left}:{top},scale=1920:1080:flags=lanczos,"
            f"zoompan=z='{zoom}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2'"
            ":d=60:s=1280x720:fps=12,fps=24,setsar=1,format=yuv420p"
        )
        run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-i", str(source), "-vf", filters, "-t", "5", "-an",
            "-c:v", "libx264", "-preset", "medium", "-crf", "18",
            "-movflags", "+faststart", str(ROOT / f"{name}.mp4"))
        print(f"Rendered {name}", flush=True)
    manifest = ROOT / "clips.txt"
    manifest.write_text("".join(f"file '{name}.mp4'\n" for name in SCENES))
    run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "concat", "-safe", "0", "-i", str(manifest),
        "-c", "copy", "-movflags", "+faststart", str(ROOT / "onboarding-animatic.mp4"))
    print("Rendered onboarding-animatic.mp4", flush=True)


if __name__ == "__main__":
    main()
