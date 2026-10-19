import {
  defaultPublication,
  defaultEmpirical,
  defaultHeatmap,
  palettes,
  seriesEncoding,
  type Config,
} from "./model";
import { publicationMetrics } from "./publication";
import { Button } from "../components/ui/button";

export function ScientificPanel({
  config: c,
  onChange,
}: {
  config: Config;
  onChange: (value: Partial<Config>) => void;
}) {
  const p = c.publication || defaultPublication,
    e = c.empirical || defaultEmpirical,
    h = c.heatmap || defaultHeatmap,
    m = publicationMetrics(c);
  const pub = (v: Partial<typeof p>) =>
    onChange({ publication: { ...p, ...v } });
  const empirical = (v: Partial<typeof e>) =>
    onChange({ empirical: { ...e, ...v } });
  const heat = (v: Partial<typeof h>) => onChange({ heatmap: { ...h, ...v } });
  return (
    <>
      <section className="property-section publication-section">
        <h3>论文尺寸与输出</h3>
        <label className="toggle-label">
          按论文物理尺寸输出
          <input
            role="switch"
            aria-label="按论文物理尺寸输出"
            type="checkbox"
            checked={p.enabled}
            onChange={(event) => pub({ enabled: event.target.checked })}
          />
        </label>
        <p className="tiny-note">
          开启后按成品 mm / pt 预览和导出；屏幕缩放不会改变成品尺寸。
        </p>
        {p.enabled && (
          <>
            <div className="publication-presets">
              <Button
                variant="outline"
                size="sm"
                onClick={() => pub({ widthMm: 89 })}
              >
                单栏 89 mm
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => pub({ widthMm: 183 })}
              >
                双栏 183 mm
              </Button>
            </div>
            <div className="form-grid">
              <NumberField
                label="成品宽度 / mm"
                value={p.widthMm}
                min={50}
                max={300}
                step={0.5}
                onChange={(widthMm) => pub({ widthMm })}
              />
              <NumberField
                label="成品基础字号 / pt"
                value={p.fontPt}
                min={4}
                max={24}
                step={0.5}
                onChange={(fontPt) => pub({ fontPt })}
              />
            </div>
            <NumberField
              label="PNG 目标 DPI"
              value={p.dpi}
              min={72}
              max={1200}
              step={1}
              onChange={(dpi) => pub({ dpi })}
            />
            <div className="publication-readout">
              <strong>
                {p.widthMm} × {m.heightMm.toFixed(1)} mm
              </strong>
              <span>高度随画布宽高比 · 字号 {p.fontPt} pt</span>
              <span>
                PNG {m.pixelWidth} × {m.pixelHeight} px · 约{" "}
                {m.effectiveDpi.toFixed(0)} DPI
              </span>
            </div>
            <p className="tiny-note">
              89 / 183 mm
              为排版起点，不代表期刊认证。修改画布高度可调整成品宽高比。
            </p>
          </>
        )}
      </section>
      {(c.type === "histogram" || c.type === "ecdf") && (
        <section className="property-section">
          <h3>{c.type === "histogram" ? "确定性分箱" : "经验累计分布"}</h3>
          <p className="tiny-note">
            使用各序列的 Y 数值列作为真实观测；分组与过滤仍生效，原 X 映射保留。
          </p>
          <StringField
            label="观测轴标题"
            value={e.valueTitle}
            placeholder="自动：序列名称"
            onChange={(valueTitle) => empirical({ valueTitle })}
          />
          <StringField
            label="分布轴标题"
            value={e.resultTitle}
            placeholder="自动：频数 / 累计概率"
            onChange={(resultTitle) => empirical({ resultTitle })}
          />
          {c.type === "histogram" ? (
            <>
              <NumberField
                label="等宽分箱数量"
                value={e.bins}
                min={1}
                max={200}
                onChange={(bins) => empirical({ bins: Math.round(bins) })}
              />
              <div className="form-grid">
                <StringField
                  label="分箱起点"
                  value={e.start}
                  placeholder="样本最小值"
                  onChange={(start) => empirical({ start })}
                />
                <StringField
                  label="分箱终点"
                  value={e.end}
                  placeholder="样本最大值"
                  onChange={(end) => empirical({ end })}
                />
              </div>
              <Choice
                label="直方图纵轴"
                value={e.normalization}
                options={[
                  ["count", "频数"],
                  ["probability", "概率"],
                  ["density", "概率密度"],
                ]}
                onChange={(v) =>
                  empirical({ normalization: v as typeof e.normalization })
                }
              />
              <p className="tiny-note">
                左闭右开，最后一箱含右边界。自动范围可复现；跨子图比较时建议指定相同起止值。超范围观测会明确告警。
              </p>
            </>
          ) : (
            <p className="tiny-note">
              重复值合并为一次跳跃；右连续阶梯，不平滑、不分箱，累计概率按有效观测数计算。
            </p>
          )}
        </section>
      )}
      <section className="property-section">
        <h3>科学色彩与区分</h3>
        <Choice
          label="序列色板"
          value={c.style.preset}
          options={Object.keys(palettes).map((key) => [key, key])}
          onChange={(preset) =>
            onChange({
              style: { ...c.style, preset },
              series: c.series.map((s, i) => ({
                ...s,
                color: palettes[preset][i % palettes[preset].length],
              })),
            })
          }
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            onChange({
              series: c.series.map((s, i) => ({
                ...s,
                ...seriesEncoding(c.style.preset, i),
              })),
            })
          }
        >
          应用色彩＋线型区分
        </Button>
        <p className="tiny-note">
          颜色循环后增加线型和点形差异，辅助灰度阅读；不等于完成色觉可访问性认证。
        </p>
      </section>
      {c.type === "heatmap" && (
        <section className="property-section">
          <h3>热力图色阶与数值</h3>
          <Choice
            label="连续色阶"
            value={h.palette}
            options={[
              ["series", "跟随当前序列色"],
              ["viridis", "Viridis · 连续"],
              ["cividis", "Cividis · 连续"],
              ["blueRed", "蓝–红 · 发散"],
            ]}
            onChange={(v) => heat({ palette: v as typeof h.palette })}
          />
          <div className="form-grid">
            <StringField
              label="色阶最小值"
              value={h.min}
              placeholder="自动"
              onChange={(min) => heat({ min })}
            />
            <StringField
              label="色阶最大值"
              value={h.max}
              placeholder="自动"
              onChange={(max) => heat({ max })}
            />
          </div>
          <StringField
            label="色阶中心值"
            value={h.center}
            placeholder="可留空，例如 0"
            onChange={(center) => heat({ center })}
          />
          <label className="toggle-label">
            显示单元格数值
            <input
              role="switch"
              aria-label="显示单元格数值"
              type="checkbox"
              checked={h.labels}
              onChange={(event) => heat({ labels: event.target.checked })}
            />
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              heat({
                palette: "cividis",
                labels: true,
                min: "0",
                max: "",
                center: "",
              })
            }
          >
            计数矩阵样式
          </Button>
          <p className="tiny-note">
            计数矩阵需实际计数数据；X 可映射预测类别，Y
            映射真实类别。此预设不计算混淆矩阵或归一化。最多 400
            个单元格显示标注。
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
        onChange={(event) => onChange(event.target.value)}
      >
        {!options.some(([v]) => v === value) && (
          <option value={value}>{value}</option>
        )}
        {options.map(([v, name]) => (
          <option key={v} value={v}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
function StringField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <label>
      {label}
      <input
        aria-label={label}
        maxLength={120}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
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
        step={step}
        value={value}
        onChange={(event) => {
          const value = Number(event.target.value);
          if (Number.isFinite(value))
            onChange(Math.min(max, Math.max(min, value)));
        }}
      />
    </label>
  );
}
