import { useEffect, useRef, useState } from "react";
import { Pause, Play, ArrowUpRight } from "lucide-react";
import { Dialog } from "./ui/dialog";
const plates = [
  {
    file: "intervals.png",
    title: "曲线与区间",
    detail: "趋势 · 范围 · 连续变化",
    tone: "blue",
    source: "lines_bars_and_markers/fill_between_demo",
  },
  {
    file: "heatmap.png",
    title: "矩阵与关联",
    detail: "数值 · 色阶 · 数据关系",
    tone: "mint",
    source: "images_contours_and_fields/image_annotated_heatmap",
  },
  {
    file: "distributions.png",
    title: "分布与比较",
    detail: "分布形态 · 组间差异",
    tone: "lilac",
    source: "statistics/boxplot_color",
  },
  {
    file: "bars.png",
    title: "分组与对比",
    detail: "类别 · 指标 · 并列比较",
    tone: "sand",
    source: "lines_bars_and_markers/barchart",
  },
];
export function FigureShowcase() {
  const [playing, setPlaying] = useState(
    () => !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
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
      if (media?.matches) setPlaying(false);
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
        {reduced ? (
          <span className="showcase-play">静态浏览</span>
        ) : (
          <button
            className="showcase-play"
            aria-label={playing ? "暂停示例播放" : "播放示例"}
            aria-pressed={playing}
            onClick={() => setPlaying((v) => !v)}
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
            <span>{playing ? "暂停播放" : "播放示例"}</span>
          </button>
        )}
      </div>
      <div
        className="showcase-viewport"
        tabIndex={0}
        aria-label="图表示例画廊，可横向滚动"
        role="region"
      >
        <div className="showcase-track" data-playing={playing && visible}>
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
                  className={`showcase-plate plate-${plate.tone}`}
                >
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
        description="首页图廊展示 Matplotlib 官方图库的参考图片。"
      >
        <p className="showcase-credit-note">
          这些图片用于展示科研图表的表达方式，来自外部图库，并非 LabFlow
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
          图片原样使用，页面仅进行等比缩放与排版。
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
