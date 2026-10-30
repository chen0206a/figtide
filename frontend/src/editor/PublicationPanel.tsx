import "./publication-panel.css";
import { useRef } from "react";
import { defaultPublication, type Config } from "./model";
import {
  publicationMetrics,
  publicationPreset,
  publicationWidths,
  publicationWidthLabels,
} from "./publication";
import { NumberInput, Toggle } from "./workbench/controls";
import {journalPreset, journalRule, journalRules} from './journals';

export function PublicationPresets({
  config: c,
  onChange,
  label,
  compact = false,
}: {
  config: Config;
  onChange: (value: Partial<Config>) => void;
  label: string;
  compact?: boolean;
}) {
  const journal = journalRule(c.publication?.journal);
  const widths = [journal.single_column_mm ?? publicationWidths[0], publicationWidths[1], journal.double_column_mm ?? publicationWidths[2]];
  return (
    <div
      className={`publication-presets ${compact ? "is-compact" : ""}`}
      role="group"
      aria-label={label}
    >
      {widths.map((width, i) => (
        <button
          key={width}
          aria-label={`${publicationWidthLabels[i]} · ${width} mm`}
          aria-pressed={
            !!c.publication?.enabled && c.publication.widthMm === width
          }
          onClick={() => onChange(publicationPreset(c, width))}
        >
          {publicationWidthLabels[i]}
          <span> · {width} mm</span>
        </button>
      ))}
    </div>
  );
}
export function PublicationPanel({
  config: c,
  onChange,
}: {
  config: Config;
  onChange: (value: Partial<Config>) => void;
}) {
  const p = c.publication || defaultPublication,
    m = publicationMetrics(c);
  const widthInput = useRef<HTMLInputElement>(null);
  const pub = (value: Partial<typeof p>) =>
    onChange({ publication: { ...p, ...value } });
  return (
    <section className="property-section publication-section">
      <h3>论文尺寸</h3>
      <label>目标期刊
        <select aria-label="目标期刊" value={p.journal || 'default'}
          onChange={event => onChange(journalPreset(c, event.target.value))}>
          {journalRules.map(rule => <option key={rule.id} value={rule.id}>{rule.name}</option>)}
        </select>
      </label>
      <p className="tiny-note">审稿最小字号 {journalRule(p.journal).min_font_pt ?? 6} pt。未注明的要求使用通用值。</p>
      <Toggle
        label="按论文物理尺寸输出"
        value={p.enabled}
        onChange={(enabled) => pub({ enabled })}
      />
      <PublicationPresets
        config={c}
        onChange={onChange}
        label="属性论文尺寸预设"
      />
      <button
        className="publication-custom"
        disabled={!p.enabled}
        onClick={() => {
          widthInput.current?.focus();
          widthInput.current?.select();
        }}
      >
        自定义
      </button>
      <fieldset className="publication-fields" disabled={!p.enabled}>
        <div className="form-grid">
          <label>
            成品宽度 / mm
            <input
              ref={widthInput}
              aria-label="成品宽度 / mm"
              type="number"
              min={50}
              max={300}
              step={0.5}
              value={p.widthMm}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n))
                  pub({ widthMm: Math.max(50, Math.min(300, n)) });
              }}
            />
          </label>
          <label>
            高度 / mm
            <input
              aria-label="高度（按比例） / mm"
              readOnly
              value={m.heightMm.toFixed(1)}
            />
          </label>
          <NumberInput
            label="成品基础字号 / pt"
            value={p.fontPt}
            min={4}
            max={24}
            step={0.5}
            onChange={(fontPt) => pub({ fontPt })}
          />
          <NumberInput
            label="PNG 目标 DPI"
            value={p.dpi}
            min={72}
            max={1200}
            onChange={(dpi) => pub({ dpi })}
          />
        </div>
      </fieldset>
      <p className="tiny-note">
        预设宽度是常见期刊版心的近似值，投稿前以期刊要求为准。
      </p>
      <p className="tiny-note">
        高度随画布宽高比换算；预览缩放不改变成品尺寸。PNG {m.pixelWidth} ×{" "}
        {m.pixelHeight} px。
      </p>
    </section>
  );
}
