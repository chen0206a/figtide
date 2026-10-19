"""Reproducible build-time font preparation; never called by the running app."""
import hashlib
import json
import sys
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset

source = Path(sys.argv[1])
expected = "a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da"
if hashlib.sha256(source.read_bytes()).hexdigest() != expected:
    raise SystemExit("Source font fingerprint differs; review the new font and license first.")
out = Path(__file__).resolve().parents[1] / "frontend/public/fonts"
for weight, name in [(400, "Regular"), (700, "Bold")]:
    font = instantiateVariableFont(TTFont(source), {"wght": weight}, inplace=True)
    options = subset.Options()
    options.name_IDs = ["*"]
    options.name_legacy = True
    sub = subset.Subsetter(options=options)
    sub.populate(unicodes=range(65536))
    sub.subset(font)
    # Keep the original timestamps so builds do not depend on wall clock time.
    font.recalcTimestamp = False
    font.save(out / f"NotoSansSC-{name}.ttf")
    if weight == 400:
        ranges = []
        for code in sorted(font.getBestCmap()):
            if not ranges or code > ranges[-1][1] + 1:
                ranges.append([code, code])
            else:
                ranges[-1][1] = code
        (out / "noto-glyphs.json").write_text(json.dumps(ranges), encoding="utf-8")
