import { Link } from "react-router-dom";
import { BrandMark } from "./BrandMark";
import { Dialog } from "./ui/dialog";

export function AboutDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange} title="关于 FigTide 图汐" description="面向科研的本地实验数据与绘图工作台。">
    <div className="about-brand"><BrandMark size={40} showCn /></div>
    <p className="lf-mono">版本 {__APP_VERSION__}</p>
    <p>实验记录、数据版本和科研绘图放在同一个工作台。每一张图，都能回到它的数据和处理规则。</p>
    <nav className="about-links" aria-label="产品信息">
      <Link to="/welcome">产品介绍</Link>
      <a href="https://github.com/chen0206a/figtide" target="_blank" rel="noreferrer">GitHub</a>
      <a href="https://github.com/chen0206a/figtide/blob/main/LICENSE" target="_blank" rel="noreferrer">MIT License</a>
    </nav>
  </Dialog>;
}
