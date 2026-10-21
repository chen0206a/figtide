import type { StyleProfile } from "./reuse";

/** Representative geometry only; the adjacent Plotly preview uses actual data. */
export function StyleThumbnail({ profile }: { profile: StyleProfile }) {
  const right = profile.legend.show && profile.legend.position === "right";
  const bottom = profile.legend.show && profile.legend.position === "bottom";
  const top = profile.legend.show && !right && !bottom;
  const box = {
    left: 27,
    right: right ? 195 : 242,
    top: top ? 33 : 19,
    bottom: bottom ? 94 : 112,
  };
  const series = profile.series.slice(0, 3);
  const values = [
    [0.15, 0.35, 0.3, 0.65, 0.74, 0.92],
    [0.08, 0.17, 0.45, 0.37, 0.6, 0.65],
    [0.28, 0.27, 0.17, 0.43, 0.46, 0.55],
  ];
  const dash = (v: string) =>
    (
      ({ dash: "7 4", dot: "2 4", dashdot: "7 3 2 3" }) as Record<
        string,
        string
      >
    )[v];
  return (
    <svg
      className="style-thumbnail"
      viewBox="0 0 260 132"
      role="img"
      aria-label="样式示意，非实验数据"
    >
      <rect width="260" height="132" rx="8" fill={profile.style.background} />
      {profile.axes.y.grid &&
        [0.25, 0.5, 0.75].map((f) => (
          <path
            key={f}
            d={`M${box.left} ${box.bottom - (box.bottom - box.top) * f}H${box.right}`}
            stroke="#e4e7ed"
            strokeWidth=".8"
          />
        ))}
      {profile.axes.x.grid &&
        [0.25, 0.5, 0.75].map((f) => (
          <path
            key={f}
            d={`M${box.left + (box.right - box.left) * f} ${box.top}V${box.bottom}`}
            stroke="#e4e7ed"
            strokeWidth=".8"
          />
        ))}
      <path
        d={`M${box.left} ${box.top}V${box.bottom}H${box.right}`}
        fill="none"
        stroke="#92969e"
        strokeWidth=".8"
      />
      {series.map((s, i) => {
        const points = values[i].map((v, j) => ({
          x: box.left + 7 + (j * (box.right - box.left - 14)) / 5,
          y: box.bottom - 3 - v * (box.bottom - box.top - 8),
        }));
        const radius = Math.max(1, Math.min(3, s.size * 0.38));
        return (
          <g key={i} opacity={s.opacity} data-sample-series={i}>
            <polyline
              points={points.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={s.color}
              strokeWidth={Math.max(0.8, Math.min(3.5, s.width * 0.8))}
              strokeDasharray={dash(s.dash)}
            />
            {points.map(({ x, y }, j) => (
              <g key={j} fill={s.color}>
                {s.symbol === "square" ? (
                  <rect
                    x={x - radius}
                    y={y - radius}
                    width={radius * 2}
                    height={radius * 2}
                  />
                ) : s.symbol === "diamond" ? (
                  <path
                    d={`M${x} ${y - radius * 1.4}l${radius * 1.2} ${radius * 1.4}l${-radius * 1.2} ${radius * 1.4}l${-radius * 1.2} ${-radius * 1.4}Z`}
                  />
                ) : s.symbol === "triangle-up" ? (
                  <path
                    d={`M${x} ${y - radius * 1.4}l${radius * 1.3} ${radius * 2.4}h${-radius * 2.6}Z`}
                  />
                ) : (
                  <circle cx={x} cy={y} r={radius} />
                )}
              </g>
            ))}
          </g>
        );
      })}
      {profile.legend.show &&
        series.map((s, i) => (
          <g
            key={i}
            transform={`translate(${right ? 207 : 36 + i * 66},${right ? 42 + i * 18 : bottom ? 120 : 18})`}
          >
            <path
              d="M0 0H15"
              stroke={s.color}
              strokeWidth={Math.min(3, s.width)}
              strokeDasharray={dash(s.dash)}
            />
            <text
              x="20"
              y="3"
              fill="#626a76"
              fontFamily={profile.style.font}
              fontSize={Math.min(11, profile.style.fontSize * 0.65)}
              fontWeight={profile.style.bold ? 700 : 400}
            >
              {["A", "B", "C"][i]}
            </text>
          </g>
        ))}
    </svg>
  );
}
