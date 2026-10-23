const fs = require("fs"),
  path = require("path");
const root = path.resolve(__dirname, ".."),
  src = path.join(root, "frontend/src");
const files = fs
  .readdirSync(src, { recursive: true })
  .filter((f) => f.endsWith(".css"))
  .map((f) => "frontend/src/" + f.replaceAll("\\", "/"))
  .sort();
const rows = files.map((file) => {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  return {
    file,
    lines: (text.match(/\n/g) || []).length,
    colors: [
      ...new Set(
        [...text.matchAll(/#[\da-f]{6}\b/gi)].map((m) => m[0].toLowerCase()),
      ),
    ],
    important: (text.match(/!important/g) || []).length,
  };
});
const sourceFiles = fs
  .readdirSync(src, { recursive: true })
  .filter((f) => /\.(css|tsx?)$/.test(f));
const forbidden = [];
for (const file of sourceFiles) {
  const lines = fs.readFileSync(path.join(src, file), "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    if (/refined-shell|font-serif|Newsreader|launch-/.test(line))
      forbidden.push({ file, line: i + 1 });
  });
}
const report = {
  files: rows.length,
  lines: rows.reduce((n, r) => n + r.lines, 0),
  six_digit_colors: [...new Set(rows.flatMap((r) => r.colors))].length,
  important: rows.reduce((n, r) => n + r.important, 0),
  serif_reference_lines: forbidden.filter((r) =>
    /font-serif|Newsreader/.test(
      fs.readFileSync(path.join(src, r.file), "utf8").split(/\r?\n/)[
        r.line - 1
      ],
    ),
  ).length,
  forbidden_reference_lines: forbidden,
  details: rows,
};
const output =
  process.argv[2] || "docs/test-evidence/refactor08-css-after.json";
const resolved = path.resolve(root, output);
if (!resolved.startsWith(root + path.sep))
  throw Error("Report must stay inside the repository");
fs.writeFileSync(resolved, JSON.stringify(report, null, 2) + "\n");
if (forbidden.length || report.six_digit_colors >= 120 || report.important >= 5)
  throw Error("CSS cleanup targets not met");
console.log(
  JSON.stringify({
    files: report.files,
    lines: report.lines,
    six_digit_colors: report.six_digit_colors,
    important: report.important,
    serif_reference_lines: report.serif_reference_lines,
    forbidden_reference_lines: forbidden.length,
  }),
);
