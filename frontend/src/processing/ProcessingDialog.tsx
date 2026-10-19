import { useRef, useState } from "react";
import {
  api,
  send,
  type Dataset,
  type ProcessingPreview,
  type ProcessingRules,
} from "../lib/api";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import { DataTable } from "../components/DataTable";
import "./processing.css";

export function initialRules(data: Dataset): ProcessingRules {
  const metric = data.fields.find(
    (f) =>
      f.type === "number" && !/^(epoch|seed|run|sample_id|id)$/i.test(f.name),
  )?.name;
  return {
    schema_version: 1,
    mode: "aggregate",
    groupBy: [],
    metrics: metric ? [metric] : [],
    filters: [],
    sort: [],
    missingGroup: "include",
    error: "sd",
    observationUnit: "",
    replicate: "",
    x: "",
    group: "",
    display: "bars",
  };
}
export function ProcessingDialog({
  project,
  data,
  onClose,
  onSaved,
}: {
  project: number;
  data: Dataset;
  onClose: () => void;
  onSaved: (data: Dataset, plot: boolean) => void;
}) {
  const [rules, setRules] = useState(() => initialRules(data));
  const [name, setName] = useState(
    data.filename.replace(/\.[^.]+$/, "").slice(0, 100) + " · 汇总",
  );
  const [preview, setPreview] = useState<ProcessingPreview | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  const sequence = useRef(0);
  const change = (value: Partial<ProcessingRules>) => {
    sequence.current++;
    setRules({ ...rules, ...value });
    setPreview(null);
    setError("");
  };
  const grouped = rules.mode === "aggregate";
  const valid =
    name.trim() &&
    (!grouped || (rules.metrics.length > 0 && rules.observationUnit.trim()));
  const fields = data.fields.map((f) => f.name),
    nums = data.fields.filter((f) => f.type === "number").map((f) => f.name);
  const options = grouped ? rules.groupBy : fields;
  async function calculate() {
    const seq = ++sequence.current;
    setBusy("preview");
    setError("");
    try {
      const result = await api<ProcessingPreview>(
        `/projects/${project}/data/${data.id}/process/preview`,
        send("POST", { name, rules }),
      );
      if (seq === sequence.current) setPreview(result);
    } catch (e) {
      if (seq === sequence.current) setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function save(plot: boolean) {
    if (!preview) return;
    setBusy("save");
    setError("");
    try {
      const result = await api<Dataset>(
        `/projects/${project}/data/${data.id}/process`,
        send("POST", { name, rules }),
      );
      onSaved(result, plot);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const select = (
    label: string,
    value: string,
    values: string[],
    onChange: (s: string) => void,
    empty?: string,
  ) => (
    <label>
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {empty && <option value="">{empty}</option>}
        {values.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <Dialog
      wide
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
      title="数据处理与重复实验汇总"
      description="先预览，再保存独立结果。所有计算由本机服务完成，不覆盖源数据。"
    >
      <div className="processing-source">
        源数据：{data.filename} · v{data.version} · {data.row_count} 行 ·
        内容指纹 {data.sha256.slice(0, 12)}
      </div>
      {data.source_meta?.kind === "data_processing" &&
        data.source_meta.rules.mode === "aggregate" && (
          <p className="processing-note">
            当前数据已是统计汇总。再次统计将以汇总行为观测，不能替代原始重复实验；可从「数据处理来源」追溯源数据。
          </p>
        )}
      <fieldset disabled={!!busy} className="processing-form">
        <div className="processing-grid">
          <label>
            结果名称
            <input
              aria-label="结果名称"
              maxLength={120}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                sequence.current++;
                setPreview(null);
              }}
            />
          </label>
          <label>
            处理方式
            <select
              aria-label="处理方式"
              value={rules.mode}
              onChange={(e) =>
                change({
                  mode: e.target.value as ProcessingRules["mode"],
                  sort: [],
                  display: "bars",
                })
              }
            >
              <option value="aggregate">分组统计重复观测</option>
              <option value="sort">只筛选与排序</option>
            </select>
          </label>
        </div>
        {grouped && (
          <>
            <div className="processing-grid">
              <section>
                <h3>
                  分组字段 <small>最多 4 列</small>
                </h3>
                <div className="processing-field-list">
                  {fields.map((f) => (
                    <label key={f}>
                      <input
                        type="checkbox"
                        aria-label={`分组字段 ${f}`}
                        checked={rules.groupBy.includes(f)}
                        disabled={
                          !rules.groupBy.includes(f) &&
                          rules.groupBy.length >= 4
                        }
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...rules.groupBy, f]
                            : rules.groupBy.filter((v) => v !== f);
                          change({
                            groupBy: next,
                            x: next.includes(rules.x) ? rules.x : next[0] || "",
                            group: next.includes(rules.group)
                              ? rules.group
                              : "",
                            sort: [],
                            display: "bars",
                          });
                        }}
                      />
                      {f}
                    </label>
                  ))}
                </div>
                <p>
                  未选择时，对全部行汇总为一组。模型、评估集、epoch
                  等不同条件应分别分组。
                </p>
              </section>
              <section>
                <h3>
                  数值指标 <small>最多 5 列</small>
                </h3>
                <div className="processing-field-list">
                  {nums.map((f) => (
                    <label key={f}>
                      <input
                        type="checkbox"
                        aria-label={`统计指标 ${f}`}
                        checked={rules.metrics.includes(f)}
                        disabled={
                          !rules.metrics.includes(f) &&
                          rules.metrics.length >= 5
                        }
                        onChange={(e) =>
                          change({
                            metrics: e.target.checked
                              ? [...rules.metrics, f]
                              : rules.metrics.filter((v) => v !== f),
                          })
                        }
                      />
                      {f}
                    </label>
                  ))}
                </div>
                <p>
                  每个指标输出 total、有效 n、缺失数、mean、SD、SEM
                  和选定误差的上下界。
                </p>
              </section>
            </div>
            <div className="processing-grid">
              <label>
                每行代表的观测单位
                <input
                  aria-label="每行代表的观测单位"
                  maxLength={120}
                  placeholder="例如：同一 epoch 下，一个独立 seed 的一次运行"
                  value={rules.observationUnit}
                  onChange={(e) => change({ observationUnit: e.target.value })}
                />
              </label>
              {select(
                "重复标识列",
                rules.replicate,
                fields,
                (replicate) => change({ replicate }),
                "不校验标识 · 请自行确认独立观测",
              )}
            </div>
            <p className="processing-note">
              选择重复标识后，同一组内标识必须唯一且非缺失。不同 epoch
              不应直接当作同一实验条件下的独立重复。SEM 的解释依赖独立观测假设。
            </p>
            <div className="processing-grid">
              <label>
                误差口径
                <select
                  aria-label="误差口径"
                  value={rules.error}
                  onChange={(e) =>
                    change({
                      error: e.target.value as ProcessingRules["error"],
                    })
                  }
                >
                  <option value="sd">样本标准差 SD（n−1）</option>
                  <option value="sem">均值标准误 SEM（SD / √n）</option>
                  <option value="none">只绘均值，不显示误差</option>
                </select>
              </label>
              <label>
                缺失分组值
                <select
                  aria-label="缺失分组值"
                  value={rules.missingGroup}
                  onChange={(e) =>
                    change({
                      missingGroup: e.target
                        .value as ProcessingRules["missingGroup"],
                    })
                  }
                >
                  <option value="include">保留为独立组</option>
                  <option value="exclude">明确排除这些行</option>
                </select>
              </label>
            </div>
            <div className="processing-grid">
              {select(
                "汇总图 X 字段",
                rules.x,
                rules.groupBy,
                (x) =>
                  change({
                    x,
                    group: x === rules.group ? "" : rules.group,
                    display: "bars",
                  }),
                "单组 / 自动",
              )}
              {select(
                "汇总图类别分组",
                rules.group,
                rules.groupBy.filter((f) => f !== rules.x),
                (group) => change({ group }),
                "不分组",
              )}
            </div>
            <label>
              误差显示方式
              <select
                aria-label="误差显示方式"
                value={rules.display}
                onChange={(e) =>
                  change({
                    display: e.target.value as ProcessingRules["display"],
                  })
                }
              >
                <option value="bars">均值与误差棒</option>
                <option
                  value="band"
                  disabled={!nums.includes(rules.x) || rules.error === "none"}
                >
                  均值曲线与上下界区间带（数值 X）
                </option>
              </select>
            </label>
            <p className="processing-note">
              n &lt; 2 时 SD/SEM
              与上下界保持缺失；不把缺失当零，不自动生成置信区间或显著性。区间带需要按
              X 升序排列。
            </p>
            <p className="processing-note">
              除 X
              与类别外，若还有一个变化的分组条件，会自动分面；更多条件需在编辑器中明确过滤与排版，避免混合实验条件。
            </p>
          </>
        )}
        <section>
          <h3>
            源数据过滤 <small>先过滤，再汇总</small>
          </h3>
          {rules.filters.map((f, i) => (
            <div className="processing-rule" key={i}>
              {select(`过滤字段 ${i + 1}`, f.field, fields, (field) =>
                change({
                  filters: rules.filters.map((v, j) =>
                    j === i ? { ...v, field, operator: "eq" } : v,
                  ),
                }),
              )}
              <label>
                条件
                <select
                  aria-label={`过滤条件 ${i + 1}`}
                  value={f.operator}
                  onChange={(e) =>
                    change({
                      filters: rules.filters.map((v, j) =>
                        j === i
                          ? {
                              ...v,
                              operator: e.target.value as typeof f.operator,
                            }
                          : v,
                      ),
                    })
                  }
                >
                  <option value="eq">等于</option>
                  <option value="gte" disabled={!nums.includes(f.field)}>
                    大于等于
                  </option>
                  <option value="lte" disabled={!nums.includes(f.field)}>
                    小于等于
                  </option>
                  <option value="missing">缺失值</option>
                </select>
              </label>
              {f.operator !== "missing" && (
                <label>
                  值
                  <input
                    aria-label={`过滤值 ${i + 1}`}
                    maxLength={500}
                    value={f.value}
                    onChange={(e) =>
                      change({
                        filters: rules.filters.map((v, j) =>
                          j === i ? { ...v, value: e.target.value } : v,
                        ),
                      })
                    }
                  />
                </label>
              )}
              <Button
                variant="ghost"
                onClick={() =>
                  change({ filters: rules.filters.filter((_, j) => j !== i) })
                }
              >
                删除过滤 {i + 1}
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            disabled={rules.filters.length >= 8}
            onClick={() =>
              change({
                filters: [
                  ...rules.filters,
                  { field: fields[0], operator: "eq", value: "" },
                ],
              })
            }
          >
            添加源数据过滤
          </Button>
        </section>
        <section>
          <h3>
            结果排序 <small>按顺序比较，缺失始终在最后</small>
          </h3>
          {rules.sort.map((s, i) => (
            <div className="processing-rule" key={i}>
              {select(
                `排序字段 ${i + 1}`,
                s.field,
                options.filter(
                  (f) =>
                    f === s.field || !rules.sort.some((v) => v.field === f),
                ),
                (field) =>
                  change({
                    sort: rules.sort.map((v, j) =>
                      j === i ? { ...v, field } : v,
                    ),
                  }),
              )}
              <label>
                方向
                <select
                  aria-label={`排序方向 ${i + 1}`}
                  value={s.direction}
                  onChange={(e) =>
                    change({
                      sort: rules.sort.map((v, j) =>
                        j === i
                          ? {
                              ...v,
                              direction: e.target.value as typeof s.direction,
                            }
                          : v,
                      ),
                    })
                  }
                >
                  <option value="asc">升序</option>
                  <option value="desc">降序</option>
                </select>
              </label>
              <Button
                variant="ghost"
                onClick={() =>
                  change({ sort: rules.sort.filter((_, j) => j !== i) })
                }
              >
                删除排序 {i + 1}
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            disabled={
              rules.sort.length >= 4 ||
              options.every((f) => rules.sort.some((s) => s.field === f))
            }
            onClick={() =>
              change({
                sort: [
                  ...rules.sort,
                  {
                    field: options.find(
                      (f) => !rules.sort.some((s) => s.field === f),
                    )!,
                    direction: "asc",
                  },
                ],
              })
            }
          >
            添加结果排序
          </Button>
          <p>
            没有排序规则时保留源顺序或组首次出现的顺序。表格里的临时排序不自动写入处理规则。
          </p>
        </section>
      </fieldset>
      {error && (
        <p className="processing-error" role="alert">
          {error}
        </p>
      )}
      <div className="processing-actions">
        <Button
          variant="outline"
          disabled={!!busy || !valid}
          onClick={calculate}
        >
          {busy === "preview" ? "正在计算…" : "预览处理结果"}
        </Button>
        <span>{!preview && "修改规则后需重新预览"}</span>
        <Button
          variant="outline"
          disabled={!!busy || !preview}
          onClick={() => save(false)}
        >
          保存独立数据集
        </Button>
        <Button disabled={!!busy || !preview} onClick={() => save(true)}>
          {busy === "save" ? "正在保存…" : "保存并绘图"}
        </Button>
      </div>
      {preview && (
        <section className="processing-preview" aria-label="处理结果预览">
          <div className="processing-counts">
            <strong>
              源数据 {preview.counts.source_rows} 行 → 结果 {preview.row_count}{" "}
              行
            </strong>
            <span>
              过滤后 {preview.counts.filtered_rows} 行 · 总排除{" "}
              {preview.counts.excluded_rows} 行 · {preview.counts.groups} 个组
            </span>
          </div>
          {preview.warnings.map((w) => (
            <p className="warning" key={w}>
              {w}
            </p>
          ))}
          <p>
            仅预览前 {preview.rows.length}{" "}
            行；保存时服务端按相同规则重新计算完整结果。
          </p>
          <DataTable
            data={{
              ...preview,
              id: 0,
              dataset_id: 0,
              version: 1,
              filename: name,
              sha256: "",
              row_count: preview.rows.length,
            }}
          />
        </section>
      )}
    </Dialog>
  );
}
