import type { Dataset } from "../lib/api";
import { defaultSampling, type Config } from "./model";
export function SamplingPanel({
  config: c,
  data,
  onChange,
}: {
  config: Config;
  data: Dataset;
  onChange: (value: Partial<Config>) => void;
}) {
  const sampling = c.sampling || defaultSampling;
  return (
    <section className="property-section">
      <h3>模型比较的样本口径</h3>
      <label>
        有效样本策略
        <select
          aria-label="有效样本策略"
          value={sampling.policy}
          onChange={(e) =>
            onChange({
              sampling: {
                ...sampling,
                policy: e.target.value as typeof sampling.policy,
              },
            })
          }
        >
          <option value="independent">各模型独立有效行</option>
          <option value="intersection">所有可见模型共同有效行</option>
        </select>
      </label>
      <label>
        样本 ID 列
        <select
          aria-label="样本 ID 列"
          value={sampling.id}
          onChange={(e) =>
            onChange({ sampling: { ...sampling, id: e.target.value } })
          }
        >
          <option value="">使用同一数据表的原始行位置</option>
          {data.fields.map((f) => (
            <option key={f.name} value={f.name}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      <p className="tiny-note">
        按当前过滤后的行比较，不跨文件猜测配对。选择 ID
        后要求全集非缺失且唯一；共同模式取所有可见模型预测的交集，隐藏/显示模型会重新确定交集。
      </p>
    </section>
  );
}
