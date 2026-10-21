import type { StyleProfile } from "./reuse";

/** A design swatch, not experimental data. The full preview uses the active dataset. */
export function StyleThumbnail({ profile }: { profile: StyleProfile }) {
  return (
    <svg
      className="style-thumbnail"
      viewBox="0 0 260 132"
      role="img"
      aria-label="样式示意，非实验数据"
    >
      <rect width="260" height="132" rx="8" fill={profile.style.background} />
      {profile.axes.y.grid &&
        [35, 65, 95].map((y) => (
          <path key={y} d={`M30 ${y}H242`} stroke="#e5e7eb" strokeWidth="0.7" />
        ))}
      <path d="M30 18V108H242" fill="none" stroke="#92969e" strokeWidth="0.8" />
      {profile.series.slice(0, 3).map((s, i) => (
        <g key={i} opacity={s.opacity}>
          <path
            d={
              [
                "M36 95L72 80L109 84L148 52L187 42L232 24",
                "M36 101L72 93L109 72L148 78L187 57L232 49",
                "M36 76L72 64L109 53L148 60L187 28L232 39",
              ][i]
            }
            fill="none"
            stroke={s.color}
            strokeWidth={Math.max(1, Math.min(4, s.width))}
            strokeDasharray={
              s.dash === "solid" ? undefined : s.dash === "dot" ? "2 4" : "6 4"
            }
          />
        </g>
      ))}
      <text
        x="30"
        y="124"
        fill="#777c85"
        fontFamily={profile.style.font}
        fontSize="9"
        fontWeight={profile.style.bold ? 700 : 400}
      >
        Aa · {profile.style.fontSize} px
      </text>
    </svg>
  );
}
