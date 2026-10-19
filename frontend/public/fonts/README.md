# Local PDF fonts

Noto Sans SC, copyright Adobe, licensed under SIL Open Font License 1.1. The full license is in `OFL-NotoSansSC.txt`. No font is fetched from the internet at application runtime.

Source: https://github.com/google/fonts/tree/main/ofl/notosanssc

The downloaded `NotoSansSC[wght].ttf` SHA-256 was `a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da` (2026-10-19). The checked-in files are static instances at weight 400 and 700, subset to Unicode BMP with fontTools 4.55.3. Reserved name in the upstream license: Source. Noto name is retained; no endorsement is claimed.

To reproduce from a separately downloaded source font matching that fingerprint, install fontTools (build-time only), then run from the repository root:

```powershell
python scripts/prepare-pdf-fonts.py .runtime/NotoSansSC-variable.ttf
```

The glyph coverage index is used to reject unsupported characters rather than silently export missing glyphs. The app uses these exact fonts for both browser plotting and embedded PDF text. PDF export requires explicitly selecting Noto Sans SC; other fonts remain supported for SVG/PNG. The PDF libraries jsPDF and svg2pdf.js are MIT licensed and loaded only on demand.
