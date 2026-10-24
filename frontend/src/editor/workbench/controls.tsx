import { ChevronDown } from "lucide-react";
export function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <details
      className="property-section property-disclosure"
      open={
        !["画布设置", "图例", "数据过滤 · 可复现", "序列操作"].includes(title)
      }
    >
      <summary>
        {icon}
        <span>{title}</span>
        <ChevronDown size={13} />
      </summary>
      <div className="property-content">{children}</div>
    </details>
  );
}
export function Text({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label>
      {label}
      <input
        aria-label={label}
        value={value}
        placeholder={placeholder}
        maxLength={500}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
export function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <label>
      {label}
      <input
        aria-label={label}
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
        }}
      />
    </label>
  );
}
export function Select({
  label,
  value,
  options,
  onChange,
  empty = "无",
}: {
  label: string;
  value: string;
  options: (string | { value: string; label: string })[];
  onChange: (v: string) => void;
  empty?: string;
}) {
  const opts = options.map((o) =>
    typeof o === "string" ? { value: o, label: o || empty } : o,
  );
  return (
    <label>
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {!opts.some((o) => o.value === value) && (
          <option value={value}>⚠ {value || "请选择"}</option>
        )}
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="toggle-label">
      {label}
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
