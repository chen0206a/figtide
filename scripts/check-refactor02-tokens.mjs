import fs from "node:fs";
import { execFileSync } from "node:child_process";
import postcss from "../frontend/node_modules/postcss/lib/postcss.mjs";
// Run from the repository root. The optional argument selects the pre-migration ref.
const baseRef = process.argv[2] || "529ff1b";
const cssFiles = fs
  .readdirSync("frontend/src", { recursive: true })
  .filter((p) => p.endsWith(".css"))
  .map((p) => "frontend/src/" + p.replaceAll("\\", "/"));
const colors = new Set(
  cssFiles.flatMap((p) =>
    [...fs.readFileSync(p, "utf8").matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) =>
      m[0].toLowerCase(),
    ),
  ),
);
const previousColors = new Set();
const tokenSource = fs.readFileSync("frontend/src/styles/tokens.css", "utf8");
const colorToken = (name) =>
  tokenSource.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))[1];
const luminance = (hex) => {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};
const contrast = [];
const contrastPairs = [
  ...["--lf-text", "--lf-text-2", "--lf-text-3"].flatMap((text) =>
    ["--lf-surface", "--lf-bg"].map((surface) => [text, surface]),
  ),
  ["--lf-text-on-inverse", "--lf-inverse"],
  ["--lf-text-on-inverse-2", "--lf-inverse"],
];
for (const [text, surface] of contrastPairs) {
  const a = luminance(colorToken(text)),
    b = luminance(colorToken(surface));
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  if (ratio < 4.5) throw new Error("Token contrast below 4.5: " + text);
  contrast.push({ text, surface, ratio: Number(ratio.toFixed(2)) });
}
const layoutProp =
  /^(display|position|inset.*|top|bottom|left|right|width|height|min-width|max-width|min-height|max-height|padding.*|margin.*|gap|row-gap|column-gap|flex.*|grid.*|align.*|justify.*|order|overflow.*|box-sizing|border-radius|z-index|transform|animation.*|transition.*)$/;
function layout(source) {
  const result = {};
  postcss.parse(source).walkDecls((d) => {
    if (!layoutProp.test(d.prop)) return;
    const path = [];
    for (let n = d.parent; n && n.type !== "root"; n = n.parent)
      path.unshift(n.type === "rule" ? n.selector : `@${n.name} ${n.params}`);
    const key = path.join(" > ").replace(/\s+/g, " ").trim() + " | " + d.prop;
    (result[key] ||= []).push(d.value.replace(/\s+/g, " ").trim());
  });
  return result;
}
const checked = [];
for (const file of cssFiles.filter((p) => !p.includes("/styles/"))) {
  const previousSource = execFileSync("git", ["show", `${baseRef}:${file}`], {
    encoding: "utf8",
  });
  for (const match of previousSource.matchAll(/#[0-9a-fA-F]{6}\b/g))
    previousColors.add(match[0].toLowerCase());
  const before = layout(previousSource);
  const after = layout(fs.readFileSync(file, "utf8"));
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    const differences = [
      ...new Set([...Object.keys(before), ...Object.keys(after)]),
    ].filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
    throw new Error(
      "Changed layout declarations in " +
        file +
        ": " +
        JSON.stringify(differences),
    );
  }
  checked.push({
    file,
    declarations: Object.values(after).reduce((sum, v) => sum + v.length, 0),
  });
}
const report = {
  base_ref: baseRef,
  six_digit_colors_before: previousColors.size,
  six_digit_colors_after: colors.size,
  reduction_percent: Number(
    (((previousColors.size - colors.size) / previousColors.size) * 100).toFixed(
      1,
    ),
  ),
  text_contrast: contrast,
  unchanged_layout_declarations: checked,
};
fs.writeFileSync(
  "docs/test-evidence/refactor02-tokens.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
