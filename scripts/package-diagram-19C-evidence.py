"""Package an explicit viewport-only review set; never include model evaluation output."""
from pathlib import Path
from PIL import Image, ImageSequence
import hashlib
import json
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
phase = 'diagram-19-C-review2' if '--review2' in sys.argv else 'diagram-19-C'
folder = root / 'docs/test-evidence' / phase
output = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root / '.runtime/deliverables/figtide-19BC-visual-review-2026-11-02.zip'
names = [
    'new-page-1440.png', 'mechanism-1440.png', 'framework-1440.png',
    'review-panel.png', 'repair-preview.png', 'icon-library.png',
    'icon-export-attribution.png', 'reference-style.png', 'external-artwork.png',
    'drawio-export.png', 'operations.gif', 'review-repair.gif', 'assets-operations.gif',
    'agent-skill-selection.png', 'agent-facts.png', 'agent-structure-apply.png',
    'agent-applied.png', 'acceptance.json', 'VISUAL-PACKAGE.md',
    'okabe-ito-all-pairs.json', 'icon-loading-benchmark.json', 'exports/jak-stat.drawio',
    'exports/editor-mechanism.drawio',
]
if phase == 'diagram-19-C-review2':
    names = [
        'assistant-01-skill.png', 'assistant-02-facts.png', 'assistant-03-proposal.png',
        'assistant-03b-three-groups.png', 'assistant-04-fact-excluded.png',
        'assistant-05-ready.png', 'assistant-06-applied.png',
        'icons-grid-1-Lab_apparatus.png', 'icons-grid-2-Genetics.png',
        'icons-grid-3-Cell_types.png', 'icons-recognizable-inserted.png',
        'icons-thin-fitted.png', 'review-panel.png', 'repair-preview.png',
        'assistant-fact-selection.gif', 'acceptance.json', 'VISUAL-PACKAGE.md',
        'icon-loading-benchmark.json',
    ]
acceptance = json.loads((folder / 'acceptance.json').read_text(encoding='utf-8'))
if acceptance['date'] != '2026-11-02':
    raise SystemExit('Refusing to package an earlier acceptance record')
for name in names:
    path = folder / name
    if not path.is_file():
        raise SystemExit(f'Missing evidence: {name}')
    if path.suffix in {'.png', '.gif'}:
        with Image.open(path) as picture:
            if picture.size != (1440, 960):
                raise SystemExit(f'Not a 1440x960 viewport: {name} {picture.size}')
            if path.suffix == '.gif':
                if picture.n_frames < 2 or any(frame.size != (1440, 960) for frame in ImageSequence.Iterator(picture)):
                    raise SystemExit(f'Invalid operation animation: {name}')
hashes = '\n'.join(f'{hashlib.sha256((folder / name).read_bytes()).hexdigest()}  {name}' for name in names) + '\n'
(folder / 'VISUAL-SHA256SUMS.txt').write_text(hashes, encoding='utf-8', newline='\n')
output.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name in names + ['VISUAL-SHA256SUMS.txt']:
        archive.write(folder / name, phase + '/' + name)
with zipfile.ZipFile(output) as archive:
    if archive.testzip() is not None:
        raise SystemExit('ZIP integrity check failed')
print(json.dumps({'file': str(output), 'files': len(names) + 1, 'bytes': output.stat().st_size,
                  'sha256': hashlib.sha256(output.read_bytes()).hexdigest()}, ensure_ascii=False))
