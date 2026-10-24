export const fittedZoom = (stage: HTMLElement, width: number, height: number) => {
  const css = getComputedStyle(stage);
  const padding = (a: string, b: string) =>
    (parseFloat(a) || 0) + (parseFloat(b) || 0);
  const group = stage.querySelector<HTMLElement>(".paper-group");
  const paper = stage.querySelector<HTMLElement>(".paper-wrap");
  // Captions, footnotes and the optional mm ruler occupy unscaled space.
  const chrome = group && paper
    ? Math.max(0, group.getBoundingClientRect().height - paper.getBoundingClientRect().height)
    : 0;
  return Math.max(
    5,
    Math.min(
      100,
      Math.floor(
        Math.min(
          (stage.clientWidth - padding(css.paddingLeft, css.paddingRight)) / width,
          (stage.clientHeight - padding(css.paddingTop, css.paddingBottom) - chrome) / height,
        ) * 100,
      ),
    ),
  );
};
