import { useState, useEffect } from "react";
import type { JsonValue } from "../lib/api";
import { Button } from "../components/ui/button";
type Row = {
  id: string;
  key: string;
  type: "number" | "string" | "boolean" | "null" | "json";
  text: string;
};
function validateJson(value: JsonValue, depth = 0) {
  if (depth > 30) throw new Error("JSON 嵌套过深");
  if (typeof value === "number" && !Number.isFinite(value))
    throw new Error("数值超出可用范围");
  if (value !== null && typeof value === "object")
    Object.values(value).forEach((v) => validateJson(v, depth + 1));
}
function rowsOf(value: Record<string, JsonValue>): Row[] {
  return Object.entries(value).map(([key, v]) => ({
    id: crypto.randomUUID(),
    key,
    type:
      v === null
        ? "null"
        : typeof v === "object"
          ? "json"
          : (typeof v as Row["type"]),
    text: typeof v === "string" ? v : JSON.stringify(v),
  }));
}
function read(rows: Row[]): Record<string, JsonValue> {
  const out: Record<string, JsonValue> = Object.create(null);
  for (const row of rows) {
    const key = row.key.trim();
    if (!key || key.length > 120)
      throw new Error("字段名不能为空，最多 120 字符");
    if (Object.hasOwn(out, key)) throw new Error(`字段名“${key}”重复`);
    if (row.type === "number") {
      if (!row.text.trim() || !Number.isFinite(Number(row.text)))
        throw new Error(`${key} 需要有限数值`);
      out[key] = Number(row.text);
    } else if (row.type === "null") out[key] = null;
    else if (row.type === "boolean") out[key] = row.text === "true";
    else if (row.type === "json") {
      try {
        out[key] = JSON.parse(row.text);
      } catch {
        throw new Error(`${key} 的 JSON 无效`);
      }
    } else out[key] = row.text;
  }
  validateJson(out);
  return out;
}
export function ObjectFields({
  label,
  value,
  onChange,
  onValid,
}: {
  label: string;
  value: Record<string, JsonValue>;
  onChange: (v: Record<string, JsonValue>) => void;
  onValid: (v: boolean) => void;
}) {
  const [rows, setRows] = useState(() => rowsOf(value));
  const [advanced, setAdvanced] = useState(false);
  const [raw, setRaw] = useState(JSON.stringify(value, null, 2));
  const [error, setError] = useState("");
  useEffect(() => {
    onValid(!error);
  }, [error, onValid]);
  function update(next: Row[]) {
    setRows(next);
    try {
      const result = read(next);
      onChange(result);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function jsonChange(text: string) {
    setRaw(text);
    try {
      const v = JSON.parse(text);
      if (v === null || typeof v !== "object" || Array.isArray(v))
        throw new Error();
      validateJson(v);
      onChange(v);
      setRows(rowsOf(v));
      setError("");
    } catch {
      setError("请输入有效的 JSON 对象");
    }
  }
  return (
    <section className="object-fields">
      <div className="form-section-head">
        <h3>{label}</h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!!error}
          onClick={() => {
            setRaw(JSON.stringify(value, null, 2));
            setAdvanced(!advanced);
          }}
        >
          {advanced ? "返回表单" : `${label}高级 JSON`}
        </Button>
      </div>
      {advanced ? (
        <textarea
          className="code-input"
          aria-label={`${label}（JSON）`}
          value={raw}
          onChange={(e) => jsonChange(e.target.value)}
        />
      ) : (
        <>
          {rows.length > 0 && (
            <div className="kv-head">
              <span>名称</span>
              <span>类型</span>
              <span>值</span>
            </div>
          )}
          {rows.map((r, i) => (
            <div className="kv-row" key={r.id}>
              <input
                aria-label={`${label} ${i + 1} 名称`}
                maxLength={120}
                placeholder={
                  label === "参数" ? "例如 learning_rate" : "例如 accuracy"
                }
                value={r.key}
                onChange={(e) =>
                  update(
                    rows.map((a) =>
                      a.id === r.id ? { ...a, key: e.target.value } : a,
                    ),
                  )
                }
              />
              <select
                aria-label={`${label} ${i + 1} 类型`}
                value={r.type}
                onChange={(e) =>
                  update(
                    rows.map((a) =>
                      a.id === r.id
                        ? {
                            ...a,
                            type: e.target.value as Row["type"],
                            text:
                              e.target.value === "boolean" ? "true" : a.text,
                          }
                        : a,
                    ),
                  )
                }
              >
                <option value="number">数值</option>
                <option value="string">文本</option>
                <option value="boolean">布尔</option>
                <option value="null">缺失</option>
                <option value="json">JSON</option>
              </select>
              {r.type === "boolean" ? (
                <select
                  aria-label={`${label} ${i + 1} 值`}
                  value={r.text}
                  onChange={(e) =>
                    update(
                      rows.map((a) =>
                        a.id === r.id ? { ...a, text: e.target.value } : a,
                      ),
                    )
                  }
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input
                  aria-label={`${label} ${i + 1} 值`}
                  disabled={r.type === "null"}
                  placeholder={r.type === "null" ? "缺失" : "输入值"}
                  value={r.type === "null" ? "" : r.text}
                  onChange={(e) =>
                    update(
                      rows.map((a) =>
                        a.id === r.id ? { ...a, text: e.target.value } : a,
                      ),
                    )
                  }
                />
              )}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`删除${label} ${i + 1}`}
                onClick={() => update(rows.filter((a) => a.id !== r.id))}
              >
                ×
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={rows.length >= 100}
            onClick={() =>
              update([
                ...rows,
                { id: crypto.randomUUID(), key: "", type: "number", text: "" },
              ])
            }
          >
            添加{label}
          </Button>
        </>
      )}
      {label === "指标" && (
        <p className="field-help">
          有限数值可用于对比与绘图；文本、缺失和嵌套对象保留原值，不按 0 处理。
        </p>
      )}
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
    </section>
  );
}
