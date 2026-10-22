import { Maximize2, Type } from "lucide-react";
import { type Config } from "../../model";
import { NumberInput, Section, Select, Text, Toggle } from "../controls";

type AppearanceTabProps = {
  panel: string;
  c: Config;
  style: (value: Partial<Config["style"]>) => void;
  patch: (value: Partial<Config>) => void;
};
export function AppearanceTab({ panel, c, style, patch }: AppearanceTabProps) {
  return (
    <>
      {panel === "appearance" && (
        <>
          <Section title="标题与字体" icon={<Type size={13} />}>
            <Text
              label="图表标题"
              value={c.style.title}
              onChange={(title) => style({ title })}
            />
            <Select
              label="字体"
              value={c.style.font}
              options={[
                "Arial",
                "Helvetica",
                "Times New Roman",
                "Georgia",
                "Courier New",
                "Noto Sans SC",
              ]}
              onChange={(font) => style({ font })}
            />
            <div className="form-grid">
              <fieldset
                className="axis-numeric-controls"
                disabled={!!c.publication?.enabled}
              >
                <NumberInput
                  label="字号"
                  value={c.style.fontSize}
                  min={8}
                  max={40}
                  onChange={(fontSize) => style({ fontSize })}
                />
              </fieldset>
              <label>
                字重
                <select
                  value={c.style.bold ? "bold" : "normal"}
                  onChange={(e) => style({ bold: e.target.value === "bold" })}
                >
                  <option value="normal">Regular</option>
                  <option value="bold">Bold</option>
                </select>
              </label>
            </div>
          </Section>
          <Section title="画布设置" icon={<Maximize2 size={13} />}>
            <div className="form-grid">
              <NumberInput
                label="宽度 / px"
                value={c.style.width}
                min={250}
                max={2400}
                onChange={(width) => style({ width })}
              />
              <NumberInput
                label="高度 / px"
                value={c.style.height}
                min={250}
                max={2400}
                onChange={(height) => style({ height })}
              />
            </div>
            <label>
              画布背景
              <div className="color-input">
                <input
                  aria-label="画布背景"
                  type="color"
                  value={c.style.background}
                  onChange={(e) => style({ background: e.target.value })}
                />
                <span>{c.style.background.toUpperCase()}</span>
              </div>
            </label>
            <div className="form-grid">
              {(["top", "bottom", "left", "right"] as const).map((k) => (
                <NumberInput
                  key={k}
                  label={
                    {
                      top: "上边距",
                      bottom: "下边距",
                      left: "左边距",
                      right: "右边距",
                    }[k]
                  }
                  value={c.style[k]}
                  min={0}
                  max={300}
                  onChange={(v) => style({ [k]: v })}
                />
              ))}
            </div>
          </Section>
          {c.type !== "confusion" && (
            <Section title="图例">
              <Toggle
                label="显示图例"
                value={c.legend.show}
                onChange={(show) => patch({ legend: { ...c.legend, show } })}
              />
              <div className="form-grid">
                <Select
                  label="位置"
                  value={c.legend.position}
                  options={["top", "bottom", "right"]}
                  onChange={(position) =>
                    patch({ legend: { ...c.legend, position } })
                  }
                />
                <Select
                  label="方向"
                  value={c.legend.orientation}
                  options={["h", "v"]}
                  onChange={(v) =>
                    patch({
                      legend: {
                        ...c.legend,
                        orientation: v as "h" | "v",
                      },
                    })
                  }
                />
              </div>
            </Section>
          )}
        </>
      )}
    </>
  );
}
