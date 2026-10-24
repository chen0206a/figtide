import { sampleModels, sampleRows } from "../../lib/sampleProject";

/** Static preview from the same local demo observations, including their SEM. */
export function SampleThumbnail() {
  const rows = sampleRows();
  const colors = ["#2563eb", "#0f766e", "#d97706"];
  const x = (epoch: number) => 52 + epoch * 29;
  // Leave room inside the upper-right plot area for the legend, above the data.
  const y = (value: number) => 228 - (value - 0.45) * 260;
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
        return <g key={model}><polygon points={polygon} fill={colors[i]} opacity="0.35" /><polyline points={points.map((p) => `${x(p.epoch)},${y(p.mean)}`).join(" ")} fill="none" stroke={colors[i]} strokeWidth="2" /></g>;
      })}
      <path d="M52 48V228H380" fill="none" stroke="#a3a3a3" />
      <g data-sample-x-ticks="true">
        {[0, 2, 4, 6, 8, 10, 11].map((epoch) => <g key={epoch}>
          <path d={`M${x(epoch)} 228v4`} stroke="#a3a3a3" />
          <text x={x(epoch)} y="246" textAnchor="middle" fill="#737373" fontSize="11">{epoch}</text>
        </g>)}
      </g>
      <text data-sample-x-title="true" x="216" y="268" textAnchor="middle" fill="#737373" fontSize="11">epoch</text>
      <g data-sample-legend="true" role="group" aria-label="模型图例">
        <rect x="255" y="49" width="125" height="47" rx="5" fill="white" fillOpacity="0.94" />
        {sampleModels().map((model, i) => <g key={model}>
          <path d={`M264 ${58 + i * 14}h12`} stroke={colors[i]} strokeWidth="2" />
          <text x="283" y={62 + i * 14} fill={colors[i]} fontSize="11">{model}</text>
        </g>)}
      </g>
    </svg>
  );
}
