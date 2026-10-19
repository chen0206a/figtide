import type { Dataset } from "../lib/api";
import {
  defaultDistribution,
  defaultFacet,
  type Config,
  type Facet,
} from "./model";
import { facetEntries } from "./facets";
import { Button } from "../components/ui/button";
import "./professional.css";

export function ProfessionalPanel({
  config: c,
  data,
  onChange,
}: {
  config: Config;
  data: Dataset;
  onChange: (value: Partial<Config>) => void;
}) {
  const distribution = c.distribution || defaultDistribution,
    facet = c.facet || defaultFacet;
  const setDistribution = (value: Partial<typeof distribution>) =>
    onChange({ distribution: { ...distribution, ...value } });
  const setFacet = (value: Partial<Facet>) =>
    onChange({ facet: { ...facet, ...value } });
  const entries = facetEntries(c, data);
  const isDistribution = c.type === "box" || c.type === "violin";
  return (
    <>
      <section className="property-section professional-intro">
        <span className="professional-kicker">FIGURE COMPOSITION</span>
        <h3>从单张图，到完整图版。</h3>
        <p>样本分布、指标分面与统一排版，全部随图表保存。</p>
      </section>
      {isDistribution && (
        <section className="property-section">
          <h3>分布与观测</h3>
          <p className="tiny-note">
            每行应是一次真实观测。均值汇总不等同于重复实验。
          </p>
          <Choice
            label="观测点显示"
            value={distribution.points}
            options={[
              ["all", "全部真实观测"],
              ["outliers", "仅离群观测"],
              ["none", "隐藏观测点"],
            ]}
            onChange={(v) =>
              setDistribution({ points: v as typeof distribution.points })
            }
          />
          <Choice
            label="四分位算法"
            value={distribution.quartileMethod}
            options={[
              ["linear", "线性百分位（Plotly）"],
              ["exclusive", "分半中位数 · 排除中位数"],
              ["inclusive", "分半中位数 · 包含中位数"],
            ]}
            onChange={(v) =>
              setDistribution({
                quartileMethod: v as typeof distribution.quartileMethod,
              })
            }
          />
          <Switch
            label="显示均值线"
            checked={distribution.mean}
            onChange={(mean) => setDistribution({ mean })}
          />
          {c.type === "violin" && (
            <>
              <Switch
                label="显示内部箱体"
                checked={distribution.innerBox}
                onChange={(innerBox) => setDistribution({ innerBox })}
              />
              <label>
                密度带宽
                <input
                  aria-label="密度带宽"
                  value={distribution.bandwidth}
                  placeholder="自动 · Silverman"
                  maxLength={120}
                  onChange={(e) =>
                    setDistribution({ bandwidth: e.target.value })
                  }
                />
              </label>
              <Choice
                label="密度边界"
                value={distribution.span}
                options={[
                  ["hard", "样本最小值至最大值"],
                  ["soft", "向两端延伸两个带宽"],
                ]}
                onChange={(v) =>
                  setDistribution({ span: v as typeof distribution.span })
                }
              />
              <p className="tiny-note">
                密度为估计形状。少于 3
                个有效观测或常量组不估计密度；开启全部观测点时显示原始点。
              </p>
            </>
          )}
          <p className="tiny-note">
            箱须采用 1.5 ×
            IQR；不添加显著性或额外误差棒。点位不随机抖动，导出位置可复现。
          </p>
        </section>
      )}
      <section className="property-section">
        <h3>多子图排版</h3>
        <Choice
          label="分面方式"
          value={facet.mode}
          options={[
            ["none", "单张图表"],
            ["series", "按序列 / 指标"],
            ["field", "按字段类别"],
          ]}
          onChange={(v) =>
            setFacet({
              mode: v as Facet["mode"],
              field:
                facet.field ||
                data.fields.find((f) => f.type === "string")?.name ||
                data.fields[0]?.name ||
                "",
            })
          }
        />
        {c.type === "heatmap" && facet.mode !== "none" && (
          <p className="tiny-note">
            热力图当前显示单图；分面设置保留供其他类型使用。
          </p>
        )}
        {facet.mode !== "none" && (
          <>
            {facet.mode === "field" && (
              <Choice
                label="分面字段"
                value={facet.field}
                options={data.fields.map((f) => [f.name, f.name])}
                onChange={(field) => setFacet({ field })}
              />
            )}
            <div className="facet-plan">
              <div className="facet-plan-head">
                <strong>{entries.length} 个子图</strong>
                <span>最多 8 个</span>
              </div>
              <div
                className="facet-mini-grid"
                style={{ gridTemplateColumns: `repeat(${facet.columns}, 1fr)` }}
              >
                {entries.slice(0, 8).map((entry, i) => (
                  <span
                    key={entry.key}
                    title={facet.titles[entry.key] ?? entry.title}
                  >
                    <b>
                      {facet.labels
                        ? `(${String.fromCharCode(97 + i)})`
                        : i + 1}
                    </b>
                    <i />
                    <small>{facet.titles[entry.key] ?? entry.title}</small>
                  </span>
                ))}
              </div>
              {entries.length > 8 && (
                <p role="alert">子图超限，请先过滤数据或隐藏部分序列。</p>
              )}
            </div>
            <Choice
              label="子图列数"
              value={String(facet.columns)}
              options={[
                ["1", "1 列"],
                ["2", "2 列"],
                ["3", "3 列"],
              ]}
              onChange={(v) => setFacet({ columns: Number(v) })}
            />
            <div className="form-grid">
              <Numeric
                label="水平间距 (px)"
                value={facet.gapX}
                min={24}
                max={200}
                onChange={(gapX) => setFacet({ gapX })}
              />
              <Numeric
                label="垂直间距 (px)"
                value={facet.gapY}
                min={40}
                max={200}
                onChange={(gapY) => setFacet({ gapY })}
              />
            </div>
            <Switch
              label="共享 X 轴范围"
              checked={facet.shareX}
              onChange={(shareX) => setFacet({ shareX })}
            />
            <Switch
              label="共享 Y 轴范围"
              checked={facet.shareY}
              onChange={(shareY) => setFacet({ shareY })}
            />
            <p className="tiny-note">
              仅在指标含义和单位相同时共享 Y
              范围。关闭后，各子图独立计算范围；手动轴范围仍作用于全部子图。
            </p>
            <Switch
              label="显示子图编号"
              checked={facet.labels}
              onChange={(labels) => setFacet({ labels })}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                onChange({
                  style: {
                    ...c.style,
                    width: 1120,
                    height: Math.min(
                      2400,
                      Math.max(
                        540,
                        Math.ceil(Math.min(entries.length, 8) / facet.columns) *
                          300 +
                          160,
                      ),
                    ),
                  },
                })
              }
            >
              适配多子图画布
            </Button>
          </>
        )}
      </section>
      {facet.mode !== "none" && entries.length > 0 && entries.length <= 8 && (
        <section className="property-section">
          <h3>子图标题</h3>
          {entries.map((entry, i) => (
            <label key={entry.key}>
              {`子图 ${String.fromCharCode(97 + i)} 标题`}
              <input
                aria-label={`子图 ${String.fromCharCode(97 + i)} 标题`}
                maxLength={300}
                value={facet.titles[entry.key] ?? entry.title}
                onChange={(e) =>
                  setFacet({
                    titles: { ...facet.titles, [entry.key]: e.target.value },
                  })
                }
              />
            </label>
          ))}
        </section>
      )}
      {!isDistribution && (
        <section className="property-section">
          <p className="tiny-note">
            选择左侧箱线图或小提琴图，可配置观测点、四分位算法和密度参数。
          </p>
        </section>
      )}
    </>
  );
}
function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[][];
  onChange: (v: string) => void;
}) {
  return (
    <label>
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {!options.some(([key]) => key === value) && (
          <option value={value}>请选择有效字段</option>
        )}
        {options.map(([key, name]) => (
          <option key={key} value={key}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="toggle-label">
      {label}
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
function Numeric({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label>
      {label}
      <input
        aria-label={label}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
        }}
      />
    </label>
  );
}
