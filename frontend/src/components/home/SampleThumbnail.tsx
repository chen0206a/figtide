import { sampleModels, sampleRows } from "../../lib/sampleProject";

/** Static preview from the same local demo observations, including their SEM. */
export function SampleThumbnail() {
  const rows = sampleRows();
  const colors = ["#2563eb", "#0f766e", "#d97706"];
  const x = (epoch: number) => 52 + epoch * 29;
  const y = (value: number) => 235 - (value - 0.45) * 350;
  return (
    <svg viewBox="0 0 420 280" role="img" aria-label="三个模型的学习曲线与标准误区间示意">
      <rect width="420" height="280" rx="12" fill="white" />
      <text x="52" y="25" fill="#171717" fontSize="14">Grouped means ± SEM</text>
      {[0.5, 0.7, 0.9].map((v) => <g key={v}><path d={`M52 ${y(v)}H380`} stroke="#e5e7eb" /><text x="22" y={y(v) + 4} fill="#737373" fontSize="11">{v.toFixed(1)}</text></g>)}
      {sampleModels().map((model, i) => {
        const points = Array.from({ length: 12 }, (_, epoch) => {
          const values = rows.filter((r) => r.model === model && r.epoch === epoch).map((r) => r.accuracy);
          const mean = values.reduce((a, b) => a + b, 0) / values.length;
          const sem = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1)) / Math.sqrt(values.length);
          return { epoch, mean, sem };
        });
        const polygon = [...points.map((p) => `${x(p.epoch)},${y(p.mean - p.sem)}`), ...[...points].reverse().map((p) => `${x(p.epoch)},${y(p.mean + p.sem)}`)].join(" ");
        return <g key={model}><polygon points={polygon} fill={colors[i]} opacity="0.35" /><polyline points={points.map((p) => `${x(p.epoch)},${y(p.mean)}`).join(" ")} fill="none" stroke={colors[i]} strokeWidth="2" /><text x={52 + i * 112} y="266" fill={colors[i]} fontSize="11">{model}</text></g>;
      })}
      <path d="M52 48V235H380" fill="none" stroke="#a3a3a3" />
      <text x="205" y="251" fill="#737373" fontSize="11">epoch</text>
    </svg>
  );
}
