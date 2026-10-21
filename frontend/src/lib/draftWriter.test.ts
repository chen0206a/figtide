import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DraftWriter } from "./draftWriter";
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
function fixture() {
  const storage = { setItem: vi.fn(), removeItem: vi.fn() },
    saved = vi.fn(),
    failed = vi.fn();
  return {
    storage,
    saved,
    failed,
    writer: new DraftWriter(storage, saved, failed),
  };
}
it("coalesces input and flushes the exact latest draft before unload", () => {
  const { writer, storage, saved } = fixture();
  for (let i = 0; i < 27; i++) {
    writer.schedule("chart", String(i));
    vi.advanceTimersByTime(8);
  }
  expect(storage.setItem).not.toHaveBeenCalled();
  writer.flush();
  expect(storage.setItem).toHaveBeenCalledExactlyOnceWith("chart", "26");
  vi.runAllTimers();
  expect(saved).toHaveBeenCalledTimes(1);
});
it("never resurrects a draft cleared by a successful server save", () => {
  const { writer, storage } = fixture();
  writer.schedule("chart", "dirty");
  writer.clear("chart");
  vi.runAllTimers();
  writer.flush();
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(storage.removeItem).toHaveBeenCalledWith("chart");
});
it("flushes each chart to its own key when switching drafts", () => {
  const { writer, storage } = fixture();
  writer.schedule("a", "first");
  writer.schedule("b", "second");
  vi.runAllTimers();
  expect(storage.setItem.mock.calls).toEqual([
    ["a", "first"],
    ["b", "second"],
  ]);
});
it("reports quota errors and retains the pending draft for a flush retry", () => {
  const { writer, storage, saved, failed } = fixture();
  storage.setItem.mockImplementationOnce(() => {
    throw new Error("quota");
  });
  writer.schedule("chart", "latest");
  vi.runAllTimers();
  expect(failed).toHaveBeenCalledTimes(1);
  writer.flush();
  expect(storage.setItem).toHaveBeenLastCalledWith("chart", "latest");
  expect(saved).toHaveBeenCalledTimes(1);
});

it("synchronously preserves the latest edit before navigation and reports a failed write", () => {
  const { writer, storage } = fixture();
  writer.schedule("chart", "old pending");
  expect(writer.writeNow("chart", "latest input")).toBe(true);
  vi.runAllTimers();
  expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(
    "chart",
    "latest input",
  );
  storage.setItem.mockImplementationOnce(() => {
    throw new Error("quota");
  });
  expect(writer.writeNow("chart", "newer input")).toBe(false);
  expect(writer.flush()).toBe(true);
  expect(storage.setItem).toHaveBeenLastCalledWith("chart", "newer input");
});
