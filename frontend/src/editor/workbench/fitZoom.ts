export const fittedZoom = (stage: HTMLElement, width: number, height: number) =>
  Math.max(
    5,
    Math.min(
      100,
      Math.floor(
        Math.min(
          (stage.clientWidth - 64) / width,
          (stage.clientHeight - 88) / height,
        ) * 100,
      ),
    ),
  );
