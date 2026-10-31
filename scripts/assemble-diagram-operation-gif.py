"""Assemble ordered real browser captures; holds are extended for readability."""
from pathlib import Path
from PIL import Image
import sys

root = Path(__file__).resolve().parents[1]
folder = root / (sys.argv[1] if len(sys.argv)>1 else "docs/test-evidence/diagram-checkpoint-c")
paths = sorted((folder / "gif-frames").glob("*.png"))
if len(paths) != 21:
    raise SystemExit(f"Expected 21 actual operation captures; got {len(paths)}")
frames = [Image.open(p).convert("RGB").quantize(colors=256) for p in paths]
durations = [650 if i in {0, 7, 13, 15, 17, 18, 20} else 160 for i in range(len(frames))]
frames[0].save(folder / "operations.gif", save_all=True, append_images=frames[1:],
               duration=durations, loop=0, disposal=2, optimize=False)
print(f"GIF: {len(paths)} captures, {sum(durations)} ms, {frames[0].size}")

review_paths=sorted((folder / "review-gif-frames").glob("*.png"))
if review_paths:
    review_frames=[Image.open(p).convert("RGB").quantize(colors=256) for p in review_paths]
    review_frames[0].save(folder / "review-repair.gif",save_all=True,append_images=review_frames[1:],duration=900,loop=0,disposal=2,optimize=False)
    print(f"Review GIF: {len(review_paths)} actual captures")
