import icon from "../assets/brand/figtide-icon.svg";
import smallIcon from "../assets/brand/figtide-icon-small.svg";
import reverseIcon from "../assets/brand/figtide-icon-reverse.svg";
import "./brand.css";

export function BrandMark({
  size = 32,
  tone = "dark",
  showCn = false,
}: {
  size?: number;
  tone?: "dark" | "light";
  showCn?: boolean;
}) {
  const src = tone === "light" ? reverseIcon : size <= 24 ? smallIcon : icon;
  return (
    <span className={`brand-mark brand-mark-${tone}`} role="img" aria-label="FigTide">
      <img src={src} width={size} height={size} alt="" />
      <span className="brand-wordmark" aria-hidden="true"><b>Fig</b><span>Tide</span></span>
      {showCn && <span className="brand-cn" aria-hidden="true">图汐</span>}
    </span>
  );
}
