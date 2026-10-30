import rough from "roughjs";
import type { DiagramRect } from "../model";

export function stableSeed(id: string): number {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % 2147483646 + 1;
}
/** No DOM, clock or random state. The same element always produces identical vector paths. */
export function sketchPaths(id: string, box: DiagramRect, ellipse: boolean, stroke: string, width: number) {
  const generator = rough.generator();
  const options = { seed: stableSeed(id), stroke, strokeWidth: width, roughness: .65, bowing: .3, disableMultiStroke: true };
  const drawable = ellipse
    ? generator.ellipse(box.x + box.w / 2, box.y + box.h / 2, box.w, box.h, options)
    : generator.rectangle(box.x, box.y, box.w, box.h, options);
  return generator.toPaths(drawable);
}
