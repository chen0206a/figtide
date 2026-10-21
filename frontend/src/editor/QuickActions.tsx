import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2, ArrowRight, ListChecks } from "lucide-react";
import { api, send, type Dataset } from "../lib/api";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import type { Config } from "./model";
import { StylePreview } from "./StylePreview";
import {
  operationValues,
  sameProtectedFigure,
  toolFieldAvailable,
  makeToolOperation,
  changeLabel,
  displayToolValue,
  toolFieldNames,
  toolValueNames,
  type ToolOperation,
  type ToolCatalog,
  type ToolPreview,
} from "./figureTools";
import "./quick-actions.css";

export function QuickActions(p: {
  project: number;
  chartId: number | null;
  revision: number;
  config: Config;
  data: Dataset;
  token: string;
  onClose: () => void;
  onApply: (token: string, config: Config, count: number) => boolean;
}) {
  const catalog = useQuery({
    queryKey: ["figure-tools-catalog"],
    queryFn: () => api<ToolCatalog>("/figure-tools/catalog"),
    staleTime: 60_000,
  });
  const [tool, setTool] = useState("set_style");
  const [values, setValues] = useState<
    Record<string, string | number | boolean>
  >(() => operationValues("set_style", p.config));
  const [enabled, setEnabled] = useState([
    p.config.publication?.enabled ? "fontPt" : "fontSize",
  ]);
  const [operations, setOperations] = useState<ToolOperation[]>([]);
  const [preview, setPreview] = useState<{
    result: ToolPreview;
    token: string;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const spec = catalog.data?.tools.find((v) => v.name === tool);
  const availableTools =
    catalog.data?.tools.filter((v) =>
      toolFieldAvailable(v.name, "", p.config),
    ) || [];
  const compatible =
    catalog.data?.protocol_version === 1 &&
    catalog.data.config_schema_version === 1 &&
    catalog.data.execution === "preview-only";
  const invalidate = () => {
    setPreview(null);
    setError("");
  };
  function selectTool(name: string) {
    setTool(name);
    setValues(operationValues(name, p.config));
    setError("");
    setEnabled([
      name === "set_style"
        ? p.config.publication?.enabled
          ? "fontPt"
          : "fontSize"
        : name === "set_axis"
          ? ["heatmap", "confusion"].includes(p.config.type)
            ? "title"
            : "grid"
          : name === "set_legend"
            ? "position"
            : name === "set_series"
              ? "color"
              : "width",
    ]);
  }
  async function check() {
    setBusy(true);
    setError("");
    setPreview(null);
    const token = p.token;
    try {
      const result = await api<ToolPreview>(
        `/projects/${p.project}/figure-tools/preview`,
        send("POST", {
          protocol_version: 1,
          chart_id: p.chartId,
          base_revision: p.chartId ? p.revision : 0,
          config: p.config,
          operations,
        }),
      );
      if (
        result.protocol_version !== 1 ||
        !sameProtectedFigure(p.config, result.config) ||
        result.config.datasetVersionId !== p.config.datasetVersionId ||
        result.source.dataset_version_id !== p.data.id ||
        result.source.sha256 !== p.data.sha256
      )
        throw new Error("预览来源不一致，请重新打开当前图表");
      setPreview({ result, token });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) p.onClose();
      }}
      title="快捷操作"
      description="把多项调整一起预览、一起应用。字段映射与实验数据保持原样。"
      wide
      className="quick-actions-dialog"
    >
      <div className="quick-actions-body">
        <section className="quick-actions-builder" aria-label="操作编辑">
          {catalog.isPending ? (
            <p role="status">正在读取可用操作…</p>
          ) : catalog.isError ? (
            <div role="alert">
              {catalog.error.message}
              <Button onClick={() => catalog.refetch()}>重试</Button>
            </div>
          ) : !compatible ? (
            <p role="alert">操作协议不兼容，请更新前后端后重试。</p>
          ) : (
            <>
              <fieldset disabled={busy}>
                <label className="quick-tool-select">
                  选择操作
                  <select
                    aria-label="选择快捷操作"
                    value={tool}
                    onChange={(e) => selectTool(e.target.value)}
                  >
                    {availableTools.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="quick-actions-note">
                  勾选要调整的属性，未勾选的保留原样。
                </p>
                {tool === "set_style" && p.config.publication?.enabled && (
                  <p className="quick-actions-note">
                    论文尺寸已启用，本次调整成品字号（pt）。
                  </p>
                )}
                <div className="quick-fields">
                  {spec &&
                    Object.entries(spec.input_schema.properties)
                      .filter(([key]) =>
                        toolFieldAvailable(
                          tool,
                          key,
                          p.config,
                          String(values.axis || "y"),
                        ),
                      )
                      .map(([key, rule]) => {
                        const required =
                            spec.input_schema.required.includes(key),
                          active = required || enabled.includes(key);
                        const label =
                          key === "width" && tool === "set_series"
                            ? "线宽"
                            : key === "title"
                              ? tool === "set_axis"
                                ? "轴标题"
                                : "图表标题"
                              : toolFieldNames[key] || key;
                        const update = (value: string | number | boolean) => {
                          if (
                            required &&
                            (key === "axis" || key === "seriesId")
                          ) {
                            setValues(
                              operationValues(tool, p.config, String(value)),
                            );
                            setEnabled((fields) =>
                              fields.filter((k) =>
                                toolFieldAvailable(
                                  tool,
                                  k,
                                  p.config,
                                  String(value),
                                ),
                              ),
                            );
                          } else setValues((v) => ({ ...v, [key]: value }));
                        };
                        const numeric =
                          Array.isArray(rule.type) ||
                          rule.type === "number" ||
                          rule.type === "integer";
                        return (
                          <div
                            className={`quick-field ${active ? "active" : ""}`}
                            key={key}
                          >
                            {required ? (
                              <span>{label}</span>
                            ) : (
                              <label className="quick-field-toggle">
                                <input
                                  type="checkbox"
                                  aria-label={`调整${label}`}
                                  checked={active}
                                  onChange={(e) =>
                                    setEnabled((v) =>
                                      e.target.checked
                                        ? [...v, key]
                                        : v.filter((k) => k !== key),
                                    )
                                  }
                                />
                                {label}
                              </label>
                            )}
                            {key === "seriesId" ? (
                              <select
                                aria-label={label}
                                value={String(values[key] || "")}
                                onChange={(e) => update(e.target.value)}
                              >
                                {p.config.series.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name}
                                  </option>
                                ))}
                              </select>
                            ) : rule.enum ? (
                              <select
                                aria-label={label}
                                disabled={!active}
                                value={String(values[key] ?? rule.enum[0])}
                                onChange={(e) => update(e.target.value)}
                              >
                                {rule.enum.map((v) => (
                                  <option key={v} value={v}>
                                    {toolValueNames[v] || v}
                                  </option>
                                ))}
                              </select>
                            ) : rule.type === "boolean" ? (
                              <select
                                aria-label={label}
                                disabled={!active}
                                value={String(values[key] ?? false)}
                                onChange={(e) =>
                                  update(e.target.value === "true")
                                }
                              >
                                <option value="true">
                                  {key === "log"
                                    ? "对数"
                                    : key === "bold"
                                      ? "加粗"
                                      : "开启"}
                                </option>
                                <option value="false">
                                  {key === "log"
                                    ? "线性"
                                    : key === "bold"
                                      ? "常规"
                                      : "关闭"}
                                </option>
                              </select>
                            ) : (
                              <input
                                aria-label={label}
                                disabled={!active}
                                type={numeric ? "number" : "text"}
                                min={rule.minimum ?? rule.exclusiveMinimum}
                                max={rule.maximum}
                                maxLength={rule.maxLength || 500}
                                step={rule.type === "integer" ? 1 : "any"}
                                placeholder={
                                  Array.isArray(rule.type)
                                    ? "留空为自动"
                                    : undefined
                                }
                                value={String(values[key] ?? "")}
                                onChange={(e) => update(e.target.value)}
                              />
                            )}
                          </div>
                        );
                      })}
                </div>
                <Button
                  variant="outline"
                  disabled={!spec || !enabled.length || operations.length >= 30}
                  onClick={() => {
                    try {
                      const operation = makeToolOperation(
                        spec!,
                        values,
                        enabled.filter((k) =>
                          toolFieldAvailable(
                            tool,
                            k,
                            p.config,
                            String(values.axis || "y"),
                          ),
                        ),
                      );
                      setOperations((v) => [...v, operation]);
                      invalidate();
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  <Plus size={14} />
                  加入调整清单
                </Button>
              </fieldset>
              <div className="quick-queue-heading">
                <h3>
                  <ListChecks size={14} />
                  待调整 · {operations.length}/30
                </h3>
                <Button
                  variant="ghost"
                  disabled={busy || !operations.length}
                  onClick={() => {
                    setOperations([]);
                    invalidate();
                  }}
                >
                  清空
                </Button>
              </div>
              {!operations.length ? (
                <p className="quick-actions-note">
                  加入一项或多项操作，再预览最终效果。
                </p>
              ) : (
                <ol className="quick-queue">
                  {operations.map((op, i) => (
                    <li key={i}>
                      <div>
                        <strong>
                          {
                            catalog.data.tools.find((s) => s.name === op.tool)
                              ?.label
                          }
                        </strong>
                        <small>
                          {Object.entries(op.arguments)
                            .map(
                              ([k, v]) =>
                                `${toolFieldNames[k] || k}：${k === "seriesId" ? p.config.series.find((s) => s.id === v)?.name || v : displayToolValue(v, k)}`,
                            )
                            .join(" · ")}
                        </small>
                      </div>
                      <button
                        disabled={busy}
                        aria-label={`移除第 ${i + 1} 项调整`}
                        onClick={() => {
                          setOperations((v) => v.filter((_, n) => n !== i));
                          invalidate();
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
          <Button
            disabled={busy || !compatible || !operations.length}
            onClick={check}
          >
            {busy ? "正在校验…" : "验证并预览"}
          </Button>
        </section>
        <aside className="quick-result">
          <div className="quick-result-scroll">
            <div className="quick-result-heading">
              <h3>{preview ? "调整后预览" : "当前画布"}</h3>
              <span>
                {preview
                  ? `${preview.result.changes.length} 处变化`
                  : "尚未应用"}
              </span>
            </div>
            <StylePreview
              config={preview?.result.config || p.config}
              data={p.data}
            />
            {!preview ? (
              <p className="quick-actions-note">预览不会保存或修改当前图表。</p>
            ) : !preview.result.changes.length ? (
              <p className="quick-actions-note">
                这些设置与当前画布相同，无需应用。
              </p>
            ) : (
              <ul className="quick-changes" aria-label="修改明细">
                {preview.result.changes.map((v) => (
                  <li key={v.path}>
                    <strong>{changeLabel(v.path, p.config)}</strong>
                    <span>
                      <del>
                        {displayToolValue(v.before, v.path.split("/").at(-1))}
                      </del>
                      <ArrowRight size={12} />
                      {displayToolValue(v.after, v.path.split("/").at(-1))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="quick-result-footer">
            <p>应用作为一步操作，可撤销。正式版本仍需点击保存。</p>
            <Button
              disabled={busy || !preview || !preview.result.changes.length}
              onClick={() => {
                if (!preview) return;
                if (
                  p.onApply(
                    preview.token,
                    preview.result.config,
                    preview.result.operation_count,
                  )
                )
                  p.onClose();
                else {
                  setPreview(null);
                  setError(
                    "画布已变化，请重新验证并预览，避免覆盖刚才的编辑。",
                  );
                }
              }}
            >
              应用这组调整
              <ArrowRight size={15} />
            </Button>
          </div>
        </aside>
      </div>
    </Dialog>
  );
}
