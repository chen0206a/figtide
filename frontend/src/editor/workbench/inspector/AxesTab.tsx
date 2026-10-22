import {
  defaultClassification,
  defaultEmpirical,
  defaultEvaluation,
  type Config,
} from "../../model";
import "../../styles-library.css";
import { Section, Text, Toggle } from "../controls";

type AxesTabProps = {
  panel: string;
  c: Config;
  evaluation: boolean;
  empirical: boolean;
  patch: (value: Partial<Config>) => void;
};
export function AxesTab({
  panel,
  c,
  evaluation,
  empirical,
  patch,
}: AxesTabProps) {
  return (
    <>
      {panel === "axes" &&
        (["x", "y"] as const).map((axis) => (
          <Section key={axis} title={`${axis.toUpperCase()} 坐标轴`}>
            <Text
              label={`${axis.toUpperCase()} 轴名称`}
              value={
                c.type === "confusion"
                  ? c.classification?.[axis === "x" ? "xTitle" : "yTitle"] || ""
                  : evaluation
                    ? c.evaluation?.[
                        c.type === "roc"
                          ? axis === "x"
                            ? "rocXTitle"
                            : "rocYTitle"
                          : axis === "x"
                            ? "prXTitle"
                            : "prYTitle"
                      ] || ""
                    : empirical
                      ? axis === "x"
                        ? c.empirical?.valueTitle || ""
                        : c.empirical?.resultTitle || ""
                      : c.axes[axis].title
              }
              onChange={(title) =>
                c.type === "confusion"
                  ? patch({
                      classification: {
                        ...(c.classification || defaultClassification),
                        [axis === "x" ? "xTitle" : "yTitle"]: title,
                      },
                    })
                  : evaluation
                    ? patch({
                        evaluation: {
                          ...(c.evaluation || defaultEvaluation),
                          [c.type === "roc"
                            ? axis === "x"
                              ? "rocXTitle"
                              : "rocYTitle"
                            : axis === "x"
                              ? "prXTitle"
                              : "prYTitle"]: title,
                        },
                      })
                    : empirical
                      ? patch({
                          empirical: {
                            ...(c.empirical || defaultEmpirical),
                            [axis === "x" ? "valueTitle" : "resultTitle"]:
                              title,
                          },
                        })
                      : patch({
                          axes: {
                            ...c.axes,
                            [axis]: { ...c.axes[axis], title },
                          },
                        })
              }
            />
            <fieldset
              className="axis-numeric-controls"
              disabled={
                evaluation ||
                (axis === "x" && (c.type === "box" || c.type === "violin"))
              }
            >
              <div className="form-grid">
                {(["min", "max"] as const).map((k) => (
                  <Text
                    key={k}
                    label={k === "min" ? "最小值" : "最大值"}
                    value={c.axes[axis][k]}
                    placeholder="自动"
                    onChange={(v) =>
                      patch({
                        axes: {
                          ...c.axes,
                          [axis]: { ...c.axes[axis], [k]: v },
                        },
                      })
                    }
                  />
                ))}
              </div>
              <Text
                label="刻度间隔（log 轴为指数间隔）"
                placeholder="自动"
                value={c.axes[axis].dtick}
                onChange={(dtick) =>
                  patch({
                    axes: {
                      ...c.axes,
                      [axis]: { ...c.axes[axis], dtick },
                    },
                  })
                }
              />
            </fieldset>
            {c.type !== "confusion" && (
              <Toggle
                label="显示网格线"
                value={c.axes[axis].grid}
                onChange={(grid) =>
                  patch({
                    axes: {
                      ...c.axes,
                      [axis]: { ...c.axes[axis], grid },
                    },
                  })
                }
              />
            )}
            <fieldset
              className="axis-numeric-controls"
              disabled={
                evaluation ||
                (axis === "x" && (c.type === "box" || c.type === "violin"))
              }
            >
              <Toggle
                label="对数坐标"
                value={c.axes[axis].log}
                onChange={(log) =>
                  patch({
                    axes: { ...c.axes, [axis]: { ...c.axes[axis], log } },
                  })
                }
              />
            </fieldset>
            {evaluation && (
              <p className="tiny-note">
                {c.type === "confusion"
                  ? "混淆矩阵使用离散类别轴；普通图的范围和对数设置已保留。"
                  : "评估曲线使用线性 0–1 坐标；普通图的范围和对数设置已保留。"}
              </p>
            )}
            {axis === "x" && (c.type === "box" || c.type === "violin") && (
              <p className="tiny-note">
                X 为离散类别；数值范围、刻度间隔与对数设置保留供其他图表使用。
              </p>
            )}
          </Section>
        ))}
    </>
  );
}
