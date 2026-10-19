export const scientificScales = {
  viridis: ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"],
  cividis: ["#00224e", "#434e6c", "#7d7c78", "#bcae6c", "#fee838"],
  blueRed: ["#2166ac", "#92c5de", "#f7f7f7", "#f4a582", "#b2182b"],
};
export function interpolate(stops: string[], t: number) {
  const at = Math.max(0, Math.min(1, t)) * (stops.length - 1),
    i = Math.min(stops.length - 2, Math.floor(at)),
    ratio = at - i;
  return (
    "#" +
    [1, 3, 5]
      .map((pos) =>
        Math.round(
          parseInt(stops[i].slice(pos, pos + 2), 16) * (1 - ratio) +
            parseInt(stops[i + 1].slice(pos, pos + 2), 16) * ratio,
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export function labelColor(fill: string, background: string, opacity: number) {
  const channels = [1, 3, 5].map(
    (pos) =>
      (parseInt(fill.slice(pos, pos + 2), 16) * opacity +
        parseInt(background.slice(pos, pos + 2), 16) * (1 - opacity)) /
      255,
  );
  const linear = channels.map((v) =>
    v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  );
  const luminance =
    linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05)
    ? "#000000"
    : "#ffffff";
}
