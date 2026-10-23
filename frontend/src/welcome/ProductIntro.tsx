import type { MouseEvent } from "react";
export default function ProductIntro({onStart}:{onStart:(event:MouseEvent)=>void}) {
  return <main className="product-intro"><header><strong>LabFlow</strong><a href="https://github.com/chen0206a/labflow-agent">GitHub</a></header><section><h1>让实验数据，自然成为论文图。</h1><p>实验记录、数据版本和科研绘图，在同一个本地工作台。</p><button onClick={onStart}>开始创作</button></section></main>;
}
