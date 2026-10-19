"""PDF integration output QA (test dependency: PyMuPDF); run after delivery E2E."""
import json
import struct
from pathlib import Path
import pymupdf

root = Path(__file__).resolve().parents[1]
doc = pymupdf.open(root / "docs/exports/reusable-figure.pdf")
page = doc[0]
text = page.get_text()
assert len(doc) == 1
assert abs(page.rect.width / 72 * 25.4 - 89) < 0.01
assert "合成实验" in text and "α" in text
assert len(page.get_images()) == 0
assert len(page.get_drawings()) > 10
fonts = page.get_fonts()
assert fonts and all(doc.extract_font(f[0])[3] for f in fonts)
spans = [s for b in page.get_text("dict")["blocks"] if "lines" in b for line in b["lines"] for s in line["spans"]]
title = next(s for s in spans if "合成实验" in s["text"])
assert abs((title["bbox"][0] + title["bbox"][2]) / 2 - page.rect.width / 2) < 1, "Title anchor shifted from SVG"
page.get_pixmap(matrix=pymupdf.Matrix(4, 4)).save(root / "docs/exports/reusable-figure-pdf-preview.png")
evidence = {"pages": len(doc), "width_mm": page.rect.width / 72 * 25.4, "height_mm": page.rect.height / 72 * 25.4, "text": text, "images": len(page.get_images()), "paths": len(page.get_drawings()), "embedded_font_bytes": sum(len(doc.extract_font(f[0])[3]) for f in fonts), "title_center_error_pt": (title["bbox"][0]+title["bbox"][2])/2-page.rect.width/2}

heat = pymupdf.open(root / ".runtime/heatmap-vector.pdf")
assert len(heat) == 1 and len(heat[0].get_images()) == 0
assert "合成热力图" in heat[0].get_text() and "模型对比" in heat[0].get_text()
assert len(heat[0].get_drawings()) >= 4
def font_weight(data):
    count = struct.unpack_from(">H", data, 4)[0]
    for index in range(count):
        start = 12 + index * 16
        if data[start:start+4] == b"OS/2":
            offset = struct.unpack_from(">I", data, start + 8)[0]
            return struct.unpack_from(">H", data, offset + 4)[0]
    return None

assert any(font_weight(heat.extract_font(f[0])[3]) == 700 for f in heat[0].get_fonts())
heat[0].get_pixmap(matrix=pymupdf.Matrix(2,2)).save(root / ".runtime/heatmap-pdf-preview.png")
evidence["heatmap"] = {"text": heat[0].get_text(), "images": 0, "paths": len(heat[0].get_drawings()), "fonts": heat[0].get_fonts()}
evidence["heatmap"]["font_weights"] = [font_weight(heat.extract_font(f[0])[3]) for f in heat[0].get_fonts()]
multi=pymupdf.open(root / ".runtime/multiline-vector.pdf")
assert "第一行 ±" in multi[0].get_text() and "Second line" in multi[0].get_text()
for b in multi[0].get_text("dict")["blocks"]:
    if "lines" in b:
        for line in b["lines"]:
            box=line["bbox"]
            assert abs((box[0]+box[2])/2-multi[0].rect.width/2)<1, "Multiline anchor shifted"
evidence["multiline_converter_text"]=multi[0].get_text()
(root / "docs/test-evidence/batch8-pdf.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8")
print("PDF QA passed: Unicode, embedded fonts, vector paths, physical size and title alignment; bold multiline heatmap.")
