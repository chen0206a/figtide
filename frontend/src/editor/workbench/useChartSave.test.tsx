import { act, renderHook } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DraftWriter } from "../../lib/draftWriter";
import { saveFailureMessage } from "../../lib/saveFeedback";
import { useChartSave } from "./useChartSave";

const key = "labflow-draft-v1:7:9";
function fixture() {
  const writer = new DraftWriter(localStorage, vi.fn(), vi.fn());
  const props: Parameters<typeof useChartSave>[0] = {
    saving: false,
    c: { datasetVersionId: 7, style: { title: "latest" } } as Parameters<typeof useChartSave>[0]["c"],
    data: { id: 7 } as Parameters<typeof useChartSave>[0]["data"],
    name: "Current figure", id: 9, project: 2, revision: 3,
    queryClient: new QueryClient(), mounted: { current: true },
    draftWriter: { current: writer }, draftKey: key, initialDraft: null,
    originDataset: 7, panel: "style", seriesId: "one",
    setSaving: vi.fn(), setConflict: vi.fn(), setId: vi.fn(),
    setRevision: vi.fn(), setBaseline: vi.fn(), setLogs: vi.fn(),
    notify: vi.fn(), onSaved: vi.fn(),
  };
  return { props, writer };
}
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

it.each([false, true])("does not promise recovery after a quota error (old draft: %s)", async (old) => {
  if (old) localStorage.setItem(key, "old draft");
  const { props, writer } = fixture();
  const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  const { result } = renderHook(() => useChartSave(props));
  await act(() => result.current.save());
  expect(props.notify).toHaveBeenCalledWith(saveFailureMessage(false));
  expect(props.notify).not.toHaveBeenCalledWith(expect.stringContaining("仍保存在本机草稿中"));
  expect(localStorage.getItem(key)).toBe(old ? "old draft" : null);
  // Failed writes retain pending data so the existing leave guard can retry.
  setItem.mockRestore();
  expect(writer.flush()).toBe(true);
  expect(JSON.parse(localStorage.getItem(key)!).config).toEqual(props.c);
});

it("promises recovery only after the latest draft has been written and read back", async () => {
  localStorage.setItem(key, "old draft");
  const { props } = fixture();
  const { result } = renderHook(() => useChartSave(props));
  await act(() => result.current.save());
  expect(props.notify).toHaveBeenCalledWith(saveFailureMessage(true));
  expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({ config: props.c, name: props.name, revision: 3 });
});

it("does not promise recovery if read-back differs despite a successful write", async () => {
  const { props } = fixture();
  vi.spyOn(Storage.prototype, "getItem").mockReturnValue("stale");
  const { result } = renderHook(() => useChartSave(props));
  await act(() => result.current.save());
  expect(props.notify).toHaveBeenCalledWith(saveFailureMessage(false));
});

it("preserves edits made while the server save is in flight", async () => {
  let fail!: (error: Error) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((_resolve, reject) => { fail = reject; })));
  const { props } = fixture();
  const { result, rerender } = renderHook((p) => useChartSave(p), { initialProps: props });
  let pending!: Promise<void>;
  act(() => { pending = result.current.save(); });
  const current = { ...props, name: "Newer edit", c: { ...props.c, x: "new-field" } };
  rerender(current);
  await act(async () => { fail(new TypeError("Failed to fetch")); await pending; });
  expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({ config: current.c, name: "Newer edit" });
  expect(props.notify).toHaveBeenCalledWith(saveFailureMessage(true));
});
