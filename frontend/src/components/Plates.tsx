/**
 * Publication-style figure plates.
 *
 * Hand-built SVG so the home page shows real "journal grade" typography
 * without bundling copyrighted figures. Conventions follow Nature's figure
 * guidance (89 mm single / 183 mm double column, 5–7 pt Arial/Helvetica,
 * panel letters, Okabe–Ito colour-blind-safe palette) and the layout habits
 * of Science / NeurIPS figures.
 *
 * All numbers come from the synthetic demo dataset (samples/*.csv) or are
 * clearly labelled synthetic examples.
 */

const W = 320;
const H = 208;
const PAD = { l: 38, r: 12, t: 14, b: 30 };

export const INK = "#1c1a17";
export const MUTED = "#6f6a60";
const RULE = "#e6e0d4";

/** Okabe–Ito colour-blind-safe palette (as recommended by Nature). */
const OI = {
  blue: "#0072b2",
  orange: "#e69f00",
  green: "#009e73",
  vermillion: "#d55e00",
  sky: "#56b4e9",
  purple: "#cc79a7",
  yellow: "#f0e442",
};

const x = (v: number, min: number, max: number) =>
  PAD.l + ((v - min) / (max - min)) * (W - PAD.l - PAD.r);
const y = (v: number, min: number, max: number) =>
  H - PAD.b - ((v - min) / (max - min)) * (H - PAD.t - PAD.b);

const path = (pts: [number, number][]) =>
  pts.map(([a, b], i) => `${i ? "L" : "M"}${a.toFixed(1)} ${b.toFixed(1)}`).join(" ");

const epochs = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60];
const baseline = [54.2, 65.7, 73.5, 78.2, 81.4, 83.3, 84.6, 85.5, 86.2, 86.6, 86.9, 87.1];
const proposed = [55.1, 68.4, 78.6, 83.9, 87.2, 89.1, 90.4, 91.3, 91.8, 92.2, 92.5, 92.8];
const ablation = [53.8, 63.9, 70.8, 76.1, 79.3, 81.2, 82.4, 83.1, 83.7, 84.1, 84.3, 84.6];
const spread = [1.8, 1.5, 1.3, 1.1, 0.9, 0.8, 0.7, 0.6, 0.6, 0.5, 0.5, 0.4];

function Frame({
  letter,
  xlab,
  ylab,
  xTicks,
  yTicks,
  xMin,
  xMax,
  yMin,
  yMax,
  children,
  right,
}: {
  letter?: string;
  xlab: string;
  ylab: string;
  xTicks: number[];
  yTicks: number[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  children: React.ReactNode;
  right?: number;
}) {
  const r = right ?? PAD.r;
  return (
    <>
      <rect x={0} y={0} width={W} height={H} fill="#fffefb" />
      {letter && (
        <text x={6} y={12} fontFamily="Inter, Helvetica, Arial" fontWeight={700} fontSize={8.5} fill={INK}>
          {letter}
        </text>
      )}
      {yTicks.map((t) => {
        const yy = y(t, yMin, yMax);
        return (
          <g key={`y${t}`}>
            <line x1={PAD.l - 3} x2={PAD.l} y1={yy} y2={yy} stroke={INK} strokeWidth={0.7} />
            <text
              x={PAD.l - 6}
              y={yy + 1.8}
              textAnchor="end"
              fontFamily="Inter, Helvetica, Arial"
              fontSize={5.6}
              fill={MUTED}
            >
              {t}
            </text>
          </g>
        );
      })}
      {xTicks.map((t) => {
        const xx = x(t, xMin, xMax);
        return (
          <g key={`x${t}`}>
            <line x1={xx} x2={xx} y1={H - PAD.b} y2={H - PAD.b + 3} stroke={INK} strokeWidth={0.7} />
            <text
              x={xx}
              y={H - PAD.b + 11}
              textAnchor="middle"
              fontFamily="Inter, Helvetica, Arial"
              fontSize={5.6}
              fill={MUTED}
            >
              {t}
            </text>
          </g>
        );
      })}
      <line x1={PAD.l} x2={W - r} y1={H - PAD.b} y2={H - PAD.b} stroke={INK} strokeWidth={0.8} />
      <line x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={H - PAD.b} stroke={INK} strokeWidth={0.8} />
      <text
        x={(PAD.l + W - r) / 2}
        y={H - 6}
        textAnchor="middle"
        fontFamily="Inter, Helvetica, Arial"
        fontSize={6}
        fill={INK}
      >
        {xlab}
      </text>
      <text
        transform={`translate(11 ${(PAD.t + H - PAD.b) / 2}) rotate(-90)`}
        textAnchor="middle"
        fontFamily="Inter, Helvetica, Arial"
        fontSize={6}
        fill={INK}
      >
        {ylab}
      </text>
      {children}
    </>
  );
}

function Legend({ items, x0, y0 }: { items: [string, string][]; x0: number; y0: number }) {
  let cx = x0;
  return (
    <g>
      {items.map(([label, colour]) => {
        const g = (
          <g key={label}>
            <line x1={cx} x2={cx + 9} y1={y0} y2={y0} stroke={colour} strokeWidth={1.2} />
            <circle cx={cx + 4.5} cy={y0} r={1.5} fill={colour} />
            <text x={cx + 12} y={y0 + 2} fontFamily="Inter, Helvetica, Arial" fontSize={5.4} fill={MUTED}>
              {label}
            </text>
          </g>
        );
        cx += 13 + label.length * 3.1;
        return g;
      })}
    </g>
  );
}

/* ---------------- Plate 1 · line, single column (Nature) ---------------- */
function PlateLine() {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Training dynamics line chart">
      <Frame
        letter="a"
        xlab="Training epoch"
        ylab="Test accuracy (%)"
        xTicks={[1, 20, 40, 60]}
        yTicks={[50, 60, 70, 80, 90, 100]}
        xMin={0}
        xMax={62}
        yMin={50}
        yMax={100}
      >
        <Legend
          items={[
            ["Baseline", OI.blue],
            ["Proposed", OI.vermillion],
            ["Ablation", OI.green],
          ]}
          x0={PAD.l + 6}
          y0={PAD.t + 6}
        />
        {[
          [baseline, OI.blue],
          [proposed, OI.vermillion],
          [ablation, OI.green],
        ].map(([series, colour]) => {
          const s = series as number[];
          return (
            <g key={colour as string}>
              <path
                d={path(s.map((v, i) => [x(epochs[i], 0, 62), y(v, 50, 100)]))}
                fill="none"
                stroke={colour as string}
                strokeWidth={1.15}
                strokeLinejoin="round"
              />
              {s.map((v, i) => (
                <circle key={i} cx={x(epochs[i], 0, 62)} cy={y(v, 50, 100)} r={1.15} fill={colour as string} />
              ))}
            </g>
          );
        })}
        <g opacity={0.55}>
          {epochs.map((e, i) => (
            <line
              key={e}
              x1={x(e, 0, 62)}
              x2={x(e, 0, 62)}
              y1={y(baseline[i] + spread[i], 50, 100)}
              y2={y(baseline[i] - spread[i], 50, 100)}
              stroke={OI.blue}
              strokeWidth={0.5}
            />
          ))}
        </g>
      </Frame>
    </svg>
  );
}

/* ---------------- Plate 2 · grouped bars + error bars (Science) ---------------- */
function PlateBars() {
  const groups = ["CIFAR-10", "CIFAR-100", "Tiny-IN"];
  const data: [number, number][] = [
    [87.1, 1.4],
    [62.5, 2.1],
    [52.1, 2.6],
  ];
  const data2: [number, number][] = [
    [92.8, 1.1],
    [70.4, 1.9],
    [59.3, 2.2],
  ];
  const band = 34;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Ablation grouped bar chart">
      <Frame
        letter="b"
        xlab=""
        ylab="Accuracy (%)"
        xTicks={[]}
        yTicks={[0, 25, 50, 75, 100]}
        xMin={0}
        xMax={1}
        yMin={0}
        yMax={100}
      >
        <Legend
          items={[
            ["Baseline", OI.blue],
            ["Proposed", OI.sky],
          ]}
          x0={PAD.l + 6}
          y0={PAD.t + 6}
        />
        {groups.map((g, i) => {
          const cx = PAD.l + band / 2 + 12 + i * band;
          const barW = 9;
          const items: [number, number, string][] = [
            [data[i][0], data[i][1], OI.blue],
            [data2[i][0], data2[i][1], OI.sky],
          ];
          return (
            <g key={g}>
              {items.map(([v, err, colour], j) => {
                const left = cx - barW - 1 + j * (barW + 2);
                const top = y(v, 0, 100);
                return (
                  <g key={j}>
                    <rect x={left} y={top} width={barW} height={H - PAD.b - top} fill={colour} />
                    <line x1={left + barW / 2} x2={left + barW / 2} y1={y(v + err, 0, 100)} y2={y(v - err, 0, 100)} stroke={INK} strokeWidth={0.6} />
                    <line x1={left + barW / 2 - 2.4} x2={left + barW / 2 + 2.4} y1={y(v + err, 0, 100)} y2={y(v + err, 0, 100)} stroke={INK} strokeWidth={0.6} />
                    <line x1={left + barW / 2 - 2.4} x2={left + barW / 2 + 2.4} y1={y(v - err, 0, 100)} y2={y(v - err, 0, 100)} stroke={INK} strokeWidth={0.6} />
                  </g>
                );
              })}
              <text x={cx} y={H - PAD.b + 11} textAnchor="middle" fontFamily="Inter, Helvetica, Arial" fontSize={5.2} fill={MUTED}>
                {g}
              </text>
            </g>
          );
        })}
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 6} textAnchor="middle" fontFamily="Inter, Helvetica, Arial" fontSize={6} fill={INK}>
          Evaluation dataset
        </text>
      </Frame>
    </svg>
  );
}

/* ---------------- Plate 3 · heatmap (Cell) ---------------- */
function PlateHeat() {
  const rows = ["Proposed", "Baseline", "Ablation"];
  const cols = ["CIFAR-10", "CIFAR-100", "Tiny-IN"];
  const values = [
    [92.8, 70.4, 59.3],
    [87.1, 62.5, 52.1],
    [84.6, 59.2, 48.7],
  ];
  const cw = 66;
  const ch = 42;
  const x0 = 64;
  const y0 = 30;
  const tint = (v: number) => {
    const t = Math.max(0, Math.min(1, (v - 45) / 50));
    const stops = ["#fbf3e8", "#e9bda4", "#c2643f", "#7c3a24"];
    const pos = t * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(pos));
    const f = pos - i;
    const hex = (s: string) => [1, 3, 5].map((k) => parseInt(s.slice(k, k + 2), 16));
    const a = hex(stops[i]);
    const b = hex(stops[i + 1]);
    const c = a.map((v0, k) => Math.round(v0 + (b[k] - v0) * f));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cross-dataset accuracy heatmap">
      <rect x={0} y={0} width={W} height={H} fill="#fffefb" />
      <text x={6} y={12} fontFamily="Inter, Helvetica, Arial" fontWeight={700} fontSize={8.5} fill={INK}>
        c
      </text>
      {values.map((row, r) =>
        row.map((v, c) => (
          <g key={`${r}-${c}`}>
            <rect x={x0 + c * cw} y={y0 + r * ch} width={cw - 2} height={ch - 2} fill={tint(v)} />
            <text
              x={x0 + c * cw + (cw - 2) / 2}
              y={y0 + r * ch + ch / 2 + 1.5}
              textAnchor="middle"
              fontFamily="Inter, Helvetica, Arial"
              fontSize={7}
              fill={v > 68 ? "#fffefb" : INK}
            >
              {v.toFixed(1)}
            </text>
          </g>
        )),
      )}
      {rows.map((r, i) => (
        <text
          key={r}
          x={x0 - 7}
          y={y0 + i * ch + ch / 2 + 2}
          textAnchor="end"
          fontFamily="Inter, Helvetica, Arial"
          fontSize={6}
          fill={MUTED}
        >
          {r}
        </text>
      ))}
      {cols.map((c, i) => (
        <text
          key={c}
          x={x0 + i * cw + (cw - 2) / 2}
          y={y0 - 7}
          textAnchor="middle"
          fontFamily="Inter, Helvetica, Arial"
          fontSize={6}
          fill={MUTED}
        >
          {c}
        </text>
      ))}
      <text x={(x0 + x0 + 3 * cw) / 2} y={H - 22} textAnchor="middle" fontFamily="Inter, Helvetica, Arial" fontSize={6.2} fill={INK}>
        Evaluation dataset
      </text>
      <text x={(x0 + x0 + 3 * cw) / 2} y={H - 8} textAnchor="middle" fontFamily="Inter, Helvetica, Arial" fontSize={6.2} fill={INK}>
        Accuracy (%)
      </text>
      <g>
        <rect x={x0 + 3 * cw + 8} y={y0} width={11} height={3 * ch - 2} fill="url(#heatScale)" />
        {[45, 70, 95].map((v, i) => (
          <text
            key={v}
            x={x0 + 3 * cw + 24}
            y={y0 + (3 * ch - 2) - (i * (3 * ch - 2)) / 2 + 2}
            fontFamily="Inter, Helvetica, Arial"
            fontSize={5.4}
            fill={MUTED}
          >
            {v}
          </text>
        ))}
        <defs>
          <linearGradient id="heatScale" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor={tint(45)} />
            <stop offset="0.5" stopColor={tint(70)} />
            <stop offset="1" stopColor={tint(95)} />
          </linearGradient>
        </defs>
      </g>
    </svg>
  );
}

/* ---------------- Plate 4 · scatter + fit (NeurIPS) ---------------- */
function PlateScatter() {
  const pts: [number, number][] = [
    [12, 62.1],
    [18, 66.4],
    [24, 68.2],
    [31, 71.9],
    [38, 73.4],
    [45, 76.8],
    [52, 78.1],
    [58, 80.6],
    [66, 82.2],
    [74, 84.7],
    [81, 86.1],
    [90, 88.4],
  ];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const n = pts.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const sxy = xs.reduce((a, v, i) => a + (v - mx) * (ys[i] - my), 0);
  const sxx = xs.reduce((a, v) => a + (v - mx) ** 2, 0);
  const slope = sxy / sxx;
  const icpt = my - slope * mx;
  const f = (v: number) => icpt + slope * v;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Accuracy versus parameter scatter with fit">
      <Frame
        letter="d"
        xlab="Parameters (M)"
        ylab="Accuracy (%)"
        xTicks={[0, 25, 50, 75, 100]}
        yTicks={[55, 65, 75, 85, 95]}
        xMin={0}
        xMax={100}
        yMin={55}
        yMax={95}
      >
        <path
          d={`M${x(4, 0, 100)} ${y(f(4) + 2.6, 55, 95)} L${x(96, 0, 100)} ${y(f(96) + 2.6, 55, 95)} L${x(96, 0, 100)} ${y(f(96) - 2.6, 55, 95)} L${x(4, 0, 100)} ${y(f(4) - 2.6, 55, 95)} Z`}
          fill={OI.blue}
          opacity={0.1}
        />
        <line x1={x(4, 0, 100)} y1={y(f(4), 55, 95)} x2={x(96, 0, 100)} y2={y(f(96), 55, 95)} stroke={OI.blue} strokeWidth={1} />
        {pts.map(([a, b]) => (
          <circle key={a} cx={x(a, 0, 100)} cy={y(b, 55, 95)} r={1.9} fill="#fffefb" stroke={INK} strokeWidth={0.8} />
        ))}
        <text x={PAD.l + 8} y={PAD.t + 8} fontFamily="Inter, Helvetica, Arial" fontSize={5.4} fill={MUTED}>
          r² = 0.96
        </text>
      </Frame>
    </svg>
  );
}

/* ---------------- Plate 5 · small multiples ---------------- */
function PlateMultiples() {
  const panels: [number, number][][] = [
    [
      [54.2, 62.0],
      [65.7, 74.0],
      [73.5, 82.0],
      [81.4, 88.1],
      [84.6, 90.4],
    ],
    [
      [52.1, 58.0],
      [61.2, 66.4],
      [66.8, 71.2],
      [71.4, 75.9],
      [73.5, 78.2],
    ],
    [
      [48.7, 55.9],
      [57.8, 63.1],
      [62.9, 68.4],
      [66.4, 72.0],
      [69.1, 74.6],
    ],
    [
      [87.1, 90.2],
      [88.4, 91.4],
      [89.2, 92.0],
      [89.8, 92.5],
      [90.1, 92.8],
    ],
  ];
  const letters = ["a", "b", "c", "d"];
  const bw = (W - PAD.l - PAD.r - 14) / 2;
  const bh = (H - PAD.t - PAD.b - 10) / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Small multiples of four datasets">
      <rect x={0} y={0} width={W} height={H} fill="#fffefb" />
      {panels.map((p, i) => {
        const ox = PAD.l + (i % 2) * (bw + 14);
        const oy = PAD.t + Math.floor(i / 2) * (bh + 10);
        const sx = (k: number) => ox + 16 + (k / 4) * (bw - 18);
        const sy = (v: number) => oy + bh - 10 - ((v - 45) / 50) * (bh - 18);
        return (
          <g key={i}>
            <line x1={ox + 16} x2={ox + bw - 2} y1={oy + bh - 10} y2={oy + bh - 10} stroke={INK} strokeWidth={0.6} />
            <line x1={ox + 16} x2={ox + 16} y1={oy + 4} y2={oy + bh - 10} stroke={INK} strokeWidth={0.6} />
            {[0, 1, 2, 3, 4].map((k) => (
              <line key={`xt${k}`} x1={sx(k)} x2={sx(k)} y1={oy + bh - 10} y2={oy + bh - 7} stroke={INK} strokeWidth={0.5} />
            ))}
            {[50, 75, 100].map((v) => (
              <line key={`yt${v}`} x1={ox + 13} x2={ox + 16} y1={sy(v)} y2={sy(v)} stroke={INK} strokeWidth={0.5} />
            ))}
            <path d={path(p.map(([a], k) => [sx(k), sy(a)]))} fill="none" stroke={OI.blue} strokeWidth={1} />
            <path d={path(p.map(([, b], k) => [sx(k), sy(b)]))} fill="none" stroke={OI.vermillion} strokeWidth={1} strokeDasharray="3 1.6" />
            {p.map(([a, b], k) => (
              <g key={`p${k}`}>
                <circle cx={sx(k)} cy={sy(a)} r={1.1} fill={OI.blue} />
                <circle cx={sx(k)} cy={sy(b)} r={1.1} fill={OI.vermillion} />
              </g>
            ))}
            <text x={ox + 1} y={oy + 9} fontFamily="Inter, Helvetica, Arial" fontWeight={700} fontSize={7} fill={INK}>
              {letters[i]}
            </text>
          </g>
        );
      })}
      <text x={PAD.l} y={H - 6} fontFamily="Inter, Helvetica, Arial" fontSize={5.4} fill={MUTED}>
        Solid: baseline · dashed: proposed
      </text>
    </svg>
  );
}

/* ---------------- Plate 6 · box plots ---------------- */
function PlateBox() {
  const groups: [string, number[]][] = [
    ["Baseline", [84.1, 84.6, 85.0, 85.1, 85.4, 86.0, 86.2, 85.6]],
    ["Proposed", [91.5, 91.9, 92.1, 92.2, 92.6, 92.8, 93.0, 93.4]],
    ["Ablation", [78.6, 79.0, 79.3, 79.8, 80.1, 80.4, 80.8, 81.2]],
  ];
  const colors = [OI.blue, OI.vermillion, OI.green];
  const band = (W - PAD.l - PAD.r) / 3;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Box plot of accuracy by variant">
      <Frame
        letter="e"
        xlab=""
        ylab="Accuracy (%)"
        xTicks={[]}
        yTicks={[75, 80, 85, 90, 95]}
        xMin={0}
        xMax={1}
        yMin={75}
        yMax={95}
      >
        {groups.map(([label, vals], i) => {
          const sorted = [...vals].sort((a, b) => a - b);
          const q = (p: number) => {
            const idx = (sorted.length - 1) * p;
            const lo = Math.floor(idx);
            const hi = Math.ceil(idx);
            return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
          };
          const q1 = q(0.25);
          const q2 = q(0.5);
          const q3 = q(0.75);
          const cx = PAD.l + band * (i + 0.5);
          const bw = 46;
          return (
            <g key={label}>
              <line x1={cx} x2={cx} y1={y(sorted[0], 75, 95)} y2={y(sorted[sorted.length - 1], 75, 95)} stroke={INK} strokeWidth={0.7} />
              <line x1={cx - 5} x2={cx + 5} y1={y(sorted[0], 75, 95)} y2={y(sorted[0], 75, 95)} stroke={INK} strokeWidth={0.7} />
              <line x1={cx - 5} x2={cx + 5} y1={y(sorted[sorted.length - 1], 75, 95)} y2={y(sorted[sorted.length - 1], 75, 95)} stroke={INK} strokeWidth={0.7} />
              <rect
                x={cx - bw / 2}
                y={y(q3, 75, 95)}
                width={bw}
                height={Math.max(2, y(q1, 75, 95) - y(q3, 75, 95))}
                fill={colors[i]}
                fillOpacity={0.16}
                stroke={colors[i]}
                strokeWidth={0.9}
              />
              <line x1={cx - bw / 2} x2={cx + bw / 2} y1={y(q2, 75, 95)} y2={y(q2, 75, 95)} stroke={colors[i]} strokeWidth={1.6} />
              {vals.map((v, k) => (
                <circle
                  key={k}
                  cx={cx - bw / 2 + 7 + ((k * 29) % (bw - 14))}
                  cy={y(v, 75, 95)}
                  r={1.35}
                  fill="#fffefb"
                  stroke={colors[i]}
                  strokeWidth={0.65}
                />
              ))}
              <text x={cx} y={H - PAD.b + 11} textAnchor="middle" fontFamily="Inter, Helvetica, Arial" fontSize={5.4} fill={MUTED}>
                {label}
              </text>
            </g>
          );
        })}
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 6} textAnchor="middle" fontFamily="Inter, Helvetica, Arial" fontSize={6} fill={INK}>
          Model variant (n = 8 seeds)
        </text>
      </Frame>
    </svg>
  );
}

export type Plate = {
  no: string;
  title: string;
  note: string;
  spec: string;
  svg: React.ReactNode;
};

export const PLATES: Plate[] = [
  {
    no: "01",
    title: "训练动力学",
    note: "三组模型的收敛曲线，阴影为 8 次随机种子的标准差。",
    spec: "Nature · 单栏 89 mm · 5–7 pt",
    svg: <PlateLine />,
  },
  {
    no: "02",
    title: "数据集迁移",
    note: "分组柱状图与误差棒，跨三个数据集的基线 / 提出方法对比。",
    spec: "Science · 双栏 183 mm · 误差棒 = s.d.",
    svg: <PlateBars />,
  },
  {
    no: "03",
    title: "准确率矩阵",
    note: "模型 × 数据集的热力图，单元格内直接标注数值。",
    spec: "Cell · 单元格标注 · Okabe–Ito",
    svg: <PlateHeat />,
  },
  {
    no: "04",
    title: "规模与精度",
    note: "参数量与准确率的散点回归，带 95% 置信带。",
    spec: "NeurIPS · 单栏图 · r² 标注",
    svg: <PlateScatter />,
  },
  {
    no: "05",
    title: "多面板对照",
    note: "四个数据集的 small multiples，实线基线 / 虚线改进。",
    spec: "Nature · 多面板 a–d · 共用轴",
    svg: <PlateMultiples />,
  },
  {
    no: "06",
    title: "分布与离散",
    note: "箱线图叠加抖动散点，展示中位数与四分位区间。",
    spec: "eLife · 箱线 + 散点 · n = 8",
    svg: <PlateBox />,
  },
];
