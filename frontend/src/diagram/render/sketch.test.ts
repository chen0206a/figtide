import { describe, expect, it } from "vitest";
import { sketchPaths, stableSeed } from "./sketch";
describe("deterministic sketch preset", () => {
  it("uses stable positive seeds and identical vector paths without DOM or randomness", () => {
    const box = {x:10,y:20,w:30,h:12};
    const a = sketchPaths("n1",box,false,"#000000",.2);
    expect(a).toEqual(sketchPaths("n1",box,false,"#000000",.2));
    expect(a).not.toEqual(sketchPaths("n2",box,false,"#000000",.2));
    expect(sketchPaths("n1",box,true,"#000000",.2)).toEqual(sketchPaths("n1",box,true,"#000000",.2));
    expect(stableSeed("n1")).toBeGreaterThan(0);
    expect(a.every(p => p.d && !p.d.includes("NaN"))).toBe(true);
  });
});
