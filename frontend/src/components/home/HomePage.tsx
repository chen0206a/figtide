import {
  ArrowRight,
  ChartColumn,
  ChartNoAxesCombined,
  FileSpreadsheet,
  Plus,
  Sigma,
  Upload,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { type Project } from "../../lib/api";
import "./home.css";
import "./home-motion.css";
import {useEntrance} from "../../lib/useMotion";
import { dateLabel, greeting, type ChartSummary } from "./homeData";

import { ContinueCard } from "./ContinueCard";
import { AssistantCard, RecentCharts } from "./HomeSide";
import { ExperimentsPanel, ProjectsPanel } from "./HomeTables";
import { SampleThumbnail } from "./SampleThumbnail";
import { Dialog } from "../ui/dialog";
import { dataPrivacy, dataPrivacyDetails, dataPrivacyLocalService } from "../../lib/privacy";
export type HomePageProps = {
  projects: Project[];
  currentId: number;
  charts: ChartSummary[];
  chartsLoading: boolean;
  chartsError?: string;
  busy: boolean;
  onCreate: () => void;
  onProject: (id: number) => void;
  onPlot: () => void;
  onUpload: () => void;
  onExperiments: () => void;
  onData: () => void;
  onChart: (id: number) => void;
  onContinue?: (id:number,pdf?:boolean)=>void;
  onRetry: () => void;
  /** Open the editor for `chartId` with the assistant open and `prompt` prefilled. */
  onAssistant?: (chartId: number, prompt: string) => void;
  onModelConnection?: () => void;
  /** Create the sample project, or open it when it already exists. */
  onSample?: () => void;
  sampleExists?: boolean;
  sampleBusy?: boolean;
};

export function HomePage(p: HomePageProps) {
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const current = p.projects.find((project) => project.id === p.currentId);
  const latest = p.charts[0];
  const act = (callback: () => void) => (current ? callback() : p.onCreate());
  const firstRun = p.projects.length === 0;
  const now = new Date();
  const entrance=useEntrance("home");
  return (
    <div className={`home home-v2 ${firstRun ? "home-first-run" : ""} ${entrance=== "none" ? "" : "lf-motion-on"}`} data-entrance={entrance}>
      <section className="home-intro" aria-label="欢迎">
        <div className="home-intro-text">
          <span className="lf-kicker">{dateLabel(now)} · 本地工作区</span>
          {firstRun ? (
            <>
              <h1>{greeting(now)}，从一个研究项目开始。</h1>
              <p className="home-intro-note">项目里放数据、图表和实验记录。</p>
            </>
          ) : (
            <h1>
              {greeting(now)}，
              {latest ? "接着上次的图继续。" : "从一份数据开始。"}
            </h1>
          )}
        </div>
        {!firstRun && <div className="home-intro-actions">
          {!firstRun && (
            <button
              type="button"
              className="home-btn"
              disabled={p.busy}
              onClick={() => act(p.onUpload)}
            >
              <Upload size={16} aria-hidden="true" />
              {p.busy ? "正在导入…" : "导入数据"}
            </button>
          )}
          <button
            type="button"
            className="home-btn home-btn-primary"
            onClick={() => act(p.onPlot)}
          >
            <Plus size={16} aria-hidden="true" />
            {firstRun
              ? "创建研究项目"
              : current
                ? "新建图表"
                : "创建第一个项目"}
          </button>
          {(firstRun || p.sampleExists) && (
            <button
              type="button"
              className="home-btn"
              disabled={p.busy || p.sampleBusy}
              onClick={p.onSample || p.onCreate}
            >
              {p.sampleBusy
                ? p.sampleExists
                  ? "正在打开…"
                  : "正在载入…"
                : p.sampleExists
                  ? "打开示例项目"
                  : "载入示例项目"}
            </button>
          )}
        </div>}
      </section>

      <AssistantCard chartId={latest?.id} onAssistant={p.onAssistant} onModelConnection={p.onModelConnection}/>
      <div className="home-top">
        {!current ? (
          firstRun ? (
            <section className="home-card home-continue home-empty-hero home-sample">
              <div className="home-sample-copy">
              <FileSpreadsheet size={32} aria-hidden="true" />
              <h2>先用示例数据走一遍。</h2>
              <p>
                3 个模型、3 个种子、12 个 epoch 的合成学习曲线，创建后可随时归档。
              </p>
              <div className="home-row">
                <button type="button" className="home-btn home-btn-primary" disabled={p.busy || p.sampleBusy} onClick={p.onSample || p.onCreate}>
                  {p.sampleBusy ? "正在载入…" : p.sampleExists ? "打开示例项目" : "载入示例项目"}
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
                <button type="button" className="home-btn" onClick={p.onCreate}>创建研究项目</button>
              </div>
              </div>
              <figure className="home-sample-preview"><SampleThumbnail /><figcaption>示意</figcaption></figure>
            </section>
          ) : (
            <section className="home-card home-continue home-empty-hero">
              <FileSpreadsheet size={32} aria-hidden="true" />
              <h2>给下一项研究，一个自己的空间。</h2>
              <p>项目会把实验、数据集和图表放在一起。数据只保存在本机。</p>
              <button
                type="button"
                className="home-btn home-btn-primary"
                onClick={p.onCreate}
              >
                创建研究项目 <ArrowRight size={16} aria-hidden="true" />
              </button>
            </section>
          )
        ) : p.chartsLoading ? (
          <section
            className="home-card home-continue home-skeleton"
            role="status"
            aria-label="正在加载最近图表"
          />
        ) : p.chartsError ? (
          <section className="home-card home-continue home-empty-hero">
            <h2>最近图表暂时无法读取</h2>
            <p>{p.chartsError}</p>
            <button type="button" className="home-btn" onClick={p.onRetry}>
              重新加载
            </button>
          </section>
        ) : latest ? (
          <ContinueCard
            project={p.currentId}
            projectName={current.name}
            chart={latest}
            onOpen={() => (p.onContinue || p.onChart)(latest.id)}
            onExport={()=> (p.onContinue || p.onChart)(latest.id,true)}
            animateLines={entrance==="full"}
          />
        ) : (
          <section className="home-card home-continue home-empty-hero">
            <ChartNoAxesCombined size={32} aria-hidden="true" />
            <h2>你的第一张图表，从真实数据开始。</h2>
            <p>导入 CSV / XLSX / JSON，确认字段后直接进入绘图工作台。</p>
            <div className="home-row">
              <button type="button" className="home-btn" onClick={p.onUpload}>
                <Upload size={16} aria-hidden="true" /> 导入数据
              </button>
              <button
                type="button"
                className="home-btn home-btn-primary"
                onClick={p.onPlot}
              >
                打开绘图工作台 <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          </section>
        )}

        {!firstRun && <div className="home-side">
          <RecentCharts
            charts={p.charts.slice(1)}
            total={p.charts.length}
            enabled={!!current && !p.chartsLoading && !p.chartsError}
            onChart={p.onChart}
          />
      <section className="home-section" aria-label="快速开始">
        <h2 className="home-section-title">快速开始</h2>
        <div className="home-quick">
          {!firstRun && (
            <QuickTile
              icon={<Upload size={20} aria-hidden="true" />}
              title="导入数据"
              text="CSV / TSV / XLSX / JSON，自动识别字段类型与缺失值"
              disabled={p.busy}
              onClick={() => act(p.onUpload)}
            />
          )}
          <QuickTile
            icon={<ChartNoAxesCombined size={20} aria-hidden="true" />}
            title="新建图表"
            text="11 类科研图，字段映射后即时预览"
            onClick={() => act(p.onPlot)}
          />
          <QuickTile
            icon={<ChartColumn size={20} aria-hidden="true" />}
            title="对比实验"
            text="选 2–8 个实验，生成参数与指标对比"
            onClick={() => act(p.onExperiments)}
          />
          <QuickTile
            icon={<Sigma size={20} aria-hidden="true" />}
            title="处理与汇总"
            text="过滤、分组，输出 mean ± SD / SEM"
            onClick={() => act(p.onData)}
          />
        </div>
      </section>
        </div>}

      </div>

      {!firstRun && <div className="home-bottom">
        <ExperimentsPanel
          project={current}
          onExperiments={() => act(p.onExperiments)}
        />
        <ProjectsPanel
          projects={p.projects}
          currentId={p.currentId}
          onProject={p.onProject}
          onCreate={p.onCreate}
        />

      </div>}

      <footer className="home-footer lf-mono">
        <button type="button" className="home-privacy-button" onClick={() => setPrivacyOpen(true)}>数据保存在本机</button>
        <Link to="/welcome">关于 LabFlow</Link>
      </footer>
      <Dialog open={privacyOpen} onOpenChange={setPrivacyOpen} title="数据在哪里" description={dataPrivacy}>
        <p>{dataPrivacyDetails}</p>
        <p>{dataPrivacyLocalService}</p>
      </Dialog>
    </div>
  );
}

function QuickTile({
  icon,
  title,
  text,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="home-quick-tile"
      disabled={disabled}
      onClick={onClick}
    >
      <span className="home-quick-icon">{icon}</span>
      <span className="home-quick-title">{title}</span>
      <span className="home-quick-text">{text}</span>
    </button>
  );
}
