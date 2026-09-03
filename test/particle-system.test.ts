import { describe, it, expect } from "vitest";
import { ParticleSystem } from "../src/particle-system";
import { makeRng } from "../src/rng";

describe("ParticleSystem", () => {
  it("returns a dead particle to the pool and reuses it", () => {
    const sys = new ParticleSystem(0);
    const rng = makeRng(1);

    sys.burst(0, 0, 10, rng);
    expect(sys.activeCount).toBe(10);
    expect(sys.allocations).toBe(10); // the first 10 really were created

    sys.update(100); // a huge dt: every particle's life drops below zero
    expect(sys.activeCount).toBe(0); // all of them went back to the pool

    sys.burst(0, 0, 10, rng);
    expect(sys.allocations).toBe(10); // still 10: NO new allocation, they came off the shelf
  });
});
