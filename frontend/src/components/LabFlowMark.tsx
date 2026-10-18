/** Original LF monogram: two continuous paths connect experiment and figure. */
export function LabFlowMark({
  size = 32,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={`labflow-mark ${className}`}
      aria-hidden="true"
    >
      <rect x="1" y="1" width="62" height="62" rx="18" fill="#22252b" />
      <rect
        x="1.5"
        y="1.5"
        width="61"
        height="61"
        rx="17.5"
        stroke="white"
        strokeOpacity=".12"
      />
      <path
        className="mark-l"
        d="M19 17V39C19 44 22 47 27 47H45"
        stroke="#f8f9fc"
        strokeWidth="6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className="mark-f"
        d="M45 17H36C31 17 28 20 28 25V35M28 30H42"
        stroke="#a7c7ff"
        strokeWidth="6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
