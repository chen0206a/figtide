import { afterEach, expect, it } from "vitest";
import {
  recoveryKey,
  recoveryRead,
  recoveryWrite,
  sameConfig,
} from "./agentRecovery";
afterEach(() => sessionStorage.clear());
it("stores only a run identifier and scopes it to the project, figure and immutable data version", () => {
  const key = recoveryKey(1, 2, 3),
    id = "d550105c-893b-4f7b-b02b-8a1e2daa32a1";
  recoveryWrite(key, id);
  expect(sessionStorage.getItem(key)).toBe(id);
  expect(recoveryRead(recoveryKey(1, 2, 4))).toBeNull();
  sessionStorage.setItem(key, '{"secret":"not a run"}');
  expect(recoveryRead(key)).toBeNull();
  recoveryWrite(key, null);
  expect(sessionStorage.getItem(key)).toBeNull();
});
it("restoration compares configuration values independently of JSON property order", () => {
  expect(
    sameConfig(
      { x: "epoch", axes: { y: 1, x: 2 } } as any,
      { axes: { x: 2, y: 1 }, x: "epoch" } as any,
    ),
  ).toBe(true);
  expect(sameConfig({ x: "epoch" } as any, { x: "step" } as any)).toBe(false);
});
