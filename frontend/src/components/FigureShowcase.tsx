import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowUpRight,
  LineChart,
  BarChart3,
  ScatterChart,
  Grid2X2,
  Activity,
  Layers,
  Waves,
} from "lucide-react";
import { Dialog } from "./ui/dialog";
const plates = [
  {
    file: "intervals.png",
    Icon: LineChart,
    width: 520,
    title: "曲线与区间",
    detail: "趋势 · 范围 · 连续变化",
    source: "lines_bars_and_markers/fill_between_demo",
  },
  {
    file: "heatmap.png",
    Icon: Grid2X2,
    width: 380,
    title: "相关性矩阵",
    detail: "关系 · 强度 · 数据结构",
    source: "images_contours_and_fields/image_annotated_heatmap",
  },
  {
    file: "distributions.png",
    Icon: BarChart3,
    width: 420,
    title: "分布与比较",
    detail: "分布形态 · 组间差异",
    source: "statistics/boxplot_color",
  },
  {
    file: "bars.png",
    Icon: BarChart3,
    width: 520,
    title: "分组与对比",
    detail: "类别 · 指标 · 并列比较",
    source: "lines_bars_and_markers/barchart",
  },
  {
    file: "scatter.png",
    Icon: ScatterChart,
    width: 420,
    title: "散点与边际分布",
    detail: "样本 · 相关性 · 分布",
    source: "lines_bars_and_markers/scatter_hist",
  },
  {
    file: "histogram.png",
    Icon: BarChart3,
    width: 360,
    title: "频率与分布",
    detail: "频数 · 密度 · 数据形态",
    source: "statistics/hist",
  },
  {
    file: "contour.png",
    Icon: Waves,
    width: 440,
    title: "等高线与响应",
    detail: "空间 · 梯度 · 响应曲面",
    source: "images_contours_and_fields/contour_demo",
  },
  {
    file: "density.png",
    Icon: Layers,
    width: 480,
    title: "密度与聚集",
    detail: "聚集 · 分箱 · 数值密度",
    source: "statistics/hexbin_demo",
  },
  {
    file: "errors.png",
    Icon: Activity,
    width: 500,
    title: "测量与误差",
    detail: "测量 · 波动 · 不确定性",
    source: "statistics/errorbar",
  },
  {
    file: "areas.png",
    Icon: LineChart,
    width: 520,
    title: "构成与变化",
    detail: "构成 · 时间 · 累积变化",
    source: "lines_bars_and_markers/stackplot_demo",
  },
];
export function FigureShowcase() {
  const [reduced, setReduced] = useState(
    () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  const [visible, setVisible] = useState(true);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const changed = () => {
      setReduced(!!media?.matches);
    };
    media?.addEventListener("change", changed);
    const observer =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            ([entry]) => setVisible(entry.isIntersecting),
            { rootMargin: "100px" },
          )
        : null;
    if (root.current) observer?.observe(root.current);
    return () => {
      media?.removeEventListener("change", changed);
      observer?.disconnect();
    };
  }, []);
  return (
    <section className="figure-showcase" aria-label="图表示例" ref={root}>
      <div className="showcase-heading">
        <div>
          <span className="showcase-eyebrow">FIGURE COLLECTION</span>
          <h2>让结果，一眼清晰。</h2>
          <p>从趋势到分布，发现数据的不同表达。</p>
        </div>
      </div>
      <div
        className="showcase-viewport"
        tabIndex={0}
        aria-label="图表示例画廊，可横向滚动"
        role="region"
      >
        <div className="showcase-track" data-playing={!reduced && visible}>
          {[0, 1].map((copy) => (
            <div
              key={copy}
              className={`showcase-set ${copy ? "showcase-copy" : ""}`}
              aria-hidden={copy === 1 ? true : undefined}
              inert={copy === 1 ? true : undefined}
            >
              {plates.map((plate) => (
                <figure
                  key={plate.file}
                  className={`showcase-plate ${plate.file === "density.png" ? "plate-dark" : ""}`}
                  style={
                    { "--plate-width": `${plate.width}px` } as CSSProperties
                  }
                >
                  <span className="showcase-badge" aria-hidden="true">
                    <plate.Icon size={21} strokeWidth={1.8} />
                  </span>
                  <div className="showcase-paper">
                    <img
                      src={`/showcase/${plate.file}`}
                      alt={`${plate.title}图表示例`}
                      width={640}
                      height={480}
                      loading="eager"
                      decoding="async"
                      draggable={false}
                    />
                  </div>
                  <figcaption>
                    <strong>{plate.title}</strong>
                    <span>{plate.detail}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="showcase-bottom">
        <span>图表灵感 · 多一种看待数据的方式</span>
        <button onClick={() => setSourcesOpen(true)}>
          素材来源 <ArrowUpRight size={12} />
        </button>
      </div>
      <Dialog
        open={sourcesOpen}
        onOpenChange={setSourcesOpen}
        title="示例素材说明"
        description="首页图廊基于 Matplotlib 开源示例，统一调整配色与排版。"
      >
        <p className="showcase-credit-note">
          这些图版沿用开源示例的数据与计算方式，统一调整配色与排版，并非 LabFlow
          导出截图。
        </p>
        <ul className="showcase-credit-list">
          {plates.map((plate) => (
            <li key={plate.file}>
              <a
                href={`https://matplotlib.org/stable/gallery/${plate.source}.html`}
                target="_blank"
                rel="noreferrer"
              >
                {plate.title}
                <ArrowUpRight size={13} />
              </a>
            </li>
          ))}
        </ul>
        <p className="showcase-credit-note">
          Copyright (c) 2012– Matplotlib Development Team; All Rights Reserved.
          已改编配色、字体、尺寸与布局；示例代码和数据的来源记录随项目保留。
        </p>
        <a
          className="showcase-license"
          href="/showcase/MATPLOTLIB-LICENSE.txt"
          target="_blank"
          rel="noreferrer"
        >
          查看 Matplotlib 完整许可
        </a>
      </Dialog>
    </section>
  );
}
