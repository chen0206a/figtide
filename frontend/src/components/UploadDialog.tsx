import { useEffect, useRef, useState } from "react";
import {
  api,
  defaultImportRules,
  type Dataset,
  type FieldRole,
  type ImportPreview,
  type ImportRules,
} from "../lib/api";
import { formatBytes } from "../lib/format";
import { checkImportShape, shapeWarning } from "../lib/importChecks";
import { Dialog } from "./ui/dialog";
import { Button } from "./ui/button";
const roles: Record<FieldRole, string> = {
  none: "不指定",
  x: "X 轴",
  y: "Y 序列",
  group: "分组",
  error: "误差",
};
export function UploadDialog({
  file,
  project,
  version,
  onClose,
  onImported,
}: {
  file: File;
  project: number;
  version: number | null;
  onClose: () => void;
  onImported: (d: Dataset) => void | Promise<void>;
}) {
  const [rules, setRules] = useState<ImportRules>(() => ({
    ...defaultImportRules(),
    delimiter: /\.tsv$/i.test(file.name)
      ? "\t"
      : /\.txt$/i.test(file.name)
        ? "auto"
        : ",",
  }));
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [acceptShape, setAcceptShape] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [committing, setCommitting] = useState(false);
  const [confirmedRules, setConfirmedRules] = useState("");
  const seq = useRef(0);
  const rulesKey = JSON.stringify(rules);
  useEffect(() => {
    const token = ++seq.current;
    const abort = new AbortController();
    setBusy(true);
    setError("");
    const timer = setTimeout(async () => {
      try {
        if (
          !/\.(csv|tsv|txt|xlsx|json|jsonl)$/i.test(file.name) ||
          file.size === 0 ||
          file.size > 10 * 1024 * 1024
        )
          throw new Error(
            "请选择 10 MB 以内的非空 CSV、TSV、TXT、XLSX、JSON 或 JSONL 文件",
          );
        const form = new FormData();
        form.append("file", file);
        form.append("rules", rulesKey);
        const result = await api<ImportPreview>(
          `/projects/${project}/datasets/preview`,
          { method: "POST", body: form, signal: abort.signal },
        );
        if (token === seq.current) {
          setPreview(result);
          setConfirmedRules(rulesKey);
        }
      } catch (e) {
        if (token === seq.current && !abort.signal.aborted)
          setError((e as Error).message);
      } finally {
        if (token === seq.current && !abort.signal.aborted) setBusy(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [file, project, rulesKey, attempt]);
  async function commit() {
    setCommitting(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("rules", rulesKey);
      const result = await api<Dataset>(
        `/projects/${project}/datasets${version ? `/${version}/versions` : ""}`,
        { method: "POST", body: form },
      );
      await onImported(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCommitting(false);
    }
  }
  function role(field: string, value: FieldRole) {
    setRules((r) => {
      const next = { ...r.roles };
      if (["x", "group", "error"].includes(value))
        Object.keys(next).forEach((k) => {
          if (next[k] === value) next[k] = "none";
        });
      next[field] = value;
      return { ...r, roles: next };
    });
  }
  return (
    <Dialog
      wide
      open
      onOpenChange={(v) => {
        if (!v && !committing) onClose();
      }}
      title="确认数据导入"
      description="文件只保存在这台电脑上，不会上传到任何外部服务器。预览 → 确认字段 → 保存版本。调整解析不会修改原文件。"
    >
      <div className="import-file">
        <strong>{file.name}</strong>
        <span>
          {formatBytes(file.size)} ·{" "}
          {version ? "新版本" : "新数据集"}
        </span>
      </div>
      <fieldset disabled={committing} className="import-options">
        {/\.(csv|tsv|txt)$/i.test(file.name) ? (
          <label>
            分隔符
            <select
              disabled={/\.tsv$/i.test(file.name)}
              value={rules.delimiter}
              onChange={(e) =>
                setRules({
                  ...rules,
                  delimiter: e.target.value,
                  types: {},
                  roles: {},
                })
              }
            >
              <option value="auto">自动识别</option>
              <option value="|">竖线</option>
              <option value=",">逗号</option>
              <option value=";">分号</option>
              <option value={"\t"}>制表符</option>
            </select>
          </label>
        ) : /\.xlsx$/i.test(file.name) ? (
          <label>
            工作表
            <select
              value={rules.sheet}
              onChange={(e) =>
                setRules({
                  ...rules,
                  sheet: Number(e.target.value),
                  types: {},
                  roles: {},
                })
              }
            >
              {(preview?.sheets.length ? preview.sheets : ["第一张工作表"]).map(
                (s, i) => (
                  <option value={i} key={i}>
                    {s}
                  </option>
                ),
              )}
            </select>
          </label>
        ) : /\.json$/i.test(file.name) ? (
          <label>
            JSON 记录路径
            <select
              aria-label="JSON 记录路径"
              value={rules.recordsPath || ""}
              onChange={(e) =>
                setRules({
                  ...rules,
                  recordsPath: e.target.value,
                  types: {},
                  roles: {},
                })
              }
            >
              <option value="">自动识别</option>
              {preview?.record_paths?.filter(Boolean).map((path) => (
                <option key={path} value={path}>
                  {path}
                </option>
              ))}
            </select>
            <small>嵌套对象按点号展开；每行一个观测值。</small>
          </label>
        ) : (
          <p>JSONL：每行一个对象，嵌套对象按点号展开。</p>
        )}
        <label>
          缺失符号（以逗号分隔）
          <input
            placeholder="例如 NA, N/A"
            value={rules.missingValues.join(",")}
            onChange={(e) =>
              setRules({
                ...rules,
                missingValues: e.target.value.split(",").map((s) => s.trim()),
              })
            }
          />
        </label>
      </fieldset>
      <p className="subtle">
        空白自动记为缺失。−999、&lt;0.01 等值只在你明确指定后处理。
      </p>
      {busy && <p role="status">正在检查数据…</p>}
      {error && (
        <p className="inline-error" role="alert">
          {error}
          <Button
            variant="outline"
            disabled={busy || committing}
            onClick={() => setAttempt((n) => n + 1)}
          >
            重新检查
          </Button>
        </p>
      )}
      {preview && (() => {
        const shape = checkImportShape({
          fieldNames: preview.fields.map((f) => f.name),
          rowCount: preview.row_count,
        });
        return (
        <div aria-busy={busy}>
          {!shape.looksLikeTable && (
            <div className="import-warning" role="alert">
              <p>{shapeWarning(shape)}</p>
              <label className="import-acknowledge">
                <input
                  type="checkbox"
                  checked={acceptShape}
                  onChange={(e) => setAcceptShape(e.target.checked)}
                />
                我确认这是一份单列数据，仍要导入
              </label>
            </div>
          )}
          <div className="section-caption">
            {preview.row_count} 行 · {preview.fields.length} 个字段 · 预览前 20
            行
          </div>
          {Object.values(rules.roles).filter((r) => r === "y").length > 1 &&
            rules.roles &&
            Object.values(rules.roles).includes("error") && (
              <p className="import-warning">
                多个 Y
                序列时，请进入绘图器为各序列分别指定误差列，系统不会自动套用同一列。
              </p>
            )}
          <div className="import-fields">
            <table className="lf-table">
              <thead>
                <tr>
                  <th>原始字段</th>
                  <th>系统推断 → 导入类型</th>
                  <th>质量</th>
                  <th>建议 → 确认角色</th>
                </tr>
              </thead>
              <tbody>
                {preview.fields.map((f) => (
                  <tr key={f.name}>
                    <td>
                      <strong>{f.name}</strong>
                      <small>{f.samples?.join(" / ")}</small>
                    </td>
                    <td>
                      <small>
                        {f.inferredType === "number" ? "数值" : "文本"}
                        {rules.types[f.name] ? " · 已手动指定" : " · 自动推断"}
                      </small>
                      <select
                        disabled={committing}
                        aria-label={`${f.name} 类型`}
                        value={rules.types[f.name] || "auto"}
                        onChange={(e) =>
                          setRules((r) => {
                            const t = { ...r.types };
                            if (e.target.value === "auto") delete t[f.name];
                            else
                              t[f.name] = e.target.value as "number" | "string";
                            return { ...r, types: t };
                          })
                        }
                      >
                        <option value="auto">使用推断</option>
                        <option value="number">数值</option>
                        <option value="string">文本</option>
                      </select>
                    </td>
                    <td>
                      {f.missing} 个缺失 · {f.unique} 个不同值
                      {f.constant && <small>常量列</small>}
                    </td>
                    <td>
                      {shape.looksLikeTable && (
                        <small>
                          建议：{roles[f.suggestedRole || "none"]}（列名 / 类型 /
                          唯一值）
                        </small>
                      )}
                      <select
                        disabled={committing}
                        aria-label={`${f.name} 角色`}
                        value={rules.roles[f.name] || "none"}
                        onChange={(e) =>
                          role(f.name, e.target.value as FieldRole)
                        }
                      >
                        {Object.entries(roles).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.issues.length > 0 && (
            <div className="inline-error" role="alert">
              请解决下列问题后再导入（最多显示 100 条）
              {preview.issues.map((i, n) => (
                <div key={n}>
                  第 {i.row} 行 · {i.field} · “{i.value}”：{i.message}
                </div>
              ))}
            </div>
          )}
          {preview.warnings.map((w) => (
            <p className="import-warning" key={w}>
              {w}
            </p>
          ))}
          <details>
            <summary>查看数据预览</summary>
            <div className="table-scroll">
              <table className="lf-table">
                <thead>
                  <tr>
                    {preview.fields.map((f) => (
                      <th key={f.name}>{f.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r, i) => (
                    <tr key={i}>
                      {preview.fields.map((f) => (
                        <td key={f.name}>{r[f.name] ?? "缺失"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
        );
      })()}
      <div className="dialog-actions">
        <Button variant="outline" disabled={committing} onClick={onClose}>
          取消
        </Button>
        <Button
          disabled={
            busy ||
            committing ||
            !!error ||
            !preview ||
            preview.issues.length > 0 ||
            confirmedRules !== rulesKey ||
            (!checkImportShape({
              fieldNames: preview.fields.map((f) => f.name),
              rowCount: preview.row_count,
            }).looksLikeTable &&
              !acceptShape)
          }
          onClick={commit}
        >
          {committing ? "正在保存…" : "确认导入"}
        </Button>
      </div>
    </Dialog>
  );
}
