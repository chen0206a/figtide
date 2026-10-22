import { useQuery } from "@tanstack/react-query";
import { ArrowUp, ChartNoAxesCombined, ChevronRight } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "../../lib/api";
import "./home.css";
import { relativeTime, type ChartSummary } from "./homeData";

type Provider = { available: boolean; model: string };
export function RecentCharts({
  charts,
  total,
  enabled,
  onChart,
}: {
  charts: ChartSummary[];
  total: number;
  enabled: boolean;
  onChart: (id: number) => void;
}) {
  const [limit, setLimit] = useState(4);
  return (
    <section
      className="home-card home-recents"
      aria-labelledby="home-recents-title"
    >
      <div className="home-card-head">
        <h2 id="home-recents-title">最近图表</h2>
        {total > 0 && <span className="home-meta">共 {total} 张</span>}
      </div>
      {!enabled ? (
        <p className="home-muted">创建项目并保存图表后显示在这里。</p>
      ) : charts.length ? (
        <ul className="home-list">
          {charts.slice(0, limit).map((chart) => (
            <li key={chart.id}>
              <button
                type="button"
                className="home-list-item"
                onClick={() => onChart(chart.id)}
              >
                <span className="home-list-icon" aria-hidden="true">
                  <ChartNoAxesCombined size={18} />
                </span>
                <span className="home-list-text">
                  <strong title={chart.name}>{chart.name}</strong>
                  <small>
                    v{chart.revision} · {relativeTime(chart.updated_at)}
                  </small>
                </span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="home-muted">
          {total === 1 ? "目前只有左侧这一张图表。" : "还没有保存的图表。"}
        </p>
      )}
      {charts.length > limit && (
        <button
          type="button"
          className="home-more"
          onClick={() => setLimit((n) => n + 8)}
        >
          显示更多图表（剩余 {charts.length - limit}）
        </button>
      )}
    </section>
  );
}

export function AssistantCard({
  chartId,
  onAssistant,
  onModelConnection,
}: {
  chartId?: number;
  onAssistant?: (chartId: number, prompt: string) => void;
  onModelConnection?: () => void;
}) {
  const provider = useQuery({
    queryKey: ["agent-provider"],
    queryFn: () => api<Provider>("/agent/provider"),
  });
  const [prompt, setPrompt] = useState("");
  const ready = !!provider.data?.available && !!chartId && !!onAssistant;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready && prompt.trim()) onAssistant!(chartId!, prompt.trim());
  };
  return (
    <section className="home-assistant" aria-labelledby="home-assistant-title">
      <div className="home-card-head">
        <h2 id="home-assistant-title">绘图助手</h2>
        <span className="home-assistant-model lf-mono">
          <span
            className={`lf-dot ${provider.data?.available ? "is-live" : "is-off"}`}
          />
          {provider.data?.available ? provider.data.model : "未连接模型"}
        </span>
      </div>
      {provider.data?.available ? (
        <form onSubmit={submit} className="home-assistant-form">
          <label htmlFor="home-assistant-input">
            {chartId
              ? "对最近的图说出想改的地方，会在编辑器中先预览，确认后才应用。"
              : "保存第一张图表后，就可以在这里描述修改。"}
          </label>
          <div className="home-assistant-field">
            <input
              id="home-assistant-input"
              type="text"
              value={prompt}
              maxLength={2000}
              disabled={!ready}
              placeholder="把图例放到右侧，字号改为 16"
              onChange={(e) => setPrompt(e.target.value)}
            />
            <button
              type="submit"
              aria-label="在编辑器中打开助手"
              disabled={!ready || !prompt.trim()}
            >
              <ArrowUp size={16} aria-hidden="true" />
            </button>
          </div>
          <div className="home-assistant-chips">
            {["图例放到右侧", "隐藏网格线", "整体字号改为 18"].map((text) => (
              <button
                key={text}
                type="button"
                disabled={!ready}
                onClick={() => setPrompt(text)}
              >
                {text}
              </button>
            ))}
          </div>
        </form>
      ) : (
        <div className="home-assistant-form">
          <p>连接任意兼容 Chat Completions 的模型后，可以用一句话调整图表。</p>
          {onModelConnection && (
            <button
              type="button"
              className="home-btn home-btn-inverse"
              onClick={onModelConnection}
            >
              配置模型连接
            </button>
          )}
        </div>
      )}
    </section>
  );
}
