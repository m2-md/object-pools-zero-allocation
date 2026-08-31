import { describe, it, expect } from "vitest";
import { scaleAndAdd } from "../src/vec";

describe("vec (in-place)", () => {
  it("scaleAndAdd out'u yerinde günceller, yeni nesne üretmez", () => {
    const out = { x: 0, y: 0 };
    const pos = { x: 1, y: 2 };
    const vel = { x: 0, y: 10 };
    const r = scaleAndAdd(out, pos, vel, 0.5); // out = pos + vel*0.5

    expect(r).toBe(out); // dönen değer, verdiğimiz tamponun ta kendisi
    expect(out).toEqual({ x: 1, y: 7 });
  });
});
