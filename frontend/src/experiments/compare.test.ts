import { it, expect } from "vitest";
import { delta, numeric, stable } from "./compare";
it("does not coerce strings, nulls or booleans into experimental measurements", () => {
  expect(numeric("95")).toBeNull();
  expect(numeric(null)).toBeNull();
  expect(numeric(false)).toBeNull();
  expect(delta(null, 90)).toBeNull();
  expect(delta(0, 90)).toBe(-90);
  expect(delta(95, 90)).toBe(5);
  expect(delta(1e308, -1e308)).toBeNull();
});
it("compares structured parameters independently of object key order", () => {
  expect(stable({ a: 1, b: { x: 2, y: 3 } })).toBe(
    stable({ b: { y: 3, x: 2 }, a: 1 }),
  );
  expect(stable([1, 2])).not.toBe(stable([2, 1]));
  expect(stable(undefined)).not.toBe(stable(null));
});
